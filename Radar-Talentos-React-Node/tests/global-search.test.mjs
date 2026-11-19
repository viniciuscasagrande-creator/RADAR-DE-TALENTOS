import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {openDiscovery,detail} from '../server/src/discovery/engine.mjs';import {globalSearch,saveWikidata,importMusicBrainz} from '../server/src/discovery/global-search.mjs';
const claim=v=>({rank:'normal',mainsnak:{snaktype:'value',datavalue:{value:v}}});const entity={id:'Q123',labels:{pt:{value:'Artista Teste'}},descriptions:{pt:{value:'cantora'}},claims:{P31:[claim({id:'Q5'})],P106:[claim({id:'Q177220'})],P2003:[claim('artistateste'),claim('bad/path')],P7085:[claim('artistateste')],P1902:[claim('a'.repeat(22))],P2397:[claim('UC'+'x'.repeat(22))]}};const fetcher=async u=>{assert.equal(u.hostname,'www.wikidata.org');return {ok:true,json:async()=>u.searchParams.get('action')==='wbsearchentities'?{search:[{id:'Q123'},{id:'Q456'}]}:{entities:{Q123:entity,Q456:{id:'Q456',labels:{pt:{value:'Lugar'}},claims:{P31:[claim({id:'Q515'})]}}}}}};
test('Busca global consulta PT/EN, deduplica QID, não grava resultados nem associa identidades',async()=>{const db=openDiscovery(':memory:');try{const r=await globalSearch(db,null,'Artista Teste',{fetcher});assert.equal(r.external.length,1);assert.equal(r.external[0].profiles.length,4);assert.equal(r.external[0].state,'pending_identity');assert.equal(db.prepare('SELECT count(*) n FROM candidates').get().n,0);}finally{db.close()}});
test('Salvar candidato usa fonte e ID reais da resposta, sem métricas e sem duplicidade',async()=>{const db=openDiscovery(':memory:');try{const a=await saveWikidata(db,'Q123',{fetcher});const b=await saveWikidata(db,'Q123',{fetcher});assert.equal(a.id,b.id);assert.equal(a.status,'pending');assert.equal(a.profiles.length,4);assert.equal(a.observations.length,0);assert.equal(a.evidence[0].url,'https://www.wikidata.org/wiki/Q123');assert.equal(db.prepare('SELECT history_allowed FROM sources').get().history_allowed,0);await assert.rejects(saveWikidata(db,'https://evil.test',{fetcher}));}finally{db.close()}});
test('Busca local ignora acento e mantém homônimos; falha externa não apaga resultados',async()=>{const db=openDiscovery(':memory:'),radar=new DatabaseSync(':memory:');try{radar.exec("CREATE TABLE talents(id TEXT,name TEXT,blocked INTEGER); INSERT INTO talents VALUES('a','João Silva',0),('b','João Silva',0),('c','João Silva',1)");const r=await globalSearch(db,radar,'joao silva',{fetcher:async()=>{throw Error('offline')}});assert.equal(r.registered.length,2);assert.equal(r.sources.wikidata,'unavailable');assert.equal(r.coverage,'partial');}finally{db.close();radar.close()}});
test('Importa catálogo local CC0 em streaming, filtra país e não inventa métricas',async()=>{const db=openDiscovery(':memory:');try{const rows=[{id:'00000000-0000-0000-0000-000000000001',name:'Música Teste',country:'BR',tags:[{name:'ignore'}]},{id:'00000000-0000-0000-0000-000000000002',name:'Outro',country:'US'}].map(JSON.stringify);rows.push('invalid');let r=await importMusicBrainz(db,rows);assert.equal(r.created,1);assert.equal(r.skipped,1);r=await importMusicBrainz(db,rows);assert.equal(r.created,0);const s=await globalSearch(db,null,'musica teste',{fetcher});assert.equal(s.candidates.length,1);assert.equal(s.sources.musicbrainz,'local_index');assert.equal(detail(db,s.candidates[0].id).observations.length,0);}finally{db.close()}});
test('Fonte desativada não é reativada automaticamente',async()=>{const db=openDiscovery(':memory:');try{await saveWikidata(db,'Q123',{fetcher});db.exec("UPDATE sources SET enabled=0 WHERE id='wikidata-cc0'");const r=await globalSearch(db,null,'teste',{fetcher:()=>{throw Error('não chamar')}});assert.equal(r.sources.wikidata,'disabled');await assert.rejects(saveWikidata(db,'Q123',{fetcher}),/desabilitada/);}finally{db.close()}});
test('Rejeita pesquisa vazia e IDs de outros tipos',async()=>{const db=openDiscovery(':memory:');try{await assert.rejects(globalSearch(db,null,' ',{fetcher}));await assert.rejects(saveWikidata(db,'Q456',{fetcher}),/não elegível/);}finally{db.close()}});

test('Rotas globais administrativas: autenticação, origem e busca/salvamento',async()=>{const {handleDiscovery}=await import('../server/src/discovery/http.mjs');const {createServer}=await import('node:http');const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'radar-global-'));const oldPath=process.env.DISCOVERY_DB,originalFetch=globalThis.fetch;process.env.DISCOVERY_DB=join(dir,'discovery.sqlite');globalThis.fetch=fetcher;const security={username:'admin',password:'fixture-long-password-123456'};const srv=createServer((req,res)=>handleDiscovery(req,res,{security}));await new Promise(r=>srv.listen(0,'127.0.0.1',r));try{const origin='http://127.0.0.1:'+srv.address().port;const url=origin+'/api/discovery/';const auth='Basic '+Buffer.from('admin:'+security.password).toString('base64');const post=(path,body,headers={})=>originalFetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});assert.equal((await post('global-search',{query:'Artista'})).status,401);assert.equal((await post('global-search',{query:'Artista'},{Authorization:auth})).status,403);const headers={Authorization:auth,Origin:origin,'X-Radar-Action':'discovery'};let response=await post('global-search',{query:'Artista'},headers);assert.equal(response.status,200);assert.equal((await response.json()).external[0].external_id,'Q123');response=await post('global-save',{id:'Q123'},headers);assert.equal(response.status,200);assert.equal((await response.json()).status,'pending');}finally{globalThis.fetch=originalFetch;if(oldPath===undefined)delete process.env.DISCOVERY_DB;else process.env.DISCOVERY_DB=oldPath;await new Promise(r=>srv.close(r));rmSync(dir,{recursive:true,force:true});}});

test('Estratégia gratuita sem contas de desenvolvedor (IG/Spotify/TikTok): MusicBrainz WS/2, Brave Search, Validação Cruzada, Publicação só de identidade e Importação CSV (Nacional + Regional)',async()=>{
 const {openDatabase}=await import('../server/src/database/index.mjs');
 const {review,publishIdentityOnly,recordAuthorizedObservation,publish}=await import('../server/src/discovery/engine.mjs');
 const {saveMusicBrainz,searchBraveProfiles,crossValidateIdentity,FREE_MOTOR_CAPABILITIES}=await import('../server/src/discovery/global-search.mjs');
 const {importNationalCsv,importRegionalCsv}=await import('../server/src/discovery/csv-import.mjs');
 const {importCommercial,commercialQuery}=await import('../server/src/commercial.mjs');
 const {commercialInsights}=await import('../server/src/commercial-insights.mjs');

 const db=openDiscovery(':memory:');
 const radar=openDatabase(':memory:');
 try{
  radar.exec("INSERT INTO municipalities(code,name,uf,region,lat,lon,source,version) VALUES('4204608','Criciúma','SC','Sul',-28.67,-49.36,'Base Nacional','2026'),('3550308','São Paulo','SP','Sudeste',-23.55,-46.63,'Base Nacional','2026')");

  // 1. Matriz de capacidades sem contas de desenvolvedor
  assert.equal(FREE_MOTOR_CAPABILITIES.Instagram.locate_profile,true);
  assert.equal(FREE_MOTOR_CAPABILITIES.Spotify.locate_profile,true);
  assert.equal(FREE_MOTOR_CAPABILITIES.TikTok.locate_profile,true);
  assert.match(FREE_MOTOR_CAPABILITIES.Instagram.municipal_audience,/Não/);

  // 2. MusicBrainz API lookup com relações de URL e site oficial
  const mbid='11111111-2222-3333-4444-555555555555';
  const mbFetcher=async u=>{
   if(u.hostname==='musicbrainz.org'){
    return {ok:true,json:async()=>({
     id:mbid,
     name:'Artista Teste',
     type:'Person',
     country:'BR',
     relations:[
      {type:'social network',url:{resource:'https://www.instagram.com/artistateste'}},
      {type:'streaming',url:{resource:'https://open.spotify.com/artist/'+'a'.repeat(22)}},
      {type:'official homepage',url:{resource:'https://artistateste.com.br'}}
     ]
    })};
   }
   if(u.hostname==='api.search.brave.com'){
    return {ok:true,json:async()=>({
     web:{results:[
      {title:'Artista Teste (@artistateste) • Instagram',url:'https://www.instagram.com/artistateste',description:'Perfil oficial'},
      {title:'Artista Teste no TikTok',url:'https://www.tiktok.com/@artistateste',description:'Vídeos oficiais'},
      {title:'Site Oficial Artista Teste',url:'https://artistateste.com.br',description:'Agenda de shows'}
     ]}
    })};
   }
   return fetcher(u);
  };

  // 3. Brave Search + Validação Cruzada (Wikidata + MusicBrainz + Brave Search)
  const braveRes=await searchBraveProfiles('Artista Teste',{key:'brave-free-key',fetcher:mbFetcher});
  assert.equal(braveRes.status,'ok');
  assert.equal(braveRes.profiles.length,2);

  const savedMb=await saveMusicBrainz(db,mbid,{fetcher:mbFetcher});
  assert.equal(savedMb.name,'Artista Teste');
  assert.equal(savedMb.profiles.length,2);
  assert.equal(savedMb.observations.length,0);

  const cross=crossValidateIdentity({
   name:'Artista Teste',
   wikidata:[{profiles:[{network:'Instagram',url:'https://instagram.com/artistateste'},{network:'YouTube',url:'https://youtube.com/channel/UC'+'x'.repeat(22)}]}],
   musicbrainz:[savedMb],
   braveProfiles:braveRes.profiles
  });
  assert.ok(cross.crossValidatedCount>=1);
  const igCross=cross.profiles.find(p=>p.network==='Instagram');
  assert.equal(igCross.verified_cross_source,true);
  assert.equal(igCross.confidence,'high_cross_validated');

  // 4. Publicação de identidade homologada SEM inventar métricas (informa limitação em metric_current)
  review(db,savedMb.id,{approve:true,reviewer:'admin',evidence:'https://artistateste.com.br',radarId:'t-artista-teste'});
  radar.exec("INSERT INTO talents(id,name,entity_type,blocked) VALUES('t-artista-teste','Artista Teste','person',0)");
  const pubIdOnly=publishIdentityOnly(db,radar,savedMb.id);
  assert.equal(pubIdOnly.mode,'identity_only');
  assert.equal(pubIdOnly.inserted,0);
  const pendingRows=radar.prepare("SELECT network,value,status,status_detail FROM metric_current WHERE talent_id='t-artista-teste'").all();
  assert.equal(pendingRows.length,2);
  assert.ok(pendingRows.every(r=>r.value===null&&r.status==='pending_source'));

  // 5. Registro de observação pública autorizada / relatório do artista no candidato e publicação com métrica
  const obs=recordAuthorizedObservation(db,savedMb.id,{
   network:'Instagram',
   url:'https://instagram.com/artistateste',
   metric:'followers',
   value:145000,
   observed_at:'2026-10-15T12:00:00Z',
   evidence_url:'https://artistateste.com.br/midia-kit',
   authorization_ref:'Mídia Kit Oficial do Artista'
  });
  assert.equal(obs.value,145000);
  const pubWithMetrics=publish(db,radar,savedMb.id,importCommercial);
  assert.equal(pubWithMetrics.inserted,1);

  // 6. Importação complementar de CSV (Nacional com métrica e com perfil pendente sem inventar número)
  const nationalCsv=[
   'id,name,network,url,metric,value,observed_on,source,category,modality',
   't-artista-teste,Artista Teste,Instagram,https://www.instagram.com/artistateste,followers,160000,2026-11-15,Mídia Kit Oficial,Cantores,shows',
   't-artista-teste,Artista Teste,Spotify,https://open.spotify.com/artist/'+'a'.repeat(22)+',monthly_listeners,320000,2026-11-15,Spotify for Artists CSV,Cantores,shows',
   't-artista-teste,Artista Teste,TikTok,https://www.tiktok.com/@artistateste,followers,pendente,2026-11-15,Observação manual,Cantores,shows'
  ].join('\n');
  const csvNatRes=importNationalCsv(radar,nationalCsv,{default_day:'2026-11-15'});
  assert.equal(csvNatRes.snapshotsImported,2);
  assert.equal(csvNatRes.pendingProfilesLinked,1);

  // Verifica que TikTok ficou pendente (value === null) e não inventou zero!
  const tkCur=radar.prepare("SELECT value,status,status_detail FROM metric_current WHERE talent_id='t-artista-teste' AND network='TikTok'").get();
  assert.equal(tkCur.value,null);
  assert.equal(tkCur.status,'pending_auth');

  // 7. Importação complementar de CSV Regional (audiência por município fornecida pelo artista)
  const regionalCsv=[
   'talent_id,network,metric,cidade,uf,value,period_start,period_end,source,quality',
   't-artista-teste,Spotify,listeners,Criciúma,SC,18500,2026-10-16,2026-11-15,Spotify for Artists,verified',
   't-artista-teste,Spotify,listeners,São Paulo,SP,92000,2026-10-16,2026-11-15,Spotify for Artists,verified'
  ].join('\n');
  const csvRegRes=importRegionalCsv(radar,regionalCsv);
  assert.equal(csvRegRes.reportsImported,1);
  assert.equal(csvRegRes.totalMunicipalities,2);

  // 8. Alimentação dos dashboards (Oportunidades e Insights refletem os dados reais e sinalizam TikTok como pendente)
  const comm=commercialQuery(radar,new URLSearchParams({network:'all',days:'30',end:'2026-11-15',talent:'t-artista-teste'}));
  assert.equal(comm.items.length,1);
  assert.equal(comm.items[0].networks.Instagram.value,160000);
  assert.equal(comm.items[0].networks.Spotify.value,320000);
  assert.equal(comm.items[0].networks.TikTok,null);

  const ins=commercialInsights(radar,new URLSearchParams({scope:'artist',talent:'t-artista-teste',days:'30',end:'2026-11-15'}));
  const tkInsight=ins.national.find(n=>n.network==='TikTok');
  assert.equal(tkInsight.item,null);
  assert.equal(tkInsight.currentStatus.status,'pending_auth');
  const spReg=ins.regional.find(r=>r.network==='Spotify');
  assert.equal(spReg.total,110500);
 }finally{
  db.close();
  radar.close();
 }
});
