# 32: Retirar a Integração revoga os Acessos no app

**What to build:** follow-up do 07 (`retirar a Integração do Workspace`) e do `conector-clay` 02. Hoje desconectar o próprio Acesso já revoga o token no app do fornecedor (quando o conector sabe revogar), mas retirar a Integração do Workspace (`disable_workspace_integration`) e desativar uma Participação só apagam ou invalidam os Acessos no banco, sem revogar no app. Fazer a retirada da Integração passar pelo mesmo caminho de revogação: para cada Acesso afetado, tentar revogar no app com o revogador do conector, registrar o resultado (revogado / não suportado / falhou) e só então invalidar o Acesso. Falha de revogação não impede a retirada: o Acesso é invalidado e a falha fica registrada para a pessoa ver.

**Blocked by:** 07 (closed) e `conector-clay` 02 (revogação no desconectar, em `main`).

**Status:** ready-for-agent (criado em 2026-10-25 a partir do follow-up registrado no `conector-clay/issues/02` e no 07).

## Pode mexer
- `supabase/functions/_shared/integracoes/*`, `supabase/functions/_shared/integration-access.ts`, a Edge Function que hoje executa o desconectar com revogação (reaproveitar), migration NOVA aditiva se precisar de RPC/coluna de registro, testes Deno e pgTAP, e a tela de Conexões só para mostrar o resultado.

## Não mexa
- `unipile-*`, `sender-accounts`, contas remetentes, Sinais, sequência. Não feche a RPC antiga `disconnect_integration_access` (é outro follow-up, depende de deploy).
- Sem chamadas reais a fornecedores nos testes: use o fake/seam já usado nos testes de revogação.
- Desativar Participação fica FORA deste ticket se exigir mudar o fluxo de membros; registre como follow-up.

## Critérios
- [ ] Retirar a Integração tenta revogar no app cada Acesso ativo daquela Integração no Workspace, pelo mesmo revogador do desconectar (Deno, com fake).
- [ ] Revogação que falha ou não é suportada não impede a retirada; o resultado fica registrado e o Acesso deixa de valer (Deno/pgTAP).
- [ ] Só Administrador retira; Membro continua sem conseguir, nem por chamada direta (pgTAP existente segue verde; acrescentar caso se a rota for nova).
- [ ] Nenhum token aparece em log, resposta ou registro.
- [ ] pgTAP, deno check/test e frontend (se tocado) verdes.
