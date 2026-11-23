import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const source=readFileSync(new URL('../dashboard/audience-dashboard.js',import.meta.url),'utf8');
const from=source.indexOf('function useArtistMapAutoMode(){');
const to=source.indexOf("$('artist-quick-btn')?.addEventListener",from);
assert.ok(from>=0&&to>from,'A busca automatica precisa existir no arquivo');
const searchImplementation=source.slice(from,to);

class MockOption {
 constructor(textContent,value) {this.textContent=textContent;this.value=String(value);}
}
function createHarness({options=[],q='Ana Castela',apiItems=[]}={}){
 const talent={options:[new MockOption('Todos com dados',''),...options],value:'',add(option,index){this.options.splice(index===undefined?this.options.length:index,0,option)}};
 const report={options:[new MockOption('Relatorio 2026','0')],value:'0',add(option,index){this.options.splice(index===undefined?this.options.length:index,0,option)}};
 const input={value:q};
 const message={textContent:''};
 let searches=0,requests=0;
 const context={
  field:key=>key==='talent'?talent:report,
  $:key=>key==='artist-quick-search'?input:message,
  normalize:s=>String(s??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim(),
  get:async path=>{requests++;assert.match(path,/^\/api\/radar\/cross-summary\?/);return {items:apiItems}},
  search:()=>searches++,
  Option:MockOption,
  URLSearchParams
 };
 const sandbox=createContext(context);
 new Script(searchImplementation+'\nthis.runSearch = applyQuickArtistSearch;').runInContext(sandbox);
 return {run:sandbox.runSearch,talent,report,input,message,stats:()=>({searches,requests})};
}

test('A busca pelo artista funciona mesmo sem relatorio selecionado',async()=>{
 const h=createHarness({apiItems:[{id:'t-ana-castela',name:'Ana Castela'}]});
 await h.run();
 assert.equal(h.talent.value,'t-ana-castela');
 assert.equal(h.report.value,'');
 assert.equal(h.input.value,'Ana Castela');
 assert.deepEqual(h.stats(),{searches:1,requests:1});
});

test('Artista ja cadastrado usa busca automatica sem outra requisicao',async()=>{
 const h=createHarness({options:[new MockOption('Ana Castela','t-ana-castela')]});
 await h.run();
 assert.equal(h.talent.value,'t-ana-castela');
 assert.equal(h.report.value,'');
 assert.deepEqual(h.stats(),{searches:1,requests:0});
});

test('Artista desconhecido nao cria pontos nem inicia busca com dados falsos',async()=>{
 const h=createHarness({q:'Nome sem cadastro',apiItems:[]});
 await h.run();
 assert.equal(h.talent.value,'');
 assert.equal(h.stats().searches,0);
 assert.match(h.message.textContent,/não encontrado/);
});

test('Mapa automatico seleciona somente relatorios verificados do artista',()=>{
 assert.match(source,/rep\.quality==='verified'/);
 assert.match(source,/e\.latest_end===rep\.period_end/);
 assert.match(source,/quality:rep\.quality,talent:selectedArtist\.id/);
 assert.match(source,/map\(artistMap\|\|\{byState:\[\],places:\[\]\}\)/);
 assert.match(source,/fill:value==null\?'#71717a':'#eab308'/);
});
