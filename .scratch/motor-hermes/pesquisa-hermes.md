# Pesquisa: documentação oficial do Hermes Agent

Ticket: [01](issues/01-pesquisar-a-documentacao-do-hermes.md). Spec: [spec.md](spec.md), seção "Recomendações a conferir".

**Fonte e data.** Consultei em 2026-10-09 a documentação oficial publicada em `hermes-agent.nousresearch.com` (texto
completo em [llms-full.txt](https://hermes-agent.nousresearch.com/llms-full.txt), mesmo conteúdo das páginas citadas
abaixo) e a issue pública [NousResearch/hermes-agent#81815](https://github.com/NousResearch/hermes-agent/issues/81815).
Não li o código-fonte nem rodei o Hermes: o que não está escrito na documentação aparece como **não confirmado** ou
como **inferência**, nunca como fato. A documentação não informa a versão a que se refere; fixar a versão do Hermes na
VPS e reconferir estes pontos ao atualizar.

Legenda: **Confirmado** (a documentação diz o mesmo que a spec), **Corrigido** (diz outra coisa), **Novo** (a spec não
previa), **Não confirmado** (a documentação não responde; precisa de teste no ticket 02).

## Resumo para quem decide

- Confirmado: perfil por Workspace, gateway multiplexado em `/p/<perfil>/...`, chave própria por perfil, `/v1/runs` com
  status, eventos SSE, cancelamento e `Idempotency-Key`, memória nativa de 2.200 caracteres, limite padrão de 10 runs.
- Corrigido: o perfil separa estado, **não** é sandbox. Credenciais OAuth (Anthropic, Codex, xAI) são **compartilhadas**
  entre perfis; só chave de API (`.env` do perfil) é por perfil. A Groq **não** é provedor nativo: entra como endpoint
  compatível com OpenAI.
- Novo: o Hermes tem trava de aprovação própria para escrita de memória e de skill (`write_approval`), que serve ao
  ticket 04 e ao 06. Os `runs` devolvem uso de tokens e o modelo que atendeu, o que serve ao ticket 03.
- Sem resposta oficial: isolamento multi-tenant do multiplexador (estado global, registro de ferramentas) e se o limite
  de 10 runs é por processo ou por perfil. Os dois precisam de teste antes de produção, como a spec já previa.

## 1. API HTTP: endpoints, autenticação, `runs`, eventos, cancelamento, idempotência

Fonte: [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server).

**Confirmado.**

- O servidor é parte do gateway (`hermes gateway`), padrão `127.0.0.1:8642`, e é preciso `API_SERVER_ENABLED=true`.
- Endpoints compatíveis com OpenAI: `POST /v1/chat/completions`, `POST /v1/responses`, `GET /v1/models`. Além deles, a
  API de `runs`: `POST /v1/runs` (devolve `run_id` e `status`), `GET /v1/runs/{run_id}`, `GET /v1/runs/{run_id}/events`
  (SSE), `POST /v1/runs/{run_id}/stop`, `POST /v1/runs/{run_id}/approval`.
- Autenticação: `Authorization: Bearer <API_SERVER_KEY>`. A chave é obrigatória em toda instalação, inclusive em
  loopback.
- Cancelamento: `POST /v1/runs/{run_id}/stop` responde na hora `{"status": "stopping"}`. O run fica `stopping` até o
  trabalho terminar e vira `cancelled`.
- Estados terminais: `completed`, `failed`, `cancelled`, `interrupted`. Se o gateway for desligado com run ativo, o run
  é gravado como `interrupted` (evento `run.interrupted`) antes de parar. Um run que espera decisão humana fica em
  `waiting_for_approval`.
- Idempotência em `/v1/runs`: o cabeçalho `Idempotency-Key` (1 a 255 caracteres ASCII visíveis) é reservado de forma
  durável antes de iniciar o trabalho. Repetição idêntica devolve o mesmo `run_id` com HTTP 202 e
  `Idempotency-Replayed: true`, mesmo depois de reinício do gateway ou de o run terminar. Mesma chave com corpo
  diferente devolve 409 `idempotency_key_conflict`. A chave vale por perfil/credencial e fica 24 horas depois da última
  atualização de status. Sem o cabeçalho, cada chamada cria um run novo.
- Eventos: o SSE traz `tool.started`, `tool.completed`, `message.delta`, `message.interim`, o terminal `run.completed`
  (com a resposta final), `run.failed`, `run.cancelled`, e `subagent.start`/`subagent.complete`. Há `: keepalive` a cada
  10 s sem evento. Terminal run status:
  [Programmatic integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration).
- Correlação: `POST /v1/runs` aceita `session_id`, e o Hermes o devolve no status do run "para correlacionar com os IDs
  de conversa da UI externa". Serve para guardar o id da Execução do app, além do `run_id` do Hermes.

**Para o ticket 02.**

- `GET /v1/capabilities` informa quais recursos a versão em execução suporta (`run_submission`, `run_status`,
  `run_events_sse`, `run_stop`). Chamar na subida do worker.
- `GET /v1/runs/{id}` devolve `usage` (entrada, saída, total e tokens de cache lidos e escritos) e `runtime` (provedor e
  modelo que realmente atenderam, inclusive após fallback). Isso é a base do ticket 03 e do consumo por Workspace.
- **Divergência dentro da própria documentação.** A seção de CORS diz que respostas por `Idempotency-Key` ficam em cache
  por 5 minutos; a seção de `runs` diz 24 horas. Provavelmente falam de endpoints diferentes (chat/completions e
  runs), mas isso é inferência. Usar só `/v1/runs` e testar a repetição depois de reiniciar o gateway.
- **Não confirmado:** a documentação não descreve campo para metadados arbitrários no `POST /v1/runs` (como
  `workspace_id`). O Workspace deve vir do perfil escolhido pela URL, não de um campo do corpo.

## 2. Perfis e gateway multiplexado

Fontes: [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles),
[Running Many Gateways at Once](https://hermes-agent.nousresearch.com/docs/user-guide/multi-profile-gateways) e a seção
de rotas `/p/<perfil>/` em [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server).

**Confirmado.**

- Um perfil é um diretório de dados próprio (`HERMES_HOME`) com `config.yaml`, `.env`, `SOUL.md`, memórias, sessões,
  skills, cron jobs e banco de estado `state.db`. É por perfil também o que o gateway multiplexado resolve a cada turno:
  config, skills, memória, SOUL **e chaves de provedor**; "credenciais nunca são compartilhadas entre perfis".
- Rotas `/p/<perfil>/v1/...` num listener compartilhado. A autenticação é **presa ao perfil**: a chave padrão é recusada
  num perfil nomeado, cada perfil usa a `API_SERVER_KEY` do seu `.env`, e um perfil sem chave própria **fica
  inacessível** (falha fechada). Os runs são por perfil: o `run_id` de outro perfil devolve 404, nunca 403.
- Mudança que quebra compatibilidade (julho de 2026): quem usava a chave padrão em todos os prefixos passou a receber
  401. Definir uma chave distinta por perfil.
- Multiplexar é o padrão (`gateway.multiplex_profiles`, hoje com um único valor válido: `true`). Um perfil nomeado não
  ganha gateway próprio; `gateway.standalone: true` é um atalho temporário que a documentação manda não usar em setup
  novo.

**Corrigido: o que o perfil NÃO separa.**

- **Não é sandbox.** "Profiles do not sandbox the agent". Com o backend de terminal `local`, o agente tem o mesmo acesso
  ao sistema de arquivos do usuário do sistema operacional, e `git`, `ssh` e `gh` compartilham as credenciais do
  `HOME` real, salvo `terminal.home_mode: profile`.
- **Logins OAuth são compartilhados**: Anthropic, OpenAI Codex e xAI via OAuth ficam no `~/.hermes/auth.json` da raiz,
  porque o refresh token é de uso único. Para isolar credencial por Workspace, usar chave de API no `.env` do perfil,
  não OAuth.
- Código e dependências Python são únicos para todos os perfis; o painel web (dashboard) é da máquina e gerencia
  qualquer perfil.
- Dois processos do agente nunca devem usar o mesmo perfil (ambos escrevem memória sozinhos). Um token de bot só pode
  pertencer a um perfil.
- A memória não é compartilhada entre perfis, e o agente nunca recorre à memória de outro perfil. Um `--clone` copia
  `MEMORY.md` e `USER.md`; criar o perfil de um Workspace novo **sem** `--clone`.

**Atenção.** A documentação do Docker diz que, na imagem oficial, o s6 trata cada perfil como um gateway supervisionado
([Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker)). Isso parece conflitar com "um gateway por
host serve todos os perfis". **Não confirmado** qual vale para o nosso desenho; decidir no ticket 02 ao subir o
primeiro perfil.

## 3. Memória e skills

Fontes: [Persistent Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory),
[Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills),
[Configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration).

**Confirmado.**

- Memória nativa: `MEMORY.md` com 2.200 caracteres (cerca de 800 tokens) e `USER.md` com 1.375 (cerca de 500). Os
  limites são configuráveis (`memory.memory_char_limit`, `memory.user_char_limit`). Passou do limite, a ferramenta
  `memory` devolve erro e o agente enxuga as entradas sozinho; não há compactação automática.
- Os arquivos entram no prompt de sistema como retrato congelado no início da sessão. Não é lugar para histórico de
  campanhas, como a spec já dizia.
- Dá para desligar a memória nativa: `memory.memory_enabled: false` **e** `memory.user_profile_enabled: false` removem a
  ferramenta `memory` e o trecho do prompt. Um provedor externo (`memory.provider`) continua ativo. Pôr `memory` em
  `agent.disabled_toolsets` é a chave mais pesada e desliga também os provedores externos.

**Como o Hermes cria memória e skills.**

- A memória é gravada pelo próprio agente com a ferramenta `memory` (`add`, `replace`, `remove`); só persiste se o
  modelo de fato chamar a ferramenta. A documentação avisa que modelos pequenos (abaixo de uns 30 bilhões de
  parâmetros) ou com chamada de ferramenta fraca dizem que salvaram sem salvar.
- Skills ficam em `~/.hermes/skills/` do perfil. O agente cria, edita e apaga as próprias com `skill_manage`, quando
  resolve um fluxo não trivial, passa por erro e acha o caminho, ou é corrigido pelo usuário. Existe também uma
  "revisão de autoaperfeiçoamento" em segundo plano depois do turno. Um linter avisa (sem bloquear) de `SKILL.md` acima
  de uns 24 mil caracteres ou com mais de 60 arquivos de referência.
- O Hermes não retreina o modelo: "autoaperfeiçoamento" é memória e skills, como a spec dizia.

**Novo: trava de aprovação nativa.** `memory.write_approval: true` e `skills.write_approval: true` seguram todo
escrita do agente numa fila (`~/.hermes/pending/skills/` para skills) revisada com `/memory pending`, `/skills pending`,
`/skills diff|approve|reject`. Isso é o encaixe natural para o ticket 06 (skill nova só vale depois de aprovada) e para
o ticket 04 (nada vai à inteligência coletiva sem revisão humana). **Não confirmado** se a fila de revisão é
utilizável por API, sem CLI ou mensageiro; a documentação cita CLI e plataformas de mensagem. O ticket 05/06 deve
decidir se a revisão fica no app (lendo a fila do disco) ou no Hermes.

## 4. Ferramentas: limitar por perfil e plugar APIs externas

Fontes: [Tools & Toolsets](https://hermes-agent.nousresearch.com/docs/user-guide/features/tools),
[MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp),
[Plugins](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins),
[Messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/),
[Security](https://hermes-agent.nousresearch.com/docs/user-guide/security).

**Confirmado e corrigido: o padrão é largo demais.**

- O conjunto padrão da API é `hermes-api-server`: "ferramentas completas" (tira só `clarify` e `text_to_speech`).
  Inclui `terminal`, arquivos, navegador e `code_execution`. A API é o mesmo conjunto: a documentação avisa que o
  servidor "dá acesso total ao conjunto de ferramentas, **inclusive comandos de terminal**".
- Limitar: `agent.disabled_toolsets` (lista que sempre vence, aplicada depois da configuração por plataforma) e a
  seleção por plataforma em `platform_toolsets.<plataforma>` no `config.yaml`. Os conjuntos comuns são `web`,
  `terminal`, `file`, `browser`, `code_execution`, `delegation`, `memory`, `skills`, `cronjob` e `messaging`, além de
  `mcp-<servidor>` dinâmicos.
- **Inferência:** a chave certa para a API deve ser `platform_toolsets.api_server`, por analogia com `acp`, `line` e
  `kanban` mostrados nas páginas; a documentação não a mostra literalmente. Testar. O desenho seguro é, em cada perfil,
  desligar `terminal`, `file`, `browser`, `code_execution` e `delegation` em `agent.disabled_toolsets` e deixar só as
  ferramentas do app.

**Como plugar as APIs do app.**

- **MCP por HTTP (recomendado).** Em `mcp_servers.<nome>` com `url` e `headers`. Há `${VAR}` nos cabeçalhos, resolvido
  do `.env` do perfil, `auth: oauth`, mTLS, `timeout`, e filtro por ferramenta (`tools.include`, `tools.exclude`,
  `resources: false`, `prompts: false`). As ferramentas entram no registro normal. Os subprocessos MCP recebem
  ambiente filtrado, para não vazar credencial.
- **Identidade do Workspace.** `identity_header` envia um cabeçalho fixo (`value_from: static`) ou o **nome do perfil**
  (`value_from: profile`). Como um perfil é um Workspace, o app pode amarrar o Workspace ao perfil e ao token do perfil.
  **Não confirmado:** cabeçalho **por chamada** (por usuário ou por run). A documentação só mostra cabeçalho por servidor
  MCP. Logo, a ferramenta do app deve resolver o Workspace pelo token do perfil e nunca confiar em argumento do modelo.
- **Plugin Python** com `ctx.register_tool(...)` também registra ferramenta própria, mas é código dentro do processo do
  Hermes; só vale se o MCP não servir.
- **Aprovações do Hermes não substituem as do app.** O Hermes aprova comandos perigosos (`approvals.mode`:
  `smart`/`manual`/`off`) e, em servidor MCP com `trust: untrusted`, pede consentimento por `approval.request` e
  `POST /v1/runs/{id}/approval`. Em sessões sem humano (API), `approvals.unattended_mode` é `deny` por padrão. Isso não
  conhece Ler/Propor/Executar nem as Aprovações do CRM-15; essas continuam sendo da ferramenta do app (ADR-0002).

## 5. Concorrência, estado global do multiplexador e isolamento multi-tenant

Fontes: [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server),
[Running Many Gateways at Once](https://hermes-agent.nousresearch.com/docs/user-guide/multi-profile-gateways),
[Docker](https://hermes-agent.nousresearch.com/docs/user-guide/docker),
[Kanban](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban),
[issue #81815](https://github.com/NousResearch/hermes-agent/issues/81815).

**Confirmado.**

- Limite de execuções simultâneas: `gateway.api_server.max_concurrent_runs`, padrão **10**, `0` desliga o limite.
  Passou do limite, a API responde **HTTP 429** `Too many concurrent runs (max N)` e o cliente deve esperar e tentar de
  novo. O limite vale para chat/completions, responses, runs e chat de sessão; cron tem limite próprio.
- Para isolamento forte, a própria documentação do Docker recomenda **um contêiner por perfil** quando há "conformidade
  / raio de explosão", credenciais que não podem dividir a mesma árvore de processos, ou necessidade de `--memory` e
  `--cpus` por carga.

**Não confirmado.**

- **Escopo do limite de 10:** a documentação não diz se a contagem é por processo do gateway (todos os perfis somados)
  ou por perfil. No multiplexador, é provável que seja do processo (inferência). Efeito: um Workspace barulhento pode
  consumir a cota dos outros. O worker precisa limitar por Workspace do lado do app, com repetição ao receber 429.
- **Estado global no multiplexador:** a documentação diz que o gateway resolve config, skills, memória, SOUL e chaves
  por turno, para o perfil roteado, mas **não afirma nada sobre o registro de ferramentas, cache de módulos ou outros
  estados do processo**. O registro de ferramentas é central e preenchido na importação (`tools/registry.py`, na
  [visão de arquitetura](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)). Ferramentas MCP
  são registradas "na subida" do processo. Se o registro for do processo, ferramenta MCP de um perfil pode aparecer
  para outro. A spec já pedia teste de vazamento antes de produção: continua valendo, e é o primeiro teste do ticket
  02.
- **Discussão aberta sobre isolamento multi-tenant:** não achei no site oficial nenhuma garantia de multi-tenant. O que
  existe é (a) o aviso de que perfil não é sandbox (seção 2), (b) o `--tenant` do Kanban, que só separa **por prefixo**
  a memória gravada por trabalhadores (convenção, não isolamento), e (c) a issue
  [#81815](https://github.com/NousResearch/hermes-agent/issues/81815), fechada como "not planned" em 2026-10-06: dois
  perfis com o provedor de memória externo Hindsight (`local_embedded`) dividem o daemon e o banco de memória pelo nome
  padrão, e um clone herda a configuração. Só afeta quem usar provedor externo de memória, que não faz parte do desenho da spec.
  Conclusão: tratar o Hermes como processo **de confiança única**, com o Workspace garantido pelo app e pelas
  ferramentas, e subir um contêiner por Workspace se o risco ou o contrato pedirem.

## 6. Provedores de modelo e configuração por perfil

Fontes: [LLM and Model Providers](https://hermes-agent.nousresearch.com/docs/integrations/providers),
[Configuring Models](https://hermes-agent.nousresearch.com/docs/user-guide/configuring-models),
[API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server).

**Confirmado: Anthropic.** Provedor nativo, com três formas de autenticação. A chave de API (`ANTHROPIC_API_KEY`, cobrada
por token) é a única indicada para uso por perfil. O OAuth "como Claude Code" só funciona em plano **Max com crédito
extra comprado** (Pro não serve), consome só o crédito extra, e o login é compartilhado entre perfis (seção 2).
Para a Althius, usar chave de API.

**Corrigido: Groq.** Não está na lista de provedores de inferência (a Groq aparece na documentação só como provedor de
transcrição de voz). Funciona como **endpoint personalizado compatível com OpenAI**: a página de provedores lista
`https://api.groq.com/openai/v1` entre os "Other Compatible Providers", configurado com `provider: custom`, `base_url` e
`api_key`. Vale para teste, mas a ferramenta depende de o modelo chamar funções com qualidade (aviso da seção 3 sobre
modelos pequenos). Medir no teste.

**Como configurar por perfil.** Cada perfil tem o seu `config.yaml` (`model:` com `default`/`provider`/`base_url`) e o
seu `.env` (chaves). Também há `fallback_providers`. Por requisição, `POST /v1/runs` aceita `model`, `provider` e
`model_options` (esforço de raciocínio, nível de serviço), e `gateway.platforms.api_server.model_routes` mapeia apelidos
para modelos. Isso permite trocar Groq por Claude sem mexer no perfil. O `runtime` devolvido no run diz o que foi
usado. Atenção: ferramentas auxiliares (visão, resumo) usam por padrão o modelo principal e podem gerar custo extra.

Outros provedores aceitos (lista da documentação): Nous Portal, OpenRouter, Google Gemini/Vertex, OpenAI, Azure AI
Foundry, AWS Bedrock, DeepSeek, Fireworks, Ollama e dezenas de outros. A escolha do modelo continua pendente do Nan
(spec: "Em aberto").

## 7. Requisitos para rodar numa VPS e custo (estimativa)

Fontes: [Docker, "Resource limits"](https://hermes-agent.nousresearch.com/docs/user-guide/docker),
[Team Telegram Assistant](https://hermes-agent.nousresearch.com/docs/guides/team-telegram-assistant).

**Confirmado, da documentação do contêiner oficial** (imagem `nousresearch/hermes-agent`):

| Recurso | Mínimo | Recomendado |
| --- | --- | --- |
| Memória | 1 GB | 2 a 4 GB |
| CPU | 1 núcleo | 2 núcleos |
| Disco (volume de dados) | 500 MB | 2 GB ou mais (cresce com sessões e skills) |

- A automação de navegador (Playwright/Chromium) é o recurso que mais consome: sem ferramentas de navegador, 1 GB
  basta; com elas, pelo menos 2 GB e `--shm-size=1g`. Como o plano é desligar `browser`, o piso é o de 1 GB.
- Todo o estado fica no volume `/opt/data`. Nunca rodar dois contêineres de gateway sobre o mesmo diretório de dados.
  O `state.db` usa SQLite em modo WAL, que não funciona bem em montagens entre VMs (virtiofs); usar volume nomeado ou
  disco nativo na VPS.
- A imagem é Debian com ambiente Python próprio. Atenção: a documentação do Telegram diz que uma VPS de US$ 5 por mês
  "é suficiente" para o **gateway**; isso é frase de guia, não requisito medido, e não vale para o nosso caso.

**Custo estimado (estimativa, não medido).** O Hermes não cobra licença: o custo é a infraestrutura mais os tokens do
provedor. A documentação não traz custo mensal por Workspace. Para decidir se cabe no plano de R$ 90 da Hostinger
(spec), falta somar, **no ticket 02, medindo**: (1) o Hermes (cerca de 1 a 2 GB por processo, sem navegador), (2) o
app, e (3) o Supabase auto-hospedado do ADR-0013, cujo consumo **não foi pesquisado aqui**. Se a soma passar do plano,
o primeiro candidato a sair da VPS é o Supabase ou o Hermes, não o modelo. O custo por token depende do modelo
escolhido, e os `usage` do `GET /v1/runs/{id}` permitem calcular o custo por mensagem.

## O que isto muda nos tickets seguintes

- **02 (ligar ao contrato do banco):** usar `/v1/runs` com `Idempotency-Key` derivada da Execução do app, `session_id`
  = id da Execução, e gravar o `run_id`. Fechar a Execução pelo `run.completed`, `run.failed` ou `run.cancelled`, e
  tratar `interrupted` como falha com nova tentativa. Respeitar 429. Testar o vazamento entre perfis (seção 5) e a
  chave `platform_toolsets.api_server` (seção 4) logo no início.
- **03 (medir resultado):** `usage` e `runtime` do run dão tokens e modelo por mensagem; o resultado comercial
  (resposta qualificada) continua vindo do app.
- **04/05/06 (contribuição, padrões, skills):** ligar `memory.write_approval` e `skills.write_approval` e decidir onde
  a revisão humana acontece (seção 3). A memória nativa não guarda histórico de campanha.
- **Segurança para todos:** desligar `terminal`, `file`, `browser`, `code_execution` e `delegation` em cada perfil; só
  ferramentas do app por MCP HTTP, com token por perfil; chave de API por perfil, nunca OAuth; sem chave mestra do
  Apollo, CRM ou banco dentro do Hermes.
