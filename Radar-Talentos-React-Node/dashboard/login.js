'use strict';
(() => {
  const $ = id => document.getElementById(id);

  // =========================================================================
  // 1. RADAR GIRATÓRIO 360° COM DETECÇÃO ANGULAR REAL DOS PONTOS DE TALENTOS
  // =========================================================================
  const beam = $('ri-radar-beam');
  const blips = [...document.querySelectorAll('.ri-talent-blip')];
  let currentAngle = 35;
  let lastFrame = performance.now();
  let speedMultiplier = 1; // acelera durante a validação de credenciais

  function animateRadar(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    currentAngle = (currentAngle + dt * 58 * speedMultiplier) % 360;
    if (beam) {
      beam.style.transform = `rotate(${currentAngle.toFixed(1)}deg)`;
    }
    for (const blip of blips) {
      const targetAngle = Number(blip.dataset.angle || 0);
      const diff = (currentAngle - targetAngle + 360) % 360;
      if (diff >= 0 && diff <= 72) {
        blip.classList.add('is-lit');
      } else {
        blip.classList.remove('is-lit');
      }
    }
    requestAnimationFrame(animateRadar);
  }
  requestAnimationFrame(animateRadar);

  // =========================================================================
  // 2. PARTÍCULAS DIGITAIS LUMINOSAS + PARALLAX DISCRETO CONFORME O MOUSE
  // =========================================================================
  const canvas = $('ri-particles-canvas');
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);
    window.addEventListener('resize', () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    });
    const particles = Array.from({ length: 34 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.8 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -0.12 - Math.random() * 0.28,
      alpha: 0.15 + Math.random() * 0.45
    }));
    function drawParticles() {
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.x = (p.x + p.vx + W) % W;
        p.y = (p.y + p.vy + H) % H;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(217, 166, 255, ${p.alpha.toFixed(2)})`;
        ctx.fill();
      }
      requestAnimationFrame(drawParticles);
    }
    requestAnimationFrame(drawParticles);
  }

  const parallaxRadar = $('ri-parallax-radar');
  const parallaxMap = $('ri-parallax-map');
  window.addEventListener('mousemove', e => {
    const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    if (parallaxRadar) {
      parallaxRadar.style.transform = `translate3d(${(nx * 7).toFixed(1)}px, ${(ny * 7).toFixed(1)}px, 0)`;
    }
    if (parallaxMap) {
      parallaxMap.style.transform = `translate3d(${(nx * -12).toFixed(1)}px, ${(ny * -12).toFixed(1)}px, 0)`;
    }
  });

  // =========================================================================
  // 3. AUTENTICAÇÃO, SEQUÊNCIA DE VARREDURA, TROCA DE SENHA E SOLICITAÇÕES
  // =========================================================================
  const loginForm = $('radar-login-form');
  const forcePwdForm = $('radar-force-pwd-form');
  const requestForm = $('radar-request-form');
  const userInp = $('login-username');
  const pwdInp = $('login-password');
  const togglePwdBtn = $('toggle-login-pwd');
  const feedback = $('login-feedback');
  const submitBtn = $('login-submit-btn');
  const scanProgress = $('ri-scan-progress');
  const scanFill = $('ri-scan-fill');
  const scanStepText = $('ri-scan-step-text');

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

  $('fill-admin-demo-btn')?.addEventListener('click', () => {
    if (userInp) userInp.value = 'admin';
    if (pwdInp) pwdInp.value = 'Radar@2026';
    if (feedback) {
      feedback.style.color = '#D9A6FF';
      feedback.textContent = 'Credenciais do Administrador preenchidas. Clique em "Acessar Radar →".';
    }
  });

  function showFormView(view = 'login') {
    if (loginForm) loginForm.hidden = view !== 'login';
    if (forcePwdForm) forcePwdForm.hidden = view !== 'force_pwd';
    if (requestForm) requestForm.hidden = view !== 'request';
  }

  $('forgot-password-btn')?.addEventListener('click', () => {
    showFormView('request');
    if ($('request-kind')) $('request-kind').value = 'recover';
    if ($('request-form-title')) $('request-form-title').textContent = '🔑 Recuperação de Senha';
    if ($('request-form-desc')) {
      $('request-form-desc').textContent =
        'Informe seu usuário ou e-mail corporativo para notificar o Administrador e receber uma nova senha temporária.';
    }
    if ($('request-role-wrap')) $('request-role-wrap').hidden = true;
    if (userInp?.value && $('request-email')) $('request-email').value = userInp.value;
    $('request-email')?.focus();
  });

  $('request-access-btn')?.addEventListener('click', () => {
    showFormView('request');
    if ($('request-kind')) $('request-kind').value = 'request';
    if ($('request-form-title')) $('request-form-title').textContent = '🚀 Solicitar Acesso ao Radar';
    if ($('request-form-desc')) {
      $('request-form-desc').textContent =
        'Preencha seus dados e seu perfil de atuação para que o Administrador libere suas credenciais e permissões.';
    }
    if ($('request-role-wrap')) $('request-role-wrap').hidden = false;
    $('request-name')?.focus();
  });

  $('back-to-login-btn')?.addEventListener('click', () => {
    showFormView('login');
  });

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
    }, 420);
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
      submitBtn.textContent = 'Validando credenciais…';
    }
    if (feedback) feedback.textContent = '';
    if (scanProgress) scanProgress.hidden = false;
    speedMultiplier = 3.2;

    if (scanFill) scanFill.style.width = '35%';
    if (scanStepText) scanStepText.textContent = 'Varrendo identidade e hash criptográfico…';

    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, remember })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || 'Usuário ou senha inválidos.');

      if (scanFill) scanFill.style.width = '75%';
      if (scanStepText) scanStepText.textContent = `Perfil ${d.user?.roleLabel || 'Autorizado'} localizado · Sincronizando permissões…`;
      await new Promise(res => setTimeout(res, 260));

      if (d.mustChangePassword || d.user?.mustChangePassword) {
        speedMultiplier = 1;
        if (scanProgress) scanProgress.hidden = true;
        showFormView('force_pwd');
        if ($('ri-welcome-title')) $('ri-welcome-title').textContent = 'Ativação de Segurança.';
        if ($('ri-welcome-subtitle')) {
          $('ri-welcome-subtitle').textContent = `Olá, ${d.user?.displayName || username}! Cadastre sua nova senha pessoal.`;
        }
        if ($('force-pwd-user-title')) {
          $('force-pwd-user-title').textContent = `🔑 Primeiro Acesso / Senha Provisória (@${d.user?.username || username})`;
        }
        newPwdInp?.focus();
        return;
      }

      if (scanFill) scanFill.style.width = '100%';
      if (scanStepText) scanStepText.textContent = `✓ Acesso liberado para ${d.user?.displayName || username}! Abrindo central…`;
      const targetUrl = explicitNext || d.redirectUrl || '/';
      enterDashboardWithAnimation(targetUrl);
    } catch (err) {
      speedMultiplier = 1;
      if (scanProgress) scanProgress.hidden = true;
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
      forceSubmitBtn.textContent = 'Salvando nova senha segura…';
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
        forceFeedback.textContent = '✓ Nova senha cadastrada com sucesso! Entrando no Radar…';
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

  requestForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const kind = $('request-kind')?.value || 'request';
    const name = $('request-name')?.value?.trim() || '';
    const email = $('request-email')?.value?.trim() || '';
    const role = $('request-role')?.value || 'producer';
    const reqFeedback = $('request-feedback');
    const reqBtn = $('request-submit-btn');

    if (!name && !email) {
      if (reqFeedback) {
        reqFeedback.style.color = '#fca5a5';
        reqFeedback.textContent = 'Informe seu nome e seu e-mail ou usuário.';
      }
      return;
    }

    if (reqBtn) reqBtn.disabled = true;
    try {
      const r = await fetch('/api/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, name, email, role })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || 'Erro ao enviar solicitação.');
      if (reqFeedback) {
        reqFeedback.style.color = '#4ade80';
        reqFeedback.textContent = '✓ ' + d.message;
      }
    } catch (err) {
      if (reqFeedback) {
        reqFeedback.style.color = '#fca5a5';
        reqFeedback.textContent = err.message;
      }
    } finally {
      if (reqBtn) reqBtn.disabled = false;
    }
  });
})();
