# 01: Rotas e casca visual das telas de acesso

**What to build:** quem abre a Althius sem sessão chega em `/entrar`, uma tela com a identidade da Althius: tela dividida no desktop (formulário de um lado, marca e proposta de valor do outro) e coluna única no celular a partir de 360px. O formulário de link por e-mail que já existe passa a morar nessa casca, e o acesso à Demonstração continua disponível. O comportamento de login não muda; o ticket prepara o terreno para `/cadastro` e `/esqueci-a-senha`, que hoje não podem existir porque as rotas só são montadas depois que a pessoa está dentro de um Workspace.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** None (can start immediately).

**Status:** closed

- [x] Visitante sem sessão é levado a `/entrar`; um endereço protegido acessado sem sessão volta para ele depois do login.
- [x] A casca das telas de acesso tem layout dividido no desktop e coluna única sem cortes nem rolagem lateral a partir de 360px, e aceita qualquer formulário de acesso.
- [x] O login por link atual funciona igual dentro da casca.
- [x] O acesso à Demonstração continua a partir de `/entrar`, com selo e dados isolados.
- [x] Os testes de raiz existentes continuam passando; um teste novo cobre visitante sem sessão → `/entrar`.

## Comments

**2026-09-25:** implementado. O destino fica na URL (`/entrar?destino=…`) e também volta pelo link do e-mail; destinos fora da origem levam ao início. Layout conferido no navegador a 1440px e a 360px, sem rolagem lateral. Abrir `/entrar` num navegador sem escolha anterior mostra a tela de acesso; outros endereços continuam abrindo a Demonstração por padrão no protótipo. Para o Auth-03 e o Auth-05: `destinoDepoisDoAcesso` só lê o destino em `/entrar` e precisa valer também em `/cadastro` e `/esqueci-a-senha`.
