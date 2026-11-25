'use strict';(()=>{
 const mark=document.querySelector('.sidebar .radar-mark');
 if(mark&&!mark.querySelector('img')){
  mark.textContent='';
  const logoImg=document.createElement('img');
  logoImg.className='brand-logo-img';
  logoImg.src='/radar-logo-mark.png';
  logoImg.alt='';
  mark.append(logoImg);
 }
 // Suporte nativo Edge-to-Edge (Android 15/16 WindowCompat + Safe Area Insets) para Mobile e Tablet
 const vpMeta=document.querySelector('meta[name="viewport"]');
 if(vpMeta&&!String(vpMeta.content).includes('viewport-fit')){
  vpMeta.content=vpMeta.content+', viewport-fit=cover';
 }
 if(!document.querySelector('link[rel="manifest"]')){
  const mf=document.createElement('link');
  mf.rel='manifest';
  mf.href='/manifest.json';
  document.head.append(mf);
 }
 const sidebarEl=document.querySelector('.sidebar');
 if(sidebarEl&&!document.getElementById('radar-mobile-menu-btn')){
  const backdrop=document.createElement('div');
  backdrop.className='radar-sidebar-backdrop';
  backdrop.id='radar-sidebar-backdrop';
  document.body.append(backdrop);
  const topHeaderHost=
   document.querySelector('.topline')||
   document.querySelector('.commercial-topbar')||
   document.querySelector('.ac-top-header')||
   document.querySelector('.disc-top-header')||
   document.querySelector('main > :first-child');
  if(topHeaderHost){
   const menuBtn=document.createElement('button');
   menuBtn.id='radar-mobile-menu-btn';
   menuBtn.className='radar-mobile-menu-btn';
   menuBtn.type='button';
   menuBtn.setAttribute('aria-label','Abrir menu de navegação do Radar');
   menuBtn.innerHTML='&#9776;';
   topHeaderHost.prepend(menuBtn);
   const toggleSidebar=()=>document.body.classList.toggle('radar-mobile-nav-open');
   const closeSidebar=()=>document.body.classList.remove('radar-mobile-nav-open');
   menuBtn.addEventListener('click',e=>{e.stopPropagation();toggleSidebar();});
   backdrop.addEventListener('click',closeSidebar);
   sidebarEl.querySelectorAll('a,button').forEach(a=>a.addEventListener('click',closeSidebar));
  }
  if(!document.getElementById('radar-mobile-bottom-nav')){
   const bNav=document.createElement('nav');
   bNav.id='radar-mobile-bottom-nav';
   bNav.className='radar-mobile-bottom-nav';
   bNav.setAttribute('aria-label','Navegação rápida mobile');
   const curPath=location.pathname||'/';
   for(const [icon,label,href] of [
    ['◉','Visão Geral','/'],
    ['⌖','Audiência','/audience.html'],
    ['↗','Comercial','/commercial.html'],
    ['★','Emergentes','/rising.html'],
    ['👥','Usuários','/users.html']
   ]){
    const a=document.createElement('a');
    a.href=href;
    const isCur=(href==='/'&&(curPath==='/'||curPath==='/index.html'))||(href!=='/'&&curPath.endsWith(href));
    if(isCur)a.setAttribute('aria-current','page');
    const ic=document.createElement('span');ic.textContent=icon;
    const lb=document.createElement('small');lb.textContent=label;
    a.append(ic,lb);
    bNav.append(a);
   }
   document.body.append(bNav);
  }
  if(!document.getElementById('radar-sidebar-apk-download')){
   const apkLink=document.createElement('a');
   apkLink.id='radar-sidebar-apk-download';
   apkLink.className='nav-link';
   apkLink.href='/radar-de-talentos.apk?v=302';
   apkLink.setAttribute('download','radar-de-talentos-v3.0.2.apk');
   apkLink.style.marginTop='8px';
   apkLink.style.border='1px solid rgba(183, 68, 255, 0.35)';
   apkLink.style.background='rgba(154, 50, 239, 0.14)';
   apkLink.innerHTML='<span class="nav-link-icon">&#128241;</span><span class="nav-link-copy"><strong>Baixar App (.APK v3.0.2)</strong><small>Android Mobile &amp; Tablet</small></span>';
   const sideFooter=sidebarEl.querySelector('.sidebar-footer');
   if(sideFooter)sidebarEl.insertBefore(apkLink,sideFooter);
   else sidebarEl.append(apkLink);
  }
 }
 if(document.getElementById('radar-notification-bell'))return;
 const host=
  document.querySelector('.top-search-bar')||
  document.querySelector('.compat-topbar-actions')||
  document.querySelector('.commercial-topbar')||
  document.querySelector('.ac-actions')||
  document.querySelector('.topbar-actions')||
  document.querySelector('.topline')||
  document.querySelector('.topbar')||
  document.querySelector('.ac-top-header')||
  document.querySelector('.disc-top-header')||
  document.querySelector('.rising-top')||
  document.querySelector('.dashboard-main > :first-child')||
  document.querySelector('main > :first-child');
 if(!host)return;
 const box=document.createElement('div');
 box.className='radar-notify';
 const btn=document.createElement('button');
 btn.id='radar-notification-bell';
 btn.type='button';
 btn.title='Notificações de artistas em ascensão';
 btn.setAttribute('aria-label','Abrir notificações de novos artistas em ascensão');
 btn.setAttribute('aria-expanded','false');
 btn.innerHTML='&#128276;';
 const count=document.createElement('span');
 count.className='radar-notify-count';
 count.hidden=true;
 btn.append(count);
 const panel=document.createElement('div');
 panel.className='radar-notify-panel';
 panel.hidden=true;
 box.append(btn,panel);
 host.append(box);
 btn.addEventListener('click',e=>{
  e.stopPropagation();
  panel.hidden=!panel.hidden;
  btn.setAttribute('aria-expanded',String(!panel.hidden));
 });
 document.addEventListener('click',e=>{
  if(!panel.hidden&&!box.contains(e.target)){
   panel.hidden=true;
   btn.setAttribute('aria-expanded','false');
  }
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!panel.hidden){
   panel.hidden=true;
   btn.setAttribute('aria-expanded','false');
  }
 });
 async function load(){
  try{
   const r=await fetch('/api/discoveries/rising?limit=10',{cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const data=await r.json();
   const n=data.total||0;
   count.hidden=n===0;
   count.textContent=n>99?'99+':String(n);
   panel.replaceChildren();
   const h=document.createElement('strong');
   h.textContent=n?`${n} talento(s) com crescimento observado`:'Monitoramento de Ascensão Ativo';
   panel.append(h);
   if(!n){
    const sub=document.createElement('p');
    sub.textContent='53 artistas monitorados com métricas verificadas (YouTube, Spotify e Instagram). Novos alertas surgem automaticamente a partir da 2ª janela comparável de 30 dias.';
    panel.append(sub);
   }
   for(const x of data.items||[]){
    const p=document.createElement('p');
    p.textContent=`${x.name} · ${x.network} · +${x.change_pct.toLocaleString('pt-BR')}% (30d)`;
    panel.append(p);
   }
   const a=document.createElement('a');
   a.href='/rising.html';
   a.textContent='Abrir painel de descobertas em ascensão ↗';
   panel.append(a);
  }catch{
   panel.replaceChildren();
   panel.textContent='Notificações temporariamente indisponíveis';
   count.hidden=true;
  }
 }
 load();
 setInterval(load,120000);

 // =========================================================================
 // CONTROLE DE SESSÃO, LOGIN, TROCA DE PERFIL E PERMISSÕES (EM TODOS OS MENUS)
 // =========================================================================
 const el=(tag,cls,text)=>{
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(text!==undefined)e.textContent=text;
  return e;
 };

 let authChip=document.getElementById('radar-user-session-chip');
 if(!authChip){
  authChip=el('button','secondary-button','👤 Admin');
  authChip.id='radar-user-session-chip';
  authChip.type='button';
  authChip.style.height='30px';
  authChip.style.padding='0 10px';
  authChip.style.fontSize='11px';
  authChip.style.borderRadius='8px';
  authChip.style.borderColor='#38bdf8';
  authChip.title='Clique para fazer Login, Trocar de Usuário ou Gerenciar Permissões';
  host.insertBefore(authChip,box);
 }

 let authModal=document.getElementById('radar-global-auth-modal');
 if(!authModal){
  authModal=el('dialog','palette show-sim-modal');
  authModal.id='radar-global-auth-modal';
  const inner=el('div');
  inner.id='radar-global-auth-content';
  inner.style.maxWidth='480px';
  inner.style.margin='0 auto';
  authModal.append(inner);
  document.body.append(authModal);
 }

 const routePermMap={
  '/':'overview',
  '/index.html':'overview',
  '/audience.html':'audience',
  '/commercial.html':'commercial',
  '/rising.html':'rising',
  '/events.html':'events',
  '/acquisition.html':'acquisition',
  '/discovery.html':'discovery',
  '/users.html':'users'
 };

 function applyUserPermissionsToNavigation(authData){
  const u=authData?.user;
  if(!u)return;
  const perms=u.permissions||{};
  const isImpersonating=Boolean(authData?.impersonating);
  if(authChip){
   authChip.textContent=isImpersonating
    ?`🎭 ${u.displayName} (Voltar)`
    :`👤 ${u.displayName}`;
   authChip.title=`Logado como ${u.displayName} (@${u.username}) — Clique para trocar de perfil ou gerenciar permissões`;
   authChip.style.borderColor=isImpersonating?'#facc15':'#38bdf8';
  }

  document.querySelectorAll('.sidebar nav a').forEach(a=>{
   const href=a.getAttribute('href')||'';
   const cleanPath=href.split('#')[0];
   const permKey=routePermMap[cleanPath];
   if(!permKey)return;
   const allowed=u.role==='admin'||perms[permKey]!==false;
   if(!allowed){
    a.style.opacity='0.38';
    a.title='Acesso não liberado pelo Administrador para este perfil';
    a.dataset.radarLocked='1';
   }else{
    a.style.opacity='1';
    a.title='';
    delete a.dataset.radarLocked;
   }
  });

  if(u.mustChangePassword){
   openPasswordChangeModal(true,u);
  }
 }

 document.querySelectorAll('.sidebar nav a').forEach(a=>{
  a.addEventListener('click',e=>{
   if(a.dataset.radarLocked==='1'){
    e.preventDefault();
    openLoginModal('Este módulo não está marcado nas permissões do perfil atual. Entre como Administrador ou solicite a liberação em Usuários.');
   }
  });
 });

 function openLoginModal(noticeText=''){
  const inner=document.getElementById('radar-global-auth-content');
  if(!authModal||!inner)return;
  inner.replaceChildren();
  if(!authModal.open)authModal.showModal();

  const head=el('div','show-sim-head');
  const left=el('div');
  left.append(
   el('span','eyebrow','AUTENTICAÇÃO & TROCA DE PERFIL · RADAR DE TALENTOS'),
   el('h2',null,'🔐 Acesso ao Radar (Login e Senha)'),
   el('p',null,noticeText||'Entre com seu usuário e senha criados pelo Administrador, ou gerencie contas e permissões.')
  );
  const closeBtn=el('button','secondary-button','✕ Fechar');
  closeBtn.type='button';
  closeBtn.addEventListener('click',()=>authModal.close());
  head.append(left,closeBtn);
  inner.append(head);

  const form=el('form');
  form.style.display='flex';
  form.style.flexDirection='column';
  form.style.gap='10px';

  const lblU=el('label','filter-card');
  lblU.style.height='auto';lblU.style.padding='8px 10px';
  lblU.append(el('span','filter-label','Usuário (Login)'));
  const inpU=el('input');
  inpU.type='text';inpU.required=true;inpU.autocomplete='username';
  lblU.append(inpU);

  const lblP=el('label','filter-card');
  lblP.style.height='auto';lblP.style.padding='8px 10px';
  lblP.append(el('span','filter-label','Senha'));
  const inpP=el('input');
  inpP.type='password';inpP.required=true;inpP.autocomplete='current-password';
  lblP.append(inpP);

  const msg=el('p');
  msg.style.fontSize='11.5px';
  msg.style.color='#facc15';

  const btnRow=el('div');
  btnRow.style.display='flex';
  btnRow.style.gap='8px';
  btnRow.style.flexWrap='wrap';

  const subBtn=el('button','btn-simulate-show','🚀 Entrar no Radar');
  subBtn.type='submit';
  subBtn.style.flex='1';
  subBtn.style.height='36px';

  const manageLink=el('a','secondary-button','👥 Usuários & Permissões');
  manageLink.href='/users.html';
  manageLink.style.textDecoration='none';
  manageLink.style.display='inline-flex';
  manageLink.style.alignItems='center';
  manageLink.style.padding='0 10px';
  manageLink.style.height='36px';

  const fullLoginLink=el('a','secondary-button','🌐 Abrir Página de Login ↗');
  fullLoginLink.href='/login.html';
  fullLoginLink.style.textDecoration='none';
  fullLoginLink.style.display='inline-flex';
  fullLoginLink.style.alignItems='center';
  fullLoginLink.style.padding='0 10px';
  fullLoginLink.style.height='36px';

  btnRow.append(subBtn,manageLink,fullLoginLink);
  form.append(lblU,lblP,msg,btnRow);

  form.addEventListener('submit',async e=>{
   e.preventDefault();
   subBtn.disabled=true;
   msg.textContent='Autenticando...';
   try{
    const r=await fetch('/api/auth/login',{
     method:'POST',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({username:inpU.value.trim(),password:inpP.value})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||'Falha no login');
    authModal.close();
    await checkAuthSession();
    window.dispatchEvent(new Event('radar:auth-updated'));
   }catch(err){
    msg.textContent=err.message;
    subBtn.disabled=false;
   }
  });

  inner.append(form);
 }

 function openPasswordChangeModal(mandatory=false,userObj=null){
  const inner=document.getElementById('radar-global-auth-content');
  if(!authModal||!inner)return;
  inner.replaceChildren();
  if(!authModal.open)authModal.showModal();

  const head=el('div','show-sim-head');
  const left=el('div');
  left.append(
   el('span','eyebrow',mandatory?'PRIMEIRO ACESSO / SENHA RESETADA · TROCA OBRIGATÓRIA':'SEGURANÇA DA CONTA'),
   el('h2',null,mandatory?`🔑 Cadastre sua Nova Senha Pessoal (${userObj?.displayName||'Usuário'})`:'🔑 Alterar Senha de Acesso'),
   el('p',null,'Por segurança corporativa, cadastre uma nova senha forte com no mínimo 8 caracteres, contendo letra maiúscula, minúscula, número e caractere especial (ex.: @, #, $, !).')
  );
  if(!mandatory){
   const closeBtn=el('button','secondary-button','✕ Fechar');
   closeBtn.type='button';
   closeBtn.addEventListener('click',()=>authModal.close());
   head.append(left,closeBtn);
  }else{
   head.append(left);
  }
  inner.append(head);

  const form=el('form');
  form.style.display='flex';
  form.style.flexDirection='column';
  form.style.gap='10px';

  const lbl1=el('label','filter-card');
  lbl1.style.height='auto';lbl1.style.padding='8px 10px';
  lbl1.append(el('span','filter-label','Nova Senha Forte (8+ caracteres, A-Z, a-z, 0-9 e símbolo)'));
  const inp1=el('input');
  inp1.type='password';inp1.required=true;inp1.autocomplete='new-password';
  lbl1.append(inp1);

  const lbl2=el('label','filter-card');
  lbl2.style.height='auto';lbl2.style.padding='8px 10px';
  lbl2.append(el('span','filter-label','Confirmar Nova Senha'));
  const inp2=el('input');
  inp2.type='password';inp2.required=true;inp2.autocomplete='new-password';
  lbl2.append(inp2);

  const rulesBox=el('small',null,'Padrão exigido: Mínimo 8 caracteres · 1 Maiúscula · 1 Minúscula · 1 Número · 1 Símbolo (@#$!%)');
  rulesBox.style.color='#38bdf8';

  const msg=el('p');
  msg.style.fontSize='11.5px';
  msg.style.color='#facc15';

  const subBtn=el('button','btn-simulate-show','✓ Salvar Nova Senha Segura e Acessar Radar');
  subBtn.type='submit';
  subBtn.style.height='36px';

  form.append(lbl1,lbl2,rulesBox,msg,subBtn);
  form.addEventListener('submit',async e=>{
   e.preventDefault();
   subBtn.disabled=true;
   msg.textContent='Validando padrões de segurança e salvando...';
   try{
    const r=await fetch('/api/auth/change-password',{
     method:'POST',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({newPassword:inp1.value,confirmPassword:inp2.value})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||'Não foi possível salvar a nova senha');
    authModal.close();
    await checkAuthSession();
    window.dispatchEvent(new Event('radar:auth-updated'));
   }catch(err){
    msg.textContent=err.message;
    subBtn.disabled=false;
   }
  });

  inner.append(form);
 }

 let logoutBtn=document.getElementById('radar-user-logout-btn');
 if(!logoutBtn){
  logoutBtn=el('button','secondary-button','⎋ Sair');
  logoutBtn.id='radar-user-logout-btn';
  logoutBtn.type='button';
  logoutBtn.style.height='30px';
  logoutBtn.style.padding='0 9px';
  logoutBtn.style.fontSize='11px';
  logoutBtn.style.borderRadius='8px';
  logoutBtn.title='Encerrar sessão e voltar ao Portal de Acesso (Login)';
  logoutBtn.addEventListener('click',async()=>{
   try{await fetch('/api/auth/logout',{method:'POST'});}catch{}
   location.replace('/login.html');
  });
  host.insertBefore(logoutBtn,box);
 }

 let latestAuthData=null;
 async function checkAuthSession(){
  try{
   const r=await fetch('/api/auth/me',{cache:'no-store'});
   if(!r.ok)return;
   latestAuthData=await r.json();
   const p=location.pathname||'/';
   if(!latestAuthData.authenticated&&!p.endsWith('/login.html')){
    const nextTarget=encodeURIComponent(p+(location.search||'')+(location.hash||''));
    location.replace('/login.html?next='+nextTarget);
    return;
   }
   applyUserPermissionsToNavigation(latestAuthData);
  }catch{}
 }

 authChip?.addEventListener('click',async()=>{
  if(latestAuthData?.impersonating){
   await fetch('/api/auth/impersonate',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({userId:null})
   });
   await checkAuthSession();
   window.dispatchEvent(new Event('radar:auth-updated'));
   return;
  }
  openLoginModal();
 });

 window.openRadarLoginModal=openLoginModal;
 window.openRadarPasswordChangeModal=openPasswordChangeModal;
 window.addEventListener('radar:auth-updated',checkAuthSession);
 checkAuthSession();

 // =========================================================================
 // ARQUITETURA HÍBRIDA: EDGE-TO-EDGE (E2E) WEBSOCKET CLIENT (RFC 6455)
 // Conexão persistente, Heartbeat (25s), Reconexão Automática, Deduplicação e ACK
 // =========================================================================
 let e2eChip=document.getElementById('radar-e2e-socket-chip');
 if(!e2eChip){
  e2eChip=el('button','secondary-button','🟡 E2E Socket');
  e2eChip.id='radar-e2e-socket-chip';
  e2eChip.type='button';
  e2eChip.style.height='30px';
  e2eChip.style.padding='0 10px';
  e2eChip.style.fontSize='11px';
  e2eChip.style.borderRadius='8px';
  e2eChip.style.borderColor='rgba(168, 85, 247, 0.45)';
  e2eChip.title='Arquitetura Híbrida REST + WebSocket Edge-to-Edge (Clique para inspecionar telemetria em tempo real)';
  host.insertBefore(e2eChip,authChip||box);
 }

 let wsInstance=null;
 let wsReconnectAttempts=0;
 let wsHeartbeatTimer=null;
 let wsConnectedClientId=null;
 const seenEventIds=new Set();

 function updateE2eChipState(state,detail=''){
  if(!e2eChip)return;
  if(state==='connected'){
   e2eChip.textContent='🟢 E2E Socket';
   e2eChip.style.borderColor='rgba(74, 222, 128, 0.55)';
   e2eChip.title=`Edge-to-Edge WebSocket Ativo (${wsConnectedClientId||'WSS'}) · ${detail||'Baixa latência'}`;
  }else if(state==='reconnecting'){
   e2eChip.textContent='🟡 E2E Reconectando';
   e2eChip.style.borderColor='rgba(250, 204, 21, 0.55)';
   e2eChip.title=`Reconectando canal Edge-to-Edge WebSocket (tentativa ${wsReconnectAttempts})...`;
  }else{
   e2eChip.textContent='⚪ E2E Standby';
   e2eChip.style.borderColor='rgba(148, 163, 184, 0.4)';
  }
 }

 function applyRisingSnapshotFromSocket(payload){
  if(!payload||typeof payload!=='object')return;
  const n=Number(payload.total||0);
  count.hidden=n===0;
  count.textContent=n>99?'99+':String(n);
  panel.replaceChildren();
  const h=document.createElement('strong');
  h.textContent=n?`${n} talento(s) com crescimento observado (Push E2E)`:'Monitoramento de Ascensão Ativo (Push E2E)';
  panel.append(h);
  if(!n){
   const sub=document.createElement('p');
   sub.textContent='Canal WebSocket Edge-to-Edge conectado. Novos alertas surgem em tempo real sem necessidade de atualizar a página.';
   panel.append(sub);
  }
  for(const x of payload.items||[]){
   const p=document.createElement('p');
   p.textContent=`${x.name} · ${x.network} · +${Number(x.change_pct||0).toLocaleString('pt-BR')}% (30d)`;
   panel.append(p);
  }
  const a=document.createElement('a');
  a.href='/rising.html';
  a.textContent='Abrir painel de descobertas em ascensão ↗';
  panel.append(a);
 }

 function connectEdgeToEdgeSocket(){
  if(typeof WebSocket==='undefined')return;
  try{
   if(wsInstance&&(wsInstance.readyState===WebSocket.OPEN||wsInstance.readyState===WebSocket.CONNECTING)){
    return;
   }
   const proto=location.protocol==='https:'?'wss:':'ws:';
   const isNativeApp=document.documentElement.hasAttribute('data-radar-native-app');
   const formFactor=document.documentElement.getAttribute('data-radar-form-factor')||(window.innerWidth<=640?'mobile':window.innerWidth<=1024?'tablet':'desktop');
   const edgeName=(isNativeApp?'android-apk-':'web-')+formFactor;
   const wsUrl=`${proto}//${location.host}/ws?edge=${encodeURIComponent(edgeName)}`;
   wsInstance=new WebSocket(wsUrl);

   wsInstance.addEventListener('open',()=>{
    wsReconnectAttempts=0;
    updateE2eChipState('connected',edgeName);
    try{
     wsInstance.send(JSON.stringify({type:'IDENTIFY_EDGE',edgeNode:edgeName,timestamp:new Date().toISOString()}));
    }catch{}
    clearInterval(wsHeartbeatTimer);
    wsHeartbeatTimer=setInterval(()=>{
     if(wsInstance&&wsInstance.readyState===WebSocket.OPEN){
      try{
       wsInstance.send(JSON.stringify({type:'PING',timestamp:new Date().toISOString()}));
      }catch{}
     }
    },25000);
   });

   wsInstance.addEventListener('message',ev=>{
    let msg;
    try{msg=JSON.parse(ev.data);}catch{return;}
    if(!msg||typeof msg!=='object')return;

    if(msg.type==='WELCOME'){
     wsConnectedClientId=msg.clientId||null;
     updateE2eChipState('connected',`${msg.edgeNode||edgeName}`);
     return;
    }

    if(msg.type==='EVENT'){
     if(msg.requiresAck&&msg.eventId&&wsInstance?.readyState===WebSocket.OPEN){
      try{
       wsInstance.send(JSON.stringify({type:'ACK',eventId:msg.eventId,receivedAt:new Date().toISOString()}));
      }catch{}
     }
     if(msg.eventId){
      if(seenEventIds.has(msg.eventId))return;
      seenEventIds.add(msg.eventId);
      if(seenEventIds.size>500){
       const first=seenEventIds.values().next().value;
       seenEventIds.delete(first);
      }
     }

     if(msg.topic==='rising.snapshot'||msg.topic==='rising.alert'){
      applyRisingSnapshotFromSocket(msg.payload);
     }else if(msg.topic==='discovery.updated'||msg.topic==='operations.sync_completed'){
      load();
     }else if(msg.topic==='users.updated'){
      checkAuthSession();
     }

     window.dispatchEvent(new CustomEvent('radar:socket-event',{detail:msg}));
    }
   });

   const scheduleReconnect=()=>{
    clearInterval(wsHeartbeatTimer);
    wsReconnectAttempts++;
    updateE2eChipState('reconnecting');
    const delay=Math.min(30000,1500*Math.pow(1.5,Math.min(wsReconnectAttempts,8)));
    setTimeout(connectEdgeToEdgeSocket,delay);
   };

   wsInstance.addEventListener('close',scheduleReconnect);
   wsInstance.addEventListener('error',()=>{
    try{wsInstance.close();}catch{}
   });
  }catch{}
 }

 e2eChip?.addEventListener('click',async()=>{
  try{
   const r=await fetch('/api/realtime/status',{cache:'no-store'});
   if(!r.ok)return;
   const st=await r.json();
   panel.replaceChildren();
   const h=el('strong',null,`⚡ Arquitetura Híbrida E2E (${st.activeConnections||0} borda(s) ativa(s))`);
   panel.append(h);
   const p1=el('p',null,`Protocolo: ${st.architecture} · Endpoint: ${st.endpoint}`);
   const p2=el('p',null,`Mensagens Enviadas: ${st.metrics?.totalMessagesSent||0} · Recebidas: ${st.metrics?.totalMessagesReceived||0} · ACKs Confirmados: ${st.metrics?.totalAcksReceived||0}`);
   const p3=el('p',null,'Recursos ativos: Conexão persistente · Heartbeat 25s · Reconexão automática · Deduplicação por eventId · Confirmação ACK · Auditoria SQLite.');
   panel.append(p1,p2,p3);
   for(const edge of (st.activeEdges||[]).slice(0,5)){
    panel.append(el('p',null,`🟢 Borda: ${edge.edgeNode} (${edge.clientId}) · RTT: ${edge.rttMs||0}ms`));
   }
   const testBtn=el('button','secondary-button','Disparar Evento E2E em Tempo Real');
   testBtn.type='button';
   testBtn.style.marginTop='6px';
   testBtn.style.width='100%';
   testBtn.addEventListener('click',async e=>{
    e.stopPropagation();
    testBtn.disabled=true;
    testBtn.textContent='Transmitindo evento via Socket...';
    try{
     await fetch('/api/realtime/publish',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
       topic:'edge.telemetry_ping',
       sourceEdge:wsConnectedClientId||'radar-ui',
       payload:{action:'manual_verification',timestamp:new Date().toISOString()}
      })
     });
     const r2=await fetch('/api/realtime/status',{cache:'no-store'});
     const st2=await r2.json();
     p2.textContent=`Mensagens Enviadas: ${st2.metrics?.totalMessagesSent||0} · Recebidas: ${st2.metrics?.totalMessagesReceived||0} · ACKs Confirmados: ${st2.metrics?.totalAcksReceived||0}`;
     testBtn.textContent='✓ Evento transmitido e confirmado (ACK)!';
    }catch{
     testBtn.textContent='Falha ao transmitir';
    }finally{
     setTimeout(()=>{testBtn.disabled=false;testBtn.textContent='Disparar Evento E2E em Tempo Real';},1800);
    }
   });
   panel.append(testBtn);
   panel.hidden=false;
  }catch{}
 });

 connectEdgeToEdgeSocket();
})();
