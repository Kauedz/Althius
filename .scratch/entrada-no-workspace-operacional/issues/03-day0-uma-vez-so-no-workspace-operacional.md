# 03: Day0 uma vez só no Workspace operacional (primeira fatia do onboarding operacional)

Spec: [../spec.md](../spec.md) (US 7–9). Ticket pai: [crm-real-e-stack/24](../../crm-real-e-stack/issues/24-onboarding-no-workspace-operacional.md).

**What to build:** no Workspace operacional, quem ainda não fez o Day0 é levado a `/onboarding` uma vez; ao concluir (ou pular), o progresso fica no backend e a Casca nunca mais força o onboarding, nem depois de recarregar ou entrar de outro navegador. O convidado pula as perguntas da empresa. Só papel, HDYHAU, empresa e conclusão; o checklist completo e o mini-ICP ficam para o resto do crm-real-e-stack/24.

**GATE:** uma migration aditiva com pgTAP, sem aplicar no remoto; sem deploy; sem dados da Demonstração no operacional.

**Blocked by:** None (decisões do Renan nos Comments; rodar depois do 01 por causa da `raiz`).

**Status:** ready-for-human (implementado e verificado localmente; migration pendente de apply pelo Nan)

**Quem faz:** agente de código depois das decisões; Nan aplica a migration. **Esforço:** M.

## Pode mexer

- migration nova (estado do onboarding por Conta de usuário e por Workspace, RLS por Participação) e o pgTAP dela
- `projeto-althius-frontend/src/fonte/` uma Fonte de onboarding Supabase nova, `composicao.ts` só para tirar `onboarding` de `indisponiveis` quando a Fonte existir
- `projeto-althius-frontend/src/paginas/onboarding/` com testes Vitest novos

## Não mexa

- `simulada-onboarding.ts` e a Demonstração
- `raiz.tsx` (ticket 01), Supabase Auth

## Critérios

- [x] Primeira entrada sem Day0 → `/onboarding`; depois de concluir ou pular, a Casca abre direto
- [x] Recarregar ou entrar de outro navegador não pede o Day0 de novo (estado no backend)
- [x] Papel e HDYHAU são da Conta de usuário e perguntados uma vez, em qualquer Workspace
- [x] Empresa é do Workspace; o convidado pula essas perguntas e não altera a empresa
- [x] Nada cria nem renomeia Workspace (ADR-0025)
- [x] pgTAP: outro participante não lê o estado de onboarding alheio
- [x] lint, `tsc -b`, vitest e pgTAP do zero verdes

## Como testar

- `supabase test db` (CI Banco) e `npx vitest run --maxWorkers=2 src/paginas/onboarding`
- Playwright com sessão falsa: entrar, concluir o Day0, recarregar → Casca.

## Evidência (auditoria, vertical A)

- `composicao.ts:90-91,136`: `onboarding` sempre em `indisponiveis`; Fonte `criarFonteDeOnboardingIndisponivel()`.
- `indisponivel.ts:102-127`: `ler` e ações lançam `ErroDeModuloIndisponivel('onboarding')`.
- `entrada-na-casca.tsx:13`: só redireciona com estado lido; no operacional nunca redireciona.

## Passos do Nan

- Aplicar a migration pelo fluxo de `docs/agents/migrations.md`; deploy do frontend; entrar com uma conta de teste, fazer o Day0, recarregar e conferir.

## Comments

- 2026-10-17 (auditoria): perguntas que destravam, herdadas do crm-real-e-stack/24 e agora para o Renan:
  1. Papel e HDYHAU na Conta de usuário; empresa, domínio e logo no Workspace: vale?
  2. "Pular" conta como concluído (nunca mais força) ou só adia até a próxima sessão?
  3. A empresa do Day0 só preenche o Workspace que o staff criou (ADR-0025), sem renomear?
  4. O mini-ICP fica fora desta fatia (vai com o crm-real-e-stack/24 e o Playbook)?
- 2026-10-17, decisão do Renan (dúvida 1 da fila): (1) sim, papel e HDYHAU na Conta de usuário, perguntados uma vez; empresa, domínio e logo no Workspace. (2) "Pular" conta como concluído: nunca mais força o Day0; o que falta fica para o checklist. (3) sim, a empresa só preenche o Workspace que o staff criou, sem renomear. (4) mini-ICP fora desta fatia. Destravado.

- 2026-10-24 (entrada-03, Codex): implementada a primeira fatia operacional conforme as decisões do Renan de 2026-10-17. Respostas pessoais globais, empresa por Workspace e conclusão por Conta + Workspace persistidas na migration nova `20261121130000_day0_operacional.sql`. Pular também conclui; convidado (inclusive Administrador por convite aceito) não informa nem altera empresa. Nenhum Workspace criado/renomeado. Fonte Supabase conectada à composição e tela operacional sem convites/checklist/mini-ICP; o acesso ao Day0 já concluído informa que o checklist completo está indisponível. A Casca aguarda a leitura e oferece nova tentativa em caso de erro.
- 2026-10-24 (evidência): vermelho pgTAP inicial: `get_my_day0` inexistente; verde final: `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_e03 supabase/tests/day0_operacional.sql` → 32/32. `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_e03_full` → 153 arquivos verdes, banco recriado do zero. Node 22: `npx vitest run --maxWorkers=2 src/paginas/onboarding src/fonte/regras-onboarding.test.ts` → 57/57; `npx oxlint` e `npx tsc -b` → exit 0 (avisos de lint preexistentes). Sem Edge Functions alteradas. Revisão Standards/Spec: nenhum achado pendente; usada a comparação de trabalho, pois `git diff origin/main...HEAD` está vazio neste sandbox sem commits.
- 2026-10-24 (navegador): Chrome/CDP com harness temporário fora do repo, componentes operacionais reais e respostas RPC falsas mantidas no servidor do harness, sem Auth real. Conferidos redirecionamento inicial, preenchimento, recarga no domínio, conclusão, recarga na Casca e reabertura do resumo concluído. [Desktop](prints/03-papel-desktop.jpg), [mobile 360 px](prints/03-papel-mobile.jpg), [Day0 concluído](prints/03-concluido-mobile.jpg). O harness usa um destino de Casca mínimo; autenticação e publicação reais seguem nos passos do Nan.
- 2026-10-24 (entrega): sem commit/push/deploy/apply remoto e sem acesso a `.env*`, conforme instrução explícita do sandbox. Corpo do PR em `/tmp/entrada-03-pr.md`; handoff em `.scratch/handoffs/entrada-03.md`. Os ACs marcados refletem verificação local; a conferência com conta real exige aplicar a migration e publicar depois.
