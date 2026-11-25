import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadarServer } from '../server/src/app.mjs';
import { openDatabase } from '../server/src/database/index.mjs';

test('Arquitetura Híbrida REST + Edge-to-Edge WebSocket (RFC 6455): handshake, heartbeat, deduplicação, ACK e auditoria SQLite', async () => {
  const db = openDatabase(':memory:');
  const server = createRadarServer({ database: db, combinedDashboard: true });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    // 1. Verifica endpoint REST /api/realtime/status
    const statusRes0 = await fetch(`http://127.0.0.1:${port}/api/realtime/status`);
    assert.equal(statusRes0.status, 200);
    const status0 = await statusRes0.json();
    assert.equal(status0.ok, true);
    assert.equal(status0.endpoint, '/ws');
    assert.equal(status0.features.persistentConnection, true);
    assert.equal(status0.features.ackConfirmation, true);
    assert.equal(status0.features.deduplicationControl, true);

    // 2. Conecta cliente WebSocket Edge-to-Edge nativo
    const receivedMessages = [];
    let welcomeResolver;
    const welcomePromise = new Promise((res) => {
      welcomeResolver = res;
    });

    let customEventResolver;
    const customEventPromise = new Promise((res) => {
      customEventResolver = res;
    });

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?edge=erp-industrial-edge`);

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      receivedMessages.push(msg);

      if (msg.type === 'WELCOME') {
        welcomeResolver(msg);
      }
      if (msg.type === 'EVENT' && msg.requiresAck && msg.eventId) {
        ws.send(JSON.stringify({ type: 'ACK', eventId: msg.eventId }));
      }
      if (msg.type === 'EVENT' && msg.topic === 'erp.production_order_completed') {
        customEventResolver(msg);
      }
    });

    const welcomeMsg = await welcomePromise;
    assert.equal(welcomeMsg.type, 'WELCOME');
    assert.equal(welcomeMsg.edgeNode, 'erp-industrial-edge');

    // 3. Testa Ping/Pong Heartbeat
    ws.send(JSON.stringify({ type: 'PING', timestamp: '2026-11-25T14:00:00Z' }));

    // 4. Publica evento crítico via REST -> Push imediato via WebSocket + Deduplicação
    const pub1 = await fetch(`http://127.0.0.1:${port}/api/realtime/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_erp_unique_001',
        topic: 'erp.production_order_completed',
        sourceEdge: 'machine-sensor-01',
        payload: { orderId: 'OP-9941', units: 500, status: 'FINALIZADO' }
      })
    });
    assert.equal(pub1.status, 200);
    const pub1Data = await pub1.json();
    assert.equal(pub1Data.ok, true);
    assert.equal(pub1Data.duplicate, false);
    assert.equal(pub1Data.deliveredTo, 1);

    // Envia o mesmo eventId novamente para testar o controle de duplicidade (idempotência E2E)
    const pubDup = await fetch(`http://127.0.0.1:${port}/api/realtime/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_erp_unique_001',
        topic: 'erp.production_order_completed',
        sourceEdge: 'machine-sensor-01',
        payload: { orderId: 'OP-9941', units: 500, status: 'FINALIZADO' }
      })
    });
    const pubDupData = await pubDup.json();
    assert.equal(pubDupData.duplicate, true);
    assert.equal(pubDupData.deliveredTo, 0);

    const receivedEvt = await customEventPromise;
    assert.equal(receivedEvt.eventId, 'evt_erp_unique_001');
    assert.equal(receivedEvt.payload.orderId, 'OP-9941');

    // Aguarda processamento do ACK no SQLite
    await new Promise((r) => setTimeout(r, 60));

    const statusRes1 = await fetch(`http://127.0.0.1:${port}/api/realtime/status`);
    const status1 = await statusRes1.json();
    assert.equal(status1.activeConnections, 1);
    assert.ok(status1.metrics.totalAcksReceived >= 1);

    const loggedEvt = status1.recentEvents.find((e) => e.eventId === 'evt_erp_unique_001');
    assert.ok(loggedEvt, 'Evento crítico deve estar persistido no log de auditoria SQLite');
    assert.equal(loggedEvt.ackCount, 1);

    ws.close();
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
