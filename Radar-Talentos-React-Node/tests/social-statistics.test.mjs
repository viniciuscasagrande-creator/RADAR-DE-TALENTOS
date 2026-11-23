import test from 'node:test';
import assert from 'node:assert/strict';
import {socialStatistics} from '../server/src/discovery/social-statistics.mjs';
const now='2026-11-23T12:00:00.000Z';
const mk=(observed_at,value,network='Instagram',metric='followers')=>({talent_id:'t-artista',network,metric,value,observed_at,source:'observação pública',evidence_url:'https://example.org/perfil'});
test('7d e 30d de observações reais sem interpolação',()=>{
 const s=socialStatistics([mk('2026-10-24T12:00:00Z',800),mk('2026-11-16T12:00:00Z',900),mk(now,1000)],{now})[0];
 assert.equal(s.current.value,1000);assert.equal(s.change_7d.absolute,100);
 assert.equal(s.change_30d.percent,25);assert.equal(s.change_30d.elapsed_days,30);
});
test('dados insuficientes não geram crescimento',()=>{
 const s=socialStatistics([mk(now,1500,'Spotify','monthly_listeners')],{now})[0];
 assert.equal(s.change_7d,null);assert.equal(s.change_30d,null);
});
test('zero inicial não gera porcentagem artificial',()=>{
 const s=socialStatistics([mk('2026-11-16T12:00:00Z',0),mk(now,500)],{now})[0];
 assert.equal(s.change_7d.percent,null);assert.equal(s.change_7d.absolute,500);
});
test('fonte, evidência e data são obrigatórias; métrica geográfica inventada não entra',()=>{
 const rows=[mk(now,50),{...mk(now,10),metric:'municipal_audience'}, {...mk(now,12),evidence_url:'http://inseguro.test'}];
 assert.equal(socialStatistics(rows,{now}).length,1);
});
test('observação velha permanece identificada como desatualizada',()=>{
 const s=socialStatistics([mk('2026-10-01T12:00:00Z',100)],{now,maxAgeDays:30})[0];
 assert.equal(s.current,null);assert.equal(s.status,'stale');
});
test('observações futuras são recusadas',()=>assert.deepEqual(socialStatistics([mk('2026-12-01T12:00:00Z',100)],{now}),[]));
test('observações conflitantes não são misturadas',()=>assert.throws(()=>socialStatistics([mk(now,100),mk(now,101)],{now}),/divergentes/));
test('Spotify e Instagram não são somados',()=>{
 const a=socialStatistics([mk(now,100,'Spotify','monthly_listeners'),mk(now,200,'Instagram','followers')],{now});
 assert.equal(a.length,2);
});
