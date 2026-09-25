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
