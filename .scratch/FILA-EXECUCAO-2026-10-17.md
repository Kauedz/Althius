# Fila de execução — 2026-10-17

Origem: [AUDITORIA-TOTAL-2026-10-17.md](./AUDITORIA-TOTAL-2026-10-17.md) (`origin/main` 1aff4ce). Althius é um Revenue OS de prospecção B2B (Sinais → enriquecimento → Sequências).
Toda IA passa pelo Hermes (`AGENT_PROVIDER=hermes`, decisão do Renan); o worker hoje roda na máquina do Nan.

Donos: **agente** = agente de código · **Nan** = deploy/ops/tickets do Nan · **Renan** = produto, revisão, validação, contas.
Esforço: P (horas) · M (1–2 dias) · G (vários dias). Status segue `docs/agents/triage-labels.md` (+ `blocked`).
"Novo" = criado nesta rodada; o resto é ticket ou PR que já existia (não recriado).

## Onda 1 — primeira Cadência de e-mail e app do Cliente

Login real, onboarding uma vez só, Conversa dos Agentes, Sequência pela IA.

| # | Ticket | Status | Dono | Depende de | Esforço |
|---|---|---|---|---|---|
| 1.1 | [suite-verde/01 Conversa coordenada volta após recarregar](./suite-verde/issues/01-conversa-coordenada-volta-apos-recarregar.md) (novo) | ready-for-agent | agente | — | P |
| 1.2 | [entrada/01 Abrir na tela de entrada, não no Modo Protótipo](./entrada-no-workspace-operacional/issues/01-abrir-na-tela-de-entrada-e-nao-no-prototipo.md) (novo) | ready-for-agent | agente | — | P |
| 1.3 | [entrada/02 Google só quando o botão existe](./entrada-no-workspace-operacional/issues/02-google-so-quando-o-botao-existe.md) (novo) | ready-for-agent | agente | — | P |
| 1.4 | [conversas/03 Selo do Agente coerente com as Conversas](./conversas-pelo-hermes/issues/03-selo-do-agente-coerente-com-as-conversas.md) (novo) | ready-for-agent | agente | — | P |
| 1.5 | [autenticacao-google-email/10 Google Cloud, SMTP, Turnstile em produção](./autenticacao-google-email/issues/10-configurar-ambiente-e-verificar.md) | ready-for-human | Nan + Renan | — | M |
| 1.6 | [conversas/01 Ligar as Conversas em produção](./conversas-pelo-hermes/issues/01-ligar-as-conversas-em-producao.md) (novo) | ready-for-human | Nan | — | P |
| 1.7 | [conversas/02 Conversas só disponíveis com o motor no ar](./conversas-pelo-hermes/issues/02-conversas-so-disponiveis-com-o-motor-no-ar.md) (novo) | ready-for-agent | agente | 1.1 (mesmo arquivo `supabase-conversas.ts`) | M |
| 1.8 | [motor-hermes/02 Worker do Hermes 24/7 na VPS](./motor-hermes/issues/02-ligar-o-hermes-no-contrato-do-banco.md) | ready-for-human | Nan | — | G |
| 1.9 | PR #227 descadastro, variáveis, lote, Propostas pelo Hermes ([tickets](https://github.com/Kauedz/Althius/pull/227)) | ready-for-human | Renan revisa · Kauedz faz merge · Nan aplica | — | M |
| 1.10 | PR #230 UI da criação em lote (base #227) | ready-for-human | Renan revisa · Kauedz | 1.9 | P |
| 1.11 | PR #228 rótulo do status público da Sequência | ready-for-human | Renan revisa · Kauedz | — | P |
| 1.12 | [canais-cadencia-backend/20 Jornada mínima por e-mail em produção](./canais-cadencia-backend/issues/20-jornada-minima-por-email-em-producao.md) (novo) | ready-for-human | Nan | 1.9 | M |
| 1.13 | [cadencia/01 Rhetor propõe a Sequência por Aprovação](./cadencia-pela-ia/issues/01-rhetor-propoe-a-sequencia.md) (novo) | blocked | agente | 1.9 em `main` | M |
| 1.14 | [cadencia/02 Sequência proposta aparece na Conversa](./cadencia-pela-ia/issues/02-sequencia-proposta-aparece-na-conversa.md) (novo) | blocked | agente | 1.13, 1.7 (`supabase-conversas.ts`) | M |
| 1.15 | [entrada/03 Day0 uma vez só no Workspace operacional](./entrada-no-workspace-operacional/issues/03-day0-uma-vez-so-no-workspace-operacional.md) (novo, fatia 1 do [crm-real-e-stack/24](./crm-real-e-stack/issues/24-onboarding-no-workspace-operacional.md)) | ready-for-agent | agente | 1.2 (`raiz` testada) | M |
| 1.16 | Conectar a caixa de e-mail como Conta remetente | ready-for-human | Renan | 1.12 | P |
| 1.17 | [cadencia/03 Primeira Cadência de e-mail de ponta a ponta](./cadencia-pela-ia/issues/03-primeira-cadencia-de-email-ponta-a-ponta.md) (novo) | blocked | Renan (+ Nan) | 1.6, 1.8, 1.9–1.14, 1.16 | P |

### Lotes paralelos da Onda 1 (máx. 3 por vez, sem conflito de arquivos)

- **Lote A (já):** 1.1 (`conversas-reais.test.tsx`, `supabase-conversas.ts`) · 1.2 (`raiz.tsx`, `raiz.test.tsx`) · 1.4 (`marca.tsx`, `agentes.tsx`, `agente.tsx`, `casca.tsx`).
- **Lote B:** 1.3 (`auth/tela-de-entrada.tsx`*, `botao-do-google.tsx`, `vite.config.ts`) · 1.7 (worker, `agent-conversation`, `supabase-conversas.ts`, `ambiente.ts`, `aplicativo.tsx`) · 1.13 quando o #227 entrar (`ferramentas-dos-agentes.ts`, `executor-de-aprovacoes.ts`).
  *1.2 também toca `tela-de-entrada.tsx` (só o link "Ver a Demonstração"): por isso 1.3 vem depois do Lote A.
- **Lote C:** 1.14 · 1.15 (`fonte/` onboarding nova, `composicao.ts`, `paginas/onboarding/`) · [suite-verde/02](./suite-verde/issues/02-testes-dos-sinais-no-workspace-operacional.md) (só testes novos).
- Nan e Renan (1.5, 1.6, 1.8–1.12, 1.16) não disputam arquivos; correm em paralelo aos lotes.

## Onda 2 — funcional em todas as verticais

| # | Ticket | Status | Dono | Depende de | Esforço |
|---|---|---|---|---|---|
| 2.1 | [sinais/01 Conferir o que está disponível em produção](./sinais-no-workspace-operacional/issues/01-conferir-o-que-esta-disponivel-em-producao.md) (novo) | ready-for-human | Nan | — | P |
| 2.2 | [prospeccao-funcional/A3 Actors validados disponíveis](./prospeccao-funcional/issues/A3-actors-validados-disponiveis.md) | ready-for-agent | Nan | 2.1 | M |
| 2.3 | [crm-real-e-stack/11 Coletar Sinais externos com Apify](./crm-real-e-stack/issues/11-coletar-sinais-externos-com-apify.md) | ready-for-agent | Nan | 2.2 | G |
| 2.4 | [conexoes/01 "Seu acesso" × "No Workspace" no card](./conexoes-clareza-do-acesso/issues/01-seu-acesso-e-o-workspace-no-card.md) (novo) | ready-for-agent | agente | — | P |
| 2.5 | [conexoes-funcionais/07 Retirar a Integração do Workspace](./conexoes-funcionais/issues/07-retirar-a-integracao-do-workspace.md) | ready-for-agent | Nan | — | M |
| 2.6 | [conexoes-funcionais/10 Apollo](./conexoes-funcionais/issues/10-conectar-o-acesso-ao-apollo.md), [11 Clay](./conexoes-funcionais/issues/11-conectar-o-acesso-ao-clay.md), [12 Lusha](./conexoes-funcionais/issues/12-conectar-o-acesso-ao-lusha.md), [13 Meta Ads](./conexoes-funcionais/issues/13-conectar-o-acesso-ao-meta-ads.md) | ready-for-agent / ready-for-human (11) | Nan | — | M cada |
| 2.7 | [conexoes-funcionais/09 Validação real com HubSpot](./conexoes-funcionais/issues/09-wizard-e-validacao-real-com-hubspot.md) e [03](./conexoes-funcionais/issues/03-conectar-o-proprio-acesso-ao-hubspot.md) | ready-for-human | Renan (diz que HubSpot e Apollo funcionam desde 2026-10-16: marcar) | — | P |
| 2.8 | [kanban-de-prospeccao/04 Critérios de passagem](./kanban-de-prospeccao/issues/04-criterios-de-passagem.md) | ready-for-agent | Nan | — | M |
| 2.9 | [crm-real-e-stack/09 ICP e Personas aprovados](./crm-real-e-stack/issues/09-icp-e-personas-aprovados.md) | ready-for-human | Nan | — | P |
| 2.10 | [crm-real-e-stack/18 Arquivar e apagar dados comerciais](./crm-real-e-stack/issues/18-arquivar-e-apagar-dados-comerciais.md) | ready-for-agent | Nan | — | P |
| 2.11 | Cotação da revelação: `begin_reveal_contact`/`quote_reveal_contact` recusam telefone ([B3, pendência](./prospeccao-funcional/issues/B3-revelar-email.md)) | ready-for-human | Nan | — | P |
| 2.12 | [prospeccao-funcional/B1](./prospeccao-funcional/issues/B1-cnpj-receita-sessao-e-credito.md), [B2](./prospeccao-funcional/issues/B2-comite-entrada-do-actor.md), [S1](./prospeccao-funcional/issues/S1-aceite-autoriza-antes-de-devolver.md) (aplicar migrations) | ready-for-human | Nan | — | P |
| 2.13 | [enriquecimento-em-cascata/02 Comitê de compra](./enriquecimento-em-cascata/issues/02-coleta-do-comite-de-compra.md) e [03 Revelar e-mail e telefone](./enriquecimento-em-cascata/issues/03-revelar-email-e-telefone.md) | ready-for-agent | agente | 2.11 (03) | M |
| 2.14 | PR #223 Atividade do Agente e Canais pelo Slack | ready-for-human | Renan revisa · Kauedz | — | P |
| 2.15 | PR #48 / [conexoes-funcionais/02 Catálogo real](./conexoes-funcionais/issues/02-catalogo-real-e-habilitacao.md) | ready-for-human | Renan + Nan | — | M |
| 2.16 | [slack-canal/06 Conversa do Slack na Althius](./slack-canal/issues/06-conversa-do-slack-na-althius.md) | ready-for-agent | agente | 1.7 e 1.14 (`supabase-conversas.ts`) | M |
| 2.17 | [crm-real-e-stack/24 Onboarding operacional completo](./crm-real-e-stack/issues/24-onboarding-no-workspace-operacional.md) (resto, depois da fatia 1.15) e [playbook-do-workspace/04](./playbook-do-workspace/issues/04-secao-empresa-no-onboarding.md) | needs-info | agente | 1.15 | G |
| 2.18 | [acesso-e-planos/07 Tela do Plano](./acesso-e-planos/issues/07-tela-plano.md) e 01–09 (validação humana) | ready-for-human | Renan | — | M |
| 2.19 | [crm-real-e-stack/14](./crm-real-e-stack/issues/14-executar-conversas-e-coordenacao.md), [agentes-em-conversa/02](./agentes-em-conversa/issues/02-cada-agente-com-a-propria-vez.md), [05](./agentes-em-conversa/issues/05-agente-propoe-mudar-o-playbook.md) (Passos do Nan) | ready-for-human | Nan | 1.6 | P |

Lotes de agente da Onda 2 (máx. 3): **D** = 2.4 (`conexoes.tsx`) · 2.13 (`account-enrichment`, `supabase-contas.ts`) · 2.16 (Conversas/Slack). Os tickets do Nan (2.2, 2.3, 2.5, 2.6, 2.8, 2.10) seguem a ordem dele; 2.5 e 2.6 tocam a mesma área de Conexões que 2.4: rodar 2.4 antes ou depois, não junto.

## Onda 3 — qualidade

| # | Ticket | Status | Dono | Depende de | Esforço |
|---|---|---|---|---|---|
| 3.1 | [suite-verde/02 Testes dos Sinais no operacional](./suite-verde/issues/02-testes-dos-sinais-no-workspace-operacional.md) (novo) | ready-for-agent | agente | — (pode adiantar para o Lote C) | M |
| 3.2 | [suite-verde/03 Caminho do Cliente, da entrada à Conversa](./suite-verde/issues/03-caminho-do-cliente-da-entrada-a-conversa.md) (novo) | blocked | agente | 1.2, 1.4, 1.15 | M |
| 3.3 | [canais-cadencia-backend/12 Validação completa com contas reais](./canais-cadencia-backend/issues/12-validacao-completa-contas-reais.md), [06 WhatsApp](./canais-cadencia-backend/issues/06-ciclo-real-whatsapp.md), [07 LinkedIn](./canais-cadencia-backend/issues/07-ciclo-real-linkedin.md) | ready-for-human | Renan + Nan | 1.17 | M |
| 3.4 | [cascatas-confiabilidade 01–05](./cascatas-confiabilidade/issues/) e [auditoria-de-sinais-2026-10-13 01–02](./auditoria-de-sinais-2026-10-13/issues/) | ready-for-human | Nan | 2.2 | M |
| 3.5 | [creditos-moeda-unica 01–09](./creditos-moeda-unica/issues/) | ready-for-human | Renan (produto) | — | G |
| 3.6 | [orquestracao/03](./orquestracao/issues/03-execucoes-presas-ou-com-falha.md), [04](./orquestracao/issues/04-auditoria-a-prova-de-adulteracao-e-quarentena.md), [05](./orquestracao/issues/05-isolamento-do-hermes-por-workspace.md) | needs-triage / blocked | Renan decide · agente | 1.8 | G |
| 3.7 | [conexoes-funcionais 15–29](./conexoes-funcionais/issues/) (pesquisa MCP) | needs-triage | Renan triagem | 2.15 | G |
| 3.8 | PR #229 status dos tickets em `.scratch` | ready-for-human | Renan revisa · Kauedz | — | P |
| 3.9 | [canais-althius 01–19](./canais-althius/issues/) (WhatsApp da Althius; grilling em andamento) | ready-for-human / ready-for-agent | Renan + agente | decisões do grilling | G |

## Decisões do Renan (2026-10-17)

As 8 dúvidas desta fila foram respondidas; cada uma está nos Comments do ticket.

1. **Onboarding (1.15):** papel e HDYHAU na Conta de usuário, uma vez só; empresa, domínio e logo no Workspace que o staff criou, sem renomear. "Pular" conta como concluído. Mini-ICP fora da fatia. 1.15 → ready-for-agent.
2. **Default do app (1.2):** confirmado como no ticket.
3. **Motor fora do ar (1.7):** Conversas indisponíveis com aviso; não enfileirar.
4. **Sequência pelo Rhetor (1.13):** confirmado: aprovar cria sem Versão autorizada, envio só no "Ativar envios".
5. **Apollo na cascata:** fica fora; Apollo só pelas Conexões dos Agentes.
6. **motor-hermes:** o ticket do Nan é o [02](./motor-hermes/issues/02-ligar-o-hermes-no-contrato-do-banco.md).
7. **Jornada mínima por e-mail:** virou o [canais-cadencia-backend/20](./canais-cadencia-backend/issues/20-jornada-minima-por-email-em-producao.md), dono Nan.
8. **[crm-real-e-stack/25](./crm-real-e-stack/issues/25-avaliar-hermes-como-motor-dos-agentes.md):** fechado, Hermes.

## Andamento

- 2026-10-17: Lote A (1.1, 1.2, 1.4) em execução, um agente por ticket; PRs saem pelo fork `nanztnn/Althius` para `Kauedz/althius`.
