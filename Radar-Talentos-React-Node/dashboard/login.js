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
  const signupForm = $('radar-signup-form');
  const authFooter = $('ri-auth-footer');
  if (forcePwdForm) forcePwdForm.hidden = true;
  if (signupForm) signupForm.hidden = true;
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

  function showSignupView() {
    if (loginForm) loginForm.hidden = true;
    if (forcePwdForm) forcePwdForm.hidden = true;
    if (authFooter) authFooter.hidden = true;
    if (signupForm) signupForm.hidden = false;
    if ($('ri-welcome-title')) $('ri-welcome-title').textContent = 'Cadastre-se no Radar.';
    if ($('ri-welcome-subtitle')) {
      $('ri-welcome-subtitle').textContent =
        'Preencha seus dados para validação. Retornaremos por e-mail com a aprovação e sua senha temporária.';
    }
    $('signup-name')?.focus();
  }

  function showLoginView() {
    if (signupForm) signupForm.hidden = true;
    if (forcePwdForm) forcePwdForm.hidden = true;
    if (loginForm) loginForm.hidden = false;
    if (authFooter) authFooter.hidden = false;
    if ($('ri-welcome-title')) $('ri-welcome-title').textContent = 'Bem-vindo ao Radar.';
    if ($('ri-welcome-subtitle')) {
      $('ri-welcome-subtitle').textContent = 'Acesse sua central de inteligência artística.';
    }
  }

  $('request-access-btn')?.addEventListener('click', showSignupView);
  $('back-to-login-btn')?.addEventListener('click', showLoginView);

  signupForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const sFeedback = $('signup-feedback');
    const sBtn = $('signup-submit-btn');
    const payload = {
      fullName: $('signup-name')?.value?.trim() || '',
      email: $('signup-email')?.value?.trim() || '',
      phone: $('signup-phone')?.value?.trim() || '',
      company: $('signup-company')?.value?.trim() || '',
      jobTitle: $('signup-job')?.value || '',
      document: $('signup-document')?.value?.trim() || '',
      cityUf: $('signup-city')?.value?.trim() || '',
      purpose: $('signup-purpose')?.value?.trim() || ''
    };
    if (!payload.fullName || !payload.email || !payload.phone || !payload.company || !payload.cityUf) {
      if (sFeedback) {
        sFeedback.style.color = '#fca5a5';
        sFeedback.textContent = 'Preencha todos os campos obrigatórios (*) para enviar seu cadastro.';
      }
      return;
    }
    if (sBtn) {
      sBtn.disabled = true;
      sBtn.textContent = 'Enviando para validação…';
    }
    try {
      const r = await fetch('/api/auth/register-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || 'Não foi possível enviar o cadastro.');
      if (sFeedback) {
        sFeedback.style.color = '#4ade80';
        sFeedback.textContent =
          '✓ ' +
          (d.message ||
            'Cadastro enviado para validação! Você receberá nosso retorno por e-mail com sua senha temporária de primeiro acesso.');
      }
      signupForm.reset();
    } catch (err) {
      if (sFeedback) {
        sFeedback.style.color = '#fca5a5';
        sFeedback.textContent = err.message;
      }
    } finally {
      if (sBtn) {
        sBtn.disabled = false;
        sBtn.innerHTML = '<span>Enviar Cadastro para Validação &rarr;</span>';
      }
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

  function detectClientDeviceHint() {
    try {
      const ua = navigator.userAgent || '';
      const isNative =
        Boolean(window.RadarNative) ||
        document.documentElement.hasAttribute('data-radar-native-app') ||
        /RadarDeTalentosApp/i.test(ua) ||
        (/; wv\)/i.test(ua) && /Android/i.test(ua));
      const uaMobile = Boolean(navigator.userAgentData?.mobile);
      const isTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
      const w = Math.min(window.innerWidth || 1280, window.screen?.width || 1280);
      const formFactor =
        document.documentElement.getAttribute('data-radar-form-factor') ||
        (uaMobile || (isTouch && w <= 768)
          ? 'mobile'
          : isTouch && w <= 1180
            ? 'tablet'
            : w <= 640
              ? 'mobile'
              : 'desktop');
      return (isNative ? 'android-apk-' : 'web-') + formFactor;
    } catch {
      return 'web-desktop';
    }
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
      const deviceHint = detectClientDeviceHint();
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Radar-Device': deviceHint },
        body: JSON.stringify({ username, password, remember, deviceHint })
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

  // =========================================================================
  // 3. CAMADA TEMPORÁRIA NEUTRA PRÉ-INAUGURAÇÃO (USA O MESMO LOGIN DO BANCO)
  // =========================================================================
  const nLoginForm = $('neutral-login-form');
  const nForceForm = $('neutral-force-pwd-form');
  const nRecoverForm = $('neutral-recover-form');
  if (nForceForm) nForceForm.hidden = true;
  if (nRecoverForm) nRecoverForm.hidden = true;
  const nUserInp = $('neutral-username');
  const nPwdInp = $('neutral-password');
  const nToggleBtn = $('neutral-toggle-pwd');
  const nFeedback = $('neutral-login-feedback');
  const nSubmitBtn = $('neutral-login-submit');
  const nNewPwdInp = $('neutral-new-password');
  const nConfPwdInp = $('neutral-confirm-password');
  const nForceFeedback = $('neutral-force-feedback');
  const nForceSubmit = $('neutral-force-submit');
  const nRecoverInp = $('neutral-recover-identifier');
  const nRecoverFeedback = $('neutral-recover-feedback');
  const nRecoverSubmit = $('neutral-recover-submit');

  $('neutral-forgot-btn')?.addEventListener('click', () => {
    if (nLoginForm) nLoginForm.hidden = true;
    if (nForceForm) nForceForm.hidden = true;
    if (nRecoverForm) nRecoverForm.hidden = false;
    if ($('neutral-title')) $('neutral-title').textContent = 'Esqueci Minha Senha';
    if ($('neutral-subtitle')) {
      $('neutral-subtitle').textContent = 'Solicite a redefinição de sua senha de acesso.';
    }
    if (nRecoverInp && nUserInp?.value?.trim()) {
      nRecoverInp.value = nUserInp.value.trim();
    }
    if (nRecoverFeedback) nRecoverFeedback.textContent = '';
    nRecoverInp?.focus();
  });

  $('neutral-back-login-btn')?.addEventListener('click', () => {
    if (nRecoverForm) nRecoverForm.hidden = true;
    if (nForceForm) nForceForm.hidden = true;
    if (nLoginForm) nLoginForm.hidden = false;
    if ($('neutral-title')) $('neutral-title').textContent = 'Autenticação de Usuário';
    if ($('neutral-subtitle')) {
      $('neutral-subtitle').textContent = 'Informe suas credenciais autorizadas para continuar.';
    }
    nUserInp?.focus();
  });

  nRecoverForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const identifier = nRecoverInp?.value?.trim() || '';
    if (!identifier) {
      if (nRecoverFeedback) {
        nRecoverFeedback.style.color = '#fca5a5';
        nRecoverFeedback.textContent = 'Informe seu e-mail ou usuário cadastrado.';
      }
      return;
    }
    if (nRecoverSubmit) {
      nRecoverSubmit.disabled = true;
      nRecoverSubmit.textContent = 'Enviando solicitação…';
    }
    if (nRecoverFeedback) {
      nRecoverFeedback.style.color = '#93c5fd';
      nRecoverFeedback.textContent = 'Registrando solicitação de redefinição…';
    }
    try {
      const r = await fetch('/api/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'recover', identifier, email: identifier })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || 'Não foi possível enviar a solicitação.');
      if (nRecoverFeedback) {
        nRecoverFeedback.style.color = '#4ade80';
        nRecoverFeedback.textContent =
          '✓ Solicitação registrada! O Administrador foi notificado para enviar sua nova senha temporária.';
      }
    } catch (err) {
      if (nRecoverFeedback) {
        nRecoverFeedback.style.color = '#fca5a5';
        nRecoverFeedback.textContent = err.message;
      }
    } finally {
      if (nRecoverSubmit) {
        nRecoverSubmit.disabled = false;
        nRecoverSubmit.innerHTML = '<span>Solicitar Redefinição de Senha</span>';
      }
    }
  });

  nToggleBtn?.addEventListener('click', () => {
    if (!nPwdInp) return;
    const isPwd = nPwdInp.type === 'password';
    nPwdInp.type = isPwd ? 'text' : 'password';
    nToggleBtn.textContent = isPwd ? 'Ocultar' : 'Mostrar';
  });

  function updateNeutralChecklist(pwd = '') {
    const s = String(pwd);
    const checks = {
      len: s.length >= 8,
      upper: /[A-Z]/.test(s),
      lower: /[a-z]/.test(s),
      num: /[0-9]/.test(s),
      sym: /[^A-Za-z0-9]/.test(s)
    };
    document.querySelectorAll('#neutral-pwd-checklist li').forEach(li => {
      const rule = li.dataset.rule;
      const ok = Boolean(checks[rule]);
      li.classList.toggle('is-valid', ok);
      const cleanTxt = li.textContent.replace(/^[✓○]\s*/, '');
      li.textContent = `${ok ? '✓' : '○'} ${cleanTxt}`;
    });
  }

  nNewPwdInp?.addEventListener('input', () => updateNeutralChecklist(nNewPwdInp.value));

  nLoginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const username = nUserInp?.value?.trim() || '';
    const password = nPwdInp?.value || '';
    const remember = Boolean($('neutral-remember')?.checked);

    if (!username || !password) {
      if (nFeedback) {
        nFeedback.style.color = '#fca5a5';
        nFeedback.textContent = 'Informe seu e-mail ou usuário e sua senha.';
      }
      return;
    }

    if (nSubmitBtn) {
      nSubmitBtn.disabled = true;
      nSubmitBtn.textContent = 'Autenticando…';
    }
    if (nFeedback) {
      nFeedback.style.color = '#93c5fd';
      nFeedback.textContent = 'Validando credenciais…';
    }

    try {
      const deviceHint = detectClientDeviceHint();
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Radar-Device': deviceHint },
        body: JSON.stringify({ username, password, remember, deviceHint })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || 'Usuário ou senha inválidos.');

      if (d.mustChangePassword || d.user?.mustChangePassword) {
        if (nLoginForm) nLoginForm.hidden = true;
        if (nForceForm) nForceForm.hidden = false;
        if ($('neutral-title')) $('neutral-title').textContent = 'Primeiro Acesso';
        if ($('neutral-subtitle')) {
          $('neutral-subtitle').textContent = `Olá, ${d.user?.displayName || username}! Cadastre sua nova senha pessoal.`;
        }
        if ($('neutral-force-title')) {
          $('neutral-force-title').textContent = `Cadastro Obrigatório de Nova Senha (@${d.user?.username || username})`;
        }
        updateNeutralChecklist('');
        nNewPwdInp?.focus();
        return;
      }

      if (nFeedback) {
        nFeedback.style.color = '#4ade80';
        nFeedback.textContent = '✓ Acesso autorizado! Redirecionando…';
      }
      location.href = explicitNext || d.redirectUrl || '/';
    } catch (err) {
      if (nFeedback) {
        nFeedback.style.color = '#fca5a5';
        nFeedback.textContent = err.message;
      }
    } finally {
      if (nSubmitBtn) {
        nSubmitBtn.disabled = false;
        nSubmitBtn.innerHTML = '<span>Entrar</span>';
      }
    }
  });

  nForceForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const newPassword = nNewPwdInp?.value || '';
    const confirmPassword = nConfPwdInp?.value || '';
    if (!newPassword || newPassword !== confirmPassword) {
      if (nForceFeedback) {
        nForceFeedback.style.color = '#fca5a5';
        nForceFeedback.textContent = 'A confirmação da nova senha não confere.';
      }
      return;
    }

    if (nForceSubmit) {
      nForceSubmit.disabled = true;
      nForceSubmit.textContent = 'Salvando…';
    }

    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword, confirmPassword })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || 'Não foi possível salvar a nova senha.');

      if (nForceFeedback) {
        nForceFeedback.style.color = '#4ade80';
        nForceFeedback.textContent = '✓ Nova senha salva! Redirecionando…';
      }
      location.href = explicitNext || d.redirectUrl || '/';
    } catch (err) {
      if (nForceFeedback) {
        nForceFeedback.style.color = '#fca5a5';
        nForceFeedback.textContent = err.message;
      }
    } finally {
      if (nForceSubmit) {
        nForceSubmit.disabled = false;
        nForceSubmit.innerHTML = '<span>Salvar Nova Senha e Entrar</span>';
      }
    }
  });
})();
