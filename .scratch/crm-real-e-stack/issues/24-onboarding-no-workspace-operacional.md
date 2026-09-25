# 24: Onboarding no Workspace operacional

**What to build:** religar `/onboarding`, desligado pelo ticket 01 no Workspace operacional, com persistência no backend. O criador sem convite faz o Day0 e o checklist no seu Workspace pessoal. O convidado faz o ramo de convidado no Workspace do convite. Os fluxos e telas seguem a [spec de onboarding](../../onboarding-pos-login/spec.md), com as regras da [spec de autenticação](../../autenticacao-google-email/spec.md).

**Blocked by:** 02: Cadastrar e criar o Workspace pessoal; 03: Convidar e gerenciar participantes.

**Status:** needs-triage

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
