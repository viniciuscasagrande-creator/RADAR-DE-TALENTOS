import { createHash, randomUUID } from 'node:crypto';
import { authenticate } from './security.mjs';
import { risingDiscoveries } from './rising-discoveries.mjs';
import { resolveSessionContext } from './users.mjs';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function ensureSocketTelemetryTables(db) {
  if (!db) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS radar_socket_events (
        event_id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        source_edge TEXT NOT NULL DEFAULT 'radar-core',
        payload_json TEXT NOT NULL,
        requires_ack INTEGER NOT NULL DEFAULT 1,
        ack_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_radar_socket_events_created
        ON radar_socket_events(created_at DESC);
    `);
  } catch {}
}

function encodeWsFrame(opcode, payloadBuffer) {
  const len = payloadBuffer.length;
  let header;
  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payloadBuffer]);
}

function decodeWsFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const isMasked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7f;
    let headerLen = 2;

    if (payloadLen === 126) {
      if (offset + 4 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (offset + 10 > buffer.length) break;
      const bigLen = buffer.readBigUInt64BE(offset + 2);
      if (bigLen > 1048576n) {
        return { frames, remaining: Buffer.alloc(0), protocolError: true };
      }
      payloadLen = Number(bigLen);
      headerLen = 10;
    }

    const maskLen = isMasked ? 4 : 0;
    const totalFrameLen = headerLen + maskLen + payloadLen;
    if (offset + totalFrameLen > buffer.length) break;

    let payload = buffer.subarray(offset + headerLen + maskLen, offset + totalFrameLen);
    if (isMasked) {
      const mask = buffer.subarray(offset + headerLen, offset + headerLen + 4);
      const unmasked = Buffer.allocUnsafe(payload.length);
      for (let i = 0; i < payload.length; i++) {
        unmasked[i] = payload[i] ^ mask[i & 3];
      }
      payload = unmasked;
    }

    frames.push({ opcode, payload });
    offset += totalFrameLen;
  }

  return {
    frames,
    remaining: buffer.subarray(offset),
    protocolError: false
  };
}

export function attachEdgeToEdgeSocketHub(server, { database, security = null, resolveClientIp = () => 'unknown' } = {}) {
  ensureSocketTelemetryTables(database);

  const clients = new Map();
  const processedInboundIds = new Map();
  const startedAt = new Date().toISOString();
  let totalMessagesSent = 0;
  let totalMessagesReceived = 0;
  let totalAcksReceived = 0;

  function pruneProcessedIds() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, ts] of processedInboundIds) {
      if (ts < cutoff) processedInboundIds.delete(id);
    }
  }

  function recordEventInDb(envelope) {
    if (!database) return;
    try {
      ensureSocketTelemetryTables(database);
      database
        .prepare(
          `INSERT OR IGNORE INTO radar_socket_events
           (event_id, topic, source_edge, payload_json, requires_ack, ack_count, created_at)
           VALUES (?, ?, ?, ?, ?, 0, ?)`
        )
        .run(
          envelope.eventId,
          envelope.topic,
          envelope.sourceEdge || 'radar-core',
          JSON.stringify(envelope.payload ?? {}),
          envelope.requiresAck ? 1 : 0,
          envelope.timestamp
        );
    } catch {}
  }

  function incrementAckInDb(eventId) {
    if (!database || !eventId) return;
    try {
      database
        .prepare(`UPDATE radar_socket_events SET ack_count = ack_count + 1 WHERE event_id = ?`)
        .run(String(eventId));
    } catch {}
  }

  function sendJsonFrame(client, data) {
    if (!client?.socket || client.socket.destroyed || !client.socket.writable) return false;
    try {
      const buf = Buffer.from(JSON.stringify(data), 'utf8');
      client.socket.write(encodeWsFrame(0x1, buf));
      totalMessagesSent++;
      return true;
    } catch {
      return false;
    }
  }

  function broadcastEvent(topic, payload = {}, { sourceEdge = 'radar-core', requiresAck = true, eventId = null } = {}) {
    const id = eventId || `evt_${randomUUID()}`;
    if (processedInboundIds.has(id)) {
      return { eventId: id, duplicate: true, deliveredTo: 0 };
    }
    processedInboundIds.set(id, Date.now());
    if (processedInboundIds.size > 2000) pruneProcessedIds();

    const envelope = {
      type: 'EVENT',
      architecture: 'Edge-to-Edge',
      protocol: 'WebSocket/RFC6455',
      eventId: id,
      topic,
      sourceEdge,
      requiresAck: Boolean(requiresAck),
      timestamp: new Date().toISOString(),
      payload
    };

    recordEventInDb(envelope);

    let deliveredTo = 0;
    for (const client of clients.values()) {
      if (sendJsonFrame(client, envelope)) {
        deliveredTo++;
      }
    }
    return { eventId: id, duplicate: false, deliveredTo, envelope };
  }

  function getHubStatus() {
    let recentEvents = [];
    if (database) {
      try {
        ensureSocketTelemetryTables(database);
        recentEvents = database
          .prepare(
            `SELECT event_id AS eventId, topic, source_edge AS sourceEdge, requires_ack AS requiresAck, ack_count AS ackCount, created_at AS createdAt
             FROM radar_socket_events
             ORDER BY created_at DESC
             LIMIT 15`
          )
          .all();
      } catch {}
    }

    const activeEdges = [];
    for (const c of clients.values()) {
      activeEdges.push({
        clientId: c.clientId,
        edgeNode: c.edgeNode,
        userAgent: c.userAgent || '',
        username: c.username || '',
        displayName: c.displayName || '',
        ip: c.ip,
        connectedAt: c.connectedAt,
        lastHeartbeatAt: new Date(c.lastPongAt).toISOString(),
        rttMs: c.lastRttMs
      });
    }

    return {
      ok: true,
      architecture: 'Hybrid REST + Edge-to-Edge WebSocket (RFC 6455)',
      endpoint: '/ws',
      startedAt,
      activeConnections: clients.size,
      metrics: {
        totalMessagesSent,
        totalMessagesReceived,
        totalAcksReceived,
        deduplicatedCacheSize: processedInboundIds.size
      },
      features: {
        persistentConnection: true,
        heartbeatIntervalMs: 25000,
        autoReconnectClient: true,
        tlsSupport: true,
        ackConfirmation: true,
        deduplicationControl: true,
        sqliteAuditLog: Boolean(database)
      },
      activeEdges,
      recentEvents
    };
  }

  function sendRisingSnapshotToClient(client) {
    if (!database) return;
    try {
      const rising = risingDiscoveries(database, { limit: 10 });
      sendJsonFrame(client, {
        type: 'EVENT',
        architecture: 'Edge-to-Edge',
        protocol: 'WebSocket/RFC6455',
        eventId: `snap_${randomUUID()}`,
        topic: 'rising.snapshot',
        sourceEdge: 'radar-core',
        requiresAck: true,
        timestamp: new Date().toISOString(),
        payload: {
          total: rising.total || 0,
          items: rising.items || []
        }
      });
    } catch {}
  }

  function handleClientMessage(client, text) {
    totalMessagesReceived++;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      sendJsonFrame(client, {
        type: 'ERROR',
        error: 'Payload JSON inválido no frame WebSocket'
      });
      return;
    }

    const msgType = String(msg.type || '').toUpperCase();

    if (msgType === 'PING' || msgType === 'HEARTBEAT') {
      client.lastPongAt = Date.now();
      sendJsonFrame(client, {
        type: 'PONG',
        clientId: client.clientId,
        serverTimestamp: new Date().toISOString(),
        clientTimestamp: msg.timestamp || null
      });
      return;
    }

    if (msgType === 'ACK') {
      const evtId = String(msg.eventId || '');
      if (evtId && !client.ackedEvents.has(evtId)) {
        client.ackedEvents.add(evtId);
        totalAcksReceived++;
        incrementAckInDb(evtId);
      }
      return;
    }

    if (msgType === 'IDENTIFY_EDGE') {
      if (typeof msg.edgeNode === 'string' && msg.edgeNode.trim()) {
        client.edgeNode = msg.edgeNode.trim().slice(0, 64);
      }
      sendJsonFrame(client, {
        type: 'EDGE_REGISTERED',
        clientId: client.clientId,
        edgeNode: client.edgeNode,
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (msgType === 'REQUEST_RISING_SNAPSHOT') {
      sendRisingSnapshotToClient(client);
      return;
    }

    if (msgType === 'PUBLISH_EDGE_EVENT') {
      const inboundId = String(msg.eventId || `edge_${randomUUID()}`).slice(0, 80);
      const topic = String(msg.topic || 'edge.telemetry').slice(0, 80);
      const result = broadcastEvent(topic, msg.payload || {}, {
        sourceEdge: client.edgeNode || 'external-edge',
        requiresAck: true,
        eventId: inboundId
      });
      sendJsonFrame(client, {
        type: 'PUBLISH_ACK',
        eventId: inboundId,
        duplicate: result.duplicate,
        deliveredTo: result.deliveredTo,
        timestamp: new Date().toISOString()
      });
    }
  }

  server.on('upgrade', (req, socket) => {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      if (parsedUrl.pathname !== '/ws' && parsedUrl.pathname !== '/api/ws') {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      if (security && !authenticate(req, security)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      const key = req.headers['sec-websocket-key'];
      const upgrade = String(req.headers['upgrade'] || '').toLowerCase();
      if (!key || upgrade !== 'websocket') {
        socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      const acceptKey = createHash('sha1')
        .update(key + WS_GUID)
        .digest('base64');

      const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '\r\n'
      ].join('\r\n');

      socket.write(responseHeaders);
      socket.setNoDelay(true);

      const clientId = `edge_${randomUUID().slice(0, 8)}`;
      const edgeParam = parsedUrl.searchParams.get('edge') || req.headers['x-radar-edge'] || 'web-dashboard';
      let wsUser = null;
      try {
        wsUser = resolveSessionContext(database, req)?.effectiveUser || null;
      } catch {}
      const client = {
        clientId,
        edgeNode: String(edgeParam).slice(0, 64),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
        username: wsUser?.username || '',
        displayName: wsUser?.displayName || '',
        ip: resolveClientIp(req),
        socket,
        connectedAt: new Date().toISOString(),
        lastPingSentAt: Date.now(),
        lastPongAt: Date.now(),
        lastRttMs: 0,
        ackedEvents: new Set(),
        buffer: Buffer.alloc(0)
      };

      clients.set(clientId, client);

      sendJsonFrame(client, {
        type: 'WELCOME',
        architecture: 'Edge-to-Edge (E2E)',
        protocol: 'WebSocket RFC 6455',
        clientId,
        edgeNode: client.edgeNode,
        heartbeatIntervalMs: 25000,
        timestamp: new Date().toISOString()
      });

      sendRisingSnapshotToClient(client);

      socket.on('data', chunk => {
        client.buffer = Buffer.concat([client.buffer, chunk]);
        const decoded = decodeWsFrames(client.buffer);
        client.buffer = decoded.remaining;

        if (decoded.protocolError) {
          socket.end(encodeWsFrame(0x8, Buffer.alloc(0)));
          socket.destroy();
          clients.delete(clientId);
          return;
        }

        for (const frame of decoded.frames) {
          if (frame.opcode === 0x8) {
            // Close frame
            try {
              socket.end(encodeWsFrame(0x8, Buffer.alloc(0)));
            } catch {}
            socket.destroy();
            clients.delete(clientId);
            return;
          }
          if (frame.opcode === 0x9) {
            // Ping -> respond Pong
            try {
              socket.write(encodeWsFrame(0xA, frame.payload));
            } catch {}
            client.lastPongAt = Date.now();
            continue;
          }
          if (frame.opcode === 0xA) {
            // Pong
            client.lastPongAt = Date.now();
            client.lastRttMs = Math.max(0, client.lastPongAt - client.lastPingSentAt);
            continue;
          }
          if (frame.opcode === 0x1) {
            handleClientMessage(client, frame.payload.toString('utf8'));
          }
        }
      });

      const cleanup = () => {
        clients.delete(clientId);
      };
      socket.on('close', cleanup);
      socket.on('error', cleanup);
      socket.on('end', cleanup);
    } catch {
      try {
        socket.destroy();
      } catch {}
    }
  });

  // Heartbeat a cada 25 segundos para manter conexões E2E ativas através de proxies/4G/Caddy
  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, client] of clients.entries()) {
      if (now - client.lastPongAt > 75000) {
        try {
          client.socket.destroy();
        } catch {}
        clients.delete(id);
        continue;
      }
      client.lastPingSentAt = now;
      try {
        client.socket.write(encodeWsFrame(0x9, Buffer.from('hb')));
      } catch {
        clients.delete(id);
      }
    }
  }, 25000);
  heartbeatTimer.unref?.();

  server.once('close', () => {
    clearInterval(heartbeatTimer);
    for (const client of clients.values()) {
      try {
        client.socket.destroy();
      } catch {}
    }
    clients.clear();
  });

  return {
    broadcastEvent,
    getHubStatus
  };
}
