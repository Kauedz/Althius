# 23: Sugerir Workspace da empresa pelo domínio do e-mail

**What to build:** quem entra com e-mail corporativo verificado vê a sugestão "Quer entrar na [empresa]?" para o Workspace da empresa associado ao mesmo domínio. A sugestão ajuda a pedir o convite, mas não concede Participação. Critérios na [spec de autenticação](../../autenticacao-google-email/spec.md).

**Blocked by:** 03: Convidar e gerenciar participantes; 22: Criar Workspace da empresa.

**Status:** needs-info

- [ ] A sugestão usa somente o e-mail verificado da pessoa e um domínio validado do Workspace da empresa.
- [ ] Domínios públicos de e-mail (Gmail, Yahoo, Hotmail e similares) nunca geram sugestão.
- [ ] A sugestão mostra só o nome da empresa, sem dados internos do Workspace.
- [ ] Sem convite válido, a interface informa que um Administrador precisa convidá-la. Nenhuma Participação é criada nem aceita implicitamente.
- [ ] A pessoa pode dispensar a sugestão e continuar no pessoal ou criar seu próprio Workspace da empresa.

## Pergunta em aberto

Como um Workspace da empresa passa a ter um domínio validado? O domínio digitado no Day0 não prova controle. Opções:

- (a) um Administrador confirma o domínio do próprio e-mail verificado;
- (b) verificação por registro DNS.

Decidir antes de mudar para `ready-for-agent`.
