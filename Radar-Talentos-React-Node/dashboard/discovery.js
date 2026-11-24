'use strict';
const $ = id => document.getElementById(id);
let selected = null, busy = false, cachedCandidates = [];
const status = t => { $('status').textContent = t; };
const add = (parent, tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  parent.append(e);
  return e;
};

async function api(path, payload) {
  const r = await fetch('/api/discovery/' + path, payload === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Radar-Action': 'discovery' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw Error('Operação indisponível (' + r.status + '). Verifique acesso administrativo e configuração.');
  return r.json();
}

function renderCandidatesList() {
  const host = $('candidates');
  if (!host) return;
  host.replaceChildren();
  const filterVal = $('candidate-priority-filter')?.value || 'all';
  const sorted = [...cachedCandidates]
    .filter(c => filterVal === 'all' || c.priority_tier === filterVal)
    .sort((a, b) => (a.priority_order ?? 9) - (b.priority_order ?? 9) || a.name.localeCompare(b.name, 'pt-BR'));
  for (const c of sorted) {
    const b = add(host, 'button', '');
    b.className = 'cand-queue-btn';
    b.dataset.tier = c.priority_tier || '';
    add(b, 'strong', c.name);
    add(b, 'small', `[${({ pending: 'Pendente', approved: 'Aprovado', published: 'No Radar', rejected: 'Rejeitado' }[c.status] || c.status)}] · ${c.priority_label || 'Revisar'}`);
    b.onclick = () => open(c.id).catch(e => status(e.message));
  }
  if (!sorted.length) add(host, 'p', 'Nenhum candidato encontrado neste filtro.');
}
$('candidate-priority-filter')?.addEventListener('change', renderCandidatesList);

async function refresh() {
  const s = await api('status');
  if (s.funnel) {
    if ($('funnel-searched')) $('funnel-searched').textContent = Number(s.funnel.searched ?? 0).toLocaleString('pt-BR');
    if ($('funnel-confirmed')) $('funnel-confirmed').textContent = Number(s.funnel.confirmed ?? 0).toLocaleString('pt-BR');
    if ($('funnel-collected')) $('funnel-collected').textContent = Number(s.funnel.collected ?? 0).toLocaleString('pt-BR');
    if ($('funnel-distributed')) $('funnel-distributed').textContent = Number(s.funnel.distributed ?? 0).toLocaleString('pt-BR');
  }
  const previous = $('source').value;
  $('source').replaceChildren();
  const g = add($('source'), 'option', 'Busca global gratuita (Wikidata + MusicBrainz + YouTube)');
  g.value = 'global';
  const yt = add($('source'), 'option', 'YouTube — pesquisar canais');
  yt.value = 'youtube-live';
  for (const f of s.sources.filter(f => f.enabled && f.kind !== 'licensed-file')) {
    const o = add($('source'), 'option', f.id);
    o.value = f.id;
  }
  if ([...$('source').options].some(o => o.value === previous)) $('source').value = previous;
  cachedCandidates = Array.isArray(s.candidates) ? s.candidates : [];
  renderCandidatesList();
  $('logs').replaceChildren();
  for (const l of s.logs) add($('logs'), 'p', l.at + ' · ' + l.status + ' · ' + l.count + ' registros · ' + (l.message || ''));
}

async function open(id) {
  const c = await api('detail?id=' + encodeURIComponent(id));
  selected = id;
  const p = $('detail');
  p.replaceChildren();
  add(p, 'h3', c.name);
  const stLabel = { pending: 'Pendente de aprovação', approved: 'Aprovado (pronto para enviar ao Radar)', published: 'Ativo no Radar (perfis e métricas distribuídos)', rejected: 'Rejeitado' }[c.status] || c.status;
  const rawRadarId = c.radar_id && !String(c.radar_id).includes('://') ? c.radar_id : null;
  const autoRadarId = rawRadarId ?? c.suggestedRadarId ?? '';
  add(p, 'p', `Status: ${stLabel}${autoRadarId ? ` · Vínculo Radar: ${autoRadarId}` : ''}`);

  const pills = add(p, 'div', '');
  pills.className = 'disc-profile-pills';
  for (const x of c.profiles) {
    const a = add(pills, 'a', `${x.network} ↗`);
    a.className = 'disc-profile-pill';
    a.href = x.url;
    a.title = x.url;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
  }
  for (const e of c.evidence) {
    const a = add(pills, 'a', `Evidência (${e.source_id}) ↗`);
    a.className = 'disc-profile-pill';
    a.href = e.url;
    a.title = e.url;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
  }

  for (const y of c.youtube ?? []) {
    for (const o of y.metrics ?? []) {
      const mLabel = { subscribers: 'YouTube Inscritos', views: 'YouTube Visualizações', video_count: 'YouTube Vídeos' }[o.metric] || o.metric;
      add(p, 'p', `✓ ${mLabel}: ${o.value.toLocaleString('pt-BR')} (${o.observed_at.slice(0, 10)})`);
    }
  }
  for (const x of c.openSocial ?? []) {
    for (const o of x.metrics ?? []) {
      add(p, 'p', `✓ ${x.network} · ${o.metric}: ${o.value.toLocaleString('pt-BR')} (${o.observed_at.slice(0, 10)})`);
    }
  }
  for (const o of c.observations ?? []) {
    add(p, 'p', `✓ ${o.metric}: ${o.value.toLocaleString('pt-BR')} (${o.observed_at.slice(0, 10)})`);
  }

  const autoEv =
    c.identity_evidence ||
    c.evidence.find(e => e.source_id === 'wikidata-cc0')?.url ||
    c.evidence[0]?.url ||
    c.profiles[0]?.url ||
    'https://www.wikidata.org';

  $('review-form').hidden = false;
  if ($('evidence')) $('evidence').value = autoEv;
  if ($('radar-id')) $('radar-id').value = autoRadarId;
  if ($('observe-form')) {
    $('observe-form').hidden = false;
    if (c.profiles[0]) {
      $('obs-network').value = c.profiles[0].network;
      $('obs-url').value = c.profiles[0].url;
      $('obs-evidence').value = '';
    }
  }
  $('approve').disabled = false;
  $('publish').disabled = false;
}

async function run(fn) {
  if (busy) return;
  busy = true;
  status('Executando…');
  try {
    const result = await fn();
    await refresh();
    if (result?.id) selected = result.id;
    if (selected) await open(selected);
    if (result?.ok && result?.radarId) {
      status(
        `✓ ${result.name || 'Artista'} aprovado e enviado ao Radar (${result.radarId})! Perfis vinculados: ${result.profilesLinked ?? 0} · YouTube coletado: ${result.youtubeCollected ?? 0} · Spotify coletado: ${result.spotifyCollected ?? 0}.`
      );
    } else if (result?.bulk) {
      status(`Prospecção: ${result.bulk.attempted} pesquisados; ${result.bulk.queued} na fila; ${result.bulk.unmatched} sem correspondência.`);
    } else {
      status('Operação concluída com sucesso.');
    }
  } catch (e) {
    status(e.message);
  } finally {
    busy = false;
  }
}

function attachFastButtons(container, payloadFactory) {
  const bar = add(container, 'div', '');
  bar.className = 'disc-fast-actions';
  const btnApprove = add(bar, 'button', '✓ Aprovar');
  btnApprove.type = 'button';
  btnApprove.className = 'btn-approve';
  const btnSend = add(bar, 'button', '🚀 Enviar ao Radar');
  btnSend.type = 'button';
  btnSend.className = 'btn-send-radar';

  const exec = () =>
    run(async () => {
      const payload = await payloadFactory();
      return api('approve-and-send', payload);
    });
  btnApprove.onclick = exec;
  btnSend.onclick = exec;
}

$('search-form').onsubmit = e => {
  e.preventDefault();
  if ($('source').value === 'youtube-live') {
    run(async () => {
      const r = await api('youtube-search', { query: $('query').value });
      const p = $('global-list');
      p.replaceChildren();
      $('global-results').hidden = false;
      for (const x of r.channels) {
        const card = add(p, 'div', '');
        card.className = 'disc-result-card';
        const head = add(card, 'div', '');
        head.className = 'disc-result-head';
        add(head, 'strong', x.title);
        const a = add(head, 'a', x.url + ' ↗');
        a.className = 'disc-profile-pill';
        a.href = x.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      return { channels: r.channels.length };
    });
  } else if ($('source').value === 'global') {
    run(async () => {
      const r = await api('global-search', {
        query: $('query').value,
        includeMusicBrainzLive: Boolean($('include-mb')?.checked)
      });
      renderGlobal(r);
      return { sources: r.sources, coverage: r.coverage };
    });
  } else {
    $('global-results').hidden = true;
    run(() => api('search', { source: $('source').value, query: $('query').value }));
  }
};

// Ambos os botões na ficha executam o fluxo unificado (Aprovar + Confirmar perfis da busca + Coletar YouTube/Spotify + Enviar ao Radar)
$('approve').onclick = () =>
  run(() =>
    api('approve-and-send', {
      id: selected,
      evidence: $('evidence')?.value || '',
      radarId: $('radar-id')?.value || ''
    })
  );
$('publish').onclick = () =>
  run(() =>
    api('approve-and-send', {
      id: selected,
      evidence: $('evidence')?.value || '',
      radarId: $('radar-id')?.value || ''
    })
  );

if ($('observe-form')) {
  $('observe-form').onsubmit = e => {
    e.preventDefault();
    run(() =>
      api('observe', {
        id: selected,
        network: $('obs-network').value,
        url: $('obs-url').value,
        metric: $('obs-metric').value,
        value: Number($('obs-value').value),
        evidence_url: $('obs-evidence').value,
        authorization_ref: $('obs-auth').value
      })
    );
  };
}
if ($('csv-form')) {
  $('csv-form').onsubmit = e => {
    e.preventDefault();
    run(() =>
      api('import-csv', {
        mode: $('csv-mode').value,
        authorization_ref: $('csv-auth').value,
        csv: $('csv-content').value
      })
    );
  };
}

function renderGlobal(r) {
  const p = $('global-list');
  p.replaceChildren();
  $('global-results').hidden = false;

  const extraYt = Array.isArray(r.youtubeChannels) && r.youtubeChannels.length ? [r.youtubeChannels[0]] : [];

  for (const x of r.external ?? []) {
    const card = add(p, 'div', '');
    card.className = 'disc-result-card';
    const head = add(card, 'div', '');
    head.className = 'disc-result-head';
    add(head, 'strong', `${x.name} (Wikidata · ${x.external_id})`);
    if (x.description) add(card, 'p', x.description);
    const pills = add(card, 'div', '');
    pills.className = 'disc-profile-pills';
    const evLink = add(pills, 'a', 'Wikidata ↗');
    evLink.className = 'disc-profile-pill';
    evLink.href = x.evidence_url;
    evLink.target = '_blank';
    evLink.rel = 'noopener noreferrer';
    for (const h of x.profiles ?? []) {
      const a = add(pills, 'a', `${h.network} ↗`);
      a.className = 'disc-profile-pill';
      a.href = h.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    attachFastButtons(card, async () => ({
      id: x.candidate_id || null,
      source: 'wikidata',
      external_id: x.external_id,
      evidence: x.evidence_url,
      extraProfiles: x.profiles?.some(pr => pr.network === 'YouTube') ? [] : extraYt
    }));
  }

  for (const x of r.musicbrainz ?? []) {
    const card = add(p, 'div', '');
    card.className = 'disc-result-card';
    const head = add(card, 'div', '');
    head.className = 'disc-result-head';
    add(head, 'strong', `${x.name} (MusicBrainz)`);
    if (x.description) add(card, 'p', x.description);
    const pills = add(card, 'div', '');
    pills.className = 'disc-profile-pills';
    const evLink = add(pills, 'a', 'MusicBrainz ↗');
    evLink.className = 'disc-profile-pill';
    evLink.href = x.evidence_url;
    evLink.target = '_blank';
    evLink.rel = 'noopener noreferrer';
    for (const h of x.profiles ?? []) {
      const a = add(pills, 'a', `${h.network} ↗`);
      a.className = 'disc-profile-pill';
      a.href = h.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    attachFastButtons(card, async () => ({
      id: x.candidate_id || null,
      source: 'musicbrainz',
      external_id: x.external_id,
      evidence: x.evidence_url,
      extraProfiles: x.profiles?.some(pr => pr.network === 'YouTube') ? [] : extraYt
    }));
  }

  for (const x of r.candidates ?? []) {
    const card = add(p, 'div', '');
    card.className = 'disc-result-card';
    const head = add(card, 'div', '');
    head.className = 'disc-result-head';
    add(head, 'strong', `${x.name} (Candidato na fila · ${x.status})`);
    attachFastButtons(card, async () => ({ id: x.id, extraProfiles: extraYt }));
  }

  if (!r.external?.length && !r.musicbrainz?.length && !r.candidates?.length) {
    add(p, 'p', 'Nenhum candidato localizado nesta busca.');
  }
}

const bulkButton = add($('search-form'), 'button', 'Prospectar 5 artistas');
bulkButton.type = 'button';
bulkButton.onclick = () => run(() => api('youtube-bulk', {}));

refresh().catch(e => status(e.message));
