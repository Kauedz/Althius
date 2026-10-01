# Worker do Hermes

Liga o Hermes Agent aos Agentes da Althius (CRM-14, motor Hermes, [ADR-0018](../../../docs/adr/0018-motor-dos-agentes-na-edge-function.md)).
O app guarda cada pedido no banco; este worker, rodando ao lado do Hermes, busca a fila (`list_queued_agent_runs`),
reserva cada pedido uma vez só (`claim_agent_run`), entrega ao Hermes (`POST /v1/runs` com `Idempotency-Key`) e grava a
resposta (`append_agent_run_event`, `finish_agent_run`). O Supabase na nuvem não precisa enxergar o seu computador, e o
mesmo worker vai para a VPS depois.

Para o usuário, quem responde é a Althius: o Hermes não diz o nome dele.

## Rodar local (Windows, PowerShell)

1. **Instalar o Hermes** (nativo no Windows; WSL2 também funciona):
   ```powershell
   iex (irm https://hermes-agent.nousresearch.com/install.ps1)
   ```
2. **Escolher o modelo.** Rode `hermes model`. Para o Groq, o `~/.hermes/config.yaml` fica assim (e `GROQ_API_KEY`
   vai no `~/.hermes/.env`, digitada só aí):
   ```yaml
   providers:
     groq:
       api: https://api.groq.com/openai/v1
       key_env: GROQ_API_KEY
   model:
     default: qwen/qwen3.8-27b
     provider: custom:groq
   ```
3. **Desligar o que não pode rodar** num teste com dados de clientes: terminal, arquivos, execução de código,
   navegador e controle do computador. No `~/.hermes/config.yaml`:
   ```yaml
   agent:
     disabled_toolsets: [terminal, file, code_execution, browser, computer_use, cronjob]
   ```
4. **Ligar o servidor de API do Hermes.** No `~/.hermes/.env`, com uma chave forte que você inventa:
   ```
   API_SERVER_ENABLED=true
   API_SERVER_KEY=uma-chave-longa-que-so-voce-sabe
   ```
   Depois, num PowerShell que fica aberto: `hermes gateway`. Ele mostra `API server listening on http://127.0.0.1:8642`.
5. **Configurar o worker.** Copie `.env.example` para `.env` nesta pasta e preencha: a `SUPABASE_SERVICE_ROLE_KEY`
   (Supabase → Project Settings → API) e a `HERMES_API_KEY` (a mesma do passo 4). O `.env` não vai para o Git.
6. **Ligar o worker**, noutro PowerShell, na raiz do repositório:
   ```powershell
   npx -y deno@2 run --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=supabase/functions/_hermes-worker/.env supabase/functions/_hermes-worker/main.ts
   ```
   Ele diz "Hermes de pé, esperando pedidos."
7. **Apontar a Edge Function para o Hermes** (uma vez):
   ```powershell
   npx supabase secrets set AGENT_PROVIDER=hermes --project-ref ycbdilsmydvzezhlymty
   ```
   Para voltar à ponte com o Groq: `AGENT_PROVIDER=groq`.
8. **Testar.** Com o app aberto (`npm run dev` em `projeto-althius-frontend`), faça um pedido na página de Agentes. O
   worker escreve "1 pedido(s) respondido(s)." e a resposta aparece na tela.

## Cada Agente na sua vez

Por padrão, cada Agente vira uma chamada própria ao Hermes: a Coordenação escolhe quem trabalha, cada Agente fala na sua
vez lendo o que os outros já disseram (até 3 rodadas) e a Coordenação junta as respostas. Um pedido gasta, então, várias
chamadas ao modelo. Para voltar ao modo de uma chamada só, ponha `HERMES_UMA_CHAMADA=true` no `.env` deste worker e
reinicie.

## O que saber

- Com `AGENT_PROVIDER=hermes` e o worker desligado, o pedido fica "Trabalhando" e vira falha por prazo em 10 minutos.
- O worker roda um pedido por vez e espera até 8 minutos pelo Hermes; passou disso, pede para ele parar.
- Neste corte, o Hermes recebe as Contas-alvo ativas do Workspace (até 10) nas instruções. As consultas que ele faz
  por conta própria ainda não aparecem como passos na tela.
- `SUPABASE_SERVICE_ROLE_KEY` dá acesso total ao banco: só no `.env` deste computador (e depois no da VPS).
