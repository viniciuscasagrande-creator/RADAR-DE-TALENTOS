#!/usr/bin/env python3
"""Correção P0 do Motor de Dados. Sem migrações, sem alteração de dados."""
from pathlib import Path
import argparse, datetime, shutil, sys

parser=argparse.ArgumentParser()
parser.add_argument('--target',required=True)
parser.add_argument('--check',action='store_true')
parser.add_argument('--restore',help='Caminho do diretório de backup criado pelo instalador')
args=parser.parse_args()
root=Path(args.target).resolve()
paths=['server/src/acquisition.mjs','dashboard/acquisition.js']
if args.restore:
    b=Path(args.restore).resolve()
    for rel in paths:
        src=b/rel
        if not src.is_file(): raise SystemExit('Backup incompleto: '+str(src))
    if not args.check:
        for rel in paths:
            shutil.copy2(b/rel,root/rel)
    print('Reversão '+('verificada' if args.check else 'concluída'))
    sys.exit(0)

# Substituições exatas: se a versão mudou, abortar sem modificar nenhum arquivo.
backend=[
("""   recentLogs=ddb.prepare('SELECT id,job_id,at,status,count,message FROM collection_logs ORDER BY at DESC LIMIT 20').all();""",
"""   recentLogs=ddb.prepare('SELECT id,job_id,at,status,count,message FROM collection_logs ORDER BY at DESC LIMIT 20').all();"""),
(""" const day24h=new Date(Date.now()-86400000).toISOString().slice(0,10);
 const radarRecent24h=count('metric_current',`WHERE value IS NOT NULL AND (collected_at >= '${day24h}' OR observed_on >= '${day24h}')`);
 const radarEvidenceCount=count('media_metric_series',"WHERE evidence_url LIKE 'https://%'");""",
""" const since24h=new Date(Date.now()-86400000).toISOString();
 // Execuções, não snapshots ou registros históricos. Fontes sem logs não são presumidas.
 // Contagem independente no banco Discovery, sem truncamento nos últimos 20 logs.
 let discoveryRunsAll24h=null;
 try {
  const ddb=openDiscovery();
  try {discoveryRunsAll24h=ddb.prepare('SELECT count(*) n FROM collection_logs WHERE at>=?').get(since24h).n;}
  finally {ddb.close();}
 } catch {}
 const radarRuns24h=db.prepare('SELECT count(*) n FROM operation_runs WHERE started_at>=?').get(since24h).n;
 const radarEvidenceCount=count('media_metric_series',"WHERE evidence_url LIKE 'https://%'");
 const evidenceBreakdown={discovery:discoveryCounts.verifiedWithEvidence,radar_series:radarEvidenceCount};
 const completedRuns24h=(discoveryRunsAll24h??0)+radarRuns24h;"""),
("""   connected_sources:connectedSourcesCount,
   collections_24h:Math.max(discoveryCounts.recent24h,radarRecent24h),
   evidence_records:Math.max(discoveryCounts.verifiedWithEvidence,radarEvidenceCount)""",
"""   connected_sources:connectedSourcesCount,
   collections_24h:discoveryRunsAll24h===null?null:completedRuns24h,
   collection_runs_discovery_24h:discoveryRunsAll24h,
   collection_runs_radar_24h:radarRuns24h,
   observations_discovery_24h:discoveryCounts.recent24h,
   evidence_records:null,
   evidence_breakdown:evidenceBreakdown"""),
("""  notice:'Contagens de registros, não certificação de origem. Atrações observadas não são identidades homologadas.'""",
"""  notice:'Execuções e observações são contadas separadamente. Evidência HTTPS registrada não comprova autenticidade. Valores ausentes são indisponíveis, não zero.'""")
]
frontend=[
("""  const evidenceCount=c.evidence_records??totalObs;""",
"""  const evidenceCount=c.evidence_records;
  const evidenceBreakdown=c.evidence_breakdown||{};"""),
("""$('kpi-connected-sources').textContent=fmt(c.connected_sources??3)""",
"""$('kpi-connected-sources').textContent=fmt(c.connected_sources)"""),
("""$('kpi-collections-24h').textContent=fmt(c.collections_24h??ytObs??0)""",
"""$('kpi-collections-24h').textContent=fmt(c.collections_24h)"""),
("""$('kpi-collections-sub').textContent='Execuções comprovadas nas últimas 24h'""",
"""$('kpi-collections-sub').textContent='Execuções registradas em 24h (não número de indicadores)'"""),
("""$('kpi-evidence-records').textContent=fmt(evidenceCount)""",
"""$('kpi-evidence-records').textContent=fmt(evidenceCount)"""),
("""$('kpi-evidence-sub').textContent='Com fonte, data e evidência HTTPS'""",
"""$('kpi-evidence-sub').textContent=`Discovery: ${fmt(evidenceBreakdown.discovery)} · Radar: ${fmt(evidenceBreakdown.radar_series)} referências HTTPS (sem auditoria externa)`"""),
("""$('step-4-detail').textContent=`${fmt(evidenceCount)} com evidência auditável`""",
"""$('step-4-detail').textContent=`${fmt(evidenceBreakdown.discovery)} referências Discovery · ${fmt(evidenceBreakdown.radar_series)} referências Radar; verificar origem`"""),
("""$('step-5-detail').textContent=`4 menus alimentados · ${fmt(c.demographicsMunicipalities??0)} polos IBGE isolados`""",
"""$('step-5-detail').textContent=`Distribuição por menu exige auditoria; ${fmt(c.demographicsMunicipalities)} polos IBGE isolados`"""),
("""  const totalTalents=Math.max(1,Number(c.talents)||0);
  const confirmedRatio=c.talents?Math.min(100,Math.round(((Number(c.confirmedAccounts)||0)/totalTalents)*100)):0;
  const qBadge=$('ac-quality-badge');
  if(qBadge){
    qBadge.textContent=evidenceCount>0
      ?`Procedência verificada · ${fmt(evidenceCount)} dados com evidência (${confirmedRatio}% cobertura de identidade)`
      :`Identidade verificada (${confirmedRatio}%) · Aguardando novas coletas com evidência`;
  }""",
"""  const qBadge=$('ac-quality-badge');
  if(qBadge){
    qBadge.textContent='Qualidade não certificada · referências cadastradas exigem auditoria independente';
  }"""),
("""detail:`${fmt(ytObs)} coletas verificadas (sem duplicar módulos)`""",
"""detail:`${fmt(ytObs)} registros de YouTube (contagem aproximada entre origens)`"""),
("""state:c.commercialAccounts>0?'Cobertura parcial (Verificada)':'Aguardando vínculos'""",
"""state:c.commercialAccounts>0?'Perfis cadastrados; cobertura a verificar':'Aguardando vínculos'"""),
("""detail:`${fmt(c.commercialAccounts??0)} perfis · ${fmt((c.commercialRecords||0)+openObs)} observações com evidência`""",
"""detail:`${fmt(c.commercialAccounts)} contas comerciais · ${fmt(openObs)} observações Discovery (qualidade a auditar)`"""),
("""$('ac-status').textContent=d.syncing?'Coleta em execução. O resultado aparecerá no histórico.':!d.configAvailable?'Banco acessível, mas configuração operacional indisponível.':d.canSync?'Diagnóstico atualizado (8 de 8 etapas ativas). Fontes habilitadas prontas para sincronização.':'Motor de Dados 3.0 ativo (8 de 8 etapas concluídas). Coletas validadas são distribuídas automaticamente para todos os menus.'""",
"""$('ac-status').textContent=d.syncing?'Coleta em execução; acompanhe o histórico.':!d.configAvailable?'Banco acessível, mas configuração operacional indisponível.':d.canSync?'Diagnóstico disponível. Consulte as fontes habilitadas e o histórico abaixo.':'Nenhuma tarefa de fonte configurada está habilitada. O histórico de descoberta pode continuar disponível.'""")
]
all_changes={'server/src/acquisition.mjs':backend,'dashboard/acquisition.js':frontend}
ready={}
for rel,changes in all_changes.items():
    path=root/rel
    if not path.is_file(): raise SystemExit('Arquivo ausente: '+str(path))
    s=path.read_text(encoding='utf-8')
    for old,new in changes:
        if old==new: continue
        if s.count(old)==1:s=s.replace(old,new)
        elif s.count(new)==1:pass # instalação idempotente
        else:raise SystemExit('Versão incompatível; abortado antes de modificar arquivos: '+rel+' / '+old[:65])
    ready[rel]=s
if args.check:
    print('Compatibilidade confirmada. Nenhum arquivo alterado.')
else:
    backup=root/'.radar-backups'/('motor-p0-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f'))
    for rel in paths:
        (backup/rel).parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(root/rel,backup/rel)
    for rel,s in ready.items():
        (root/rel).write_text(s,encoding='utf-8')
    print('Correção aplicada. Backup: '+str(backup))
