# Auditoria das specs (01/10/2026)

Retrato de cada spec em `.scratch/`, conferido no código da `main` (bda4514), e não nas linhas `Status:` dos tickets.
Nada foi rodado contra o Supabase remoto. Quando algo diz "aplicado", a fonte é o `GO-LIVE.md`.

**Achado geral:** entre 30/09 e 01/10 entraram ~50 PRs (#89 a #144) numa implementação em lote, e quase nenhum ticket foi
atualizado. Cerca de 30 tickets dizem `ready-for-agent` com o código já na `main`. Antes de pegar qualquer ticket, confira
esta auditoria.

## 1. Quadro geral

| Spec | O que é | Veredito |
| --- | --- | --- |
| `autenticacao-google-email` | Cadastro e login (senha, código, Google), Workspace pessoal, Turnstile, convite | Funciona com passos humanos pendentes. Google e Turnstile desligados por falta de chave; convite (09) parcial |
| `onboarding-pos-login` | Day0, checklist e ramo do convidado | Só Demonstração. O operacional é o CRM-24 (`needs-triage`) |
| `configuracoes` | Perfil, preferências, Pessoas, Memória, Plano, Ajuda | Parcial. Perfil, tema e Pessoas reais; Memória, Plano e Avisos não |
| `crm-real-e-stack` | Spec-mãe que leva o protótipo ao real | Parcial. Núcleo de dados real; fila de Aprovações desligada; Sinais internos e onboarding não começaram |
| `contas-e-contatos` | Tabelas, detalhe, filtros | Real, mas Aderência, Persona, Área e origem ficam sempre vazias |
| `canais-cadencia-backend` | Envio real pela Unipile | E-mail real pronto. WhatsApp e LinkedIn só no backend: desligados, sem tela e sem validação. Anexos e validação final não começaram |
| `sequencias` | Lista, detalhe, composer | Real em lista, detalhe e bloco da Conta. Nascer na Conversa e Aprovação seguem só demo |
| `kanban-de-prospeccao` | Estágios da Conta, eventos, Enviar ao CRM | Funciona com passos humanos pendentes. Faltam 3 eventos, histórico na tela e botão no cartão |
| `modulo-de-sinais` | Telas de Sinais | Pronto como demo. **No real não cria Monitoramento** (bug) |
| `sinais-reais` | Apify, varredura, 9 Sinais, reativação | Backend real, mas sem prova de ponta a ponta. Estado "disponível" só existe no remoto, feito à mão |
| `sinais-juridicos` | Jurimetria | Só pesquisa. Sugestão: parar até haver cliente jurídico pagante |
| `enriquecimento-em-cascata` | Comitê de compra, revelar e-mail e telefone | Parcial. Actors não validados; bugs de cobrança, segurança e LGPD |
| `playbook-do-workspace` | Playbook em 16 seções versionadas | Real e chegando aos Agentes. A importação perde as tabelas e o Mercado |
| `agentes-em-conversa` | Agentes conversando de verdade | 01 a 04 reais; 05 (propor mudança no Playbook) não começou |
| `motor-hermes` | Hermes como motor | Parcial e só local. No remoto roda a ponte (provavelmente Groq) |
| `pagina-de-agentes` | Grade, criar, Permissões, Conversa | Pronta como demo. No real há números fixos (`ocioso`, 0 execuções) e Rotinas que nada executa |
| `conexoes-funcionais` | Integrações por MCP ou chave | Acesso real funciona. **A sincronização do HubSpot (04–06) não existe** |
| `creditos-e-planos` | Créditos, tetos, Stripe | Parcial. O contrato está no banco; não há tela de saldo; metade dos interruptores não tem efeito; Stripe em sandbox |
| `fase-2-revenue` | Oportunidades, transcrições, GEO, inbound | Não começado, por decisão |

## 2. O que impede de funcionar hoje (P0)

1. **Workspace novo não tem crédito.** Varredura de Sinais, descoberta por ICP e comitê sempre reservam crédito
   (`20261001171000:198`, `20261001190000:157`). Com `credits_per_seat = 0` e sem pacote à venda, o saldo só vem de
   `grant_credits` por SQL, e o `wizard-go-live.sh` não tem esse passo. O diferencial do produto trava num Workspace novo.
2. **A cobrança fecha o Workspace pessoal.** Com `billing_settings.enforced = true` e o Stripe em sandbox, quem se cadastra
   cai na tela de assinatura (`aplicativo.tsx:367-388`) antes do primeiro uso.
3. **Sinais: não dá para criar Monitoramento no modo real.**
   - O editor manda o id `novo-…` (`editor.tsx:95`) como uuid para o banco (`supabase-sinais.ts:172`).
   - O público oferece as listas da Demonstração (`editor.tsx:522`).
   - Não há seletor de Contas reais.
   - Sem Monitoramento ativo, "Buscar Sinais de novo" fica sempre desligado.
4. **As telas de acesso abrem na Demonstração.** `raiz.tsx:18-29` só escolhe o operacional em `/entrar` e `/convite/…`.
   Num navegador sem escolha salva, `/cadastro`, `/esqueci-a-senha`, `/redefinir-a-senha` e os links de e-mail abrem a
   Demonstração. Risco provável (conferir no navegador): o link de redefinir senha deixa a pessoa entrar sem trocar a senha.
5. **A fila de Aprovações está desligada.** `aplicativo.tsx:355-360` não passa `aprovacoesDisponiveis`. O HubSpot nasce com
   Permissão Propor, então todo Enviar ao CRM pedido por um Agente fica pendente sem tela e expira em 7 dias. Ligar a fila
   exige autorizar a troca do teste `raiz.test.tsx:110`.
6. **`/termos` e `/privacidade` não têm rota pública** (`termos.ts:8,11`). O Google OAuth exige uma política publicada.
7. **Unipile: o teste grátis acaba por volta de 03/10.** Antes disso, faça um envio e uma resposta reais por WhatsApp e
   por LinkedIn. É a única chance de confirmar os campos marcados "não confirmado" antes da troca de conta. Depois da
   troca, o `wizard-unipile.sh` volta a valer (ADR-0015).
8. **Passos do Nan fora do `wizard-go-live.sh`:**
   - deploy de `csv-import`, `contact-photo-lookup`, `storage-purge --no-verify-jwt` e `workspace-invitation-email`;
   - `select private.configure_signal_runner(...)`: sem ele, a varredura nunca chama a função;
   - `select private.configure_storage_purge(...)`;
   - `grant_credits` inicial;
   - `limpar-sequencias-orfas.sql` e depois o `VALIDATE CONSTRAINT` (CRM-17).

## 3. Segurança e LGPD (P0)

- **A ação `cnpj-receita` não confere a sessão** (`account-discovery`, `handler.ts:365`). Qualquer pessoa com a chave anon
  roda o actor da Receita na conta Apify da Althius, sem crédito.
- **Apagar a Conta não apaga tudo.**
  - `erase_target_account` (`20260929160000:1078`) não limpa `receita_data`, que guarda sócios, e-mail e telefones. Como o
    marcador é imutável, esse dado fica para sempre.
  - `private.proposed_contacts` sobrevive ao apagamento da Conta e ao do Contato.
  - `erase_contact` não apaga os Sinais com nome e LinkedIn de terceiros (`mudanca-de-emprego.ts:72`, `nova-lideranca.ts:62`).
  - O pgTAP de varredura é anterior a essas tabelas e não pega nada disso.
- **`contact_photos` é legível por `authenticated`** (CRM-12).
- **O worker do Hermes no modo `HERMES_UMA_CHAMADA=true`** (`worker.ts:246-291`) grava `chamada`/`feito` para Agentes que não
  trabalharam. É o "fingir" que a plataforma proíbe.

## 4. Bugs e meias-entregas (P1)

**Dados e enriquecimento**
- `finish_reveal_contact` usa `coalesce(email, …)` (`20261001190000:605,610`): se o Contato já tem e-mail, cobra 2 créditos e
  descarta o valor. Também ignora `p_source` e `contact_emails`.
- As entradas dos actors estão erradas (`provedor-de-contatos.ts:112,140,178-179`): o revelar manda `profileUrls`/`findEmail`,
  o comitê manda `companies:[slug]` e lê `currentPosition`. Nenhum actor traz telefone.
- O custo do Apify não é gravado no comitê, na Receita nem no revelar. Falha do actor vira "concluída com 0".
- Interações: a origem está fixa em "Registro manual" (`supabase-contas.ts:284`), e o tipo `mensagem-recebida` não tem
  rótulo (`contas-tipos.ts:231`).
- `accept_discovered_account` usa `save_target_account` e pula a roleta; a auditoria grava `manual`.
- O Contato não tem Persona: `accept_proposed_contact` descarta a que veio do comitê.

**Sinais**
- O detalhe da Conta mostra "Nenhum sinal" em Conta Quente (`supabase-contas.ts:859`), por causa de um teste antigo que trava
  esse comportamento (`supabase-contas.test.ts:136-141`).
- Há fallbacks para os dados simulados no modo real (`pagina-sinais.tsx:125`, `conta-com-sinais.tsx:48,74`,
  `pagina-do-tipo.tsx:149`).
- A reativação só pega o estágio `fit` (`reativacao_de_sinais.sql:430`): as Contas em Descoberta nunca voltam a ser varridas.
- O estado "disponível" dos 9 actors foi gravado à mão no remoto; um banco novo ou o CI nasce com tudo `testing`.

**Envio**
- Uma Sequência só de WhatsApp/LinkedIn não se ativa pela tela (`detalhe-sequencia.tsx:882`). O diálogo mostra só os passos
  de e-mail, mas `activate_sequence` fixa os Destinos de chat sem mostrá-los (ADR-0014).
- O titular não vê as respostas de WhatsApp/LinkedIn: `list_received_chat_messages` não tem consumidor.
- Respostas sugeridas só existem para e-mail.
- Uma resposta `@lid` vinda de outro chat não se correlaciona, então a Sequência não pausa.
- O InMail provavelmente não sai como InMail (`send-chat-step.ts:330`).

**Agentes**
- `estado: 'ocioso'` e `execucoes: 0` são fixos (`supabase-agentes.ts:152-153`), e a Atividade está sempre vazia.
- A aba Rotinas deixa de avisar que elas não rodam, mas nada as executa.
- A síntese diz "Nenhuma Integração externa está conectada" (`runner.ts:341`) mesmo com as ferramentas ligadas.
- A Conversa aparece disponível com `AGENT_PROVIDER=hermes` mesmo com o worker desligado.

**Créditos e conexões**
- Ninguém chama `set_credits_enforced`: com a cobrança ligada, os Agentes rodam de graça.
- Os interruptores de Enriquecimento, Agentes e Integrações são gravados e ignorados; só a varredura respeita o teto.
- Assentos não acompanham os convites aceitos.
- É um Acesso por pessoa: a chave sobrescreve o OAuth, e o Enviar ao CRM só aceita chave.
- O RD Station não fixa o portal.
- Apollo e Meta estão como OAuth `dinamico`, mas exigem app pré-registrado; o Pipedrive tem MCP oficial e o perfil diz que
  não (pesquisa fca04d0).
- O backend de "Retirar a Integração" existe, mas a tela não tem o botão.

**Telas que dizem o contrário do que acontece**
- Configurações → Plano diz "só demonstrativos" com o Stripe ligado (texto travado por `perfil-e-preferencias-reais.test.tsx:527`).
- Configurações → Memória diz "Esses Agentes ainda não rodam".
- O interruptor de Avisos lista avisos que nunca disparam.

## 5. Contradições que pedem decisão

1. **Memória do Workspace × Playbook.**
   - O ADR-0010 e o `CONTEXT.md:67` dizem: só a versão vigente, só por proposta do Agente.
   - O `CONTEXT.md:150` e a migration do Playbook dizem: seções versionadas, Administrador edita direto.
   - As duas abas convivem em Configurações. Ficam presos nessa decisão: configuracoes 05/06, CRM-09 e agentes-em-conversa 05.
2. **Motor dos Agentes.**
   - O guia diz "o Hermes é o motor"; o remoto roda a ponte, provavelmente com Groq.
   - Há dois caminhos de execução, com prompts e laço de ferramenta duplicados.
   - O ADR-0018 está desatualizado: ainda diz que nenhum Agente age fora, e com a 5b o Agente envia ao CRM.
3. **Cobrança.**
   - Há duas chaves sem ligação entre si: `enforced` global e `credits_enforced` por Workspace.
   - O Workspace pessoal paga assinatura própria?
   - Falta definir o valor de `credits_per_seat`.
   - O ADR-0019 ainda promete sessão única (agora `wontfix`) e "sem uso grátis".
4. **Roleta × Caixa de Descobertas** (CRM-06): abandonar a roleta para recomendações ou fazer o aceite passar por ela?
5. **Quem decide Aprovações de ação:** o ADR-0010 diz qualquer participante; o `CONTEXT.md:329`, só o Administrador; a
   Demonstração deixa o Membro decidir.
6. **Quente e Aderência no real.** "Quente" é calculado em 3 lugares (o banco, `regras-sinais.ts:60` e o estágio do kanban),
   e a Aderência não é gravada em lugar nenhum.
7. **ADR-0019 × Apollo:** "o Apollo do cliente só traz o que ele já tem", mas há stubs na cascata e `match_person`/`enrich_organization` expostos aos Agentes.
8. **ADR-0016** diz que o HubSpot só lê, mas o Enviar ao CRM escreve. O Private App dá um token do portal, contra o
   ADR-0017 ("traz só o que eu enxergo").
9. **Catálogo de Conexões:** 27 apps na spec contra 4 viáveis no go-live (HubSpot, Pipedrive, RD, Notion).
10. **Seam de Canal** (revisão de 29/09): WhatsApp e LinkedIn entraram copiando o trilho do e-mail (RPCs irmãs, 8 funções
    redefinidas com filtro de canal, `runEmail`/`runChat`). Antes de mais canais ou do InMail, decidir se refatora.
11. **Sinais jurídicos:** nicho de um cliente. O DataJud veda uso comercial, e o modelo (Sinal de setor por Conta) contraria
    o ADR-0007.

## 6. Status a corrigir

| Spec | Ticket | Status atual | Deveria ser |
| --- | --- | --- | --- |
| agentes-em-conversa | 01–03 | ready-for-agent | closed |
| agentes-em-conversa | 04 | ready-for-agent | parcial (falta nome no `start_agent_run` e lista por Agente) |
| autenticacao | 03 | ready-for-human, "na branch" | já está na `main`; falta o Send Email Hook |
| autenticacao | 05–08 | "done" | rótulo fora do vocabulário |
| canais | 06, 07 | ready-for-agent | ready-for-human (backend pronto, falta tela e validação) |
| canais | 08, 09 | ready-for-agent | parciais (só e-mail) |
| canais | 11 | ready-for-agent | parcial |
| conexoes | 03, 08, 10, 12, 13 | ready-for-agent | ready-for-human |
| conexoes | 07 | ready-for-agent | parcial (falta a tela) |
| conexoes | 14, 17 | needs-triage | feitos por chave |
| creditos | 01–04, 08 | ready-for-agent | feitos (o 03 parcial) |
| crm | 09, 11 | ready-for-agent | superseded |
| crm | 25 | needs-info | closed |
| crm | 13 | ready-for-human | a migration já foi aplicada |
| enriquecimento | 01–03 | ready-for-agent | parciais |
| kanban | 01, 03 | ready-for-agent | closed |
| kanban | 02 | ready-for-agent | parcial |
| playbook | 01–03 | ready-for-agent | closed (o 03 com limitações) |
| sinais-reais | 01, 02, 07, 08 | ready-for-agent | closed |
| sinais-juridicos | 01 | ready-for-agent | ready-for-human (faltam os links) |
| várias | cabeçalho do `spec.md` | ready-for-agent | atualizar |

Specs com texto velho: `onboarding-pos-login` (ainda fala em Clerk), `sequencias` (Unipile fora; SMS e Ligação),
`contas-e-contatos` (Quente dentro da Aderência), `crm-real-e-stack` (Unipile v1, "sem Edge Function") e o ticket
canais-10 (multipart da v1). O `ORDEM-BUILD-FUNCIONAL.md` e o `RALPH-STATUS.md` estão superados pelo `GO-LIVE.md`.

## 7. Saúde do build

(preenchido abaixo, quando a rodada local das validações do CI terminar)
