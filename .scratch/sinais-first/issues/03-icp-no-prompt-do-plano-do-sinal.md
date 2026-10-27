# 03: ICP no prompt do Plano do Sinal

**Status:** ready-for-human

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Migration só aditiva, com pgTAP próprio; migration já aplicada nunca é editada, função existente redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo.

**Blocked by:** 01 (ICP estruturado único)

**Decisões:** D5 (o `signal-plan` usa o ICP como contexto) da ADR-0033; não muda nenhuma decisão da ADR-0032 (o Plano continua precisando de aprovação humana, decisão 2 do corpo da Decisão, "Só o Plano aprovado roda, nunca o texto livre").

## O que construir

- A Edge Function `signal-plan` (que já transforma Briefing em Plano, ADR-0032 ticket 01, hoje na `main`) passa a receber o ICP estruturado único do Workspace (ticket 01) como contexto adicional do prompt, para que um pedido como "empresas de SaaS" já parta do setor/porte/geografia do próprio ICP do Cliente, em vez de exigir que a pessoa repita isso no Briefing.
- O ICP é contexto, não instrução: o servidor continua validando o Plano contra as fontes disponíveis e os limites, do jeito que já faz hoje; o ICP nunca escolhe fonte, preço ou limite sozinho — só ajuda a IA a preencher critérios razoáveis quando o Briefing não os dá.
- Sem ICP estruturado ainda preenchido (Workspace novo, ou que recusou a semeadura), o `signal-plan` funciona exatamente como hoje, sem esse contexto extra — este ticket nunca pode quebrar o fluxo de quem não tem ICP ainda.

## Pode mexer

- `supabase/functions/signal-plan/` (o módulo que monta o prompt, ex. `planejador-por-ia.ts`), só para incluir o contexto do ICP.
- A RPC de leitura do ICP do ticket 01 (só leitura, sem mudar seu contrato).
- Deno test do `signal-plan` cobrindo com e sem ICP preenchido.

## Não mexa

- As RPCs `begin_signal_plan_request` / `finish_signal_plan_request`, a validação de Plano (`private.validate_signal_plan`) e os limites de 20 Planos por dia: continuam como estão, só ganham um dado de entrada a mais.
- Arquivos do Kauê listados na spec.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.
- Migrations já aplicadas.
- O motor dos Agentes e o worker do Hermes; o `SIGNALS_LLM_PROVIDER` continua sendo o único motor configurado, sem nomear modelo nem guardar chave nova.

## Critérios

- [ ] Com ICP preenchido, o Plano proposto pela IA reflete setor/porte/geografia do ICP quando o Briefing não os especifica. **Pendente verificação humana com provedor real**; o teste local confirma que esses campos chegam ao prompt, sem chamar fornecedor real.
- [x] Sem ICP preenchido, o `signal-plan` continua funcionando como hoje, sem erro nem Plano vazio por falta desse contexto (Deno test).
- [x] O Briefing continua sendo dado não confiável: um Briefing que tenta contradizer o ICP não muda fonte, preço ou limite fora do que o servidor valida (Deno test e validação existente conferida).
- [x] Deno test do `signal-plan` com e sem ICP; `deno check` limpo.
- [x] pgTAP não se aplica: nenhuma função de apoio foi criada; o ticket reutiliza a RPC de leitura existente do ticket 01.
- [ ] CI verde nos três jobs. **Pendente verificação humana**; Vitest, lint e build não se aplicam porque nenhuma tela foi alterada.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot publica `signal-plan` e, se houver migration, confere o md5 do arquivo antes.

## Comments

- 2026-10-25 — `signal-plan` passou a ler o ICP vigente pela RPC autenticada `get_my_workspace_icp` e a incluí-lo como dado contextual no prompt da IA; falhas/ausência da leitura mantêm o caminho sem ICP. Incluídos testes Deno com e sem ICP e para Briefing/ICP hostis, preservando a validação de tipo, escopo e limite no servidor. Verificações: `deno test -A supabase/functions/signal-plan` (26 testes) e `deno check supabase/functions/signal-plan/index.ts` passaram. `deno test -A` na raiz falhou ao incluir testes Vitest do frontend como testes Deno; sem alteração de frontend. Sem migration. A confirmação com provedor real e CI seguem pendentes de verificação humana.
