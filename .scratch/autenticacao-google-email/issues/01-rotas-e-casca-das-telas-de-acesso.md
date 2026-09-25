# 01: Rotas e casca visual das telas de acesso

**What to build:** quem abre a Althius sem sessão chega em `/entrar`, uma tela com a identidade da Althius: tela dividida no desktop (formulário de um lado, marca e proposta de valor do outro) e coluna única no celular a partir de 360px. O formulário de link por e-mail que já existe passa a morar nessa casca, e o acesso à Demonstração continua disponível. O comportamento de login não muda; o ticket prepara o terreno para `/cadastro` e `/esqueci-a-senha`, que hoje não podem existir porque as rotas só são montadas depois que a pessoa está dentro de um Workspace.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Visitante sem sessão é levado a `/entrar`; um endereço protegido acessado sem sessão volta para ele depois do login.
- [ ] A casca das telas de acesso tem layout dividido no desktop e coluna única sem cortes nem rolagem lateral a partir de 360px, e aceita qualquer formulário de acesso.
- [ ] O login por link atual funciona igual dentro da casca.
- [ ] O acesso à Demonstração continua a partir de `/entrar`, com selo e dados isolados.
- [ ] Os testes de raiz existentes continuam passando; um teste novo cobre visitante sem sessão → `/entrar`.
