# 11: Sequência sem exigir o Rhetor

**Kauê:** precisa de aprovação do Kauê (mexe em RPCs de banco consumidas por `sequence-runner` e por `ferramentas-dos-agentes.ts`: `private.agent_propose_sequence` e `private.agent_read_sequence_contacts`, definidas em `20261105100000_sequencia_proposta_pelo_rhetor.sql`, sem redefinição posterior; e `public.agent_suggest_althius_sequence_template` (`20261107120000_templates_althius_de_sequencia.sql`) e `public.agent_suggest_own_sequence_template` (`20261108120000_templates_proprios_de_sequencia.sql`), que têm o mesmo travão de `specialty = 'rhetor'`, não uma redefinição das duas primeiras).

**Status:** ready-for-agent

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Migration só aditiva: redefine (`create or replace function`) as quatro RPCs a partir da última definição de cada uma na `main` — `private.agent_propose_sequence` e `private.agent_read_sequence_contacts` a partir de `20261105100000_sequencia_proposta_pelo_rhetor.sql` (não têm redefinição posterior), `public.agent_suggest_althius_sequence_template` a partir de `20261107120000_templates_althius_de_sequencia.sql` e `public.agent_suggest_own_sequence_template` a partir de `20261108120000_templates_proprios_de_sequencia.sql` — sem `drop table`, `truncate` nem `delete` de linha. Migration já aplicada nunca é editada. Sem aplicar no remoto, sem deploy, sem segredo.

**Blocked by:** 10 (Esconder os quatro Agentes da interface) — só depois de a interface não oferecer mais criar/usar um Agente Rhetor é seguro tirar a exigência de que o proponente seja especificamente ele.

**Decisões:** D3 (a escrita de Sequência vira passo interno) e D9(b) (desacoplar o Rhetor é o segundo passo da retirada) da ADR-0033.

## O que construir

- As quatro RPCs que hoje recusam a chamada com `if v_agent.specialty <> 'rhetor' then raise exception` deixam de exigir essa Especialidade nomeada: `private.agent_read_sequence_contacts()`, `private.agent_propose_sequence()` (ambas de `20261105100000_sequencia_proposta_pelo_rhetor.sql`), `public.agent_suggest_althius_sequence_template()` (`20261107120000_templates_althius_de_sequencia.sql`) e `public.agent_suggest_own_sequence_template()` (`20261108120000_templates_proprios_de_sequencia.sql`) — as duas últimas sugerem um modelo de Sequência, não propõem uma, mas têm o mesmo travão e fazem parte do mesmo fluxo; deixá-las de fora faria "propor Sequência" continuar preso ao Rhetor pela porta da sugestão de modelo. A checagem de permissão passa a valer para qualquer Agente autorizado pela Permissão correta (Propor, [ADR-0002](../../../docs/adr/0002-permissoes-ler-propor-executar.md)), em vez de travar numa Especialidade nomeada.
- O comportamento de produto não muda para quem usa o Rhetor hoje enquanto ele ainda existir como linha em `private.agents` (até a retirada de schema do ticket 15): continua podendo propor e sugerir Sequência. O que muda é que a exigência de Especialidade sai do código — a trava vira "tem Permissão de Propor em Sequência", não "é o Rhetor".
- `pedir-sequencia-ao-rhetor.tsx` (a tela que hoje busca especificamente `a.especialidade.id === 'rhetor' && a.tipo === 'padrao'` e abre uma Conversa com esse Agente, navegando para `/agentes/:agenteId/conversa`) é ajustada para não depender de encontrar esse Agente especificamente. **Decisão de implementação em aberto (regra 15 da spec), isolada e fácil de trocar:** este ticket não pode fazer esse botão continuar abrindo `/agentes/:agenteId/conversa`, porque essa rota já é só-leitura desde o ticket 10 (sem caixa de novo pedido, sem continuar Conversa); o caminho novo (chamar a proposta de Sequência direto, sem depender de uma tela de Conversa de Agente) é desenho deste ticket, documentado no próprio PR, não decidido por esta spec.

## Pode mexer

- Migration nova que redefine (`create or replace function`) as quatro RPCs acima, cada uma a partir da sua última versão na `main`, e pgTAP correspondente em `supabase/tests/`.
- `projeto-althius-frontend/src/paginas/pedir-sequencia-ao-rhetor.tsx`, com testes, para parar de localizar o Agente proponente pela Especialidade e para não depender da rota só-leitura do ticket 10.

## Não mexa

- `send-chat-step*`, `sequence-runner`, `reply-proposal-*`, `unipile-*`, `detalhe-sequencia*`, `supabase-sequencias*`, `motivos-do-envio.ts`: arquivos do Kauê. Este ticket só redefine as quatro RPCs citadas acima, sem tocar nesses arquivos; qualquer ajuste que pareça necessário neles fica fora deste ticket, registrado nos Comments para o Kauê decidir.
- `supabase/functions/_shared/ferramentas-dos-agentes.ts`: consome `agent_suggest_althius_sequence_template` e `agent_suggest_own_sequence_template`, mas não é editado por este ticket — só o corpo das RPCs muda, e isso vale sem precisar publicar essa Edge Function de novo nem reiniciar o worker do Hermes; por isso **Hermes: não** continua correto aqui, mesmo as RPCs sendo consumidas por um arquivo que o worker usa.
- As outras funções que também buscam `specialty = 'rhetor'` por outro motivo (teto das Propostas de resposta, ordem de espera no envio ao CRM, Rotinas que rodam sozinhas, análise de resposta pela IA): ficam de fora deste ticket — são auditadas no ticket 13, antes de parar a semeadura.
- Migrations já aplicadas.
- `private.specialty_catalog`, `private.protect_default_agent`, `private.seed_default_agents`: não mudam aqui.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.
- O motor dos Agentes e o worker do Hermes.

## Critérios

- [ ] Propor ou sugerir um modelo de Sequência não depende mais de o Agente ter `specialty = 'rhetor'`, em nenhuma das quatro RPCs; depende só da Permissão de Propor em Sequência.
- [ ] Um Agente sem essa Permissão continua recusado, com a mesma mensagem de erro de hoje adaptada (sem citar Especialidade), nas quatro RPCs.
- [ ] O comportamento para quem já usa o Rhetor hoje não regride: propor e sugerir Sequência continuam funcionando enquanto a linha dele existir.
- [ ] `pedir-sequencia-ao-rhetor.tsx` não abre mais a rota só-leitura `/agentes/:agenteId/conversa` do ticket 10 para propor uma Sequência.
- [ ] pgTAP: a recusa por falta de Permissão continua coberta nas quatro RPCs; isolamento por Workspace; três `supabase db reset && supabase test db` verdes.
- [ ] Deno, Vitest, lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão e da aprovação do Kauê sobre o cabeçalho. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration e publica as Edge Functions tocadas.

## Comments

- 26/10/2026: `.scratch/cadencia-pela-ia/issues/01-rhetor-propoe-a-sequencia.md` (e as notas de handoff dos PRs abertos #287 e #288) descrevem o travão do Rhetor como regra. A partir da ADR-0033 (D3), esse travão é o que este ticket retira; aqueles textos ficam como histórico e não devem ser lidos como requisito.
