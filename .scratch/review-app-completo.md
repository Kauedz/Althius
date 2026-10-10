# Review completo do Althius — 10/10/2026

Snapshot: `origin/main` **04c1d183cd6d0c83ab546e841e49cdb6c3ee09ac**. Branch: `review/app-completo`. Escopo: frontend, funções, migrations, worker, operação, integrações e os 212 tickets locais. Nenhum código funcional alterado, migration aplicada, segredo consultado, envio realizado ou PR mergeado.

## Resumo executivo — 10 linhas

1. **Não há evidência suficiente para liberar o aplicativo inteiro para um cliente real sem acompanhamento.**
2. CRUD, importação, Kanban, Playbook, autorização de Sequências e contratos dos Agentes estão implementados; isso não comprova publicação e operação externa.
3. E-mail Unipile v1 envia o primeiro passo, mas a falta de leitura de conversa bloqueia continuidade, reconciliação e resposta aprovada: P1.
4. O #171 implementa vínculo por `in_reply_to`; uma resposta real ligada ao envio ainda precisa ser demonstrada.
5. Envio direto nos quatro canais é relato válido de teste do provedor, mas não fecha os aceites de envio e resposta pela Sequência.
6. Instagram não consta no contrato de envio do aplicativo; telefone está explicitamente indisponível.
7. Hermes tem worker e fila implementados; disponibilidade na VPS, modelo em execução e isolamento real não foram observados nesta revisão.
8. Onboarding operacional CRM-24 depende de decisões; cobrança tem backend Stripe, mas a seção Plano ainda é incompleta.
9. CI do código auditado verde: Vitest1200/1200, pgTAP2998/2998, Deno979/979 mais gate separado2/2, lint e build.
10. Dos 212 tickets, 115 têm entrega estática/demo/encerramento administrativo, 44 estão parciais, 36 pendentes e 17 bloqueados; **115 não significa funcionalidades prontas em produção**.

## Método e grau da evidência

Aplicada a disciplina de revisão da skill Matt (`.agents/skills/code-review/SKILL.md`), com frentes independentes de padrões/backend, especificação/tickets e frontend. O objeto é o snapshot inteiro, e não um diff de feature: não foi fabricado um ponto de comparação vazio. Instruções do repositório, guia da plataforma, CONTEXT e tracker foram lidos.

Há três evidências distintas: implementação em main; execução dos checks nesta revisão; operação externa observada. Um checkbox não substitui nenhuma delas. O inventário de tickets é uma triagem estática de todos os arquivos, com referências e lacunas; não constitui execução individual de cada critério nem certificação completa de segurança. Os anexos detalham os dois eixos sem transformar estilo em bloqueio de produto.

Relato do usuário: app e PRs até #171 em produção; envios diretos em e-mail/WhatsApp/LinkedIn/Instagram; três execuções Hermes com última bem-sucedida; problema de acesso VPS. Preservado como relato, sem afirmar consulta ao banco ou ao container que não ocorreu. O próprio corpo do #171 ainda diz publicação pendente: divergência documental, não prova de deploy ausente.

## Área por área

| Área | Implementado | Quebrado / limitação | Parcial ou ausente | Evidência | Prioridade |
|---|---|---|---|---|---|
| Auth e workspace | Google, senha, código, recovery, captcha, workspace pessoal, convite e papéis | Configuração Auth/Google/SMTP real não observada | Auth09/10, CRM24; onboarding operacional indisponível | `auth/contexto.tsx`, `auth/aplicativo.tsx`, `fonte/composicao.ts`; anexo frontend | P1 |
| Perfil / CRM08 | Troca de senha no servidor e limite de tentativas | Encerramento de sessões e configuração remota exigem prova | Aceite operacional | `functions/account-password`, `20261009213521_troca_de_senha_no_servidor.sql`; igualdade com #163 | P1 validação |
| Contas e contatos | CRUD, vínculos, arquivar/apagar, canais, responsabilidade | Listas sem paginação; detalhe pode perder contato além do limite da API | Testes de volume e isolamento remoto | `fonte/supabase-contas.ts:380,432`; testes comerciais | P2 |
| Importação e Kanban | CSV durável, preview paginado, blocos, estágios e handoff | Falha na leitura de estágios vira mapa vazio | CRM real/transferência/orfãs CRM17 | `supabase-importacao.ts`, `supabase-contas.ts:440`; tickets CRM17/kanban05 | P1/P2 |
| Enriquecimento | CNPJ, comitê, Persona, e-mail, reservas, cache para não recobrar | Modal confirma cotação pendente/falha, com preço inventado no fallback | Telefone indisponível; validação dos actors/cascata | `comite-e-enriquecimento.tsx:453-466,576`; `account-enrichment` | P1 externo/P2 UX |
| Créditos e cobrança | Ledger, tetos, custo, Stripe/webhook e cota por fatura | Seção Plano contradiz existência do backend; assentos não cumprem integralmente créditos05 | Observador/cota comercial/ajuste de assentos e painel | `stripe-billing/handler.ts:120`, `secao-plano.tsx:129-147`, créditos05 | P1 |
| Sequências / Playbook | Criação, autorização, revisão CRM09, aprovação admin, recebidas, chat | Importação do Playbook não estrutura Cadência/SLA; listas sem paginação | Órfãs CRM17, fila CRM15 operacional; personalização pelo Rhetor deferida | `supabase-sequencias.ts`, `20261009220509_revisao_do_playbook_por_aprovacao.sql`, playbook03/05 | P1/P2 |
| Unipile e-mail v1/v2 | Ponte única, configuração ativa, envio simples, normalização, vínculo novo | V1 rejeita leitura de e-mail/thread/senders; `thread_check_failed`, reconciliação e resposta bloqueadas | Payload real `in_reply_to`; anexos/resposta em thread não suportados v1 | `bridge-v1.ts:59-80`, `send-step.ts:239-243`, migration #171 | P1 |
| WhatsApp / LinkedIn / Instagram | Contratos WhatsApp/LinkedIn, contas remetentes, ingestão, respostas privadas | Envio externo direto não comprova correlação no app | Ciclos reais 06/07/12/17; Instagram ausente do contrato do app | `send-chat-step.ts:17`, `enviador-de-resposta.ts:13`; canais06–17 | P1 |
| Agentes / Hermes | Fila, claim, eventos, tools, Playbook, propostas/custos/tetos | Worker em produção não inspecionado | Modelo, disponibilidade, prova entre workspaces | `_hermes-worker/worker.ts`, `agent-conversation`, `reply-proposal-*` | P1 |
| Sinais | Catálogo/atores, monitoramentos, internos, dedupe e custos | Deep link redireciona antes de carregar; falhas de leitura parecem vazio | CRM11 histórico de falha/correlação de execução externa | `sinais/editor.tsx:145-151`, `estado.tsx:31-54`, `signal-scan/handler.ts` | P1 operacional/P2 bugs |
| Integrações | Habilitação, acessos, OAuth/state, tools/regras, MCP/REST, handoff | Catálogo não prova conector funcional | HubSpot/Notion e outros precisam prova real; conexões07 sobrepõe31 parcialmente | `integration-*`, `crm-handoff`, `conexoes_desabilitar_integracao.sql` | P1 |
| Segurança e operação | Auth de endpoints, RLS/RPC, APP_ORIGIN, assinatura webhook, CI | `temp_v1_mail_raw` conserva metadados e campos extras | RLS pgTAP/deploy Caddy/worker/runtime remoto não observados | `config.toml`, `_shared/cors.ts`, `unipile-account-status/handler.ts:174-177,266`, CI | P1 validação/P2 logs |

Mapeamento detalhado de **telas, rotas, Fontes, Edge Functions, tabelas e RPCs**: [frontend](review-frontend-audit.md) e [backend](review-backend-audit.md). A tabela completa dos **212 tickets, status, evidência e o que falta** está em [auditoria de tickets](review-tickets-audit.md).

## Feedback e gates

| Comando / local | Resultado desta revisão |
|---|---|
| `deno test supabase/functions` na raiz isolada | Primeira tentativa bloqueada por download JSR. Repetido com dependências disponíveis: **979 passed / 0 failed / 2 ignored**, exit0. |
| `deno check supabase/functions/*/index.ts` | Primeira tentativa bloqueada por DNS do registry. Repetido: **exit0**. |
| `npm ci --ignore-scripts` em projeto-althius-frontend | Reparo sequencial exit0; CI executou também `npm ci` normal, exit0. Preparação inicial detalhada no complemento. |
| `npm run lint`, `npm test`, `npm run build` | **CI: todos verdes; Vitest126 arquivos /1200 testes**, 503,46s. Lint/build também passaram localmente. Vitest local foi encerrado após sucesso da mesma suíte na CI, sem resultado local conclusivo. |
| `supabase test db` | Local bloqueado: CLI/Docker/Postgres ausentes, WSL não instalado. **Executado na CI do PR172 após migrations do zero:77 arquivos,2998 testes, PASS.** |
| GitHub checks | APIs do snapshot171 devolveram lista vazia, sem conclusão. **CI do PR172 no commit358b3cd: três jobs concluídos success**, run38023853539. Esse commit só adiciona documentação ao código04c1d18. |
| Navegador `https://app.althius.com.br` | Abriu `/onboarding` em Demonstração, banner “Modo Protótipo (Completo)”. Botão de acesso abriu login com senha/código/demo. Sem sessão operacional: fluxos autenticados e mobile não validados. |

Não foi usado pgTAP no remoto como substituto: o pedido proíbe aplicar alterações no Supabase remoto. Os comandos de Deno são os mesmos da CI, sem permissão global de rede para o código dos testes. Logs locais são diagnósticos e não vão para o PR; nenhum segredo necessário.

## PRs abertos conferidos no GitHub

Metadados consultados nesta revisão, em [evidência compacta](review-prs-evidencia.json). Nenhum foi fechado ou mergeado.

| PR | Situação / recomendação | Evidência e cuidado |
|---|---|---|
| [164](https://github.com/Kauedz/Althius/pull/164) | Candidato a merge documental após conciliar texto | Só3 arquivos de status; comentário relata conexão ativa/Vault/200 com4 contas. Corpo ainda diz15/16 abertos, diff fecha ambos. Conferir não regredir status17 mais recente. CI verde relatado pelo usuário, não obtido nesta revisão. |
| [163](https://github.com/Kauedz/Althius/pull/163) | Candidato a fechar por entrega já em main/#167 | `git diff --quiet 6ef1078 HEAD -- supabase/functions/account-password projeto-althius-frontend/src/auth/contexto.tsx supabase/migrations/20261009213521_troca_de_senha_no_servidor.sql` exit0. Cabeça não é ancestral por squash; comparar conteúdo. Encerrar PR redundante não encerra gate real CRM08. |
| [165](https://github.com/Kauedz/Althius/pull/165) | Candidato a fechar por entrega já em main/#167 | Migration `20261009220509_revisao_do_playbook_por_aprovacao.sql` e seção Memória idênticas ao head644692e; frontend/backend atuais consomem revisão. Preservar Passos do Nan CRM09. |
| [149](https://github.com/Kauedz/Althius/pull/149) | Candidato a fechar após comparar somente diferenças documentais restantes | Publica spec/tickets e fecha gate00 em snapshot antigo34ed683; não substitui gate atual. Inventário atual já contém esses tickets. Não usar CI antigo como prova da main atual. |
| [48](https://github.com/Kauedz/Althius/pull/48) | Candidato a fechar por superação, revisar diferenças residuais | Catálogo real/habilitação já presentes e ampliados em main; integração atual tem acessos/regras/canais. Não aplicar código antigo por cima. Preservar documentação ou teste ainda exclusivo se houver. |

## Tickets para matar agora

Distribuição da triagem estática. “Feito” inclui o escopo visual/demo e encerramentos administrativos, conforme cada linha do anexo; não é aceite operacional.

| Frente | Total | Feito | Parcial | Pendente | Bloqueado |
|---|---:|---:|---:|---:|---:|
| agentes-em-conversa |5|3|2|0|0|
| autenticacao-google-email |11|7|3|0|1|
| canais-cadencia-backend |17|6|8|0|3|
| conexoes-funcionais |31|4|8|19|0|
| configuracoes |9|9|0|0|0|
| contas-e-contatos |13|13|0|0|0|
| creditos-e-planos |8|4|4|0|0|
| crm-real-e-stack |27|13|9|1|4|
| enriquecimento-em-cascata |5|0|1|0|4|
| fase-2-revenue |10|0|0|10|0|
| kanban-de-prospeccao |6|3|2|0|1|
| modulo-de-sinais |9|9|0|0|0|
| motor-hermes |6|2|1|0|3|
| onboarding-pos-login |5|5|0|0|0|
| pagina-de-agentes |10|10|0|0|0|
| playbook-do-workspace |5|4|0|0|1|
| prospeccao-funcional |11|5|5|1|0|
| sequencias |10|10|0|0|0|
| sinais-juridicos |4|0|1|3|0|
| sinais-reais |10|8|0|2|0|
| **Total** |**212**|**115**|**44**|**36**|**17**|

As cinco entregas visuais de onboarding-pos-login não fecham CRM24 operacional; as dez de sequencias não fecham canais06–12. Os19 conectores pendentes e fase2 são roadmap: produto precisa definir recorte de lançamento, em vez de chamar todo roadmap de regressão.

- Fechar administrativamente PR163/165 após cotejo residual; implementação já localizada. Não reimplementar CRM08/09.
- Consolidar canais15/16 com evidência do #164 e relato atual; fechar seu escopo de conexão/adaptador sem prometer paridade v1/v2.
- Tratar PR48/149 como reconciliação documental; não reabrir implementação antiga só por PR pendente.
- Manter tickets cancelados/substituídos como encerramento administrativo, com sucessor. CRM02 foi dividido em Auth; CRM16/19/20/21 em canais. Demo fechada continua demo.
- Lista detalhada de candidatos e respectivos limites: anexo tickets. **Não fechar automaticamente todos os115**; o número inclui demo/cancelamentos e exige os gates do escopo.

## Pendências do Renan / Nan

São decisões ou acesso que os tickets atribuem ao Nan; inspeção visual é trabalho de agente quando a sessão existe.

- CRM24: responder quatro decisões já descritas no ticket de onboarding; não inventar fluxo ou outra fonte de ICP.
- Confirmar pelo canal seguro o acesso operacional à VPS; não há prova nesta revisão de mudança da senha root. Não enviar senha no chat.
- Confirmar se respondeu ao e-mail “sequência3”, para engenharia correlacionar resposta real com envio. Uma nova resposta só deve ser pedida se esse teste ainda for necessário.
- Definir cota por assento, Observador, ajustes/redução de assentos (créditos05), telefone (enriquecimento03), política de contribuição coletiva/Hermes e gates jurídicos documentados.
- Autorizar separadamente qualquer limpeza destrutiva de sequências órfãs CRM17. A revisão não executou limpeza nem mudança de Auth/segredos.

## Pendências do Kauê / engenharia

Atribuição proposta pelo contexto fornecido; ownership não foi inventado em cada ticket.

- Provar envio **pela Sequência**, recebimento e vínculo privado por e-mail/WhatsApp/LinkedIn; usar tickets06/07/12/17 existentes com horário, ambiente e IDs não secretos.
- Capturar payload real anonimizado `in_reply_to`, confirmar mesmo sender/Envio, executar teste de isolamento e remover log temporário.
- Resolver ou expor a limitação de continuidade/reconciliação/resposta do e-mail v1 antes de prometer cadência completa.
- Conferir worker Hermes/serviço, modelo configurado, fila e duas execuções isoladas após acesso disponível. Reconciliar relato de deploy com handoffs ainda pendentes.
- Validar HubSpot/Notion/handoff real; completar as evidências do tracker antes de encerrar tickets operacionais.
- Rodar frontend e pgTAP do zero em ambiente equipado e registrar gates do snapshot/PR; não repetir implementação já mergeada.

## Decisões de produto pendentes

CRM24/Day0 e fonte primária ICP/Personas; cota/assentos/Observador; telefone; contribuição coletiva Hermes; política/reaceite jurídico; capacidades anunciadas da v1; Instagram no app; login ou Demonstração como entrada padrão do domínio app. Decisões registradas posteriormente precisam ser conciliadas antes de perguntar novamente. Lista com dependências na auditoria de tickets.

## Tickets novos sugeridos — não criados como implementação

| Proposta | Prioridade | Critério de aceite rascunhado |
|---|---|---|
| Continuidade e reconciliação de e-mail v1 | P1 | Primeiro envio, passoRe, resposta, reconexão e resposta aprovada em v1 com comportamento suportado; não retirar silenciosamente proteção contra webhook perdido. Limitações visíveis antes da autorização; testes v1/v2. |
| Remover/minimizar log temporário v1 | P2 | Confirmar formato real, fixture anonimizada; eliminar temp_v1_mail_raw ou allowlist mínima; logs não incluem assunto, endereço, corpo, headers, anexos ou campos extras. |
| Carregamento e erros no editor de Monitoramento | P2 | Deep link válido espera promessa e mantém URL; erro com retry; só redireciona após inexistência confirmada; lista não mascara falha como vazio. |
| Cotação de revelação obrigatória | P2 | Confirmar desabilitado até cotação verdadeira; falha não cria preço/saldo nem permite envio; retry e saldo insuficiente testados. |
| Paginação e detalhe por identidade | P2 | Contas/Contatos/Sequências paginados; detalhe busca ID e vínculo, independente da lista; registro da segunda página acessível; filtros/totais coerentes. |
| Plano operacional coerente com Stripe | P1/P2 | Mostrar status, assentos, saldo, uso reais e erro explícito; ações de cobrança por papel; conciliar créditos05 sem duplicar ticket. |
| Playbook importado estruturado | P2 | Cadência/SLA/Mercado importados alimentam contratos corretos; prévia identifica campos não reconhecidos; confirmação atômica admin. Escopo deferido em playbook03. |
| Reconciliação contínua do tracker | P2 | Cada aceite cita snapshot, ambiente, execução e resultado; demo/cancelado/operacional separados; sucessores apontados, sem apagar histórico. |

CRM11 já existe: usar esse ticket para persistir falhas/correlação de execuções externas. **O signal-runner já salva last_error; a alegação genérica de que nenhum erro é salvo é incorreta.** Testes reais de canais também devem completar tickets existentes, sem duplicata.

## Dependências

`npm audit --json` executado nesta revisão: exit1, **8 high / 0 critical**, sem `audit fix`. Entradas: `@modelcontextprotocol/sdk`, `@ts-morph/common`, `braces`, `fast-glob`, `micromatch`, `shadcn`, `source-map-js`, `ts-morph`. O total inclui pacotes afetados transitivamente, não oito vulnerabilidades independentes. Advisories diretos encontrados para SDK MCP (OAuth/credenciais), braces (DoS por padrões profundos) e source-map-js (DoS por source maps). A cadeia ts-morph/glob passa por shadcn; SDK/shadcn podem ser ferramentas de desenvolvimento apesar da classificação em dependencies. Não foi demonstrado que esse código vulnerável roda no bundle servido ou recebe entrada não confiável no app.

Ticket sugerido P2, promovível a P1 se exposição confirmada: mapear dependência até uso efetivo, atualizar/remover ferramenta sem regressão, lockfile reproduzível, lint/test/build verdes e novo audit. Não aceitar automaticamente sugestão `audit fix --force`, que propõe mudança major de shadcn. Nenhuma alteração de dependências foi feita nesta revisão.

## Complemento dos gates

A instalação inicial foi acidentalmente repetida enquanto outra tentativa ainda existia; houve erros de extração. A instalação foi refeita **sequencialmente**, exit0 em46s, antes da rodada definitiva. Essa falha de preparação não é atribuída ao produto.

- `npm ci --ignore-scripts --fetch-retries=0 --fetch-timeout=30000`: exit0, 456 pacotes instalados. Scripts de instalação desativados; os checks seguintes conferem executáveis necessários.
- `npm run lint`: exit0, avisos existentes de Fast Refresh, sem erro.
- `npm run build`: TypeScript e Vite concluídos; bundle principal1.338,22kB (gzip381,97kB), aviso de chunk >500kB. Aviso de tamanho não é falha de build.
- `deno test --allow-read=supabase/functions supabase/functions/_shared/unipile/sem-base-fixa.test.ts`: 2 passed / 0 failed, exit0. Os2 ignored da suíte Deno geral correspondem ao gate com permissão separada, executado agora.
- pgTAP local bloqueado; CI do PR172 executou o banco do zero e passou **77 arquivos /2998 testes**, job114130405064 no [run38023853539](https://github.com/Kauedz/Althius/actions/runs/38023853539). Esse resultado elimina o gate de banco não executado; não comprova migrations aplicadas em produção.
- Vitest na CI: **126 arquivos /1200 testes passaram**, job114130405069, duração503,46s. Rodada local encerrada após confirmação da CI verde; não se declara sucesso local do Vitest.
- Todos os jobs do run38023853539 passaram (commit358b3cd, somente documentação sobre main04c1d18). A atualização final deste relatório altera apenas Markdown; pode disparar nova CI, que não substitui o resultado já obtido do mesmo código funcional.

## Limites finais da verificação

Não atestar ausência de vulnerabilidades por leitura estática. verify_jwt=false tem autenticação alternativa nos endpoints inspecionados; sua presença não é falha por si só. Caddy, runtime de produção, RLS efetiva e entregas externas não foram inspecionados. A conclusão de prontidão permanece negativa por bloqueios demonstrados e gates faltantes, sem transformar acesso não disponível em defeito comprovado.
