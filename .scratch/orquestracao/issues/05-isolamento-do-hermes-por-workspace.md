# 05: Isolamento do Hermes por Workspace

**What to build:** hoje um único Hermes, com um único login, atende todos os Workspaces, e isso é seguro só porque quem usa a plataforma são os criadores. Quando entrar o primeiro cliente, o Hermes passa a guardar memória, skills e credenciais de empresas diferentes, e a pesquisa já registrou o que o perfil do Hermes **não** separa (`.scratch/motor-hermes/pesquisa-hermes.md`, seção 2). Este ticket prepara o isolamento: (1) um perfil por Workspace com **chave de API própria**, nunca o login OAuth compartilhado; (2) a escrita de memória e de skill do Hermes presa numa fila de aprovação (`memory.write_approval` e `skills.write_approval`), ou a memória nativa desligada, com o Playbook do Workspace como única memória; (3) todo fato que sobreviver na memória leva o rótulo do Workspace e da Conversa de origem; (4) um teste de isolamento do multiplexador (`/p/<perfil>/`) que prova que um Workspace não enxerga o outro.

**Blocked by:** primeiro cliente (o primeiro Workspace que não seja dos criadores, pagando ou em piloto). Gatilho já usado no resto do projeto: "primeiro cliente pagando e a prospecção rodando" (`.scratch/fase-2-revenue/spec.md:45`). Fora da ordem 01 → 04: nenhum desses tickets depende deste nem o contrário.

**Status:** blocked (o estado `blocked` não está no vocabulário de `docs/agents/triage-labels.md`; quando o primeiro cliente existir, o ticket volta para `ready-for-agent`)

## Estado de hoje (decisão registrada)

- **O login OAuth do ChatGPT é intencional.** Registrado a pedido do Kauê em 12/10/2026: o Hermes local hoje autentica pelo login OAuth do ChatGPT, e isso é uma escolha deliberada, **porque só os criadores usam a plataforma**. Não é dívida a corrigir antes do primeiro cliente, e nenhum ticket deve tratá-lo como bug. A pesquisa chama esse caminho de "OpenAI Codex via OAuth". O login mora no `~/.hermes/auth.json` do computador onde o Hermes roda, fora do repositório (o `README.md` do worker mostra o Groq por chave só como exemplo de configuração), então este registro é a evidência dele no projeto.
- Por que isso é aceitável agora e deixa de ser depois: os logins OAuth (Anthropic, OpenAI Codex, xAI) ficam no `~/.hermes/auth.json` **da raiz** e são compartilhados entre perfis, porque o refresh token é de uso único (`pesquisa-hermes.md:93-95`). Com um só domínio de confiança, não há o que vazar. Com clientes, o crédito e o login de uma conta pessoal pagariam o uso de todos, e um perfil comprometido usaria a credencial de todos.
- Quem consome o Hermes é o worker (`supabase/functions/_hermes-worker/worker.ts`, `main.ts`), que chama `POST /v1/runs` na `HERMES_URL` local (`.env.example`: `HERMES_URL=http://127.0.0.1:8642`, `HERMES_API_KEY` única). A pasta do worker e o `README.md` mandam desligar `terminal`, `file`, `code_execution`, `browser`, `computer_use` e `cronjob` (passo 3 do README).
- O Playbook do Workspace chega à Execução pelo banco (`agent_run_playbook`, `20260930104500_playbook_na_execucao_dos_agentes.sql:6`), e a mudança nele passa por Aprovação do Administrador (ADR-0010 e `20261009220509_revisao_do_playbook_por_aprovacao.sql`). A memória do Hermes, não: é um segundo lugar onde "o que a Althius sabe da empresa" pode morar.
- Os tickets vizinhos: `motor-hermes` 04 (permissão para contribuir, `needs-info`), 05 (biblioteca de padrões coletivos) e 06 (skills versionadas, `needs-info`). Este ticket não decide nenhum deles; ele só garante que, **sem** a permissão do Workspace, nada de um Workspace vira conhecimento de outro.

## Desenho

- **Perfil por Workspace, chave por perfil.** O worker deixa de usar uma `HERMES_API_KEY` global: `GET` do banco devolve ao worker o perfil e a chave do Workspace da Execução (guardada no Vault, como a chave de IA do cliente em `agent_run_ai_key`, `20260930210000_chave_de_ia_do_cliente.sql:64`), e o worker chama `POST {HERMES_URL}/p/<perfil>/v1/runs` com a chave daquele perfil. A chave padrão não vale num perfil nomeado, e um perfil sem chave própria fica inacessível (`pesquisa-hermes.md:79-83`). A credencial de modelo do perfil é uma chave de API no `.env` do perfil (Anthropic por chave, `pesquisa-hermes.md:226-229`), nunca o `auth.json` da raiz. O perfil de um Workspace novo nasce **sem** `--clone` (o clone copia `MEMORY.md` e `USER.md`, `:100-101`).
- **Memória.** Duas opções, e a escolha é do Renan (dúvida 1). (A) `memory.write_approval: true` e `skills.write_approval: true` em todo perfil: toda escrita do Hermes cai na fila de pendências do perfil e só vale depois de um humano aprovar (`pesquisa-hermes.md:136-138`); a revisão humana acontece como Aprovação do Administrador na Althius, não no terminal. (B) `memory.memory_enabled: false` e `memory.user_profile_enabled: false` (`:121-123`): sem memória nativa, o **Playbook do Workspace é a única memória** e o que o Agente "aprende" entra por Revisão do Playbook (ADR-0010).
- **Rótulo de origem.** Toda entrada que chegue à memória do perfil carrega `workspace_id` e a Conversa de origem (`agent_conversations.id` e a Execução), por convenção de formato no texto da entrada e conferida pelo worker na leitura: entrada sem rótulo, ou com rótulo de outro Workspace, é descartada e vira log. É a defesa em profundidade para o caso de um perfil ser servido por engano ao Workspace errado.
- **Teste de isolamento do multiplexador.** Um script de integração (Deno) contra um Hermes real com pelo menos dois perfis (A e B) e o gateway multiplexado (`gateway.multiplex_profiles`), que prova os pontos que a pesquisa deixou "não confirmados" (`pesquisa-hermes.md:197-212`): estado global do multiplexador, registro de ferramentas MCP e o escopo do limite de 10 runs simultâneos.

## Critérios

- [ ] **Chave por perfil.** A chave do perfil A é recusada (401) em `/p/B/v1/runs`, e a chave padrão é recusada em qualquer perfil nomeado. Um perfil sem chave própria responde como inacessível.
- [ ] **Nunca OAuth compartilhado.** Nenhum perfil de Workspace de cliente resolve credencial de modelo pelo `auth.json` da raiz: o script de verificação lê a configuração de cada perfil e falha se o provedor usa `auth: oauth` ou não tem chave de API própria no `.env` do perfil. O Hermes dos criadores (OAuth do ChatGPT) é um perfil à parte, nomeado, e o script o lista como "criadores" sem acusar falha.
- [ ] **run de outro perfil.** O `run_id` do perfil A consultado em `/p/B/v1/runs/{id}` devolve 404, nunca o conteúdo nem 403.
- [ ] **Memória presa.** Com `memory.write_approval` e `skills.write_approval`, um run do perfil A que pede ao Hermes "lembre que o cliente X prefere Y" deixa a escrita pendente e **não** a torna visível em um run do perfil B nem em um segundo run de A antes da aprovação. Com a memória desligada (opção B), a ferramenta `memory` não aparece na lista de ferramentas do run.
- [ ] **Rótulo.** Uma entrada aprovada na memória de A leva `workspace_id` e a Conversa de origem; o worker descarta e registra em log uma entrada sem rótulo ou com `workspace_id` diferente do da Execução, sem chamá-la de erro do usuário.
- [ ] **Multiplexador.** Dois runs simultâneos, um em A e um em B, cada um com uma ferramenta MCP do app que devolve o `workspace_id` resolvido pelo token do perfil: cada run vê só o seu. Uma ferramenta MCP registrada só no perfil A não aparece na lista do perfil B. Skills criadas em A não aparecem em B.
- [ ] **Limite por Workspace.** Se o limite de 10 runs simultâneos se mostrar do processo e não do perfil, o worker limita por Workspace do lado do app e repete ao receber 429, e o script documenta o achado.
- [ ] **Segurança herdada.** Em todo perfil, `terminal`, `file`, `browser`, `code_execution` e `delegation` continuam desligados, e o Hermes não tem chave mestra do Apollo, do CRM nem do banco (`pesquisa-hermes.md:283-287`).
- [ ] **Vazamento entre Workspaces no banco.** A função nova que entrega perfil e chave ao worker é só do `service_role` e nunca devolve a chave de outro Workspace (pgTAP).
- [ ] O resultado do script de isolamento fica gravado em `.scratch/orquestracao/issues/` (Comments deste ticket) com a versão do Hermes testada, e o README do worker (`_hermes-worker/README.md`) ganha a seção "Um perfil por Workspace".

## Pode mexer

- `supabase/functions/_hermes-worker/` (`worker.ts`, `main.ts`, `.env.example`, `README.md`) para escolher o perfil e a chave por Execução, e testes Deno novos ao lado.
- Uma migration nova, com timestamp UTC maior que a última da `main`, com a tabela do perfil por Workspace (sem a chave: só o nome do segredo no Vault) e a função de leitura do `service_role`, e um pgTAP novo.
- Um script novo de verificação de isolamento (por exemplo `scripts/verifica-isolamento-hermes.ts`) e o wizard que cria o perfil de um Workspace (`scripts/wizard-hermes-perfil.sh`, `/wizard`).
- Uma ADR nova (próximo número livre) se a opção (A) ou (B) da memória for decidida.

## Não mexa

- Na ponte `agent-conversation` (o Groq): este ticket é do caminho do Hermes.
- Em `_shared/orquestracao.ts`, `claim_agent_run`, `finish_agent_run` e nos créditos: o isolamento não muda o contrato do motor (ADR-0018).
- No login OAuth do ChatGPT dos criadores: o perfil deles segue como está até o primeiro cliente existir (ver "Estado de hoje").
- Em `motor-hermes` 04, 05 e 06: continuam com os próprios donos e status.
- Em testes existentes: um ticket só acrescenta testes (`worker*.test.ts`).
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.

## Arquivos compartilhados com a área do Renan

- `.scratch/motor-hermes/` (spec, `pesquisa-hermes.md` e tickets 02 a 06): o Hermes é o motor dos Agentes da frente do Renan.
- `supabase/functions/_hermes-worker/*` e `20260930210000_chave_de_ia_do_cliente.sql` (`agent_run_ai_key`, `agent_run_uses_own_ai_key`): o worker já lê a chave de IA do cliente, e a chave do perfil mora ao lado dela.
- `20260930104500_playbook_na_execucao_dos_agentes.sql` e `20261009220509_revisao_do_playbook_por_aprovacao.sql`: o Playbook como única memória depende da Revisão por Aprovação.
- `crm-real-e-stack/propostas/hermes-multi-tenant-architecture.md`: a proposta de arquitetura multi-tenant do Hermes; este ticket a executa.

## Dúvidas para o Renan

1. **Memória nativa ligada com `write_approval` (A), ou desligada com o Playbook como única memória (B)?** Padrão proposto: B, porque a memória nativa tem 2.200 caracteres e não guarda histórico de campanha (`pesquisa-hermes.md:116`, `:286`), e o Playbook já tem versão, aprovação e leitura pelos Agentes. Em A, a aprovação precisaria de uma tela nova de pendências do perfil.
2. **Perfil num processo só (multiplexador) ou um contêiner por perfil?** A própria documentação recomenda um contêiner por perfil para "conformidade / raio de explosão" (`pesquisa-hermes.md:195-197`). Padrão proposto: multiplexador para o piloto e um contêiner por Workspace se o contrato do cliente exigir; o script de isolamento diz se o multiplexador aguenta.
3. **O que conta como "primeiro cliente" para desbloquear?** Padrão proposto: o primeiro Workspace que não seja dos criadores a rodar Agentes, pagando ou em piloto, e antes dele rodar.
4. **O perfil dos criadores continua no OAuth do ChatGPT depois do primeiro cliente?** Padrão proposto: sim, como perfil nomeado e isolado do dos clientes.
5. **Onde fica a pendência de memória na versão (A)?** Fila do Hermes no disco, ou espelhada como Aprovação na Althius (categoria nova, só Administrador, ADR-0002)? Só precisa de resposta se a dúvida 1 for A.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

Este ticket só começa depois do primeiro cliente. Quando começar, os passos humanos são:

1. Criar uma chave de API do provedor de modelo **por Workspace** (ou uma chave de projeto por Workspace) e digitá-la só no `.env` do perfil, no wizard (nunca no chat nem no Git).
2. Criar o perfil do Workspace no Hermes **sem** `--clone`, ligar a configuração de memória escolhida na dúvida 1 e subir o gateway multiplexado. Um wizard (`/wizard`) leva o Nan por esses passos e imprime os comandos de PowerShell prontos.
3. Guardar o segredo do perfil no Vault do Supabase e aplicar a migration conforme `docs/agents/migrations.md`, com o CI verde e antes do merge. Antes de escrever no Vault ou em qualquer segredo, a IA pergunta ao Nan (AGENTS.md: alterar segredos exige pergunta).
4. Rodar o script de isolamento contra o Hermes real e anexar o resultado aos Comments deste ticket.
5. Reiniciar o worker do Hermes com o `.env` novo.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
