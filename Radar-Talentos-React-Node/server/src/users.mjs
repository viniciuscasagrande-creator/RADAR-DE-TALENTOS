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

export const RADAR_ROLE_PROFILES = [
  {
    role: 'superadmin',
    label: 'Superadministrador',
    description: 'Controle integral da plataforma',
    defaultRoute: '/',
    permissions: ['overview', 'audience', 'commercial', 'rising', 'simulator_pl', 'radar_ai', 'events', 'acquisition', 'discovery', 'users']
  },
  {
    role: 'admin',
    label: 'Administrador',
    description: 'Usuários, integrações e configurações',
    defaultRoute: '/',
    permissions: ['overview', 'audience', 'commercial', 'rising', 'simulator_pl', 'radar_ai', 'events', 'acquisition', 'discovery', 'users']
  },
  {
    role: 'analyst',
    label: 'Analista',
    description: 'Motor de Dados, prospecção e validação',
    defaultRoute: '/acquisition.html',
    permissions: ['overview', 'audience', 'commercial', 'rising', 'events', 'acquisition', 'discovery']
  },
  {
    role: 'entrepreneur',
    label: 'Empresário',
    description: 'Inteligência comercial e artística',
    defaultRoute: '/commercial.html',
    permissions: ['overview', 'audience', 'commercial', 'rising', 'simulator_pl', 'radar_ai']
  },
  {
    role: 'producer',
    label: 'Produtor',
    description: 'Audiência, eventos e oportunidades',
    defaultRoute: '/audience.html',
    permissions: ['overview', 'audience', 'commercial', 'rising', 'simulator_pl', 'radar_ai', 'events']
  },
  {
    role: 'consultant',
    label: 'Consultor',
    description: 'Consulta a módulos autorizados',
    defaultRoute: '/',
    permissions: ['overview', 'audience', 'commercial', 'rising', 'radar_ai']
  },
  {
    role: 'visitor',
    label: 'Visitante',
    description: 'Acesso demonstrativo restrito',
    defaultRoute: '/',
    permissions: ['overview', 'rising']
  }
];

const ALL_TRUE_PERMS = Object.fromEntries(RADAR_PERMISSIONS_CATALOG.map(p => [p.key, true]));
const DEFAULT_USER_PERMS = Object.fromEntries(RADAR_PERMISSIONS_CATALOG.map(p => [p.key, Boolean(p.defaultUser)]));

// Proteção contra força bruta / tentativas excessivas de login
const loginAttempts = new Map();

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

export function isAdminRole(role = '') {
  return role === 'admin' || role === 'superadmin';
}

export function hasUsersAdminPower(user) {
  if (!user) return false;
  return isAdminRole(user.role) || Boolean(user.permissions?.users);
}

export function defaultPermissionsForRole(role = 'producer') {
  if (isAdminRole(role)) return { ...ALL_TRUE_PERMS };
  const found = RADAR_ROLE_PROFILES.find(r => r.role === role);
  if (!found) return { ...DEFAULT_USER_PERMS };
  const set = new Set(found.permissions);
  return Object.fromEntries(RADAR_PERMISSIONS_CATALOG.map(p => [p.key, set.has(p.key)]));
}

function normalizePermissions(raw = {}, role = 'user') {
  if (isAdminRole(role)) return { ...ALL_TRUE_PERMS };
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  }
  const roleDefaults = defaultPermissionsForRole(role);
  const out = {};
  for (const item of RADAR_PERMISSIONS_CATALOG) {
    out[item.key] = parsed && typeof parsed[item.key] === 'boolean' ? parsed[item.key] : Boolean(roleDefaults[item.key]);
  }
  return out;
}

function formatUserRow(row) {
  if (!row) return null;
  const roleMeta = RADAR_ROLE_PROFILES.find(r => r.role === row.role) || {
    role: row.role,
    label: row.role === 'admin' ? 'Administrador' : 'Usuário',
    description: 'Consulta a módulos autorizados',
    defaultRoute: '/'
  };
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email || '',
    role: row.role,
    roleLabel: roleMeta.label,
    roleDescription: roleMeta.description,
    defaultRoute: roleMeta.defaultRoute,
    mustChangePassword: Boolean(row.must_change_password),
    active: Boolean(row.active),
    permissions: normalizePermissions(row.permissions_json, row.role),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at
  };
}

function recordAccessLog(db, { username = 'anon', userId = null, action = 'login', ip = '', status = 'ok', detail = '' } = {}) {
  try {
    db.prepare(
      'INSERT INTO radar_access_logs(id,username,user_id,action,ip,status,detail,created_at) VALUES(?,?,?,?,?,?,?,?)'
    ).run(
      'log-' + randomBytes(6).toString('hex'),
      String(username).slice(0, 120),
      userId,
      String(action).slice(0, 80),
      String(ip).slice(0, 64),
      String(status).slice(0, 40),
      String(detail).slice(0, 400),
      new Date().toISOString()
    );
  } catch {}
}

export function ensureDefaultAdminUser(db) {
  if (!db) return null;
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS radar_access_logs (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS radar_signup_requests (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      job_title TEXT NOT NULL DEFAULT '',
      document TEXT NOT NULL DEFAULT '',
      city_uf TEXT NOT NULL DEFAULT '',
      purpose TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      assigned_username TEXT,
      assigned_role TEXT DEFAULT 'producer',
      temp_password_hint TEXT,
      review_note TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT,
      reviewed_at TEXT,
      email_sent INTEGER NOT NULL DEFAULT 0,
      email_delivery_mode TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    ) STRICT;`);
  } catch {}
  for (const alterSql of [
    "ALTER TABLE radar_sessions ADD COLUMN ip TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE radar_sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT ''"
  ]) {
    try { db.exec(alterSql); } catch {}
  }
  try {
    const tableMeta = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'radar_users'").get();
    if (tableMeta?.sql && /CHECK\s*\(\s*role\s+IN/i.test(tableMeta.sql)) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        BEGIN;
        CREATE TABLE radar_users_v2 (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          email TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL DEFAULT 'user',
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          must_change_password INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0,1)),
          active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
          permissions_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_login_at TEXT
        ) STRICT;
        INSERT INTO radar_users_v2 SELECT id, username, display_name, email, role, password_hash, password_salt, must_change_password, active, permissions_json, created_at, updated_at, last_login_at FROM radar_users;
        DROP TABLE radar_users;
        ALTER TABLE radar_users_v2 RENAME TO radar_users;
        COMMIT;
        PRAGMA foreign_keys = ON;
      `);
    }
  } catch {
    try { db.exec('ROLLBACK; PRAGMA foreign_keys = ON;'); } catch {}
  }
  try {
    db.prepare("UPDATE radar_users SET role = 'admin' WHERE lower(username) = 'vinicius.casagrande' AND role = 'user'").run();
    const nailaRows = db
      .prepare("SELECT id FROM radar_users WHERE id = 'u-naila.longas-210a89'")
      .all();
    for (const nr of nailaRows) {
      db.prepare('DELETE FROM radar_sessions WHERE user_id = ? OR impersonated_user_id = ?').run(nr.id, nr.id);
      db.prepare('DELETE FROM radar_users WHERE id = ?').run(nr.id);
    }
  } catch {}
  const adminRow = db.prepare("SELECT * FROM radar_users WHERE role IN ('admin','superadmin') ORDER BY created_at ASC LIMIT 1").get();
  if (adminRow) {
    return adminRow;
  }
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
        if (sess.impersonated_user_id && hasUsersAdminPower(baseUser)) {
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

  const defaultAdmin = formatUserRow(
    db.prepare("SELECT * FROM radar_users WHERE role IN ('admin','superadmin') ORDER BY created_at ASC LIMIT 1").get()
  );
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

  const clientIp = req.socket?.remoteAddress || '127.0.0.1';

  try {
    ensureDefaultAdminUser(database);
    const ctx = resolveSessionContext(database, req);

    // 1. GET /api/auth/me
    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      let pendingSignupsCount = 0;
      try {
        pendingSignupsCount = database.prepare("SELECT count(*) AS n FROM radar_signup_requests WHERE status = 'pending'").get().n;
      } catch {}
      send(res, 200, {
        authenticated: ctx.authenticated,
        impersonating: ctx.impersonating,
        adminUser: ctx.user,
        user: ctx.effectiveUser,
        pendingSignupsCount,
        permissionsCatalog: RADAR_PERMISSIONS_CATALOG,
        roleProfiles: RADAR_ROLE_PROFILES
      });
      return true;
    }

    // 1b. POST /api/auth/register-request (Formulário público "Cadastre-se" na página de login)
    if (req.method === 'POST' && url.pathname === '/api/auth/register-request') {
      const b = await readJsonBody(req);
      const fullName = String(b.fullName || b.name || '').trim().slice(0, 140);
      const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
      const phone = String(b.phone || '').trim().slice(0, 40);
      const company = String(b.company || '').trim().slice(0, 140);
      const jobTitle = String(b.jobTitle || '').trim().slice(0, 100);
      const document = String(b.document || '').trim().slice(0, 40);
      const cityUf = String(b.cityUf || '').trim().slice(0, 100);
      const purpose = String(b.purpose || '').trim().slice(0, 500);

      if (fullName.length < 3) {
        send(res, 400, { error: 'Informe seu nome completo (mínimo 3 caracteres).' });
        return true;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        send(res, 400, { error: 'Informe um endereço de e-mail válido para receber a confirmação e a senha temporária.' });
        return true;
      }
      if (phone.length < 8) {
        send(res, 400, { error: 'Informe seu telefone / WhatsApp com DDD.' });
        return true;
      }
      if (company.length < 2) {
        send(res, 400, { error: 'Informe sua empresa, produtora, escritório ou instituição.' });
        return true;
      }

      const existingUser = database.prepare('SELECT id FROM radar_users WHERE lower(email) = ?').get(email);
      if (existingUser) {
        send(res, 409, { error: 'Este e-mail já possui um cadastro ativo no Radar de Talentos. Utilize a tela de login.' });
        return true;
      }
      const existingPending = database
        .prepare("SELECT id FROM radar_signup_requests WHERE lower(email) = ? AND status = 'pending'")
        .get(email);
      if (existingPending) {
        send(res, 200, {
          ok: true,
          requestId: existingPending.id,
          message: 'Já recebemos sua solicitação de cadastro para este e-mail! Nossa equipe está validando seus dados e enviará o retorno com sua senha temporária por e-mail.'
        });
        return true;
      }

      const reqId = 'req-' + randomBytes(5).toString('hex');
      const now = new Date().toISOString();
      database
        .prepare(
          `INSERT INTO radar_signup_requests(
             id, full_name, email, phone, company, job_title, document, city_uf, purpose, status, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
        )
        .run(reqId, fullName, email, phone, company, jobTitle, document, cityUf, purpose, now);

      recordAccessLog(database, {
        username: email,
        action: 'signup_requested',
        ip: clientIp,
        status: 'pending',
        detail: `Solicitação de cadastro enviada por ${fullName} (${company}${cityUf ? ' · ' + cityUf : ''})`
      });

      send(res, 201, {
        ok: true,
        requestId: reqId,
        message: 'Cadastro enviado com sucesso para validação! Você receberá um e-mail informando a aprovação junto com sua senha temporária de primeiro acesso.'
      });
      return true;
    }

    // 2. POST /api/auth/login (aceita login por usuário ou por e-mail + proteção contra tentativas excessivas)
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const b = await readJsonBody(req);
      const identifier = String(b.username || b.email || '').trim().toLowerCase();
      const password = String(b.password || '');
      const remember = Boolean(b.remember !== false);

      if (!identifier || !password) {
        send(res, 400, { error: 'Informe seu e-mail ou usuário e sua senha.' });
        return true;
      }

      const attemptKey = `${clientIp}|${identifier}`;
      const attempt = loginAttempts.get(attemptKey);
      if (attempt && attempt.count >= 6 && Date.now() - attempt.lastAt < 5 * 60000) {
        recordAccessLog(database, {
          username: identifier,
          action: 'login_blocked',
          ip: clientIp,
          status: 'blocked',
          detail: 'Bloqueio temporário por excesso de tentativas (5 min)'
        });
        send(res, 429, { error: 'Tentativas excessivas detectadas. Aguarde 5 minutos ou solicite o reset de senha ao Administrador.' });
        return true;
      }

      const userRow = database
        .prepare('SELECT * FROM radar_users WHERE lower(username) = ? OR (email != \'\' AND lower(email) = ?)')
        .get(identifier, identifier);

      if (!userRow || !userRow.active || !verifyPassword(password, userRow.password_hash, userRow.password_salt)) {
        const prevCount = attempt ? attempt.count : 0;
        loginAttempts.set(attemptKey, { count: prevCount + 1, lastAt: Date.now() });
        recordAccessLog(database, {
          username: identifier,
          userId: userRow?.id || null,
          action: 'login_failed',
          ip: clientIp,
          status: 'failed',
          detail: !userRow ? 'Usuário/e-mail não localizado' : !userRow.active ? 'Conta inativa' : 'Senha incorreta'
        });
        send(res, 401, { error: 'Credenciais inválidas ou acesso não autorizado.' });
        return true;
      }

      loginAttempts.delete(attemptKey);
      const token = randomBytes(32).toString('hex');
      const now = new Date().toISOString();
      const maxAgeSec = remember ? 14 * 86400 : 86400;
      const expires = new Date(Date.now() + maxAgeSec * 1000).toISOString();
      const ua = String(req.headers?.['user-agent'] || '').slice(0, 240);
      try {
        database
          .prepare('INSERT INTO radar_sessions(token,user_id,impersonated_user_id,created_at,expires_at,ip,user_agent) VALUES(?,?,NULL,?,?,?,?)')
          .run(token, userRow.id, now, expires, clientIp, ua);
      } catch {
        database
          .prepare('INSERT INTO radar_sessions(token,user_id,impersonated_user_id,created_at,expires_at) VALUES(?,?,NULL,?,?)')
          .run(token, userRow.id, now, expires);
      }
      database.prepare('UPDATE radar_users SET last_login_at = ? WHERE id = ?').run(now, userRow.id);

      const formatted = formatUserRow(database.prepare('SELECT * FROM radar_users WHERE id = ?').get(userRow.id));
      recordAccessLog(database, {
        username: formatted.username,
        userId: formatted.id,
        action: 'login_success',
        ip: clientIp,
        status: 'success',
        detail: `Perfil ${formatted.roleLabel} autenticado`
      });

      send(
        res,
        200,
        {
          ok: true,
          token,
          user: formatted,
          mustChangePassword: formatted.mustChangePassword,
          redirectUrl: formatted.defaultRoute || '/'
        },
        {
          'Set-Cookie': `radar_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`
        }
      );
      return true;
    }

    // 3. POST /api/auth/request-access (Solicitação de acesso ou recuperação de senha na tela de login)
    if (req.method === 'POST' && url.pathname === '/api/auth/request-access') {
      const b = await readJsonBody(req);
      const kind = b.kind === 'recover' ? 'recover_password' : 'request_access';
      const name = String(b.name || b.identifier || '').trim();
      const email = String(b.email || b.identifier || '').trim();
      const requestedRole = String(b.role || 'producer').trim();
      if (!name && !email) {
        send(res, 400, { error: 'Informe seu nome, usuário ou e-mail corporativo.' });
        return true;
      }
      recordAccessLog(database, {
        username: email || name,
        action: kind,
        ip: clientIp,
        status: 'pending_admin',
        detail: kind === 'recover_password'
          ? `Solicitação de reset de senha para "${email || name}"`
          : `Solicitação de novo acesso: ${name} (${email}) · Perfil sugerido: ${requestedRole}`
      });
      send(res, 200, {
        ok: true,
        message:
          kind === 'recover_password'
            ? 'Solicitação registrada na Central de Segurança! O Administrador foi notificado para resetar sua senha em Usuários.'
            : 'Solicitação de acesso registrada! O Administrador revisará seu perfil e liberará suas permissões no painel Usuários.'
      });
      return true;
    }

    // 4. POST /api/auth/logout
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      if (ctx.token) {
        database.prepare('DELETE FROM radar_sessions WHERE token = ?').run(ctx.token);
      }
      recordAccessLog(database, {
        username: ctx.effectiveUser?.username || 'admin',
        userId: ctx.effectiveUser?.id || null,
        action: 'logout',
        ip: clientIp,
        status: 'ok',
        detail: 'Sessão encerrada pelo usuário'
      });
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

    // 5. POST /api/auth/change-password (obrigatório no 1º acesso ou após reset pelo Admin)
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
      database
        .prepare('UPDATE radar_users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?')
        .run(hash, salt, now, targetUserId);
      const updated = formatUserRow(database.prepare('SELECT * FROM radar_users WHERE id = ?').get(targetUserId));
      recordAccessLog(database, {
        username: updated.username,
        userId: updated.id,
        action: 'password_changed',
        ip: clientIp,
        status: 'success',
        detail: 'Nova senha forte cadastrada pelo usuário'
      });
      send(res, 200, {
        ok: true,
        user: updated,
        redirectUrl: updated.defaultRoute || '/',
        message: 'Nova senha cadastrada com sucesso seguindo os padrões de segurança!'
      });
      return true;
    }

    // 6. POST /api/auth/impersonate (Admin troca o perfil ativo para o usuário selecionado ou volta ao Admin)
    if (req.method === 'POST' && url.pathname === '/api/auth/impersonate') {
      if (!hasUsersAdminPower(ctx.user) && !hasUsersAdminPower(ctx.effectiveUser)) {
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
          database
            .prepare('INSERT INTO radar_sessions(token,user_id,impersonated_user_id,created_at,expires_at) VALUES(?,?,?,?,?)')
            .run(token, ctx.user.id, targetRow.id, now, expires);
        } else {
          database.prepare('UPDATE radar_sessions SET impersonated_user_id = ? WHERE token = ?').run(targetRow.id, token);
        }
        const formattedTarget = formatUserRow(targetRow);
        recordAccessLog(database, {
          username: ctx.user.username,
          userId: ctx.user.id,
          action: 'impersonate_start',
          ip: clientIp,
          status: 'ok',
          detail: `Admin alternou para o perfil @${formattedTarget.username} (${formattedTarget.roleLabel})`
        });
        send(
          res,
          200,
          {
            ok: true,
            impersonating: true,
            user: formattedTarget,
            adminUser: ctx.user,
            message: `Perfil alternado para "${targetRow.display_name}" (@${targetRow.username} · ${formattedTarget.roleLabel}).`
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

    // 7. GET /api/users (Lista todos os usuários, perfis, sessões ativas, logs de acesso e permissões)
    if (req.method === 'GET' && url.pathname === '/api/users') {
      const rows = database
        .prepare("SELECT * FROM radar_users ORDER BY CASE WHEN role IN ('superadmin','admin') THEN 0 ELSE 1 END, display_name ASC")
        .all();
      const accessLogs = database.prepare('SELECT * FROM radar_access_logs ORDER BY created_at DESC LIMIT 30').all();
      const nowIso = new Date().toISOString();
      let activeSessions = [];
      try {
        const rawSessions = database
          .prepare(
            `SELECT s.token, s.user_id, s.impersonated_user_id, s.created_at, s.expires_at,
                    s.ip, s.user_agent, u.username, u.display_name, u.role
             FROM radar_sessions s
             JOIN radar_users u ON u.id = s.user_id
             WHERE s.expires_at > ?
             ORDER BY s.created_at DESC
             LIMIT 30`
          )
          .all(nowIso);
        activeSessions = rawSessions.map(s => ({
          sessionId: s.token.slice(0, 12),
          isCurrent: Boolean(ctx.token && s.token === ctx.token),
          userId: s.user_id,
          username: s.username,
          displayName: s.display_name,
          role: s.role,
          ip: s.ip || '127.0.0.1',
          userAgent: s.user_agent || 'Navegador / Dispositivo Web',
          deviceType: /RadarDeTalentosApp/i.test(s.user_agent || '')
            ? '📱 App Android (.APK)'
            : /Mobile|Android|iPhone/i.test(s.user_agent || '')
              ? '📱 Mobile Web'
              : /iPad|Tablet/i.test(s.user_agent || '')
                ? '📟 Tablet'
                : '💻 Desktop',
          createdAt: s.created_at,
          expiresAt: s.expires_at
        }));
      } catch {}
      let signupRequests = [];
      try {
        signupRequests = database
          .prepare(
            `SELECT * FROM radar_signup_requests
             ORDER BY CASE WHEN status = 'pending' THEN 0 WHEN status = 'approved' THEN 1 ELSE 2 END, created_at DESC
             LIMIT 100`
          )
          .all()
          .map(r => ({
            id: r.id,
            fullName: r.full_name,
            email: r.email,
            phone: r.phone,
            company: r.company,
            jobTitle: r.job_title,
            document: r.document,
            cityUf: r.city_uf,
            purpose: r.purpose,
            status: r.status,
            assignedUsername: r.assigned_username || '',
            assignedRole: r.assigned_role || 'producer',
            tempPasswordHint: r.temp_password_hint || '',
            reviewNote: r.review_note || '',
            reviewedBy: r.reviewed_by || '',
            reviewedAt: r.reviewed_at || null,
            emailSent: Boolean(r.email_sent),
            emailDeliveryMode: r.email_delivery_mode || '',
            createdAt: r.created_at
          }));
      } catch {}
      send(res, 200, {
        items: rows.map(formatUserRow),
        signupRequests,
        pendingSignupsCount: signupRequests.filter(r => r.status === 'pending').length,
        permissionsCatalog: RADAR_PERMISSIONS_CATALOG,
        roleProfiles: RADAR_ROLE_PROFILES,
        accessLogs,
        activeSessions,
        currentSession: {
          authenticated: ctx.authenticated,
          impersonating: ctx.impersonating,
          adminUser: ctx.user,
          effectiveUser: ctx.effectiveUser
        }
      });
      return true;
    }

    // Operações de escrita em /api/users exigem perfil de Administrador ou permissão de Gestão de Usuários
    if (!hasUsersAdminPower(ctx.user) && !hasUsersAdminPower(ctx.effectiveUser)) {
      send(res, 403, { error: 'Operação restrita ao Administrador do Radar.' });
      return true;
    }

    // 8. POST /api/users (Admin cria novo usuário + senha inicial + perfil + checkboxes de permissões)
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
      const validRoles = new Set(RADAR_ROLE_PROFILES.map(r => r.role).concat(['user']));
      const role = validRoles.has(b.role) ? b.role : 'user';
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
      const perms = normalizePermissions(b.permissions || defaultPermissionsForRole(role), role);
      const mustChange = b.mustChangePassword === false ? 0 : 1;
      const now = new Date().toISOString();

      database
        .prepare(
          `INSERT INTO radar_users(id,username,display_name,email,role,password_hash,password_salt,must_change_password,active,permissions_json,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,1,?,?,?)`
        )
        .run(id, username, displayName, email, role, hash, salt, mustChange, JSON.stringify(perms), now, now);

      const created = formatUserRow(database.prepare('SELECT * FROM radar_users WHERE id = ?').get(id));
      recordAccessLog(database, {
        username: created.username,
        userId: created.id,
        action: 'user_created',
        ip: clientIp,
        status: 'ok',
        detail: `Criado pelo Admin com perfil ${created.roleLabel}`
      });
      send(res, 201, {
        ok: true,
        user: created,
        message: `Usuário "${displayName}" (@${username} · ${created.roleLabel}) criado com sucesso! No primeiro login será obrigatório cadastrar uma nova senha forte.`
      });
      return true;
    }

    // 9. POST /api/users/permissions (Admin atualiza checkboxes de permissões, perfil ou status ativo)
    if (req.method === 'POST' && url.pathname === '/api/users/permissions') {
      const b = await readJsonBody(req);
      const userId = String(b.userId || '').trim();
      const row = database.prepare('SELECT * FROM radar_users WHERE id = ?').get(userId);
      if (!row) {
        send(res, 404, { error: 'Usuário não localizado.' });
        return true;
      }
      const validRoles = new Set(RADAR_ROLE_PROFILES.map(r => r.role).concat(['user']));
      const newRole = b.role && validRoles.has(b.role) ? b.role : row.role;
      const newActive = typeof b.active === 'boolean' ? (b.active ? 1 : 0) : row.active;
      const perms = normalizePermissions(b.permissions || row.permissions_json, newRole);
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

    // 10. POST /api/users/reset-password (Admin reseta a senha do usuário e força troca no próximo login)
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
      database
        .prepare('UPDATE radar_users SET password_hash = ?, password_salt = ?, must_change_password = 1, updated_at = ? WHERE id = ?')
        .run(hash, salt, now, userId);
      const updated = formatUserRow(database.prepare('SELECT * FROM radar_users WHERE id = ?').get(userId));
      recordAccessLog(database, {
        username: updated.username,
        userId: updated.id,
        action: 'password_reset_by_admin',
        ip: clientIp,
        status: 'ok',
        detail: 'Senha provisória resetada pelo Administrador (troca obrigatória ativada)'
      });
      send(res, 200, {
        ok: true,
        user: updated,
        message: `Senha de "${updated.displayName}" (@${updated.username}) resetada pelo Admin! O usuário deverá cadastrar uma nova senha segura no próximo login.`
      });
      return true;
    }

    // 11. POST /api/users/delete (Admin pode remover qualquer usuário, inclusive contas de administrador)
    if (req.method === 'POST' && url.pathname === '/api/users/delete') {
      const b = await readJsonBody(req);
      const userId = String(b.userId || '').trim();
      const usernameParam = String(b.username || '').trim().toLowerCase();
      const targetRow = userId
        ? database.prepare('SELECT * FROM radar_users WHERE id = ?').get(userId)
        : usernameParam
          ? database.prepare('SELECT * FROM radar_users WHERE lower(username) = ?').get(usernameParam)
          : null;
      if (!targetRow) {
        send(res, 404, { error: 'Usuário não localizado para exclusão.' });
        return true;
      }
      database.prepare('DELETE FROM radar_sessions WHERE user_id = ? OR impersonated_user_id = ?').run(targetRow.id, targetRow.id);
      try {
        if (targetRow.username) {
          database
            .prepare("DELETE FROM radar_signup_requests WHERE lower(assigned_username) = lower(?)")
            .run(targetRow.username);
        }
      } catch {}
      database.prepare('DELETE FROM radar_users WHERE id = ?').run(targetRow.id);
      ensureDefaultAdminUser(database);
      recordAccessLog(database, {
        username: targetRow.username,
        userId: targetRow.id,
        action: 'user_deleted_by_admin',
        ip: clientIp,
        status: 'ok',
        detail: `Usuário ${targetRow.display_name} (@${targetRow.username}) excluído pelo Admin (@${ctx.user?.username || 'admin'})`
      });
      send(res, 200, {
        ok: true,
        deletedUserId: targetRow.id,
        message: `Usuário "${targetRow.display_name}" (@${targetRow.username}) excluído com sucesso.`
      });
      return true;
    }

    // 11b. POST /api/users/signup-requests/delete (Admin exclui solicitação da fila de cadastros)
    if (req.method === 'POST' && url.pathname === '/api/users/signup-requests/delete') {
      const b = await readJsonBody(req);
      const requestId = String(b.requestId || '').trim();
      const reqRow = database.prepare('SELECT * FROM radar_signup_requests WHERE id = ?').get(requestId);
      if (!reqRow) {
        send(res, 404, { error: 'Solicitação de cadastro não encontrada.' });
        return true;
      }
      database.prepare('DELETE FROM radar_signup_requests WHERE id = ?').run(requestId);
      send(res, 200, {
        ok: true,
        deletedRequestId: requestId,
        message: `Solicitação de "${reqRow.full_name}" excluída com sucesso.`
      });
      return true;
    }

    // 12. POST /api/users/sessions/revoke (Admin revoga uma sessão ativa remotamente)
    if (req.method === 'POST' && url.pathname === '/api/users/sessions/revoke') {
      const b = await readJsonBody(req);
      const sessionIdPrefix = String(b.sessionId || '').trim();
      if (!sessionIdPrefix || sessionIdPrefix.length < 6) {
        send(res, 400, { error: 'Identificador de sessão inválido.' });
        return true;
      }
      const resDel = database
        .prepare('DELETE FROM radar_sessions WHERE substr(token, 1, 12) = ?')
        .run(sessionIdPrefix.slice(0, 12));
      recordAccessLog(database, {
        username: ctx.user?.username || 'admin',
        userId: ctx.user?.id || null,
        action: 'session_revoked',
        ip: clientIp,
        status: 'ok',
        detail: `Sessão ${sessionIdPrefix} encerrada remotamente pelo Admin`
      });
      send(res, 200, {
        ok: true,
        revoked: resDel.changes,
        message: 'Sessão encerrada remotamente com sucesso!'
      });
      return true;
    }

    // 13. POST /api/users/signup-requests/review (Admin aprova ou recusa solicitação de cadastro do site, gera senha temporária e retorna e-mail pronto)
    if (req.method === 'POST' && url.pathname === '/api/users/signup-requests/review') {
      const b = await readJsonBody(req);
      const requestId = String(b.requestId || '').trim();
      const decision = String(b.decision || '').trim().toLowerCase();
      const reviewNote = String(b.reviewNote || '').trim().slice(0, 400);
      const validRoles = new Set(RADAR_ROLE_PROFILES.map(r => r.role).concat(['user']));
      const role = validRoles.has(b.role) ? b.role : 'producer';

      const reqRow = database.prepare('SELECT * FROM radar_signup_requests WHERE id = ?').get(requestId);
      if (!reqRow) {
        send(res, 404, { error: 'Solicitação de cadastro não encontrada.' });
        return true;
      }
      if (!['approve', 'reject'].includes(decision)) {
        send(res, 400, { error: 'Decisão inválida. Informe approve ou reject.' });
        return true;
      }

      const now = new Date().toISOString();
      const reviewerName = ctx.user?.username || 'admin';
      const portalUrl = 'https://radardetalentos.net.br/login.html';

      if (decision === 'approve') {
        const tempNum = String(Math.floor(1000 + Math.random() * 9000));
        const tempPassword = String(b.tempPassword || '').trim() || `Radar@${tempNum}`;
        const emailPrefix = String(reqRow.email.split('@')[0] || reqRow.full_name)
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, '.')
          .replace(/^\.+|\.+$/g, '')
          .slice(0, 32);
        let username = String(b.username || '').trim().toLowerCase() || emailPrefix || 'cliente.radar';
        const collision = database.prepare('SELECT id, email FROM radar_users WHERE lower(username) = ?').get(username);
        if (collision && String(collision.email || '').toLowerCase() !== reqRow.email.toLowerCase()) {
          username = `${username}.${tempNum.slice(0, 3)}`;
        }

        const existingByEmail = database.prepare('SELECT * FROM radar_users WHERE lower(email) = ?').get(reqRow.email.toLowerCase());
        const { hash, salt } = hashPassword(tempPassword);
        const perms = normalizePermissions(b.permissions || defaultPermissionsForRole(role), role);
        let userId;
        if (existingByEmail) {
          userId = existingByEmail.id;
          username = existingByEmail.username;
          database
            .prepare(
              'UPDATE radar_users SET display_name = ?, role = ?, password_hash = ?, password_salt = ?, must_change_password = 1, active = 1, permissions_json = ?, updated_at = ? WHERE id = ?'
            )
            .run(reqRow.full_name, role, hash, salt, JSON.stringify(perms), now, userId);
        } else {
          userId = 'u-' + username + '-' + randomBytes(3).toString('hex');
          database
            .prepare(
              `INSERT INTO radar_users(id,username,display_name,email,role,password_hash,password_salt,must_change_password,active,permissions_json,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,1,1,?,?,?)`
            )
            .run(userId, username, reqRow.full_name, reqRow.email.toLowerCase(), role, hash, salt, JSON.stringify(perms), now, now);
        }

        const emailSubject = 'Radar de Talentos — Seu cadastro foi APROVADO (Acesso e Senha Temporária)';
        const emailBody = [
          `Olá, ${reqRow.full_name}!`,
          '',
          `Seu cadastro para acesso ao Radar de Talentos (${reqRow.company || 'Inteligência de Mercado'}) foi APROVADO pela nossa equipe.`,
          '',
          'DADOS PARA SEU PRIMEIRO ACESSO:',
          `• Portal Oficial: ${portalUrl}`,
          `• E-mail / Usuário: ${reqRow.email} (ou @${username})`,
          `• Senha Temporária: ${tempPassword}`,
          '',
          'IMPORTANTE — TROCA OBRIGATÓRIA DE SENHA NO 1º ACESSO:',
          'Ao acessar o site com a senha temporária acima, o sistema abrirá automaticamente a tela de Primeiro Acesso para que você cadastre sua nova senha pessoal definitiva seguindo o padrão de segurança (mínimo de 8 caracteres, letra maiúscula, letra minúscula, número e caractere especial).',
          reviewNote ? `\nObservação da equipe: ${reviewNote}` : '',
          '',
          'Atenciosamente,',
          'Equipe Radar de Talentos — https://radardetalentos.net.br'
        ]
          .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
          .join('\n');

        let autoDelivered = false;
        let deliveryMode = 'mailto_ready';
        if (process.env.RESEND_API_KEY) {
          try {
            const rMail = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: process.env.RADAR_EMAIL_FROM || 'Radar de Talentos <acesso@radardetalentos.net.br>',
                to: [reqRow.email],
                subject: emailSubject,
                text: emailBody
              })
            });
            if (rMail.ok) {
              autoDelivered = true;
              deliveryMode = 'resend_api';
            }
          } catch {}
        }

        database
          .prepare(
            `UPDATE radar_signup_requests
             SET status = 'approved', assigned_username = ?, assigned_role = ?, temp_password_hint = ?,
                 review_note = ?, reviewed_by = ?, reviewed_at = ?, email_sent = 1, email_delivery_mode = ?
             WHERE id = ?`
          )
          .run(username, role, tempPassword, reviewNote, reviewerName, now, deliveryMode, requestId);

        recordAccessLog(database, {
          username,
          userId,
          action: 'signup_approved',
          ip: clientIp,
          status: 'approved',
          detail: `Cadastro de ${reqRow.full_name} (${reqRow.email}) aprovado com senha temporária e troca obrigatória no 1º acesso`
        });

        const cleanPhone = String(reqRow.phone || '').replace(/\D+/g, '');
        const waPhone = cleanPhone.length >= 10 ? (cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone) : '';
        const mailtoUrl = `mailto:${encodeURIComponent(reqRow.email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
        const whatsappUrl = waPhone
          ? `https://wa.me/${waPhone}?text=${encodeURIComponent(emailBody)}`
          : `https://wa.me/?text=${encodeURIComponent(emailBody)}`;

        send(res, 200, {
          ok: true,
          decision: 'approved',
          requestId,
          username,
          email: reqRow.email,
          tempPassword,
          autoDelivered,
          emailSubject,
          emailBody,
          mailtoUrl,
          whatsappUrl,
          message: `Cadastro de "${reqRow.full_name}" (${reqRow.email}) APROVADO! Conta @${username} criada com senha temporária "${tempPassword}" (troca obrigatória no 1º acesso).`
        });
        return true;
      } else {
        const emailSubject = 'Radar de Talentos — Atualização sobre sua solicitação de cadastro';
        const emailBody = [
          `Olá, ${reqRow.full_name},`,
          '',
          'Agradecemos seu interesse no Radar de Talentos (https://radardetalentos.net.br).',
          'Após análise dos dados enviados, informamos que sua solicitação de cadastro não pôde ser aprovada neste momento.',
          reviewNote ? `\nMotivo / Orientação da equipe: ${reviewNote}` : '\nCaso deseje complementar as informações da sua empresa ou produtora, responda a este e-mail.',
          '',
          'Atenciosamente,',
          'Equipe Radar de Talentos — https://radardetalentos.net.br'
        ].join('\n');

        let autoDelivered = false;
        let deliveryMode = 'mailto_ready';
        if (process.env.RESEND_API_KEY) {
          try {
            const rMail = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: process.env.RADAR_EMAIL_FROM || 'Radar de Talentos <acesso@radardetalentos.net.br>',
                to: [reqRow.email],
                subject: emailSubject,
                text: emailBody
              })
            });
            if (rMail.ok) {
              autoDelivered = true;
              deliveryMode = 'resend_api';
            }
          } catch {}
        }

        database
          .prepare(
            `UPDATE radar_signup_requests
             SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = ?, email_sent = 1, email_delivery_mode = ?
             WHERE id = ?`
          )
          .run(reviewNote, reviewerName, now, deliveryMode, requestId);

        recordAccessLog(database, {
          username: reqRow.email,
          action: 'signup_rejected',
          ip: clientIp,
          status: 'rejected',
          detail: `Cadastro de ${reqRow.full_name} (${reqRow.email}) não aprovado`
        });

        const mailtoUrl = `mailto:${encodeURIComponent(reqRow.email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
        send(res, 200, {
          ok: true,
          decision: 'rejected',
          requestId,
          email: reqRow.email,
          autoDelivered,
          emailSubject,
          emailBody,
          mailtoUrl,
          message: `Solicitação de "${reqRow.full_name}" (${reqRow.email}) marcada como NÃO APROVADA. E-mail de retorno pronto para envio.`
        });
        return true;
      }
    }

    send(res, 404, { error: 'Endpoint de usuários não encontrado.' });
    return true;
  } catch (err) {
    send(res, 400, { error: err.message || 'Erro ao processar requisição de usuários.' });
    return true;
  }
}
