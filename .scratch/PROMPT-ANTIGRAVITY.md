# Prompt de continuação (para outro agente de código)

Este arquivo é o ponto de partida para quem continuar a implementação geral da Althius. Leia inteiro antes de mexer em qualquer coisa.

## Quem é o dono e como ele quer trabalhar

O dono do produto é o Nan. Ele quer o app "totalmente funcional" e pediu: **sem paradas de revisão, vá implementando, sem quebrar nada, sem inventar nada**. Ele mesmo faz o teste final, quando a plataforma estiver pronta. Escreva textos de interface e comentários em **português do Brasil**, simples e diretos, no mesmo tom do código ao redor.

## Onde está o trabalho

- Repositório: `Kauedz/althius`. Branch com o trabalho em andamento: **`claude/funny-hypatia-6u2ton`** (14 commits à frente da `main`, nenhum atrás, 66 arquivos, ~16 mil linhas).
- O que está nela é **só backend**: migrations, Edge Functions, módulos `_shared` e testes. **Nenhuma frente tem tela ainda.** Nada foi rodado em conjunto (suíte completa de pgTAP, deno, vitest) e **nenhuma das migrations novas foi aplicada no banco remoto**.
- Comece com: `git fetch origin && git checkout claude/funny-hypatia-6u2ton && git pull`.

## Leitura obrigatória (curta)

`AGENTS.md`, `CONTEXT.md` (glossário: use esses termos na tela e nos nomes de domínio), `docs/visao-geral-da-plataforma.md`, `docs/agents/migrations.md`, `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, e os ADRs de `docs/adr/` da frente em que for mexer (0002 Permissões, 0008, 0014, 0015, 0016, 0017, 0018). Specs e tickets ficam em `.scratch/<frente>/` (`spec.md` e `issues/`).

## Regras que não se negociam

1. **Aditivo.** Migration nova para cada mudança; nunca edite uma migration já aplicada. **Nunca altere testes existentes** (pgTAP, vitest, deno): se um teste antigo quebrar, o código novo está errado. Testes novos vão em arquivos novos.
2. **Não redefina** `save_target_account`, `create_contact`, `update_contact`, `link_contact`, `end_contact_link`.
3. Funções SQL: `security definer`, `set search_path = ''`, nomes qualificados, `revoke all ... from public, anon` e `grant execute` só a quem precisa. Tabela nova com RLS ligada.
4. **Segredos:** nunca exiba, copie ou grave `sk_`, `rk_`, `whsec_` nem chave de API em arquivo, commit, log ou chat. Segredo novo entra só por `npx supabase secrets set --project-ref ycbdilsmydvzezhlymty`. Documente o **nome** do segredo na seção "Passos do Nan" do ticket, nunca o valor. Nunca peça chave no chat.
5. **Banco remoto** (projeto Supabase `ycbdilsmydvzezhlymty`, pré-produção, ADR-0013): antes de qualquer coisa destrutiva (drop, apagar dados, escrever em `auth.users`) e antes de mudar configuração de Auth ou segredos, **pare e pergunte ao Nan**. Para aplicar migration use o procedimento atômico de `docs/agents/migrations.md` (bloco `do $apply$ ... $m$<arquivo>$m$ ...` + conferência do `md5`). **Não use `supabase db push`**: o histórico remoto tem versões gravadas à mão. Se você não tiver acesso ao banco, deixe a migration sem aplicar e liste em "Passos do Nan".
6. **Cobrança (Stripe):** a cobrança está **ligada** (`billing_settings.enforced = true`) e só roda no sandbox. Não mude isso, não toque nas chaves nem em configurações do Stripe sem o Nan autorizar.
7. O Agente **propõe**, a pessoa decide (Aprovações, ADR-0002). Dado de um Workspace nunca vaza para outro. Quando algo depende de passo manual do Nan (segredo, app OAuth, webhook), deixe o código pronto, **desligado com padrão seguro**, e a tela mostrando o estado honesto ("Precisa configurar…"), nunca fingindo que funciona.
8. Não escreva nome de modelo de IA em nenhum arquivo do repositório.
9. O glossário evita a palavra "assinatura": na tela é "Plano do Workspace".
10. Existe outra sessão trabalhando em Sinais (`sinais-juridicos`, `modulo-de-sinais`). Antes de abrir PR, faça `git merge origin/main` e resolva conflitos mantendo as duas partes.

## Como validar (igual ao CI)

- Frontend, em `projeto-althius-frontend/`: `npm ci`, `npm run lint`, `npm test`, `npm run build`.
- Edge Functions, na raiz: `deno check supabase/functions/*/index.ts` e `deno test supabase/functions` (se um `npm:` não resolver, use `--node-modules-dir=none`).
- pgTAP: `supabase test db` (precisa de Docker) ou, num Postgres 16 com pgTAP, `bash scripts/pgtap-local.sh <nome-do-banco>` (lê o cabeçalho do script).
- CI do GitHub tem 3 jobs (frontend, banco, funções). Mescle seu PR **com merge commit** quando os 3 estiverem verdes.

## O que existe na branch (backend), por frente

| Frente | Migration | Edge Functions e módulos | Falta |
|---|---|---|---|
| **Descoberta por ICP** | `20261001170000_descoberta_de_contas_pelo_icp.sql`, `20261001171000_busca_de_contas_pelo_icp.sql` | `account-discovery/` (busca pelo ICP com Apify, pontuação, normalização) | Tela, enriquecimento (CNPJ/Receita, comitê, contatos), gancho para os Agentes, tickets |
| **Conectores** | `20261001160000_acessos_as_integracoes.sql` | `integration-connect`, `integration-callback`, `integration-tools`, `_shared/integration-access.ts` (cliente MCP, OAuth com PKCE, renovação) | Cartões na tela de Conexões, sincronização do HubSpot (tickets 04–06), perfis por chave de API (RD Station, Pipedrive), ADR-0019, tickets |
| **WhatsApp e LinkedIn** | `20261001150000_canais_whatsapp_e_linkedin.sql` | `_shared/send-chat-step*.ts`, `_shared/ingest-chat-event.ts`, ajustes em `sequence-runner/` e `unipile-account-status/` | Conferir o webhook `message.new`, mensagens na tela, `scripts/wizard-unipile.sh` (novos eventos), tickets 06 e 07 |
| **Respostas sugeridas** | `20261001180000_propostas_de_resposta.sql` | `reply-proposal-runner`, `reply-proposal-send`, `_shared/enviador-de-resposta.ts` | Bloco "Resposta sugerida" na tela, cron/token do runner, WhatsApp/LinkedIn no envio, tickets 08 e 09 |

## Plano, em etapas (uma de cada vez; um PR por etapa; só passe à seguinte com a anterior mesclada)

### Etapa 0 — Estabilizar a branch
Rode **todas** as validações acima na branch como está. Corrija o que falhar **no código novo** (nunca nos testes antigos). Confira se as 5 migrations novas aplicam em ordem num banco limpo e se o pgTAP inteiro fecha (cada arquivo com o `plan` certo). Abra o PR para a `main`, espere o CI, aplique as migrations no remoto (regra 5) e mescle.

### Etapa 1 — Descoberta por ICP e enriquecimento (prioridade do Nan)
Pedido dele: "a IA busca contas que combinam com o ICP e que estão dando sinais; a Apify acha os leads; enriquece trazendo os contatos, com telefone, e-mail, CNPJ, dados da Receita, cargo e LinkedIn". A base de enriquecimento é o Apify (foco em dados brasileiros); Apollo, Lusha e Clay entram depois pelos conectores dos Agentes.
Specs: `.scratch/enriquecimento-em-cascata/`, `.scratch/sinais-reais/`, `.scratch/modulo-de-sinais/`, `.scratch/crm-real-e-stack/issues/11` e `12`.
1. Tela "Descobertas" na página de Contas: botão "Buscar contas pelo ICP" **mostrando o custo estimado antes** (padrão do reativar-sinais), lista de candidatas com aderência ao ICP e os motivos, Aceitar/Descartar, estado do enriquecimento. Fonte nova em `src/fonte/` (métodos opcionais, simulada na Demonstração, ligada em `composicao.ts` atrás de um interruptor seguro), testes com `renderizarApp`.
2. Aceitar uma candidata cria a Conta-alvo **pela regra existente `save_target_account`, como a pessoa**, sem redefini-la. Nada vira Conta-alvo sem confirmação.
3. Enriquecimento da Conta (função `account-enrichment`): CNPJ e Receita Federal pelo Actor do Apify, se existir no store (confirme em `https://api.apify.com/v2/acts/<id>`, que é público), e pela BrasilAPI `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` como alternativa.
4. Comitê de compra e Contatos (ticket 02): pessoas por cargo/persona via Actors do Apify **validados**; interface `ProvedorDeContatos` plugável para Apollo/Lusha/Clay. Contatos propostos entram numa caixa e, ao aceitar, usam `create_contact`/`link_contact` sem redefini-los. Revelar e-mail/telefone gasta Créditos e exige confirmação. LGPD (ticket 05) é `needs-info`: registre a origem de cada dado e deixe a base legal como pendência, sem inventar texto jurídico.
5. Todo gasto com Apify passa pelo débito de Créditos e respeita interruptores e tetos (`custos_por_acao`, `saldo_e_lancamentos_de_credito`, `interruptores_e_tetos`).
6. Actors de descoberta ficam registrados no registro de actors como "a validar numa execução real". **Nunca invente id de actor nem campo de entrada**: leia o `inputSchema`.

### Etapa 2 — Conectores (HubSpot, Notion, Apollo, Lusha, Clay, Meta Ads, RD Station, Pipedrive)
Specs: `.scratch/conexoes-funcionais/` (tickets 02 a 19), `pesquisa-servidores-mcp.md`, ADR-0016 e ADR-0017.
1. Cartões da tela `/conexoes`: conectar (OAuth abre a URL; chave de API em formulário), estado do próprio Acesso, "Precisa reconectar", desconectar, lista de ferramentas. Fonte de Conexões com métodos opcionais, simulada na Demonstração.
2. Escreva o **ADR-0019** (`docs/adr/0019-conexao-por-chave-de-api-quando-nao-ha-mcp.md`): a ADR-0017 descartou o token colado como caminho principal; aqui ele vira alternativa explícita pedida pelo Nan, para cobrir CRMs sem MCP (RD Station CRM, Pipedrive, HubSpot por Private App). A chave só é aceita de participante ativo, validada antes de gravar, e nunca volta ao navegador.
3. Sincronização do HubSpot (tickets 04 a 06): só leitura, respeita o Vendedor responsável (ADR-0016), usa as funções de escrita existentes sem redefini-las.
4. Passos do Nan: criar o MCP Auth App do HubSpot e pôr `HUBSPOT_MCP_CLIENT_ID` e `HUBSPOT_MCP_CLIENT_SECRET`; registrar a URL de retorno da `integration-callback`. O teste real é o ticket 09.

### Etapa 3 — WhatsApp e LinkedIn nas Sequências
Specs: `.scratch/canais-cadencia-backend/` (tickets 06 e 07). Cadência pedida pelo Nan: **LinkedIn = convite com nota; se já conectado, mensagem. WhatsApp = mensagem.**
O contrato da Unipile v2 foi levantado por busca, **sem acesso à documentação oficial**. Confira tudo que estiver marcado `// não confirmado:` (por exemplo `users_ids` ou `user_ids` em `POST /v2/{account_id}/chats/send`, o evento de nova relação do LinkedIn, o limite da nota do convite). Complete: webhook `message.new`, mensagens de bloqueio na tela, novos eventos em `scripts/wizard-unipile.sh`. Nunca reenviar às cegas em timeout. Mensagem pessoal ou sem correlação com Contato participante não vira Interação nem pausa a Sequência.

### Etapa 4 — Respostas sugeridas
Specs: tickets 08 e 09 de `canais-cadencia-backend`. Bloco "Resposta sugerida" visível só ao titular (editar, Aprovar e enviar, Rejeitar, Gerar de novo), cron e token do runner, e o envio por WhatsApp/LinkedIn quando a Etapa 3 estiver na `main`. A IA nunca recebe ferramenta nem credencial de envio; aprovar não retoma a Sequência.

### Etapa 5 — Enviar ao CRM e ferramentas dos Agentes
1. Enviar ao CRM (`.scratch/kanban-de-prospeccao/issues/05`): leva empresa, Contatos e nota com Sinais e abordagem ao CRM conectado (HubSpot, RD Station, Pipedrive), usando `_shared/integration-access.ts` e o executor de Aprovações (`propose_agent_action`, `claim_approved_action`, `finish_approved_action`). Com Permissão Propor, nada sai sem Aprovação do Administrador. Ao existir o primeiro executor, ligue `aprovacoesDisponiveis` em `composicao.ts`.
2. Agentes (Scopus, Ethos, Rhetor, Oraculum) conversam "como num Slack" pelo Hermes (`supabase/functions/agent-conversation`, `_hermes-worker`) e passam a ter ferramentas: pedir descoberta, enriquecer, ler conectores (Ler) e propor ações (Propor). Mantenha as Permissões do ADR-0002.

### Etapa 6 — Fechamento
Atualize os tickets (checklists e "Passos do Nan"), `supabase/functions/README.md` e `CONTEXT.md` só se surgir termo novo. Gere a lista final do que o Nan precisa fazer à mão (segredos, apps OAuth, webhooks, contas de teste reais) para o teste dele.

## Ao terminar cada etapa, responda ao Nan com

1. O que ficou pronto e os arquivos principais. 2. Os números reais dos checks. 3. O que não ficou pronto e por quê. 4. Os "Passos do Nan". Não afirme que algo passou sem ter rodado.
