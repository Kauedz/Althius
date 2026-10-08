# 24: Onboarding no Workspace operacional

**What to build:** religar `/onboarding`, desligado pelo ticket 01 no Workspace operacional, com persistência no backend. O criador sem convite faz o Day0 e o checklist no seu Workspace pessoal. O convidado faz o ramo de convidado no Workspace do convite. Os fluxos e telas seguem a [spec de onboarding](../../onboarding-pos-login/spec.md), com as regras da [spec de autenticação](../../autenticacao-google-email/spec.md).

**Blocked by:** Auth-02: [Workspace pessoal criado no primeiro acesso](../../autenticacao-google-email/issues/02-workspace-pessoal-no-primeiro-acesso.md) (substitui o CRM-02); 03: Convidar e gerenciar participantes.

**Status:** needs-info (nada começou; antes de um agente pegar, o Nan decide as quatro perguntas dos Comments de 2026-10-07)

- [ ] Papel e HDYHAU pertencem à Conta de usuário e são perguntados uma única vez, qualquer que seja o Workspace.
- [ ] Empresa, domínio do site, logo, mini-ICP, base de Personas e progresso do checklist pertencem ao Workspace em que o Day0 foi feito.
- [ ] A empresa informada no Day0 não renomeia o Workspace pessoal nem cria Workspace da empresa. Ela pode apenas sugerir o nome na ação do ticket 22.
- [ ] Um Workspace da empresa recém-criado (ticket 22) oferece a seu Administrador o Day0 de empresa e o checklist.
- [ ] O convidado pula empresa e domínio e não altera os dados de empresa do Workspace que recebeu.
- [ ] Reabrir ou atualizar a página retoma o progresso salvo sem duplicar Workspace nem refazer passos concluídos.
- [ ] Enquanto não houver backend real de leitura do site, ela aparece como indisponível e os campos ficam vazios e editáveis. Nenhuma leitura fixa da Demonstração entra no Workspace operacional.

## Proposta a validar na triagem

- A divisão entre dados da Conta de usuário e dados do Workspace acima.
- O que fica no Workspace pessoal de um convidado que nunca fez Day0 nele: checklist disponível, mas não obrigatório.
- A relação entre o mini-ICP do onboarding e o ICP da Memória do Workspace (ticket 09): se o mini-ICP vira o ICP vigente ou continua sendo só a base do checklist.

## Comments

- 2026-10-07 (triagem contra a `main` 59e53a6): os sete critérios estão em aberto. No Workspace operacional, `/onboarding` redireciona para `/` (`src/App.tsx:58`), porque `onboarding` está em `indisponiveis` (`src/fonte/composicao.ts:89`), e a Fonte é `criarFonteDeOnboardingIndisponivel()` (`composicao.ts:123`). O teste "/onboarding mostra que o módulo está indisponível, sem dados da Demonstração" (`src/raiz.test.tsx`) trava isso. Nenhuma migration tem onboarding, HDYHAU ou checklist; `private.user_profiles` (`20260928111856_perfil_e_preferencias.sql:8`) só tem nome e foto. Os bloqueios técnicos (Auth-02, crm-real-e-stack 03 e 22) estão fechados.
  - Perguntas ao Nan:
    1. A divisão entre a Conta de usuário (papel, HDYHAU) e o Workspace (empresa, domínio, logo, mini-ICP, Personas, checklist) vale como está na proposta acima?
    2. No Workspace pessoal de quem entrou por convite, o checklist fica disponível e opcional?
    3. O mini-ICP vira o ICP vigente, ou só a base do checklist? Hoje há três candidatos: a Memória do Workspace (ADR-0010), as seções `icp` e `personas` do Playbook (`20260930090500_playbook_do_workspace.sql:13-16`) e o crm-real-e-stack 09. É a contradição 1 da auditoria (Memória × Playbook).
    4. A empresa do Day0 só sugere o nome (o 22 está fechado, e a sugestão por domínio do 23 está em `needs-info`)?
  - Depois das respostas, o ticket precisa de "Pode mexer", "Não mexa", plano de testes e Passos do Nan. A spec `onboarding-pos-login/spec.md` ainda cita Clerk 5 vezes.
