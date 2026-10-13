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

## As ferramentas dos Agentes (Etapa 5b)

A API de runs do Hermes (`POST /v1/runs`) recebe `input`, `instructions` e `conversation_history`, e não aceita
ferramentas nossas: as do Hermes são os toolsets dele (que este README manda desligar). Por isso as ferramentas da
Althius rodam **na ponte, aqui no worker**: no modo por Agente, as instruções de cada Agente listam as ferramentas que a
Especialidade e a Permissão dele permitem (`_shared/ferramentas-dos-agentes.ts`) e ensinam o pedido, um objeto JSON só,
sem texto fora dele:

```json
{"ferramenta": "ler_contas_e_sinais", "entrada": {"so_quentes": true}}
```

O worker executa pelo mesmo catálogo e as mesmas RPCs da ponte, grava o passo na Conversa (evento `ferramenta`) e chama
o Hermes de novo com o resultado (uma Idempotency-Key por chamada, `…-r1-f1`, `…-r1-f2`). Até 4 chamadas por Agente e
rodada, e 6 ferramentas por pedido somando todos os Agentes; passou, a Execução fecha com `tool_loop_limit`. Uma falha
de ferramenta volta como texto ao Agente. `HERMES_FERRAMENTAS=off` no `.env` volta ao modo só de conversa. As
ferramentas só existem no modo por Agente (o padrão); com `HERMES_UMA_CHAMADA=true`, não há ferramentas.

O envio ao CRM de um Agente com a Permissão Executar sai daqui mesmo (o executor das Aprovações), pelo Acesso de quem
pediu. Pela chave de API ele não precisa de nenhum segredo a mais; para renovar um Acesso por OAuth, o worker usaria os
segredos de cliente OAuth das Integrações, que não ficam neste `.env` (nesse caso o Agente recebe "reconectar").

## O que saber

- Com `AGENT_PROVIDER=hermes` e o worker desligado, o pedido fica "Trabalhando" e vira falha por prazo em 10 minutos.
- O worker roda um pedido por vez e espera até 8 minutos pelo Hermes; passou disso, pede para ele parar.
- Neste corte, o Hermes recebe as Contas-alvo ativas do Workspace (até 10) nas instruções. As consultas que ele faz
  por conta própria ainda não aparecem como passos na tela.
- `SUPABASE_SERVICE_ROLE_KEY` dá acesso total ao banco: só no `.env` deste computador (e depois no da VPS).

## As classificações dos Sinais

Com `SIGNALS_LLM_PROVIDER=hermes` nas Edge Functions `signal-runner` e `signal-cascade`, os passos de IA dos Sinais (notícia e diário oficial) não chamam um modelo direto: enfileiram o pedido no banco (`claim_signal_llm_request`) e este worker o responde pelo Hermes, que já usa a OpenAI. O worker reserva até 5 pedidos por volta, entrega ao Hermes só o texto do pedido (público) e a regra de marca, e grava a resposta e os tokens (`finish_signal_llm_request`); o erro real fica só no log, sem segredo, e o pedido guarda uma mensagem neutra. Se o worker não está ligado, a Edge Function desiste no prazo e o passo usa a regra de palavra-chave. `HERMES_SINAIS_IA=off` no `.env` desliga só isto.
