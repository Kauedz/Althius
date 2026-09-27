# 09: Entrar por convite

**What to build:** quem abre um convite para um Workspace da empresa se cadastra ou entra com o e-mail do convite já preenchido e travado, e ao terminar cai no Workspace da empresa, mantendo também seu Workspace pessoal.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 03: Cadastro com nome, e-mail e senha, e verificação por código; 07: Continuar com Google; CRM-03: [Convites e participantes](../../crm-real-e-stack/issues/03-convites-e-participantes.md).

**Status:** ready-for-agent

- [ ] O convite abre `/cadastro` (ou `/entrar`, se a conta existe) com o e-mail travado e o aviso "Este convite é para fulano@empresa.com".
- [ ] O destino do convite é preservado entre as rotas, durante a verificação e no retorno do Google.
- [ ] No Google, conta com outro e-mail não aceita o convite: a tela explica e oferece escolher outra conta, sem criar Participação.
- [ ] Após aceitar, a entrada vai para o Workspace da empresa; o Workspace pessoal continua no seletor.
- [ ] Testes de raiz cobrem e-mail travado, destino preservado e divergência de e-mail no Google.

## Comments

- 2026-09-27 (CRM-03): o backend e o aceite já existem. O link do convite é `/convite/<token>` (`ROTA_DO_CONVITE` e `tokenDoConviteNoEndereco` em `src/auth/destino.ts`); `workspace_invitation_preview(token)` devolve, sem login, o e-mail convidado, o nome do Workspace e o papel de um convite pendente (dos demais, só o estado), para travar o e-mail. A entrada aceita o convite depois do bootstrap (`src/auth/aplicativo.tsx`, `aceitarConvite` em `src/fonte/supabase-participantes.ts`) e já explica a recusa por outro e-mail, sem criar Participação. "Criar conta" em `/entrar` leva o destino ao cadastro; o e-mail travado, o retorno do Google com o destino e "Esqueci a senha" ficam para este ticket.
