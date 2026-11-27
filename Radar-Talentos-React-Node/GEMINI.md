# Regras Operacionais — Radar de Talentos

## 1. Regra Fixa: Commit, Push e Deploy Obrigatório na VM `radar-producao`

Sempre que alterações forem validadas e commitadas no Git, execute o ciclo completo até a atualização da VM de produção no Google Cloud:

1. **Validação Local**:
   - Executar `npm run build` e `npm test` (garantir 100% dos testes passando e sintaxe verificada).
2. **Git Commit & Push (`origin/main`)**:
   - Como o diretório `.git` está no nível pai (`../.git`) e o Windows usa `schannel` para HTTPS do GitHub, executar `git add`, `git commit` e `git push origin main` com `BypassSandbox: true`.
3. **Deploy Obrigatório na VM `radar-producao` (Google Cloud)**:
   - **Projeto GCP**: `gen-lang-client-0023634133`
   - **Instância / Zona**: `radar-producao` / `us-central1-a`
   - **Comando Exato de Deploy** (executar com `BypassSandbox: true`, evitando erros de permissão em `/opt/radar` e `dubious ownership` no Git):

```powershell
gcloud compute ssh radar-producao --project=gen-lang-client-0023634133 --zone=us-central1-a --quiet --command="sudo bash -c 'export HOME=/home/develop_diskingressos; git config --global --add safe.directory /home/develop_diskingressos/radar-github-sync; cd /home/develop_diskingressos/radar-github-sync && bash Radar-Talentos-React-Node/scripts/deploy-gcloud.sh deploy && chown -R develop_diskingressos:develop_diskingressos /home/develop_diskingressos/radar-github-sync /home/develop_diskingressos/radar-backups'"
```

## 2. Tela de Login — Camada Temporária Neutra Pré-Inauguração

- Manter ativa a camada neutra pré-inauguração (`#neutral-prelaunch-overlay` em `dashboard/login.html`, `dashboard/login.css` e `dashboard/login.js`) até que o usuário solicite explicitamente sua remoção.
