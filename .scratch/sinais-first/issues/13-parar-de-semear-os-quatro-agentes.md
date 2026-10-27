# 13: Parar de semear os quatro Agentes

**Status:** ready-for-agent

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Migration só aditiva: redefine `private.seed_default_agents` a partir da última definição na `main` (`20261122130400_habilitar_whatsapp_em_conexoes.sql`), sem `drop function`, sem apagar linha de Workspace existente. Migration já aplicada nunca é editada. Sem aplicar no remoto, sem deploy, sem segredo.

**Blocked by:** 10 (Esconder os quatro Agentes da interface), 11 (Sequência sem exigir o Rhetor)

**Decisões:** D9(c) (parar `seed_default_agents` para Workspace novo é o terceiro passo da retirada) da ADR-0033.

## O que construir

- `private.seed_default_agents(p_workspace_id uuid)` para de criar as 4 linhas de Agente padrão (Scopus, Ethos, Rhetor, Oraculum) para Workspaces novos. A função continua existindo (não é apagada — a retirada de schema é o ticket 15), só deixa de ser chamada com efeito, ou passa a não inserir nada, conforme o desenho mais simples e reversível.
- Workspaces que já têm os 4 Agentes continuam com eles, sem mudança: este ticket só afeta a criação de Workspace novo.
- **Auditoria de dependência**, antes de desligar: várias funções fora do gate de Sequência buscam o Agente padrão com `specialty = 'rhetor'` (ou outra Especialidade) por outro motivo — o teto das Propostas de resposta (`private.reply_proposal_cap_scopes`, `private.automation_scope_runs`), a ordem de espera no envio ao CRM (`private.crm_handoff_waits_for_agents`), as Rotinas que rodam sozinhas (`private.schedule_agent_routine` e funções de automação) e a análise de resposta pela IA (as funções de `20261205120000_analise_de_resposta_pela_ia.sql`). Este ticket escreve um teste para cada uma delas rodando num Workspace **sem nenhum Agente padrão**, confirmando que o resultado é "nada a fazer"/"automação indisponível" (um caminho já prudente que essas funções deveriam ter), nunca um erro não tratado. Uma função que quebrar vira um achado documentado nos Comments deste ticket, para o dono da área (Kauê, nas que forem dele) decidir o ajuste — não é corrigida silenciosamente por este ticket se o ajuste genuíno cair em arquivo do Kauê.

## Pode mexer

- Migration nova que redefine `private.seed_default_agents` e pgTAP cobrindo "Workspace novo nasce sem os 4 Agentes" e "Workspace existente não perde os que já tinha".
- Testes novos (pgTAP ou Deno, conforme a função) que exercitam as funções listadas acima contra um Workspace sem Agente padrão, sem alterar o código delas além do que for estritamente necessário para não quebrar.

## Não mexa

- `private.specialty_catalog` e `private.protect_default_agent`: a retirada de schema é o ticket 15, por último.
- O código das funções de teto de Propostas de resposta, envio ao CRM, Rotinas e análise de resposta pela IA, **a menos que** o teste deste ticket mostre uma quebra real (erro não tratado); nesse caso, se o arquivo for do Kauê (teto das Propostas de resposta e análise de resposta pela IA estão na área dele), o ajuste fica fora deste ticket, registrado nos Comments com "**Kauê:** precisa de aprovação do Kauê" para um ticket à parte.
- Migrations já aplicadas.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.
- O motor dos Agentes e o worker do Hermes.

## Critérios

- [ ] Um Workspace criado depois desta migration nasce sem nenhum dos 4 Agentes padrão.
- [ ] Um Workspace que já tinha os 4 Agentes antes da migration continua com eles, sem alteração.
- [ ] Os quatro pontos de risco auditados (teto de Propostas de resposta, envio ao CRM, Rotinas, análise de resposta pela IA) têm teste cobrindo o caso "Workspace sem Agente padrão", com resultado seguro (sem erro não tratado).
- [ ] Qualquer quebra encontrada na auditoria está documentada nos Comments, com o arquivo e se precisa de aprovação do Kauê.
- [ ] pgTAP: isolamento por Workspace; três `supabase db reset && supabase test db` verdes.
- [ ] Deno, Vitest, lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration.

## Comments
