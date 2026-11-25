'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  let usersList = [];
  let permsCatalog = [];
  let currentSession = null;

  async function api(path, method = 'GET', payload = null) {
    const opts = { method, cache: 'no-store', headers: {} };
    if (payload) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(payload);
    }
    const r = await fetch(path, opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'HTTP ' + r.status);
    return d;
  }

  function renderNewUserPermissionsCheckboxes() {
    const grid = $('new-user-permissions-grid');
    if (!grid) return;
    grid.replaceChildren();
    for (const p of permsCatalog) {
      const lbl = el('label');
      lbl.style.display = 'flex';
      lbl.style.alignItems = 'center';
      lbl.style.gap = '8px';
      lbl.style.padding = '8px 10px';
      lbl.style.borderRadius = '8px';
      lbl.style.background = '#130f22';
      lbl.style.border = '1px solid rgba(192,132,252,0.45)';
      lbl.style.cursor = 'pointer';
      const chk = el('input');
      chk.type = 'checkbox';
      chk.name = 'perm_' + p.key;
      chk.dataset.permKey = p.key;
      chk.checked = Boolean(p.defaultUser);
      chk.style.width = '16px';
      chk.style.height = '16px';
      const sp = el('span', null, p.label);
      sp.style.fontSize = '11.5px';
      sp.style.color = '#f4f4f5';
      lbl.append(chk, sp);
      grid.append(lbl);
    }
  }

  function renderUsersMatrix() {
    const host = $('users-cards-container');
    if (!host) return;
    host.replaceChildren();

    const activeUser = currentSession?.effectiveUser;
    const isAdminBase = currentSession?.adminUser?.role === 'admin';

    if ($('kpi-users-total')) $('kpi-users-total').textContent = String(usersList.length);
    if ($('kpi-active-user')) $('kpi-active-user').textContent = activeUser?.displayName || 'Administrador Radar';
    if ($('kpi-active-role')) {
      $('kpi-active-role').textContent = currentSession?.impersonating
        ? `🎭 Visualizando como @${activeUser?.username} (Admin: @${currentSession?.adminUser?.username})`
        : `@${activeUser?.username || 'admin'} · ${activeUser?.role === 'admin' ? 'Administrador' : 'Usuário Padrão'}`;
    }
    const pendingCount = usersList.filter(u => u.mustChangePassword).length;
    if ($('kpi-pending-pwd')) $('kpi-pending-pwd').textContent = String(pendingCount);

    for (const u of usersList) {
      const isCurrentEffective = activeUser?.id === u.id;
      const card = el('div');
      card.style.padding = '14px 16px';
      card.style.borderRadius = '11px';
      card.style.background = isCurrentEffective ? 'linear-gradient(160deg,#1b2438 0%,#111522 100%)' : '#130f22';
      card.style.border = isCurrentEffective ? '1.5px solid #38bdf8' : '1px solid rgba(192,132,252,0.5)';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '12px';

      // Cabeçalho do Card do Usuário
      const topRow = el('div');
      topRow.style.display = 'flex';
      topRow.style.alignItems = 'center';
      topRow.style.justifyContent = 'space-between';
      topRow.style.flexWrap = 'wrap';
      topRow.style.gap = '10px';

      const infoLeft = el('div');
      const titleRow = el('div');
      titleRow.style.display = 'flex';
      titleRow.style.alignItems = 'center';
      titleRow.style.gap = '8px';
      titleRow.style.flexWrap = 'wrap';

      const nameStrong = el('strong', null, `${u.displayName} (@${u.username})`);
      nameStrong.style.fontSize = '15px';
      nameStrong.style.color = '#ffffff';
      titleRow.append(nameStrong);

      const roleBadge = el(
        'span',
        u.role === 'admin' ? 'traction-badge viral' : 'traction-badge emerging',
        u.role === 'admin' ? '🛡 Administrador' : '👤 Usuário'
      );
      titleRow.append(roleBadge);

      if (u.mustChangePassword) {
        const pwdBadge = el('span', 'traction-badge consolidated', '🔑 Troca de Senha Obrigatória no Login');
        pwdBadge.style.borderColor = '#facc15';
        pwdBadge.style.color = '#fef08a';
        titleRow.append(pwdBadge);
      } else {
        const okBadge = el('span', 'traction-badge emerging', '✓ Senha Forte Ativa');
        titleRow.append(okBadge);
      }

      if (isCurrentEffective) {
        const actBadge = el('span', 'studio-badge-pill', '● Perfil em Uso Agora');
        titleRow.append(actBadge);
      }

      infoLeft.append(titleRow);
      const subMeta = el(
        'small',
        null,
        `${u.email ? u.email + ' · ' : ''}Criado em: ${(u.createdAt || '').slice(0, 10)} · Último login: ${u.lastLoginAt ? u.lastLoginAt.slice(0, 16).replace('T', ' ') : 'Ainda não acessou'}`
      );
      subMeta.style.color = '#a1a1aa';
      subMeta.style.marginTop = '3px';
      infoLeft.append(subMeta);

      // Botões de Ação do Admin sobre este usuário
      const actRight = el('div');
      actRight.style.display = 'flex';
      actRight.style.alignItems = 'center';
      actRight.style.flexWrap = 'wrap';
      actRight.style.gap = '8px';

      if (isAdminBase) {
        // 1. Botão de Trocar Perfil (Impersonate / Voltar ao Admin)
        if (isCurrentEffective && currentSession?.impersonating) {
          const backBtn = el('button', 'btn-simulate-show', '↩ Voltar ao Perfil Admin');
          backBtn.type = 'button';
          backBtn.addEventListener('click', async () => {
            await api('/api/auth/impersonate', 'POST', { userId: null });
            if ($('users-status-banner')) $('users-status-banner').textContent = 'Retornado ao perfil Administrador com sucesso!';
            await loadUsers();
            window.dispatchEvent(new Event('radar:auth-updated'));
          });
          actRight.append(backBtn);
        } else if (!isCurrentEffective) {
          const impBtn = el('button', 'btn-simulate-show', '🎭 Acessar com este Perfil');
          impBtn.type = 'button';
          impBtn.title = 'Trocar imediatamente o perfil ativo para testar e operar o Radar com as permissões deste usuário';
          impBtn.addEventListener('click', async () => {
            const res = await api('/api/auth/impersonate', 'POST', { userId: u.id });
            if ($('users-status-banner')) $('users-status-banner').textContent = res.message;
            await loadUsers();
            window.dispatchEvent(new Event('radar:auth-updated'));
          });
          actRight.append(impBtn);
        }

        // 2. Botão de Resetar Senha
        const rstBtn = el('button', 'secondary-button', '🔄 Resetar Senha');
        rstBtn.type = 'button';
        rstBtn.addEventListener('click', () => openResetPasswordModal(u));
        actRight.append(rstBtn);

        // 3. Excluir (somente se não for o admin principal)
        if (u.id !== 'u-admin' && u.id !== currentSession?.adminUser?.id) {
          const delBtn = el('button', 'secondary-button', '🗑 Excluir');
          delBtn.type = 'button';
          delBtn.style.borderColor = '#ef4444';
          delBtn.style.color = '#fca5a5';
          delBtn.addEventListener('click', async () => {
            await api('/api/users/delete', 'POST', { userId: u.id });
            if ($('users-status-banner')) $('users-status-banner').textContent = `Usuário "${u.displayName}" removido.`;
            await loadUsers();
          });
          actRight.append(delBtn);
        }
      }

      topRow.append(infoLeft, actRight);
      card.append(topRow);

      // Grade de Checkboxes de Permissões deste Usuário
      const permsWrap = el('div');
      permsWrap.style.paddingTop = '8px';
      permsWrap.style.borderTop = '1px solid rgba(192,132,252,0.22)';

      const permsHead = el('div');
      permsHead.style.display = 'flex';
      permsHead.style.alignItems = 'center';
      permsHead.style.justifyContent = 'space-between';
      permsHead.style.marginBottom = '8px';
      permsHead.append(
        el(
          'small',
          null,
          u.role === 'admin'
            ? '☑ Permissões de Administrador (Acesso Total Liberado a Todos os Módulos):'
            : '☑ Permissões Liberadas em Check (clique para liberar ou bloquear qualquer módulo instantaneamente):'
        )
      );
      permsWrap.append(permsHead);

      const permsGrid = el('div');
      permsGrid.style.display = 'grid';
      permsGrid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(225px,1fr))';
      permsGrid.style.gap = '7px';

      const currentPerms = { ...(u.permissions || {}) };
      for (const p of permsCatalog) {
        const lbl = el('label');
        lbl.style.display = 'flex';
        lbl.style.alignItems = 'center';
        lbl.style.gap = '7px';
        lbl.style.padding = '6px 9px';
        lbl.style.borderRadius = '7px';
        lbl.style.background = currentPerms[p.key] ? 'rgba(56,189,248,0.12)' : 'rgba(24,24,27,0.75)';
        lbl.style.border = currentPerms[p.key] ? '1px solid rgba(56,189,248,0.5)' : '1px solid #27272a';
        lbl.style.cursor = u.role === 'admin' || !isAdminBase ? 'default' : 'pointer';

        const chk = el('input');
        chk.type = 'checkbox';
        chk.checked = u.role === 'admin' ? true : Boolean(currentPerms[p.key]);
        chk.disabled = u.role === 'admin' || !isAdminBase;
        chk.style.width = '15px';
        chk.style.height = '15px';

        chk.addEventListener('change', async () => {
          currentPerms[p.key] = chk.checked;
          lbl.style.background = chk.checked ? 'rgba(56,189,248,0.12)' : 'rgba(24,24,27,0.75)';
          lbl.style.border = chk.checked ? '1px solid rgba(56,189,248,0.5)' : '1px solid #27272a';
          try {
            const res = await api('/api/users/permissions', 'POST', {
              userId: u.id,
              permissions: currentPerms
            });
            if ($('users-status-banner')) $('users-status-banner').textContent = res.message;
            window.dispatchEvent(new Event('radar:auth-updated'));
          } catch (err) {
            if ($('users-status-banner')) $('users-status-banner').textContent = 'Erro ao salvar permissão: ' + err.message;
          }
        });

        const txt = el('span', null, p.label);
        txt.style.fontSize = '11px';
        txt.style.color = chk.checked ? '#ffffff' : '#a1a1aa';
        lbl.append(chk, txt);
        permsGrid.append(lbl);
      }
      permsWrap.append(permsGrid);
      card.append(permsWrap);
      host.append(card);
    }
  }

  function openResetPasswordModal(user) {
    const dialog = $('admin-reset-pwd-modal');
    const host = $('admin-reset-pwd-content');
    if (!dialog || !host) return;
    host.replaceChildren();
    if (!dialog.open) dialog.showModal();

    const head = el('div', 'show-sim-head');
    const left = el('div');
    const h = el('h2', null, `🔄 Resetar Senha — ${user.displayName}`);
    h.id = 'reset-pwd-title';
    left.append(
      el('span', 'eyebrow', 'RESET ADMINISTRATIVO DE CREDENCIAL'),
      h,
      el('p', null, `Defina uma nova senha provisória para @${user.username}. Quando o usuário fizer login, o sistema obrigará o cadastro de uma nova senha forte.`)
    );
    const closeBtn = el('button', 'secondary-button', '✕ Fechar');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => dialog.close());
    head.append(left, closeBtn);
    host.append(head);

    const form = el('form');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '12px';

    const lbl = el('label', 'filter-card');
    lbl.style.height = 'auto';
    lbl.style.padding = '10px 12px';
    lbl.append(el('span', 'filter-label', 'Nova Senha Temporária'));
    const inp = el('input');
    inp.type = 'text';
    inp.required = true;
    inp.value = 'RadarReset@2026';
    lbl.append(inp);
    form.append(lbl);

    const msg = el('p');
    msg.style.fontSize = '11.5px';
    msg.style.color = '#67e8f9';
    form.append(msg);

    const subBtn = el('button', 'btn-simulate-show', '✓ Confirmar Reset de Senha');
    subBtn.type = 'submit';
    subBtn.style.height = '36px';
    form.append(subBtn);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      subBtn.disabled = true;
      try {
        const res = await api('/api/users/reset-password', 'POST', {
          userId: user.id,
          newPassword: inp.value.trim()
        });
        if ($('users-status-banner')) $('users-status-banner').textContent = res.message;
        dialog.close();
        await loadUsers();
      } catch (err) {
        msg.textContent = err.message;
        subBtn.disabled = false;
      }
    });

    host.append(form);
  }

  async function loadUsers() {
    try {
      const d = await api('/api/users');
      usersList = d.items || [];
      permsCatalog = d.permissionsCatalog || [];
      currentSession = d.currentSession || null;
      if (!$('new-user-permissions-grid')?.children.length) {
        renderNewUserPermissionsCheckboxes();
      }
      renderUsersMatrix();
    } catch (err) {
      if ($('users-status-banner')) $('users-status-banner').textContent = 'Erro ao carregar usuários: ' + err.message;
    }
  }

  $('chk-all-new-perms')?.addEventListener('click', () => {
    document.querySelectorAll('#new-user-permissions-grid input[type="checkbox"]').forEach(c => {
      c.checked = true;
    });
  });

  $('chk-exec-new-perms')?.addEventListener('click', () => {
    const execKeys = new Set(['overview', 'audience', 'commercial', 'rising', 'simulator_pl', 'radar_ai', 'events']);
    document.querySelectorAll('#new-user-permissions-grid input[type="checkbox"]').forEach(c => {
      c.checked = execKeys.has(c.dataset.permKey);
    });
  });

  $('create-user-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const displayName = $('new-user-name')?.value?.trim() || '';
    const username = $('new-user-username')?.value?.trim() || '';
    const email = $('new-user-email')?.value?.trim() || '';
    const password = $('new-user-password')?.value?.trim() || '';
    const role = $('new-user-role')?.value || 'user';
    const mustChangePassword = Boolean($('new-user-must-change')?.checked);

    const permissions = {};
    document.querySelectorAll('#new-user-permissions-grid input[type="checkbox"]').forEach(c => {
      permissions[c.dataset.permKey] = c.checked;
    });

    try {
      const res = await api('/api/users', 'POST', {
        displayName,
        username,
        email,
        password,
        role,
        mustChangePassword,
        permissions
      });
      if ($('users-status-banner')) $('users-status-banner').textContent = res.message;
      if ($('new-user-name')) $('new-user-name').value = '';
      if ($('new-user-username')) $('new-user-username').value = '';
      if ($('new-user-email')) $('new-user-email').value = '';
      await loadUsers();
      window.dispatchEvent(new Event('radar:auth-updated'));
    } catch (err) {
      if ($('users-status-banner')) $('users-status-banner').textContent = 'Não foi possível criar o usuário: ' + err.message;
    }
  });

  $('open-login-modal-btn')?.addEventListener('click', () => {
    if (typeof window.openRadarLoginModal === 'function') window.openRadarLoginModal();
  });

  $('open-change-pwd-btn')?.addEventListener('click', () => {
    if (typeof window.openRadarPasswordChangeModal === 'function') window.openRadarPasswordChangeModal(false);
  });

  window.addEventListener('radar:auth-updated', loadUsers);
  loadUsers();
})();
