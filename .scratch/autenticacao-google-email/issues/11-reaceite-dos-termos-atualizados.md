# 11: Reaceite dos Termos atualizados

**What to build:** decidir e construir o que acontece com quem já aceitou os Termos de Uso e a Política de Privacidade quando eles ganham uma versão nova.

Spec: [Cadastro e login com Google, senha ou código](../spec.md).

**Blocked by:** 10: Configurar o ambiente e verificar, porque os Termos ainda nem foram publicados.

**Status:** needs-triage

## Situação atual

- Há um aceite por Conta de usuário. O bootstrap do Workspace pessoal grava a versão e a data no primeiro acesso.
- A migration `20260925170000` fez o bootstrap nunca sobrescrever um aceite existente, para não registrar como aceita uma versão que a pessoa não viu.
- Com isso, uma versão nova dos Termos nunca é registrada para quem já tinha conta. Não há tela de reaceite nem histórico de aceites.

## Opções levantadas na sabatina de 2026-09-25

- **(a) Reaceite explícito.** Uma tela "Termos atualizados" bloqueia até a pessoa aceitar, com histórico de aceites (várias linhas por Conta de usuário).
- **(b) Aceite passivo no próximo login,** com aviso.

A decisão ficou para antes da primeira mudança dos Termos.

## Comments

- 2026-09-25: aberto a partir da Q6 da sabatina de prioridades. A decisão fica com o responsável pelo produto, antes da primeira mudança dos Termos.
