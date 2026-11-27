import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/src/database/index.mjs';
import { createRadarServer } from '../server/src/app.mjs';
import { validatePasswordStrength } from '../server/src/users.mjs';

test('Usuários e Permissões: Admin cria usuário com checkboxes, força cadastro de nova senha forte no 1º login, reseta senha e alterna perfil (impersonate)', async () => {
  const db = openDatabase(':memory:');
  const server = createRadarServer({ database: db, eventsOnly: true, combinedDashboard: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;

    // 1. Validação de força de senha
    assert.ok(validatePasswordStrength('curta'));
    assert.ok(validatePasswordStrength('semnumero@A'));
    assert.ok(validatePasswordStrength('SemSimbolo123'));
    assert.equal(validatePasswordStrength('RadarForte@2026'), null);

    // 2. Página /users.html está disponível e presente nos menus
    const usersPage = await fetch(base + '/users.html');
    assert.equal(usersPage.status, 200);
    const usersHtml = await usersPage.text();
    assert.match(usersHtml, /Gestão de Usuários, Senhas e Permissões/);

    // 3. Admin padrão é inicializado e pode criar um novo usuário com permissões em check
    const createRes = await fetch(base + '/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Carlos Produtor',
        username: 'carlos.produtor',
        email: 'carlos@eventos.com.br',
        password: 'Temp@123',
        role: 'user',
        mustChangePassword: true,
        permissions: {
          overview: true,
          audience: true,
          commercial: true,
          rising: false,
          acquisition: false,
          discovery: false,
          users: false
        }
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.user.username, 'carlos.produtor');
    assert.equal(created.user.mustChangePassword, true);
    assert.equal(created.user.permissions.commercial, true);
    assert.equal(created.user.permissions.rising, false);

    // 4. Usuário faz login com a senha inicial e recebe mustChangePassword = true
    const loginRes = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'carlos.produtor', password: 'Temp@123' })
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    assert.equal(loginBody.mustChangePassword, true);
    const userToken = loginBody.token;

    // 5. Tentativa de cadastrar senha fraca é bloqueada; senha forte libera mustChangePassword = false
    const weakRes = await fetch(base + '/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Radar-Session': userToken },
      body: JSON.stringify({ newPassword: '123', confirmPassword: '123' })
    });
    assert.equal(weakRes.status, 400);

    const strongRes = await fetch(base + '/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Radar-Session': userToken },
      body: JSON.stringify({ newPassword: 'Carlos@2026!Radar', confirmPassword: 'Carlos@2026!Radar' })
    });
    assert.equal(strongRes.status, 200);
    const strongBody = await strongRes.json();
    assert.equal(strongBody.user.mustChangePassword, false);

    // 6. Admin atualiza permissões via check, reseta a senha do usuário e faz acesso trocando para o perfil dele
    const permRes = await fetch(base + '/api/users/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: created.user.id,
        permissions: { ...created.user.permissions, rising: true }
      })
    });
    assert.equal(permRes.status, 200);
    const permBody = await permRes.json();
    assert.equal(permBody.user.permissions.rising, true);

    const resetRes = await fetch(base + '/api/users/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: created.user.id, newPassword: 'Reset@123' })
    });
    assert.equal(resetRes.status, 200);
    const resetBody = await resetRes.json();
    assert.equal(resetBody.user.mustChangePassword, true);

    const impRes = await fetch(base + '/api/auth/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: created.user.id })
    });
    assert.equal(impRes.status, 200);
    const impBody = await impRes.json();
    assert.equal(impBody.impersonating, true);
    assert.equal(impBody.user.username, 'carlos.produtor');

    // 7. Usuário comum autenticado sem permissão 'users' não enxerga sessões/logs/solicitações de outros usuários e registra X-Forwarded-For
    const loginProxyRes = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '189.45.10.22, 10.0.0.1' },
      body: JSON.stringify({ username: 'carlos.produtor', password: 'Reset@123' })
    });
    assert.equal(loginProxyRes.status, 200);
    const proxyToken = (await loginProxyRes.json()).token;

    const nonAdminListRes = await fetch(base + '/api/users', {
      headers: { 'X-Radar-Session': proxyToken }
    });
    assert.equal(nonAdminListRes.status, 200);
    const nonAdminList = await nonAdminListRes.json();
    assert.equal(nonAdminList.items.length, 1);
    assert.equal(nonAdminList.items[0].username, 'carlos.produtor');
    assert.equal(nonAdminList.accessLogs.length, 0);
    assert.equal(nonAdminList.activeSessions.length, 0);
    assert.equal(nonAdminList.signupRequests.length, 0);

    // 8. Admin vê o IP real resolvido pelo proxy reverso na tabela de sessões ativas
    const adminListRes = await fetch(base + '/api/users');
    const adminList = await adminListRes.json();
    const carlosSession = adminList.activeSessions.find(s => s.username === 'carlos.produtor' && s.ip === '189.45.10.22');
    assert.ok(carlosSession);

    // 9. Camada neutra pré-inauguração possui "Esqueci minha senha" integrado ao endpoint /api/auth/request-access
    const loginHtmlRes = await fetch(base + '/login.html');
    assert.equal(loginHtmlRes.status, 200);
    const loginHtml = await loginHtmlRes.text();
    assert.match(loginHtml, /id="neutral-forgot-btn"/);
    assert.match(loginHtml, /Esqueci minha senha/);
    assert.match(loginHtml, /id="neutral-recover-form"/);

    const recoverRes = await fetch(base + '/api/auth/request-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'recover', identifier: 'carlos.produtor', email: 'carlos.produtor' })
    });
    assert.equal(recoverRes.status, 200);
    const recoverBody = await recoverRes.json();
    assert.equal(recoverBody.ok, true);
  } finally {
    await new Promise(r => server.close(r));
    db.close();
  }
});
