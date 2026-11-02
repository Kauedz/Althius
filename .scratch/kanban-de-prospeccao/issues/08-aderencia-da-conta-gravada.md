# 08: Aderência da Conta-alvo gravada

**What to build:** a Conta-alvo passa a ter Aderência gravada (Fit, Não fit ou ainda sem avaliação), com quem avaliou (a pessoa ou o Scopus), quando e um motivo curto. Gravar Fit leva o cartão a Fit; gravar Não fit leva a Descartada.

**Blocked by:** 01 e 02 (fechados). Decisão de 2026-11-02 no ticket [07](07-ligar-fit-e-reuniao.md).

**Status:** ready-for-agent

## Contexto

`CONTEXT.md`: Aderência é "a classificação de encaixe de uma Conta-alvo no ICP pelo Scopus: Fit ou Não fit"; Conta importada fica sem Aderência até ser avaliada; Sinal torna a Conta Quente sem decidir o encaixe. Na `main` (dca7e3bf) nada disso é gravado: `public.target_accounts` não tem o campo, a Fonte de Contas real não preenche `aderencia` (o tipo `Aderencia = 'fit' | 'nao-fit'` em `fonte/contas-tipos.ts` e o `SeloDeAderencia` só têm dado na Demonstração), e o Scopus não tem ferramenta que grave. O `fit_level` de `private.discovered_accounts` é outra coisa (nota das empresas descobertas) e não entra aqui.

## Desenho

- **Banco (migration aditiva):** tabela `private.account_fit` (uma linha por Conta: `workspace_id`, `target_account_id`, `fit` em `fit|nao_fit`, `reason`, `decided_by_kind` em `pessoa|agente`, `decided_by_user`, `decided_by_agent`, `decided_at`) e o histórico de cada mudança, no mesmo molde do estágio (ticket 01). Sem linha = sem avaliação; nenhum backfill.
- **Quem grava:**
  - `public.set_account_fit(conta, fit, motivo)`: só o Vendedor responsável pela Conta, com Participação ativa (ADR-0009, como `move_prospecting_stage`).
  - `private.agent_set_account_fit(...)` para o Scopus, sob a Permissão do Agente (Propor → Aprovação; Executar → grava). Ferramenta nova em `supabase/functions/_shared/ferramentas-dos-agentes.ts`, `especialidades: ['scopus']`.
- **Evento:** gravar chama `private.record_prospecting_event(..., 'fit' | 'nao_fit')`. O gancho já faz o resto: Fit não volta cartão que já passou de Fit; Não fit descarta em qualquer estágio. Mudar de Não fit para Fit depois não tira da Descartada (Descartada só sai à mão, ticket 01).
- **Leitura:** `list_account_fits` (participante ativo do Workspace) para a Fonte de Contas.
- **Tela:** a Fonte de Contas real preenche `aderencia`; no detalhe da Conta, o Vendedor responsável escolhe Fit / Não fit com o motivo; o selo aparece no cartão do kanban e na tabela, como já aparece na Demonstração. Não fit pede confirmação ("o cartão vai para Descartada").

## Pode mexer

- Migration aditiva (tabela, funções, histórico) e pgTAP novo.
- `supabase/functions/_shared/ferramentas-dos-agentes.ts` (ferramenta nova do Scopus) e o teste Deno dela.
- `projeto-althius-frontend/src/fonte/supabase-contas.ts`, `contas-tipos.ts`, `paginas/detalhe-conta.tsx`, `paginas/kanban-de-contas.tsx` e testes novos.

## Não mexa

- Em `private.discovered_accounts`, no `fit_level` dela e nas funções de descoberta (frente de Sinais/ICP, `desfazer-sinais-first`).
- Em `private.record_prospecting_event` e `private.advance_prospecting_stage` sem partir da última definição na `main`.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Só o Vendedor responsável ativo grava pela tela; outro Workspace não alcança a Conta; valor fora de Fit/Não fit é recusado.
- [ ] O Scopus grava em Executar; em Propor, nada é gravado sem Aprovação.
- [ ] Gravar Fit leva a Fit (sem voltar cartão adiantado); gravar Não fit leva a Descartada; os dois ficam no histórico do estágio com o evento.
- [ ] O histórico da Aderência guarda quem, quando e o motivo.
- [ ] O selo aparece na tabela e no cartão com o dado real; Conta sem avaliação mostra "sem avaliação".

## Decisões a confirmar (com padrão recomendado)

- **Quem avalia:** recomendado, a pessoa responsável e o Scopus. Alternativa: só o Scopus, com a pessoa podendo corrigir.
- **Motivo obrigatório para Não fit:** recomendado, sim (é o que explica a Descartada).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration conforme `docs/agents/migrations.md` (validar com rollback, rodar o pgTAP novo pelo `scripts/pgtap-no-remoto.sh`, aplicar e conferir o md5).
2. Publicar a função que serve as ferramentas dos Agentes (`npx supabase functions deploy agent-conversation --project-ref ycbdilsmydvzezhlymty`) e, com o Hermes, atualizar e reiniciar o worker.
3. Conferência visual no navegador (a IA faz e anexa os prints).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- 2026-11-02: aberto pela decisão do dono do produto no ticket 07 (Aderência vira dado gravado).
- 2026-11-02: decisões confirmadas pelo dono do produto: avaliam a pessoa responsável e o Scopus; motivo obrigatório para Não fit. Como não existe Permissão do Agente fora das Integrações (`private.agent_permissions` exige `integration_id`), o Scopus **sempre propõe**: nasce uma Aprovação da categoria `aderencia`, que só o Vendedor responsável decide (o mesmo molde de `propor_sequencia`), e aprovar grava. Isso redefine `decide_approval`, `cancel_approval` e `list_approvals` a partir da última definição da `main`, e a fila de Aprovações passa a mostrar a categoria.
