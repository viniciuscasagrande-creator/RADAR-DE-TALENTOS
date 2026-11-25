import {createHash} from 'node:crypto';
import {FilterError,distanceKm} from './radar.mjs';
const fail=m=>{throw new FilterError(m)};
const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const norm=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const required=(s,k)=>{if(typeof s!=='string'||!s.trim()||s.length>2000)fail('Campo inválido: '+k);return s.trim()};
const rules=[['corridas',/\b(corrida de rua|corrida infantil|corrida (?:de )?\d+ ?km|maratona|trail run|meia maratona)\b/],['humor',/\b(stand up|standup|show de humor)\b/],['infantil',/\b(infantil|espetaculo infantil)\b/],['teatro',/\b(teatro|peca teatral|musical|ballet)\b/],['palestras',/\b(palestra|congresso|workshop|imersao|curso)\b/],['gastronomia',/\b(gastronomia|gastronomico|degustacao)\b/],['feiras',/\b(feira|exposicao|expo)\b/],['esportes',/\b(triatlo|ciclismo|futebol|jiu jitsu)\b/],['festivais',/\b(festival|festa)\b/],['shows',/\b(show|concerto|sertanejo|pagode|rock)\b/],['experiencias',/\b(experiencia|turismo)\b/]];
export function classifyEvent(title){const text=norm(title);if(/\b(stand up|standup|show de humor)\b/.test(text))return 'humor';if(/\b(corrida de rua|corrida infantil|corrida (?:de )?\d+ ?km|maratona|trail run)\b/.test(text))return 'corridas';const matches=rules.filter(([,r])=>r.test(text));return matches.length===1?matches[0][0]:'outros'}
// Infer only one explicitly identifiable subcategory; multi-distance races, mixed genres
// and ambiguous titles stay unclassified rather than counting as one arbitrary segment.
const subRules={
 shows:[['Sertanejo',/\bsertanejo\b/],['Rock',/\brock\b/],['Pagode',/\bpagode\b/],['Samba',/\bsamba\b/],['MPB',/\bmpb\b/],['Gospel',/\bgospel\b/],['Forró',/\bforro\b/],['Pop',/\bpop\b/],['Funk',/\bfunk\b/]],
 humor:[['Stand-up',/\b(stand up|standup)\b/],['Improvisação',/\bimprovisacao\b/],['Shows humorísticos',/\bshow de humor\b/]],
 teatro:[['Musical',/\bmusical\b/],['Ballet',/\b(ballet|bale)\b/],['Ópera',/\bopera\b/],['Drama',/\bdrama\b/]],
 corridas:[['5 km',/\b5 ?km\b/],['10 km',/\b10 ?km\b/],['Meia maratona',/\b(meia maratona|21 ?km)\b/],['Maratona',/\b(maratona|42 ?km)\b/],['Trail run',/\btrail run\b/],['Corrida infantil',/\bcorrida infantil\b/]],
 esportes:[['Ciclismo',/\bciclismo\b/],['Triatlo',/\btriatlo\b/],['Lutas',/\b(jiu jitsu|boxe|lutas)\b/],['Futebol',/\bfutebol\b/]],
 palestras:[['Liderança',/\blideranca\b/],['Vendas',/\bvendas\b/],['Finanças',/\b(financas|investimentos)\b/],['Saúde',/\bsaude\b/],['Tecnologia',/\btecnologia\b/]],
 gastronomia:[['Cerveja',/\bcerveja\b/],['Vinho',/\bvinho\b/],['Degustações',/\bdegustacao\b/]],
 feiras:[['Tecnologia',/\btecnologia\b/],['Geek',/\bgeek\b/],['Automóveis',/\b(automoveis|carros)\b/]]
};
export function classifySubmodality(db,title,modality){
 const text=norm(title),matches=(subRules[modality]??[]).filter(([name,re])=>re.test(name==='Maratona'?text.replace(/\bmeia maratona\b/g,''):text));
 if(matches.length!==1)return null;return db.prepare('SELECT id FROM submodalities WHERE modality_id=? AND name=?').get(modality,matches[0][0])?.id??null;
}
function writeArtists(db,platform,external,artists,source,origin){
 if(!Array.isArray(artists)||artists.length>100)fail('Lista de atrações inválida');
 db.prepare('DELETE FROM event_listing_artists WHERE platform_id=? AND external_id=? AND origin=?').run(platform,external,origin);
 const insert=db.prepare('INSERT OR IGNORE INTO event_listing_artists VALUES(?,?,?,?,?,?,?)');for(const a of artists){const name=required(typeof a==='string'?a:a?.name,'artist'),key=norm(name);if(!key)fail('Nome de atração inválido');insert.run(platform,external,key,name,origin,source,typeof a?.id==='string'?required(a.id,'artist_id'):null);}
}
export function reviewArtists(db,{source,items}){source=required(source,'source');if(!Array.isArray(items)||items.length>50000)fail('Lista inválida');db.exec('BEGIN IMMEDIATE');try{for(const a of items){if(!db.prepare('SELECT 1 FROM event_listings WHERE platform_id=? AND external_id=?').get(a.platform??'',a.external_id??''))fail('Anúncio não localizado');writeArtists(db,a.platform,a.external_id,a.artists,source,'reviewed');}db.exec('COMMIT');return items.length;}catch(e){db.exec('ROLLBACK');throw e;}}
export function importEvents(db,{platform,observed_on,source,items},onCommit=null,{tolerateConflicts=false,acceptChanges=false}={}){
 if(!db.prepare('SELECT 1 FROM ticket_platforms WHERE id=?').get(platform??''))fail('Plataforma inválida'); if(!date(observed_on)||!Array.isArray(items))fail('Importação inválida');source=required(source,'source');
 const accepted=[];let conflicts=0;db.exec('BEGIN IMMEDIATE');try{for(const raw of items){const title=required(raw.title,'title'),venue=required(raw.venue,'venue'),external=required(raw.external_id,'external_id'),url=required(raw.url,'url');let u;try{u=new URL(url)}catch{fail('URL inválida')}if(u.protocol!=='https:'||u.username||u.password)fail('URL inválida');if(!date(raw.event_date)||raw.published_on!=null&&(!date(raw.published_on)||raw.published_on>observed_on))fail('Datas inválidas');
 let inputCity=raw.municipality_code;if(!inputCity&&typeof raw.city==='string'&&typeof raw.uf==='string'){const matches=db.prepare('SELECT code,name FROM municipalities WHERE uf=?').all(raw.uf.toUpperCase().trim()).filter(m=>norm(m.name)===norm(raw.city));if(matches.length===1)inputCity=matches[0].code;}const city=required(inputCity,'municipality_code ou cidade/UF');if(!db.prepare('SELECT 1 FROM municipalities WHERE code=?').get(city))fail('Município desconhecido: '+city);
 const modality=raw.modality_id??classifyEvent(title);const classification=raw.modality_id?'provided':modality==='outros'?'unknown':'rule';const sub=raw.submodality_id===undefined?classifySubmodality(db,title,modality):raw.submodality_id;
 const id=createHash('sha256').update(JSON.stringify([norm(title),city,norm(venue),raw.event_date])).digest('hex');
 const old=db.prepare('SELECT * FROM event_listings WHERE platform_id=? AND external_id=?').get(platform,external);if(old&&old.event_id!==id&&!(acceptChanges&&observed_on>=old.last_seen)){if(!tolerateConflicts)fail('Identidade alterada: revisar '+external+' antes de importar');db.prepare('INSERT INTO event_listing_conflicts VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(platform_id,external_id,proposed_id) DO UPDATE SET observed_on=max(observed_on,excluded.observed_on)').run(platform,external,id,observed_on,title,city,venue,raw.event_date);conflicts++;continue;}
 db.prepare('DELETE FROM event_listing_conflicts WHERE platform_id=? AND external_id=?').run(platform,external);accepted.push(external);
 db.prepare(`INSERT INTO events VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET modality_id=excluded.modality_id,submodality_id=excluded.submodality_id,classification=excluded.classification WHERE excluded.classification='provided' AND events.classification!='provided'`).run(id,title,city,venue,raw.event_date,modality,sub,classification);
 db.prepare(`INSERT INTO event_listings VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(platform_id,external_id) DO UPDATE SET event_id=excluded.event_id,first_seen=min(first_seen,excluded.first_seen),last_seen=max(last_seen,excluded.last_seen),published_on=coalesce(event_listings.published_on,excluded.published_on),status=CASE WHEN excluded.last_seen>=last_seen THEN excluded.status ELSE status END,url=CASE WHEN excluded.last_seen>=last_seen THEN excluded.url ELSE url END`).run(platform,external,id,url,observed_on,observed_on,raw.published_on??null,raw.status??'listed');
 if(old&&old.event_id!==id)db.prepare('INSERT INTO event_listing_revisions(platform_id,external_id,old_event_id,new_event_id,observed_on,source_ref) VALUES(?,?,?,?,?,?)').run(platform,external,old.event_id,id,observed_on,source);
 if(raw.artists!==undefined&&(!old||observed_on>=old.last_seen))writeArtists(db,platform,external,raw.artists,source,'source');

 }db.prepare('INSERT INTO event_imports(platform_id,observed_on,records,source) VALUES (?,?,?,?)').run(platform,observed_on,accepted.length,source);onCommit?.(accepted.length,{accepted,conflicts});db.exec('COMMIT');return accepted.length;}catch(e){db.exec('ROLLBACK');throw e;}
}
export function eventQuery(db,path,p){
 if(path==='/api/events/municipalities'){const q=(p.get('q')??'').trim().slice(0,100),uf=p.get('uf')??'';return db.prepare("SELECT code,name,uf FROM municipalities WHERE (?='' OR uf=?) ORDER BY name").all(uf,uf).filter(m=>!q||norm(m.name).includes(norm(q))||m.code===q).slice(0,100);}
 if(path==='/api/events/conflicts')return db.prepare('SELECT platform_id,external_id,proposed_title,municipality_code,venue,event_date,observed_on FROM event_listing_conflicts ORDER BY observed_on DESC LIMIT 100').all();
 if(path==='/api/events/platforms')return db.prepare(`SELECT p.*,max(i.observed_on) last_import,count(i.id) imports,sum(CASE WHEN i.source LIKE 'Amostra manual de anúncios públicos%' THEN i.records ELSE 0 END) manual_records FROM ticket_platforms p LEFT JOIN event_imports i ON i.platform_id=p.id GROUP BY p.id ORDER BY p.name`).all();
 if(!['/api/events/trends','/api/events/artists'].includes(path))return undefined;
 const get=k=>p.get(k)||'',offset=get('offset')?Number(get('offset')):0,status=get('status'),start=get('start'),end=get('end'),basis=get('basis')||'first_seen',platform=get('platform'),mod=get('modality'),sub=get('submodality'),region=get('region'),uf=get('uf'),city=get('city'),center=get('center'),radius=get('radius');
 if(!Number.isSafeInteger(offset)||offset<0||offset>1e7||status&&!['active','cancelled','all'].includes(status))fail('Paginação ou situação inválida');
 if(!date(start)||!date(end)||start>end||!['first_seen','published_on','event_date'].includes(basis))fail('Período ou base temporal inválidos');
 if(region&&!['Norte','Nordeste','Centro-Oeste','Sudeste','Sul'].includes(region))fail('Região inválida');if(uf&&!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(uf))fail('UF inválida');
 if(platform&&!db.prepare('SELECT 1 FROM ticket_platforms WHERE id=?').get(platform))fail('Plataforma inválida');if(mod&&!db.prepare('SELECT 1 FROM modalities WHERE id=?').get(mod))fail('Modalidade inválida');if(sub&&!db.prepare('SELECT 1 FROM submodalities WHERE id=? AND (?=\'\' OR modality_id=?)').get(sub,mod,mod))fail('Submodalidade inválida');
 const lookup=c=>db.prepare('SELECT * FROM municipalities WHERE code=?').get(c);if(city&&!lookup(city))fail('Município inválido');const origin=center?lookup(center):null;if((center||radius)&&(!origin||origin.lat==null||radius===''||!Number.isFinite(+radius)||+radius<0||+radius>10000))fail('Raio inválido');
 const rows=db.prepare(`SELECT e.*,m.name city_name,m.uf,m.region,m.lat,m.lon,mo.name modality_name,s.name submodality_name,min(l.first_seen) first_seen,min(l.published_on) published_on,count(*) listings,sum(CASE WHEN l.status='cancelled' THEN 1 ELSE 0 END) cancelled FROM events e JOIN municipalities m ON m.code=e.municipality_code JOIN modalities mo ON mo.id=e.modality_id LEFT JOIN submodalities s ON s.id=e.submodality_id JOIN event_listings l ON l.event_id=e.id WHERE (?='' OR l.platform_id=?) GROUP BY e.id`).all(platform,platform).filter(r=>(!mod||r.modality_id===mod)&&(!sub||String(r.submodality_id)===sub)&&(!region||r.region===region)&&(!uf||r.uf===uf)&&(!city||r.municipality_code===city)&&(!status||status==='all'||(status==='cancelled'?r.cancelled===r.listings:r.cancelled<r.listings)));
 let excludedCoordinates=0;const scoped=rows.filter(r=>{if(!origin)return true;if(r.lat==null){excludedCoordinates++;return false}return distanceKm(origin,r)<=+radius});
 const artistFilter=norm((p.get('artist')??'').slice(0,200));const artistEvents=artistFilter?new Set(db.prepare(`SELECT l.event_id,a.artist_key FROM event_listing_artists a JOIN event_listings l ON l.platform_id=a.platform_id AND l.external_id=a.external_id WHERE (?='' OR l.platform_id=?)`).all(platform,platform).filter(a=>a.artist_key.includes(artistFilter)).map(a=>a.event_id)):null;const matchArtist=r=>!artistEvents||artistEvents.has(r.id);
 const selected=scoped.filter(r=>matchArtist(r)&&r[basis]&&r[basis]>=start&&r[basis]<=end);const days=(Date.parse(end)-Date.parse(start))/86400000+1;const shift=(s,n)=>new Date(Date.parse(s)+n*86400000).toISOString().slice(0,10);const previous=scoped.filter(r=>matchArtist(r)&&r[basis]&&r[basis]>=shift(start,-days)&&r[basis]<start);
 const agg=(rs,key)=>{const m=new Map();for(const r of rs){const n=key(r);m.set(n,(m.get(n)||0)+1)}return [...m].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name))};
 const prior=new Map(agg(previous,r=>r.modality_name).map(r=>[r.name,r.value]));const current=agg(selected,r=>r.modality_name);for(const name of prior.keys())if(!current.some(r=>r.name===name))current.push({name,value:0});const ranking=current.map(r=>({...r,previous:prior.get(r.name)??0,growth_pct:prior.get(r.name)?(r.value/prior.get(r.name)-1)*100:null}));
 const artistMap=new Map(), eventArtists=new Map();const chosen=new Set(selected.map(r=>r.id));
 for(const a of db.prepare(`SELECT a.*,l.event_id,l.url FROM event_listing_artists a JOIN event_listings l ON l.platform_id=a.platform_id AND l.external_id=a.external_id WHERE (?='' OR l.platform_id=?)`).all(platform,platform)){if(!chosen.has(a.event_id))continue;const names=eventArtists.get(a.event_id)??new Map();names.set(a.artist_key,a.name);eventArtists.set(a.event_id,names);const item=artistMap.get(a.artist_key)??{name:a.name,events:new Set(),cities:new Set(),platforms:new Set()};item.events.add(a.event_id);item.platforms.add(a.platform_id);artistMap.set(a.artist_key,item);}
 for(const r of selected)for(const k of (eventArtists.get(r.id)??new Map()).keys())artistMap.get(k).cities.add(r.municipality_code);
 const artists=[...artistMap.entries()].filter(([key])=>!artistFilter||key.includes(artistFilter)).map(([,a])=>a).map(a=>({name:a.name,value:a.events.size,cities:a.cities.size,platforms:a.platforms.size})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name));
 if(path==='/api/events/artists')return {artists,total:selected.length,withArtists:eventArtists.size,notice:'Atrações explicitamente informadas pelas fontes; agrupamento por nome, homônimos não verificados.'};
 const byPlatform=db.prepare('SELECT id platform_id,name FROM ticket_platforms').all().filter(p=>!platform||p.platform_id===platform).map(p=>{const ids=new Set(db.prepare('SELECT event_id FROM event_listings WHERE platform_id=?').all(p.platform_id).map(x=>x.event_id));return {name:p.name,value:selected.filter(r=>ids.has(r.id)).length}}).sort((a,b)=>b.value-a.value);
 const places=agg(selected,r=>r.municipality_code).map(p=>{const r=lookup(p.name);return {...r,value:p.value}});
 const statusBreakdown={active:0,cancelled:0,postponed:0,rescheduled:0,multiPlatformDeduplicated:0};
 const dateConcurrencyMap=new Map(),artistCityRecurrenceMap=new Map(),venueCapacityMap=new Map();
 const knownVenueCapacities=[
  [/allianz parque|morumbis|mineirao|maracana|arena brb|couto pereira/i,45000,'Estádio / Arena (Capacidade comprovada ~45.000)'],
  [/jeunesse arena|farmasi arena|vibra sao paulo|espaco unimed|expotrade|pedreira paulo leminski|classic hall|arena opus/i,8000,'Arena Multiúso / Grande Casa (Capacidade ~8.000)'],
  [/teatro positivo|teatro guaira|audit[oó]rio araujo vianna|vivo rio|qualistage|concha acustica|centro de eventos/i,3000,'Teatro / Centro de Eventos (Capacidade ~3.000)'],
  [/teatro|clube|opera de arame|circo voador|audio|fundicao progresso/i,1500,'Teatro / Casa de Shows (Capacidade ~1.500)']
 ];
 const revEventIds=new Set(db.prepare('SELECT DISTINCT new_event_id FROM event_listing_revisions UNION SELECT DISTINCT old_event_id FROM event_listing_revisions').all().map(x=>x.new_event_id));
 const conflictExtSet=new Set(db.prepare("SELECT platform_id || '|' || external_id AS k FROM event_listing_conflicts").all().map(x=>x.k));
 for(const r of selected){
  if(r.listings>1)statusBreakdown.multiPlatformDeduplicated++;
  const isResched=revEventIds.has(r.id)||/\b(remarcado|nova data)\b/i.test(r.title);
  const isPostp=/\b(adiado)\b/i.test(r.title);
  if(r.cancelled===r.listings)statusBreakdown.cancelled++;
  else if(isResched)statusBreakdown.rescheduled++;
  else if(isPostp)statusBreakdown.postponed++;
  else statusBreakdown.active++;
  const dcKey=`${r.event_date}|${r.city_name}/${r.uf}`;
  const dcEntry=dateConcurrencyMap.get(dcKey)??{date:r.event_date,city:`${r.city_name}/${r.uf}`,eventsCount:0,listingsCount:0,modalities:new Set(),titles:[]};
  dcEntry.eventsCount++;dcEntry.listingsCount+=r.listings;dcEntry.modalities.add(r.modality_name);if(dcEntry.titles.length<4)dcEntry.titles.push(r.title);
  dateConcurrencyMap.set(dcKey,dcEntry);
  const vKey=`${r.venue}|${r.city_name}/${r.uf}`;
  if(!venueCapacityMap.has(vKey)){
   const matchedCap=knownVenueCapacities.find(([re])=>re.test(r.venue));
   venueCapacityMap.set(vKey,{venue:r.venue,city:`${r.city_name}/${r.uf}`,eventsCount:0,verifiedCapacity:matchedCap?matchedCap[1]:null,capacitySource:matchedCap?matchedCap[2]:'Capacidade não informada no anúncio'});
  }
  venueCapacityMap.get(vKey).eventsCount++;
  for(const [aKey,aName] of (eventArtists.get(r.id)??new Map()).entries()){
   const acKey=`${aKey}|${r.municipality_code}`;
   const ac=artistCityRecurrenceMap.get(acKey)??{artist:aName,city:`${r.city_name}/${r.uf}`,eventsCount:0,dates:[]};
   ac.eventsCount++;ac.dates.push(r.event_date);
   artistCityRecurrenceMap.set(acKey,ac);
  }
 }
 const dateConcurrency=[...dateConcurrencyMap.values()].map(d=>({...d,modalities:[...d.modalities].join(', '),sampleTitles:d.titles.join(' · ')})).sort((a,b)=>b.eventsCount-a.eventsCount||a.date.localeCompare(b.date)).slice(0,25);
 const artistCityRecurrence=[...artistCityRecurrenceMap.values()].map(x=>({...x,dates:x.dates.sort().join(', ')})).sort((a,b)=>b.eventsCount-a.eventsCount||a.artist.localeCompare(b.artist)).slice(0,30);
 const venueCapacities=[...venueCapacityMap.values()].sort((a,b)=>(b.verifiedCapacity||0)-(a.verifiedCapacity||0)||b.eventsCount-a.eventsCount).slice(0,30);
 return {offset,pageSize:100,artists,withArtists:eventArtists.size,total:selected.length,listings:selected.reduce((n,r)=>n+r.listings,0),deduplicatedSavings:Math.max(0,selected.reduce((n,r)=>n+r.listings,0)-selected.length),statusBreakdown,dateConcurrency,artistCityRecurrence,venueCapacities,ranking,byPlatform,byModalityRegion:['Norte','Nordeste','Centro-Oeste','Sudeste','Sul'].flatMap(region=>agg(selected.filter(r=>r.region===region),r=>r.modality_name).map(r=>({...r,region}))),subcategories:agg(selected,r=>r.modality_name+' / '+(r.submodality_name??'Não classificado')),byRegion:agg(selected,r=>r.region),byState:agg(selected,r=>r.uf),byCity:agg(selected,r=>r.city_name+' / '+r.uf),monthly:agg(selected,r=>r[basis].slice(0,7)).sort((a,b)=>a.name.localeCompare(b.name)),seasonality:agg(selected,r=>r.event_date.slice(0,7)).sort((a,b)=>a.name.localeCompare(b.name)),places,origin,radius:origin?+radius:null,excludedCoordinates,missingDates:scoped.filter(r=>!r[basis]).length,items:selected.sort((a,b)=>b[basis].localeCompare(a[basis])||a.id.localeCompare(b.id)).slice(offset,offset+100).map(r=>{const matchedCap=knownVenueCapacities.find(([re])=>re.test(r.venue));const isResched=revEventIds.has(r.id)||/\b(remarcado|nova data)\b/i.test(r.title);const isPostp=/\b(adiado)\b/i.test(r.title);const srcs=db.prepare("SELECT platform_id,external_id,url,status FROM event_listings WHERE event_id=? AND (?='' OR platform_id=?)").all(r.id,platform,platform);const hasConflict=srcs.some(s=>conflictExtSet.has(`${s.platform_id}|${s.external_id}`));const lifecycleStatus=r.cancelled===r.listings?'Cancelado':isResched||hasConflict?'Remarcado / Alterado':isPostp?'Adiado':'Ativo';return {...r,lifecycleStatus,verifiedCapacity:matchedCap?matchedCap[1]:null,ticketPriceInfo:'Preços / Lotes sob consulta na ticketeira',artists:[...(eventArtists.get(r.id)??new Map()).values()],sources:srcs}}),notice:'Eventos únicos observados, não vendas. Crescimento depende da cobertura de coleta; primeira detecção não é data oficial de publicação.'};
}
