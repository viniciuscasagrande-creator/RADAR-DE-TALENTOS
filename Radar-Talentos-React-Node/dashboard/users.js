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
  let signupRequests = [];
  let permsCatalog = [];
  let roleProfiles = [];
  let accessLogs = [];
  let activeSessions = [];
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
    const isAdminRole = role => role === 'admin' || role === 'superadmin';
    const isAdminBase =
      isAdminRole(currentSession?.adminUser?.role) ||
      isAdminRole(activeUser?.role) ||
      Boolean(currentSession?.adminUser?.permissions?.users) ||
      Boolean(activeUser?.permissions?.users);

    if ($('kpi-users-total')) $('kpi-users-total').textContent = String(usersList.length);
    if ($('kpi-active-user')) $('kpi-active-user').textContent = activeUser?.displayName || 'Administrador Radar';
    if ($('kpi-active-role')) {
      $('kpi-active-role').textContent = currentSession?.impersonating
        ? `🎭 Visualizando como @${activeUser?.username} (Admin: @${currentSession?.adminUser?.username})`
        : `@${activeUser?.username || 'admin'} · ${activeUser?.roleLabel || (isAdminRole(activeUser?.role) ? 'Administrador' : 'Usuário Padrão')}`;
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
        u.role === 'admin' || u.role === 'superadmin' ? 'traction-badge viral' : 'traction-badge emerging',
        `${u.role === 'superadmin' ? '👑' : u.role === 'admin' ? '🛡' : '👤'} ${u.roleLabel || (u.role === 'admin' ? 'Administrador' : 'Usuário')}`
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

        // 2. Botão de Resetar Senha (habilitado para qualquer usuário, inclusive o próprio Administrador)
        const rstBtn = el('button', 'secondary-button', '🔄 Resetar Senha');
        rstBtn.type = 'button';
        rstBtn.title = 'Definir nova senha provisória para este usuário (inclusive Administrador)';
        rstBtn.addEventListener('click', () => openResetPasswordModal(u));
        actRight.append(rstBtn);

        // 3. Botão de Excluir (habilitado para qualquer usuário, inclusive contas de Administrador)
        const delBtn = el('button', 'secondary-button', '🗑 Excluir');
        delBtn.type = 'button';
        delBtn.style.borderColor = '#ef4444';
        delBtn.style.color = '#fca5a5';
        delBtn.title = 'Excluir permanentemente este usuário e encerrar suas sessões';
        delBtn.addEventListener('click', async () => {
          const isSelf = u.id === currentSession?.adminUser?.id || u.id === activeUser?.id;
          const confirmMsg = isSelf
            ? `Confirma a exclusão da conta de Administrador "${u.displayName} (@${u.username})"?`
            : `Confirma a exclusão permanente do usuário "${u.displayName} (@${u.username})"?`;
          if (typeof window.confirm === 'function' && !window.confirm(confirmMsg)) return;
          try {
            const res = await api('/api/users/delete', 'POST', { userId: u.id });
            if ($('users-status-banner')) {
              $('users-status-banner').textContent = res.message || `Usuário "${u.displayName}" removido.`;
            }
            await loadUsers();
          } catch (err) {
            if ($('users-status-banner')) {
              $('users-status-banner').textContent = 'Erro ao excluir usuário: ' + err.message;
            }
          }
        });
        actRight.append(delBtn);
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
      permsHead.style.flexWrap = 'wrap';
      permsHead.style.gap = '8px';
      permsHead.style.marginBottom = '8px';
      permsHead.append(
        el(
          'small',
          null,
          isAdminRole(u.role)
            ? '☑ Permissões de Administrador (Acesso Total Liberado a Todos os Módulos):'
            : '☑ Permissões Liberadas em Check (clique para liberar ou bloquear qualquer módulo instantaneamente):'
        )
      );
      if (isAdminBase && roleProfiles.length) {
        const roleChangeSel = el('select');
        roleChangeSel.style.height = '26px';
        roleChangeSel.style.borderRadius = '6px';
        roleChangeSel.style.background = '#0d061a';
        roleChangeSel.style.color = '#f0abfc';
        roleChangeSel.style.border = '1px solid rgba(192,132,252,0.45)';
        roleChangeSel.style.fontSize = '11px';
        roleChangeSel.title = 'Alterar perfil de acesso deste usuário';
        for (const rp of roleProfiles) {
          const opt = new Option(`Perfil: ${rp.label}`, rp.role);
          if (rp.role === u.role) opt.selected = true;
          roleChangeSel.append(opt);
        }
        roleChangeSel.addEventListener('change', async () => {
          try {
            const res = await api('/api/users/permissions', 'POST', {
              userId: u.id,
              role: roleChangeSel.value
            });
            if ($('users-status-banner')) $('users-status-banner').textContent = res.message;
            await loadUsers();
            window.dispatchEvent(new Event('radar:auth-updated'));
          } catch (err) {
            if ($('users-status-banner')) $('users-status-banner').textContent = 'Erro ao alterar perfil: ' + err.message;
          }
        });
        permsHead.append(roleChangeSel);
      }
      permsWrap.append(permsHead);

      const permsGrid = el('div');
      permsGrid.style.display = 'grid';
      permsGrid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(min(100%,225px),1fr))';
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
        lbl.style.cursor = isAdminRole(u.role) || !isAdminBase ? 'default' : 'pointer';

        const chk = el('input');
        chk.type = 'checkbox';
        chk.checked = isAdminRole(u.role) ? true : Boolean(currentPerms[p.key]);
        chk.disabled = isAdminRole(u.role) || !isAdminBase;
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

  function renderActiveSessionsTable() {
    const host = $('active-sessions-container');
    if (!host) return;
    host.replaceChildren();
    if (!activeSessions.length) {
      const p = el('p', null, 'Nenhuma sessão autenticada ativa no momento.');
      p.style.padding = '12px';
      host.append(p);
      return;
    }
    const tbl = el('table', 'rising-table');
    const thead = tbl.createTHead().insertRow();
    for (const h of ['Usuário', 'Dispositivo / App', 'Endereço IP', 'Início da Sessão', 'Validade', 'Ação Remota']) {
      const th = document.createElement('th');
      th.textContent = h;
      thead.append(th);
    }
    const tbody = tbl.createTBody();
    for (const s of activeSessions) {
      const tr = tbody.insertRow();
      tr.insertCell().textContent = `${s.displayName} (@${s.username})`;
      const tdDev = tr.insertCell();
      tdDev.textContent = s.deviceType + (s.isCurrent ? ' (Sessão Atual)' : '');
      tdDev.style.color = s.isCurrent ? '#38bdf8' : '#e4e4e7';
      tdDev.style.fontWeight = s.isCurrent ? '700' : '400';
      tr.insertCell().textContent = s.ip || '127.0.0.1';
      tr.insertCell().textContent = (s.createdAt || '').slice(0, 19).replace('T', ' ');
      tr.insertCell().textContent = (s.expiresAt || '').slice(0, 10);
      const tdAct = tr.insertCell();
      const revBtn = el('button', 'secondary-button', s.isCurrent ? 'Encerrar Minha Sessão' : '⨯ Encerrar Sessão');
      revBtn.type = 'button';
      revBtn.style.height = '26px';
      revBtn.style.fontSize = '11px';
      revBtn.style.borderColor = '#ef4444';
      revBtn.style.color = '#fca5a5';
      revBtn.addEventListener('click', async () => {
        await api('/api/users/sessions/revoke', 'POST', { sessionId: s.sessionId });
        if ($('users-status-banner')) $('users-status-banner').textContent = `Sessão de @${s.username} encerrada remotamente.`;
        await loadUsers();
      });
      tdAct.append(revBtn);
    }
    host.append(tbl);
  }

  function renderAccessLogsTable() {
    const host = $('access-logs-container');
    if (!host) return;
    host.replaceChildren();
    if (!accessLogs.length) {
      const p = el('p', null, 'Nenhum evento de autenticação registrado ainda.');
      p.style.padding = '12px';
      host.append(p);
      return;
    }
    const tbl = el('table', 'rising-table');
    const thead = tbl.createTHead().insertRow();
    for (const h of ['Data / Hora', 'Usuário / E-mail', 'Ação', 'Status', 'Detalhe Operacional']) {
      const th = document.createElement('th');
      th.textContent = h;
      thead.append(th);
    }
    const tbody = tbl.createTBody();
    for (const l of accessLogs) {
      const tr = tbody.insertRow();
      tr.insertCell().textContent = (l.created_at || '').slice(0, 19).replace('T', ' ');
      tr.insertCell().textContent = l.username || '—';
      tr.insertCell().textContent = l.action || '—';
      const tdSt = tr.insertCell();
      tdSt.textContent = l.status || 'ok';
      tdSt.style.color = l.status === 'failed' || l.status === 'blocked' ? '#fca5a5' : '#4ade80';
      tr.insertCell().textContent = l.detail || '—';
    }
    host.append(tbl);
  }

  function showEmailDispatchResult(res) {
    const box = $('signup-email-dispatch-box');
    if (!box) return;
    box.hidden = false;
    box.replaceChildren();
    const isApproved = res.decision === 'approved';
    box.style.borderColor = isApproved ? '#4ade80' : '#f87171';
    box.style.background = isApproved ? 'rgba(20,83,45,0.28)' : 'rgba(127,29,29,0.28)';

    const top = el('div');
    top.style.display = 'flex';
    top.style.alignItems = 'center';
    top.style.justifyContent = 'space-between';
    top.style.gap = '10px';
    top.style.flexWrap = 'wrap';
    const title = el(
      'strong',
      null,
      isApproved
        ? `✓ Cadastro Aprovado — Retorno por E-mail com Senha Temporária (${res.tempPassword}) para ${res.email}`
        : `✕ Cadastro Não Aprovado — Retorno por E-mail para ${res.email}`
    );
    title.style.color = isApproved ? '#86efac' : '#fca5a5';
    title.style.fontSize = '13.5px';
    const closeBtn = el('button', 'secondary-button', '✕ Fechar');
    closeBtn.type = 'button';
    closeBtn.style.height = '26px';
    closeBtn.addEventListener('click', () => {
      box.hidden = true;
    });
    top.append(title, closeBtn);
    box.append(top);

    const senderAddr = res.senderEmail || 'radardetalentosnet@gmail.com';
    const pre = el(
      'pre',
      null,
      `De: ${senderAddr} (Não responda este e-mail)\nPara: ${res.email}\nAssunto: ${res.emailSubject}\n\n${res.emailBody}`
    );
    pre.style.margin = '10px 0';
    pre.style.padding = '12px';
    pre.style.borderRadius = '8px';
    pre.style.background = '#0d061a';
    pre.style.border = '1px solid rgba(192,132,252,0.35)';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.fontSize = '12px';
    pre.style.color = '#f3e8ff';
    box.append(pre);

    const actions = el('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.flexWrap = 'wrap';

    if (res.gmailComposeUrl) {
      const gmailA = el('a', 'btn-simulate-show', `📨 Enviar pelo Gmail (${senderAddr})`);
      gmailA.href = res.gmailComposeUrl;
      gmailA.target = '_blank';
      gmailA.rel = 'noopener noreferrer';
      gmailA.style.textDecoration = 'none';
      gmailA.style.display = 'inline-flex';
      gmailA.style.alignItems = 'center';
      gmailA.style.height = '32px';
      gmailA.style.padding = '0 14px';
      actions.append(gmailA);
    }

    if (res.mailtoUrl) {
      const mailA = el('a', 'secondary-button', `📧 Abrir no App de E-mail (${res.email})`);
      mailA.href = res.mailtoUrl;
      mailA.style.textDecoration = 'none';
      mailA.style.display = 'inline-flex';
      mailA.style.alignItems = 'center';
      mailA.style.height = '32px';
      mailA.style.padding = '0 14px';
      actions.append(mailA);
    }

    const copyBtn = el('button', 'secondary-button', '📋 Copiar Texto do E-mail');
    copyBtn.type = 'button';
    copyBtn.style.height = '32px';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(`Assunto: ${res.emailSubject}\n\n${res.emailBody}`);
        copyBtn.textContent = '✓ E-mail Copiado!';
        setTimeout(() => {
          copyBtn.textContent = '📋 Copiar Texto do E-mail';
        }, 2500);
      } catch {}
    });
    actions.append(copyBtn);

    if (res.whatsappUrl) {
      const waA = el('a', 'secondary-button', '💬 Enviar Senha Temporária via WhatsApp');
      waA.href = res.whatsappUrl;
      waA.target = '_blank';
      waA.rel = 'noopener noreferrer';
      waA.style.textDecoration = 'none';
      waA.style.display = 'inline-flex';
      waA.style.alignItems = 'center';
      waA.style.height = '32px';
      waA.style.padding = '0 12px';
      actions.append(waA);
    }

    box.append(actions);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderSignupRequestsQueue() {
    const host = $('signup-requests-container');
    if (!host) return;
    host.replaceChildren();
    const pendingCount = signupRequests.filter(r => r.status === 'pending').length;
    if ($('pending-signups-count')) $('pending-signups-count').textContent = String(pendingCount);

    if (!signupRequests.length) {
      const p = el(
        'p',
        null,
        'Nenhuma solicitação de cadastro pendente no momento. Quando um cliente preencher o formulário "Cadastre-se" na página inicial de login, os dados aparecerão aqui para validação.'
      );
      p.style.margin = '0';
      p.style.fontSize = '12.5px';
      p.style.color = '#a1a1aa';
      host.append(p);
      return;
    }

    for (const r of signupRequests) {
      const card = el('div');
      card.style.padding = '12px 14px';
      card.style.borderRadius = '10px';
      card.style.background = r.status === 'pending' ? 'linear-gradient(160deg,#1f1235 0%,#130f22 100%)' : '#130f22';
      card.style.border =
        r.status === 'pending'
          ? '1.5px solid #facc15'
          : r.status === 'approved'
            ? '1px solid rgba(74,222,128,0.45)'
            : '1px solid rgba(248,113,113,0.45)';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '10px';

      const head = el('div');
      head.style.display = 'flex';
      head.style.alignItems = 'center';
      head.style.justifyContent = 'space-between';
      head.style.flexWrap = 'wrap';
      head.style.gap = '8px';

      const left = el('div');
      const stLabel =
        r.status === 'pending'
          ? '⏳ Aguardando Validação'
          : r.status === 'approved'
            ? `✓ Aprovado (@${r.assignedUsername} · Senha temp.: ${r.tempPasswordHint || 'Enviada'})`
            : '✕ Não Aprovado';
      const title = el('strong', null, `${r.fullName} — ${r.company || 'Empresa não informada'}`);
      title.style.fontSize = '14px';
      title.style.color = '#ffffff';
      const badge = el(
        'span',
        r.status === 'pending' ? 'traction-badge consolidated' : r.status === 'approved' ? 'traction-badge emerging' : 'traction-badge viral',
        stLabel
      );
      badge.style.marginLeft = '8px';
      left.append(title, badge);

      const dateSmall = el('small', null, `Recebido em: ${(r.createdAt || '').slice(0, 16).replace('T', ' ')}`);
      dateSmall.style.color = '#a1a1aa';
      head.append(left, dateSmall);
      card.append(head);

      const details = el(
        'div',
        null,
        `📧 E-mail: ${r.email} · 📱 WhatsApp/Tel: ${r.phone || '—'} · 🏢 Cargo: ${r.jobTitle || '—'} · 🪪 CNPJ/CPF: ${r.document || '—'} · 📍 Cidade/UF: ${r.cityUf || '—'}${r.purpose ? ` · 🎯 Objetivo: ${r.purpose}` : ''}`
      );
      details.style.fontSize = '12px';
      details.style.color = '#e2dcf0';
      card.append(details);

      const controls = el('div');
      controls.style.display = 'flex';
      controls.style.alignItems = 'center';
      controls.style.gap = '8px';
      controls.style.flexWrap = 'wrap';

      const roleSel = el('select');
      roleSel.style.height = '30px';
      roleSel.style.borderRadius = '6px';
      roleSel.style.background = '#0d061a';
      roleSel.style.color = '#ffffff';
      roleSel.style.border = '1px solid rgba(192,132,252,0.4)';
      roleSel.style.fontSize = '11.5px';
      for (const [val, lbl] of [
        ['producer', '🎫 Perfil: Produtor'],
        ['entrepreneur', '💼 Perfil: Empresário'],
        ['consultant', '📊 Perfil: Consultor'],
        ['visitor', '👁 Perfil: Visitante'],
        ['analyst', '🔬 Perfil: Analista'],
        ['admin', '🛡 Perfil: Administrador']
      ]) {
        const opt = new Option(lbl, val);
        if (val === (r.assignedRole || 'producer')) opt.selected = true;
        roleSel.append(opt);
      }

      const tempPwdInp = el('input');
      tempPwdInp.type = 'text';
      tempPwdInp.value = r.tempPasswordHint || `Radar@${Math.floor(1000 + Math.random() * 9000)}`;
      tempPwdInp.title = 'Senha temporária que será enviada por e-mail (troca obrigatória no 1º acesso)';
      tempPwdInp.style.height = '30px';
      tempPwdInp.style.width = '135px';
      tempPwdInp.style.padding = '0 8px';
      tempPwdInp.style.borderRadius = '6px';
      tempPwdInp.style.background = '#0d061a';
      tempPwdInp.style.color = '#86efac';
      tempPwdInp.style.border = '1px solid rgba(74,222,128,0.45)';
      tempPwdInp.style.fontSize = '11.5px';

      const noteInp = el('input');
      noteInp.type = 'text';
      noteInp.value = r.reviewNote || '';
      noteInp.placeholder = 'Observação p/ o e-mail do cliente (opcional)';
      noteInp.style.height = '30px';
      noteInp.style.flex = '1';
      noteInp.style.minWidth = '180px';
      noteInp.style.padding = '0 8px';
      noteInp.style.borderRadius = '6px';
      noteInp.style.background = '#0d061a';
      noteInp.style.color = '#ffffff';
      noteInp.style.border = '1px solid rgba(192,132,252,0.35)';
      noteInp.style.fontSize = '11.5px';

      const reqFeedback = el('small');
      reqFeedback.style.display = 'none';
      reqFeedback.style.fontSize = '12px';
      reqFeedback.style.fontWeight = '700';

      const approveBtn = el('button', 'btn-simulate-show', '✓ Aprovar e Gerar E-mail c/ Senha Temporária');
      approveBtn.type = 'button';
      approveBtn.style.height = '30px';
      approveBtn.addEventListener('click', async () => {
        approveBtn.disabled = true;
        reqFeedback.style.display = 'block';
        reqFeedback.style.color = '#67e8f9';
        reqFeedback.textContent = 'Processando aprovação e criando conta com senha temporária…';
        try {
          const res = await api('/api/users/signup-requests/review', 'POST', {
            requestId: r.id,
            decision: 'approve',
            role: roleSel.value,
            tempPassword: tempPwdInp.value.trim(),
            reviewNote: noteInp.value.trim()
          });
          if ($('users-status-banner')) $('users-status-banner').textContent = res.message;
          showEmailDispatchResult(res);
          await loadUsers();
        } catch (err) {
          reqFeedback.style.color = '#fca5a5';
          reqFeedback.textContent = '⚠ Erro ao aprovar cadastro: ' + err.message;
          if ($('users-status-banner')) $('users-status-banner').textContent = 'Erro ao aprovar cadastro: ' + err.message;
        } finally {
          approveBtn.disabled = false;
        }
      });

      const rejectBtn = el('button', 'secondary-button', '✕ Não Aprovar e Retornar E-mail');
      rejectBtn.type = 'button';
      rejectBtn.style.height = '30px';
      rejectBtn.style.borderColor = 'rgba(248,113,113,0.5)';
      rejectBtn.style.color = '#fca5a5';
      rejectBtn.addEventListener('click', async () => {
        rejectBtn.disabled = true;
        reqFeedback.style.display = 'block';
        reqFeedback.style.color = '#67e8f9';
        reqFeedback.textContent = 'Processando retorno…';
        try {
          const res = await api('/api/users/signup-requests/review', 'POST', {
            requestId: r.id,
            decision: 'reject',
            reviewNote: noteInp.value.trim()
          });
          if ($('users-status-banner')) $('users-status-banner').textContent = res.message;
          showEmailDispatchResult(res);
          await loadUsers();
        } catch (err) {
          reqFeedback.style.color = '#fca5a5';
          reqFeedback.textContent = '⚠ Erro ao recusar cadastro: ' + err.message;
          if ($('users-status-banner')) $('users-status-banner').textContent = 'Erro ao recusar cadastro: ' + err.message;
        } finally {
          rejectBtn.disabled = false;
        }
      });

      const deleteReqBtn = el('button', 'secondary-button', '🗑 Excluir');
      deleteReqBtn.type = 'button';
      deleteReqBtn.style.height = '30px';
      deleteReqBtn.style.borderColor = '#ef4444';
      deleteReqBtn.style.color = '#fca5a5';
      deleteReqBtn.addEventListener('click', async () => {
        if (typeof window.confirm === 'function' && !window.confirm(`Excluir solicitação de "${r.fullName}"?`)) return;
        deleteReqBtn.disabled = true;
        try {
          const res = await api('/api/users/signup-requests/delete', 'POST', { requestId: r.id });
          if ($('users-status-banner')) $('users-status-banner').textContent = res.message;
          await loadUsers();
        } catch (err) {
          reqFeedback.style.display = 'block';
          reqFeedback.style.color = '#fca5a5';
          reqFeedback.textContent = '⚠ Erro ao excluir solicitação: ' + err.message;
          if ($('users-status-banner')) $('users-status-banner').textContent = 'Erro ao excluir solicitação: ' + err.message;
          deleteReqBtn.disabled = false;
        }
      });

      controls.append(roleSel, tempPwdInp, noteInp, approveBtn, rejectBtn, deleteReqBtn);
      card.append(controls, reqFeedback);
      host.append(card);
    }
  }

  async function loadUsers() {
    try {
      const d = await api('/api/users');
      usersList = d.items || [];
      signupRequests = d.signupRequests || [];
      permsCatalog = d.permissionsCatalog || [];
      roleProfiles = d.roleProfiles || [];
      accessLogs = d.accessLogs || [];
      activeSessions = d.activeSessions || [];
      currentSession = d.currentSession || null;
      if (!$('new-user-permissions-grid')?.children.length) {
        renderNewUserPermissionsCheckboxes();
      }
      renderSignupRequestsQueue();
      renderUsersMatrix();
      renderActiveSessionsTable();
      renderAccessLogsTable();
    } catch (err) {
      if ($('users-status-banner')) $('users-status-banner').textContent = 'Erro ao carregar usuários: ' + err.message;
    }
  }

  $('new-user-role')?.addEventListener('change', () => {
    const val = $('new-user-role')?.value || 'producer';
    const found = roleProfiles.find(r => r.role === val);
    if (!found) return;
    const set = new Set(found.permissions);
    document.querySelectorAll('#new-user-permissions-grid input[type="checkbox"]').forEach(c => {
      c.checked = set.has(c.dataset.permKey);
    });
  });

  $('chk-all-new-perms')?.addEventListener('click', () => {
    document.querySelectorAll('#new-user-permissions-grid input[type="checkbox"]').forEach(c => {
      c.checked = true;
    });
  });

  $('chk-exec-new-perms')?.addEventListener('click', () => {
    const execKeys = new Set(['overview', 'audience', 'commercial', 'rising', 'reports', 'simulator_pl', 'radar_ai', 'events']);
    document.querySelectorAll('#new-user-permissions-grid input[type="checkbox"]').forEach(c => {
      c.checked = execKeys.has(c.dataset.permKey);
    });
  });

  function slugifyLogin(str = '') {
    return String(str)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._-]+/g, '.')
      .replace(/^\.+|\.+$/g, '');
  }

  let userEditedUsername = false;
  $('new-user-username')?.addEventListener('input', () => {
    userEditedUsername = Boolean($('new-user-username')?.value?.trim());
  });
  $('new-user-name')?.addEventListener('input', () => {
    const uInp = $('new-user-username');
    if (uInp && !userEditedUsername) {
      uInp.value = slugifyLogin($('new-user-name')?.value || '');
    }
  });

  async function handleCreateUser(e) {
    e?.preventDefault();
    const fb = $('create-user-feedback');
    const banner = $('users-status-banner');
    const btn = $('create-user-submit-btn');
    const rawName = $('new-user-name')?.value?.trim() || '';
    const rawUsername = $('new-user-username')?.value?.trim() || '';
    const displayName = rawName || rawUsername;
    const username = slugifyLogin(rawUsername || rawName);
    const email = $('new-user-email')?.value?.trim() || '';
    const password = ($('new-user-password')?.value?.trim()) || 'Mudar@123';
    const role = $('new-user-role')?.value || 'user';
    const mustChangePassword = Boolean($('new-user-must-change')?.checked);

    const showFeedback = (text, isError = false) => {
      if (fb) {
        fb.textContent = text;
        fb.style.color = isError ? '#fca5a5' : '#4ade80';
      }
      if (banner) {
        banner.textContent = text;
      }
    };

    if (!displayName || !username || username.length < 3) {
      showFeedback('⚠ Preencha o Nome Completo ou um Login de Acesso válido (mínimo 3 caracteres) antes de clicar em Criar Usuário.', true);
      $('new-user-name')?.focus();
      return;
    }

    const permissions = {};
    document.querySelectorAll('#new-user-permissions-grid input[type="checkbox"]').forEach(c => {
      permissions[c.dataset.permKey] = c.checked;
    });

    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Criando usuário e liberando permissões…';
    }
    showFeedback(`Criando usuário "${displayName}" (@${username})…`, false);

    try {
      // Se o admin estiver visualizando como outro usuário (impersonating), volta automaticamente para Admin antes de criar
      if (currentSession?.impersonating) {
        await api('/api/auth/impersonate', 'POST', { userId: null });
      }
      const res = await api('/api/users', 'POST', {
        displayName,
        username,
        email,
        password,
        role,
        mustChangePassword,
        permissions
      });
      showFeedback(`✓ ${res.message}`, false);
      if ($('new-user-name')) $('new-user-name').value = '';
      if ($('new-user-username')) $('new-user-username').value = '';
      if ($('new-user-email')) $('new-user-email').value = '';
      userEditedUsername = false;
      await loadUsers();
      window.dispatchEvent(new Event('radar:auth-updated'));
      $('users-matrix-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      showFeedback('⚠ Não foi possível criar o usuário: ' + err.message, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🚀 Criar Usuário e Liberar Acesso';
      }
    }
  }

  $('create-user-form')?.addEventListener('submit', handleCreateUser);

  $('open-login-modal-btn')?.addEventListener('click', () => {
    if (typeof window.openRadarLoginModal === 'function') window.openRadarLoginModal();
  });

  $('open-change-pwd-btn')?.addEventListener('click', () => {
    if (typeof window.openRadarPasswordChangeModal === 'function') window.openRadarPasswordChangeModal(false);
  });

  window.addEventListener('radar:auth-updated', loadUsers);
  loadUsers();
})();
