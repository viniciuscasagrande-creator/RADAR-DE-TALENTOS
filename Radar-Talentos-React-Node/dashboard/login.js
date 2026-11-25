'use strict';
(() => {
  const $ = id => document.getElementById(id);

  // =========================================================================
  // 1. RADAR GIRATÓRIO 360° COM PONTOS DE TALENTOS QUE ACENDEM NA VARREDURA
  // =========================================================================
  const beam = $('ri-radar-beam');
  const blips = [...document.querySelectorAll('.ri-talent-blip')];
  let currentAngle = 315;
  let lastFrame = performance.now();
  let speedMultiplier = 1;

  function animateRadar(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    currentAngle = (currentAngle + dt * 52 * speedMultiplier) % 360;
    if (beam) {
      beam.style.transform = `rotate(${currentAngle.toFixed(1)}deg)`;
    }
    for (const blip of blips) {
      const targetAngle = Number(blip.dataset.angle || 0);
      const diff = (currentAngle - targetAngle + 360) % 360;
      if (diff >= 0 && diff <= 68) {
        blip.classList.add('is-lit');
      } else {
        blip.classList.remove('is-lit');
      }
    }
    requestAnimationFrame(animateRadar);
  }
  requestAnimationFrame(animateRadar);

  // =========================================================================
  // 2. AUTENTICAÇÃO E TROCA OBRIGATÓRIA DE SENHA NO PRIMEIRO ACESSO
  // =========================================================================
  const loginForm = $('radar-login-form');
  const forcePwdForm = $('radar-force-pwd-form');
  const userInp = $('login-username');
  const pwdInp = $('login-password');
  const togglePwdBtn = $('toggle-login-pwd');
  const feedback = $('login-feedback');
  const submitBtn = $('login-submit-btn');

  const newPwdInp = $('new-strong-password');
  const confPwdInp = $('confirm-strong-password');
  const forceFeedback = $('force-pwd-feedback');
  const forceSubmitBtn = $('force-pwd-submit-btn');

  const params = new URLSearchParams(location.search);
  const explicitNext = params.get('next') && params.get('next').startsWith('/') ? params.get('next') : '';

  togglePwdBtn?.addEventListener('click', () => {
    if (!pwdInp) return;
    const isPwd = pwdInp.type === 'password';
    pwdInp.type = isPwd ? 'text' : 'password';
    togglePwdBtn.textContent = isPwd ? 'Ocultar' : 'Mostrar';
  });

  // Como os cadastros e resets são gerenciados exclusivamente pelos Administradores via e-mail/WhatsApp:
  $('forgot-password-btn')?.addEventListener('click', () => {
    if (feedback) {
      feedback.style.color = '#d8b4fe';
      feedback.textContent =
        'Para redefinir sua senha, solicite o reset diretamente ao Administrador do Radar via e-mail ou WhatsApp.';
    }
  });

  $('request-access-btn')?.addEventListener('click', () => {
    if (feedback) {
      feedback.style.color = '#d8b4fe';
      feedback.textContent =
        'Ambiente de acesso restrito: a criação de usuários e liberação de permissões é realizada pelos Administradores via e-mail ou WhatsApp.';
    }
  });

  // Checklist em tempo real para o Primeiro Acesso:
  // ✓ Mínimo de 8 caracteres
  // ○ Pelo menos 1 letra maiúscula (A–Z)
  // ✓ Pelo menos 1 letra minúscula (a–z)
  // ○ Pelo menos 1 número (0–9)
  // ✓ Pelo menos 1 caractere especial (@, #, $, !, %)
  function updateChecklist(pwd = '') {
    const s = String(pwd);
    const checks = {
      len: s.length >= 8,
      upper: /[A-Z]/.test(s),
      lower: /[a-z]/.test(s),
      num: /[0-9]/.test(s),
      sym: /[^A-Za-z0-9]/.test(s)
    };
    document.querySelectorAll('#pwd-rules-checklist li').forEach(li => {
      const rule = li.dataset.rule;
      const ok = Boolean(checks[rule]);
      li.classList.toggle('is-valid', ok);
      const cleanTxt = li.textContent.replace(/^[✓○]\s*/, '');
      li.textContent = `${ok ? '✓' : '○'} ${cleanTxt}`;
    });
  }

  newPwdInp?.addEventListener('input', () => updateChecklist(newPwdInp.value));

  function enterDashboardWithAnimation(destination = '/') {
    const layout = $('ri-split-layout');
    if (layout) layout.classList.add('is-entering-dashboard');
    setTimeout(() => {
      location.href = destination;
    }, 380);
  }

  loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const username = userInp?.value?.trim() || '';
    const password = pwdInp?.value || '';
    const remember = Boolean($('login-remember')?.checked);

    if (!username || !password) {
      if (feedback) {
        feedback.style.color = '#fca5a5';
        feedback.textContent = 'Informe seu e-mail ou usuário e sua senha.';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Autenticando…';
    }
    if (feedback) {
      feedback.style.color = '#c4b5fd';
      feedback.textContent = 'Validando credenciais…';
    }
    speedMultiplier = 2.8;

    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, remember })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || 'Usuário ou senha inválidos.');

      // Se for primeiro acesso (ou senha resetada pelo Admin), exibe obrigatoriamente o cadastro da nova senha forte com o checklist
      if (d.mustChangePassword || d.user?.mustChangePassword) {
        speedMultiplier = 1;
        if (loginForm) loginForm.hidden = true;
        if (forcePwdForm) forcePwdForm.hidden = false;
        if ($('ri-welcome-title')) $('ri-welcome-title').textContent = 'Primeiro acesso.';
        if ($('ri-welcome-subtitle')) {
          $('ri-welcome-subtitle').textContent = `Olá, ${d.user?.displayName || username}! Cadastre sua nova senha pessoal segura.`;
        }
        if ($('force-pwd-user-title')) {
          $('force-pwd-user-title').textContent = `🔑 Cadastro Obrigatório de Nova Senha (@${d.user?.username || username})`;
        }
        updateChecklist('');
        newPwdInp?.focus();
        return;
      }

      if (feedback) {
        feedback.style.color = '#4ade80';
        feedback.textContent = `✓ Acesso autorizado! Abrindo Radar de Talentos…`;
      }
      const targetUrl = explicitNext || d.redirectUrl || '/';
      enterDashboardWithAnimation(targetUrl);
    } catch (err) {
      speedMultiplier = 1;
      if (feedback) {
        feedback.style.color = '#fca5a5';
        feedback.textContent = err.message;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Acessar Radar &rarr;</span>';
      }
    }
  });

  forcePwdForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const newPassword = newPwdInp?.value || '';
    const confirmPassword = confPwdInp?.value || '';
    if (!newPassword || newPassword !== confirmPassword) {
      if (forceFeedback) {
        forceFeedback.style.color = '#fca5a5';
        forceFeedback.textContent = 'A confirmação da nova senha não confere.';
      }
      return;
    }

    if (forceSubmitBtn) {
      forceSubmitBtn.disabled = true;
      forceSubmitBtn.textContent = 'Salvando nova senha…';
    }

    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword, confirmPassword })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || 'Não foi possível salvar a nova senha.');

      if (forceFeedback) {
        forceFeedback.style.color = '#4ade80';
        forceFeedback.textContent = '✓ Nova senha cadastrada com sucesso! Abrindo Radar…';
      }
      const targetUrl = explicitNext || d.redirectUrl || '/';
      enterDashboardWithAnimation(targetUrl);
    } catch (err) {
      if (forceFeedback) {
        forceFeedback.style.color = '#fca5a5';
        forceFeedback.textContent = err.message;
      }
    } finally {
      if (forceSubmitBtn) {
        forceSubmitBtn.disabled = false;
        forceSubmitBtn.innerHTML = '<span>Salvar Senha e Acessar Radar &rarr;</span>';
      }
    }
  });
})();
