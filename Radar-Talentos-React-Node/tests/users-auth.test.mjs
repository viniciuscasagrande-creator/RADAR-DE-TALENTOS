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
  } finally {
    await new Promise(r => server.close(r));
    db.close();
  }
});
