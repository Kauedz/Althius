# 05: Esqueci a senha

**What to build:** uma Conta de usuário que esqueceu a senha pede a redefinição em `/esqueci-a-senha`, confirma com código ou link, define uma nova senha e as outras sessões são encerradas. Também é o caminho para quem só tem Google definir uma senha.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 03: Cadastro com nome, e-mail e senha, e verificação por código; 04: Entrar com senha ou com código.

**Status:** ready-for-agent

- [ ] O pedido responde de forma genérica, exista ou não a conta.
- [ ] O e-mail traz código de 6 dígitos e link; os dois levam à definição da nova senha.
- [ ] A nova senha segue a mesma política do cadastro (mínimo de 8, medidor, mostrar/ocultar).
- [ ] Após a troca, as outras sessões da Conta de usuário são encerradas e a pessoa entra no Workspace de entrada.
- [ ] Testes de raiz cobrem pedido genérico, redefinição por código e encerramento das outras sessões.
