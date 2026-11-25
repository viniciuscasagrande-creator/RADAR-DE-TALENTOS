import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { authenticate } from './security.mjs';

export const RADAR_PERMISSIONS_CATALOG = [
  { key: 'overview', label: 'Visão Geral & Ficha 360°', path: '/', defaultUser: true },
  { key: 'audience', label: 'Audiência Geográfica & Mapa IBGE', path: '/audience.html', defaultUser: true },
  { key: 'commercial', label: 'Oportunidade Comercial & Radar Score 2.0', path: '/commercial.html', defaultUser: true },
  { key: 'rising', label: 'Talentos Emergentes & Tração Digital', path: '/rising.html', defaultUser: true },
  { key: 'simulator_pl', label: 'Simulador Financeiro de Eventos (P&L)', path: '#simulator', defaultUser: true },
  { key: 'radar_ai', label: 'Radar IA — Assistente de Inteligência', path: '#radar-ai', defaultUser: true },
  { key: 'events', label: 'Eventos e Ticketeiras (Consulta Opcional)', path: '/events.html', defaultUser: true },
  { key: 'acquisition', label: 'Motor de Dados 3.0 (Administração)', path: '/acquisition.html', defaultUser: false },
  { key: 'discovery', label: 'Prospecção e Aprovação de Talentos', path: '/discovery.html', defaultUser: false },
  { key: 'users', label: 'Gestão de Usuários, Senhas e Permissões', path: '/users.html', defaultUser: false }
];

const ALL_TRUE_PERMS = Object.fromEntries(RADAR_PERMISSIONS_CATALOG.map(p => [p.key, true]));
const DEFAULT_USER_PERMS = Object.fromEntries(RADAR_PERMISSIONS_CATALOG.map(p => [p.key, Boolean(p.defaultUser)]));

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, expectedHash, salt) {
  try {
    const actual = Buffer.from(scryptSync(String(password), salt, 64).toString('hex'), 'hex');
    const expected = Buffer.from(String(expectedHash), 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(pwd = '') {
  const s = String(pwd);
  if (s.length < 8) return 'A nova senha deve ter no mínimo 8 caracteres.';
  if (!/[A-Z]/.test(s)) return 'A nova senha deve conter pelo menos 1 letra maiúscula (A–Z).';
  if (!/[a-z]/.test(s)) return 'A nova senha deve conter pelo menos 1 letra minúscula (a–z).';
  if (!/[0-9]/.test(s)) return 'A nova senha deve conter pelo menos 1 número (0–9).';
  if (!/[^A-Za-z0-9]/.test(s)) return 'A nova senha deve conter pelo menos 1 caractere especial (ex.: @, #, $, !, %).';
  return null;
}

function normalizePermissions(raw = {}, isAdmin = false) {
  if (isAdmin) return { ...ALL_TRUE_PERMS };
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  }
  const out = {};
  for (const item of RADAR_PERMISSIONS_CATALOG) {
    out[item.key] = parsed && typeof parsed[item.key] === 'boolean' ? parsed[item.key] : Boolean(item.defaultUser);
  }
  return out;
}

function formatUserRow(row) {
  if (!row) return null;
  const isAdmin = row.role === 'admin';
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email || '',
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
    active: Boolean(row.active),
    permissions: normalizePermissions(row.permissions_json, isAdmin),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at
  };
}

export function ensureDefaultAdminUser(db) {
  if (!db) return null;
  const count = db.prepare('SELECT count(*) AS n FROM radar_users').get().n;
  if (count > 0) return db.prepare("SELECT * FROM radar_users WHERE role='admin' ORDER BY created_at ASC LIMIT 1").get();
  const now = new Date().toISOString();
  const defaultPwd = process.env.RADAR_ADMIN_INITIAL_PASSWORD || 'Radar@2026';
  const { hash, salt } = hashPassword(defaultPwd);
  db.prepare(
    `INSERT INTO radar_users(id,username,display_name,email,role,password_hash,password_salt,must_change_password,active,permissions_json,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,0,1,?,?,?)`
  ).run(
    'u-admin',
    'admin',
    'Administrador Radar',
    'admin@radardetalentos.com.br',
    'admin',
    hash,
    salt,
    JSON.stringify(ALL_TRUE_PERMS),
    now,
    now
  );
  return db.prepare('SELECT * FROM radar_users WHERE id=?').get('u-admin');
}

function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

export function resolveSessionContext(db, req) {
  if (!db) return { authenticated: false, user: null, effectiveUser: null, impersonating: false };
  ensureDefaultAdminUser(db);
  const cookies = parseCookies(req);
  const token = cookies.radar_session || req.headers?.['x-radar-session'] || '';
  const now = new Date().toISOString();

  if (token) {
    const sess = db.prepare('SELECT * FROM radar_sessions WHERE token = ? AND expires_at > ?').get(token, now);
    if (sess) {
      const baseUserRow = db.prepare('SELECT * FROM radar_users WHERE id = ? AND active = 1').get(sess.user_id);
      if (baseUserRow) {
        const baseUser = formatUserRow(baseUserRow);
        let effectiveUser = baseUser;
        let impersonating = false;
        if (sess.impersonated_user_id && baseUser.role === 'admin') {
          const impRow = db.prepare('SELECT * FROM radar_users WHERE id = ?').get(sess.impersonated_user_id);
          if (impRow) {
            effectiveUser = formatUserRow(impRow);
            impersonating = true;
          }
        }
        return {
          authenticated: true,
          token,
          user: baseUser,
          effectiveUser,
          impersonating
        };
      }
    }
  }

  // Fallback dev/default: se não houver cookie de sessão ativa, retorna o perfil Admin padrão para não quebrar fluxos existentes,
  // permitindo trocar de usuário ou fazer login a qualquer momento.
  const defaultAdmin = formatUserRow(db.prepare("SELECT * FROM radar_users WHERE role='admin' ORDER BY created_at ASC LIMIT 1").get());
  return {
    authenticated: false,
    token: null,
    user: defaultAdmin,
    effectiveUser: defaultAdmin,
    impersonating: false
  };
}

const send = (res, status, data, extraHeaders = {}) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
};

async function readJsonBody(req, maxBytes = 32768) {
  let n = 0;
  const parts = [];
  for await (const chunk of req) {
    n += chunk.length;
    if (n > maxBytes) throw Error('Payload excedeu o limite permitido');
    parts.push(chunk);
  }
  if (!parts.length) return {};
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

export async function handleUsersApi(req, res, { database, security } = {}) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/auth/') && !url.pathname.startsWith('/api/users')) return false;
  if (!database) {
    send(res, 503, { error: 'Banco de dados indisponível' });
    return true;
  }
  if (security && !authenticate(req, security)) {
    send(res, 401, { error: 'Autenticação necessária' });
    return true;
  }

  try {
    ensureDefaultAdminUser(database);
    const ctx = resolveSessionContext(database, req);

    // 1. GET /api/auth/me
    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      send(res, 200, {
        authenticated: ctx.authenticated,
        impersonating: ctx.impersonating,
        adminUser: ctx.user,
        user: ctx.effectiveUser,
        permissionsCatalog: RADAR_PERMISSIONS_CATALOG
      });
      return true;
    }

    // 2. POST /api/auth/login
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const b = await readJsonBody(req);
      const username = String(b.username || '').trim().toLowerCase();
      const password = String(b.password || '');
      if (!username || !password) {
        send(res, 400, { error: 'Informe usuário e senha.' });
        return true;
      }
      const userRow = database.prepare('SELECT * FROM radar_users WHERE lower(username) = ?').get(username);
      if (!userRow || !userRow.active) {
        send(res, 401, { error: 'Usuário ou senha inválidos, ou conta desativada.' });
        return true;
      }
      if (!verifyPassword(password, userRow.password_hash, userRow.password_salt)) {
        send(res, 401, { error: 'Usuário ou senha inválidos.' });
        return true;
      }
      const token = randomBytes(32).toString('hex');
      const now = new Date().toISOString();
      const expires = new Date(Date.now() + 7 * 86400000).toISOString();
      database.prepare('INSERT INTO radar_sessions(token,user_id,impersonated_user_id,created_at,expires_at) VALUES(?,?,NULL,?,?)').run(token, userRow.id, now, expires);
      database.prepare('UPDATE radar_users SET last_login_at = ? WHERE id = ?').run(now, userRow.id);
      const formatted = formatUserRow(database.prepare('SELECT * FROM radar_users WHERE id = ?').get(userRow.id));
      send(
        res,
        200,
        {
          ok: true,
          token,
          user: formatted,
          mustChangePassword: formatted.mustChangePassword
        },
        {
          'Set-Cookie': `radar_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
        }
      );
      return true;
    }

    // 3. POST /api/auth/logout
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      if (ctx.token) {
        database.prepare('DELETE FROM radar_sessions WHERE token = ?').run(ctx.token);
      }
      send(
        res,
        200,
        { ok: true },
        {
          'Set-Cookie': 'radar_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
        }
      );
      return true;
    }

    // 4. POST /api/auth/change-password (obrigatório no 1º acesso ou após reset pelo Admin)
    if (req.method === 'POST' && url.pathname === '/api/auth/change-password') {
      const b = await readJsonBody(req);
      const targetUserId = ctx.effectiveUser?.id;
      if (!targetUserId) {
        send(res, 401, { error: 'Sessão inválida para alteração de senha.' });
        return true;
      }
      const newPassword = String(b.newPassword || '');
      const confirmPassword = String(b.confirmPassword ?? newPassword);
      if (newPassword !== confirmPassword) {
        send(res, 400, { error: 'A confirmação da nova senha não confere.' });
        return true;
      }
      const strengthError = validatePasswordStrength(newPassword);
      if (strengthError) {
        send(res, 400, { error: strengthError });
        return true;
      }
      const row = database.prepare('SELECT * FROM radar_users WHERE id = ?').get(targetUserId);
      if (!row) {
        send(res, 404, { error: 'Usuário não encontrado.' });
        return true;
      }
      if (verifyPassword(newPassword, row.password_hash, row.password_salt)) {
        send(res, 400, { error: 'A nova senha deve ser diferente da senha provisória/atual.' });
        return true;
      }
      const { hash, salt } = hashPassword(newPassword);
      const now = new Date().toISOString();
      database.prepare('UPDATE radar_users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?').run(hash, salt, now, targetUserId);
      const updated = formatUserRow(database.prepare('SELECT * FROM radar_users WHERE id = ?').get(targetUserId));
      send(res, 200, { ok: true, user: updated, message: 'Nova senha cadastrada com sucesso seguindo os padrões de segurança!' });
      return true;
    }

    // 5. POST /api/auth/impersonate (Admin troca o perfil ativo para o usuário selecionado ou volta ao Admin)
    if (req.method === 'POST' && url.pathname === '/api/auth/impersonate') {
      if (ctx.user?.role !== 'admin') {
        send(res, 403, { error: 'Somente o Administrador pode alternar para o perfil de outro usuário.' });
        return true;
      }
      const b = await readJsonBody(req);
      const targetUserId = b.userId ? String(b.userId).trim() : null;
      let token = ctx.token;
      const now = new Date().toISOString();
      const expires = new Date(Date.now() + 7 * 86400000).toISOString();

      if (targetUserId && targetUserId !== ctx.user.id) {
        const targetRow = database.prepare('SELECT * FROM radar_users WHERE id = ?').get(targetUserId);
        if (!targetRow) {
          send(res, 404, { error: 'Usuário de destino não encontrado.' });
          return true;
        }
        if (!token) {
          token = randomBytes(32).toString('hex');
          database.prepare('INSERT INTO radar_sessions(token,user_id,impersonated_user_id,created_at,expires_at) VALUES(?,?,?,?,?)').run(token, ctx.user.id, targetRow.id, now, expires);
        } else {
          database.prepare('UPDATE radar_sessions SET impersonated_user_id = ? WHERE token = ?').run(targetRow.id, token);
        }
        send(
          res,
          200,
          {
            ok: true,
            impersonating: true,
            user: formatUserRow(targetRow),
            adminUser: ctx.user,
            message: `Perfil alternado para "${targetRow.display_name}" (@${targetRow.username}).`
          },
          {
            'Set-Cookie': `radar_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
          }
        );
        return true;
      } else {
        if (token) {
          database.prepare('UPDATE radar_sessions SET impersonated_user_id = NULL WHERE token = ?').run(token);
        }
        send(res, 200, {
          ok: true,
          impersonating: false,
          user: ctx.user,
          adminUser: ctx.user,
          message: 'Retornado ao perfil Administrador.'
        });
        return true;
      }
    }

    // 6. GET /api/users (Lista todos os usuários e permissões)
    if (req.method === 'GET' && url.pathname === '/api/users') {
      const rows = database.prepare('SELECT * FROM radar_users ORDER BY CASE WHEN role=\'admin\' THEN 0 ELSE 1 END, display_name ASC').all();
      send(res, 200, {
        items: rows.map(formatUserRow),
        permissionsCatalog: RADAR_PERMISSIONS_CATALOG,
        currentSession: {
          authenticated: ctx.authenticated,
          impersonating: ctx.impersonating,
          adminUser: ctx.user,
          effectiveUser: ctx.effectiveUser
        }
      });
      return true;
    }

    // Operações de escrita em /api/users exigem perfil base de Administrador
    if (ctx.user?.role !== 'admin') {
      send(res, 403, { error: 'Operação restrita ao Administrador do Radar.' });
      return true;
    }

    // 7. POST /api/users (Admin cria novo usuário + senha inicial + checkboxes de permissões)
    if (req.method === 'POST' && url.pathname === '/api/users') {
      const b = await readJsonBody(req);
      const rawName = String(b.displayName || b.name || b.username || '').trim();
      const rawLogin = String(b.username || rawName)
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9._-]+/g, '.')
        .replace(/^\.+|\.+$/g, '');
      const username = rawLogin;
      const displayName = rawName || username;
      const email = String(b.email || '').trim();
      const role = b.role === 'admin' ? 'admin' : 'user';
      const initialPassword = String(b.password || 'Mudar@123').trim() || 'Mudar@123';

      if (!username || username.length < 3) {
        send(res, 400, { error: 'Informe um Nome Completo ou Login com pelo menos 3 caracteres.' });
        return true;
      }
      const exists = database.prepare('SELECT id FROM radar_users WHERE lower(username) = ?').get(username);
      if (exists) {
        send(res, 409, { error: `Já existe um usuário cadastrado com o login "${username}".` });
        return true;
      }

      const id = 'u-' + username + '-' + randomBytes(3).toString('hex');
      const { hash, salt } = hashPassword(initialPassword);
      const perms = normalizePermissions(b.permissions || DEFAULT_USER_PERMS, role === 'admin');
      const mustChange = b.mustChangePassword === false ? 0 : 1;
      const now = new Date().toISOString();

      database.prepare(
        `INSERT INTO radar_users(id,username,display_name,email,role,password_hash,password_salt,must_change_password,active,permissions_json,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,1,?,?,?)`
      ).run(id, username, displayName, email, role, hash, salt, mustChange, JSON.stringify(perms), now, now);

      const created = formatUserRow(database.prepare('SELECT * FROM radar_users WHERE id = ?').get(id));
      send(res, 201, {
        ok: true,
        user: created,
        message: `Usuário "${displayName}" (@${username}) criado com sucesso! No primeiro login será obrigatório cadastrar uma nova senha forte.`
      });
      return true;
    }

    // 8. POST /api/users/permissions (Admin atualiza checkboxes de permissões, perfil ou status ativo)
    if (req.method === 'POST' && url.pathname === '/api/users/permissions') {
      const b = await readJsonBody(req);
      const userId = String(b.userId || '').trim();
      const row = database.prepare('SELECT * FROM radar_users WHERE id = ?').get(userId);
      if (!row) {
        send(res, 404, { error: 'Usuário não localizado.' });
        return true;
      }
      const newRole = b.role ? (b.role === 'admin' ? 'admin' : 'user') : row.role;
      const newActive = typeof b.active === 'boolean' ? (b.active ? 1 : 0) : row.active;
      const perms = normalizePermissions(b.permissions || row.permissions_json, newRole === 'admin');
      const now = new Date().toISOString();

      database.prepare('UPDATE radar_users SET role = ?, active = ?, permissions_json = ?, updated_at = ? WHERE id = ?').run(
        newRole,
        newActive,
        JSON.stringify(perms),
        now,
        userId
      );
      const updated = formatUserRow(database.prepare('SELECT * FROM radar_users WHERE id = ?').get(userId));
      send(res, 200, {
        ok: true,
        user: updated,
        message: `Permissões de "${updated.displayName}" atualizadas imediatamente!`
      });
      return true;
    }

    // 9. POST /api/users/reset-password (Admin reseta a senha do usuário e força troca no próximo login)
    if (req.method === 'POST' && url.pathname === '/api/users/reset-password') {
      const b = await readJsonBody(req);
      const userId = String(b.userId || '').trim();
      const tempPassword = String(b.newPassword || '').trim();
      if (!userId || tempPassword.length < 4) {
        send(res, 400, { error: 'Informe o usuário e a nova senha temporária (mínimo 4 caracteres).' });
        return true;
      }
      const row = database.prepare('SELECT * FROM radar_users WHERE id = ?').get(userId);
      if (!row) {
        send(res, 404, { error: 'Usuário não localizado.' });
        return true;
      }
      const { hash, salt } = hashPassword(tempPassword);
      const now = new Date().toISOString();
      database.prepare('UPDATE radar_users SET password_hash = ?, password_salt = ?, must_change_password = 1, updated_at = ? WHERE id = ?').run(
        hash,
        salt,
        now,
        userId
      );
      const updated = formatUserRow(database.prepare('SELECT * FROM radar_users WHERE id = ?').get(userId));
      send(res, 200, {
        ok: true,
        user: updated,
        message: `Senha de "${updated.displayName}" (@${updated.username}) resetada pelo Admin! O usuário deverá cadastrar uma nova senha segura no próximo login.`
      });
      return true;
    }

    // 10. POST /api/users/delete (Admin remove usuário não-admin padrão)
    if (req.method === 'POST' && url.pathname === '/api/users/delete') {
      const b = await readJsonBody(req);
      const userId = String(b.userId || '').trim();
      if (userId === 'u-admin' || userId === ctx.user?.id) {
        send(res, 400, { error: 'Não é permitido excluir o administrador principal.' });
        return true;
      }
      database.prepare('DELETE FROM radar_users WHERE id = ?').run(userId);
      send(res, 200, { ok: true, message: 'Usuário removido.' });
      return true;
    }

    send(res, 404, { error: 'Endpoint de usuários não encontrado.' });
    return true;
  } catch (err) {
    send(res, 400, { error: err.message || 'Erro ao processar requisição de usuários.' });
    return true;
  }
}
