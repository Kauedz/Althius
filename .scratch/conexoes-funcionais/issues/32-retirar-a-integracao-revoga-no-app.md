# 32: Retirar a Integração revoga os Acessos no app

**What to build:** follow-up do 07 (`retirar a Integração do Workspace`) e do `conector-clay` 02. Hoje desconectar o próprio Acesso já revoga o token no app do fornecedor (quando o conector sabe revogar), mas retirar a Integração do Workspace (`disable_workspace_integration`) e desativar uma Participação só apagam ou invalidam os Acessos no banco, sem revogar no app. Fazer a retirada da Integração passar pelo mesmo caminho de revogação: para cada Acesso afetado, tentar revogar no app com o revogador do conector, registrar o resultado (revogado / não suportado / falhou) e só então invalidar o Acesso. Falha de revogação não impede a retirada: o Acesso é invalidado e a falha fica registrada para a pessoa ver.

**Blocked by:** 07 (closed) e `conector-clay` 02 (revogação no desconectar, em `main`).

**Status:** ready-for-human (código e verificações locais prontos; falta aplicar a migration e publicar a Edge Function para conferir com um app conectado).

## Pode mexer
- `supabase/functions/_shared/integracoes/*`, `supabase/functions/_shared/integration-access.ts`, a Edge Function que hoje executa o desconectar com revogação (reaproveitar), migration NOVA aditiva se precisar de RPC/coluna de registro, testes Deno e pgTAP, e a tela de Conexões só para mostrar o resultado.

## Não mexa
- `unipile-*`, `sender-accounts`, contas remetentes, Sinais, sequência. Não feche a RPC antiga `disconnect_integration_access` (é outro follow-up, depende de deploy).
- Sem chamadas reais a fornecedores nos testes: use o fake/seam já usado nos testes de revogação.
- Desativar Participação fica FORA deste ticket se exigir mudar o fluxo de membros; registre como follow-up.

## Critérios
- [x] Retirar a Integração tenta revogar no app cada Acesso daquela Integração no Workspace, pelo mesmo revogador do desconectar (Deno, com fake).
- [x] Revogação que falha ou não é suportada não impede a retirada; o resultado fica registrado e o Acesso deixa de valer (Deno/pgTAP).
- [x] Só Administrador retira; Membro continua sem conseguir, nem por chamada direta (pgTAP existente e novo caminho de serviço).
- [x] Nenhum token aparece em log, resposta ou registro.
- [x] pgTAP, Deno das Edge Functions e frontend verdes.

## Comments

**2026-10-25 (Codex).** A ação de retirar agora passa pela `integration-connect`, reaproveita o revogador do desconectar em cada Acesso e só então invalida tudo. Falha e ausência de suporte ficam registradas sem token e são mostradas ao próprio participante em Conexões mesmo depois de recarregar. A RPC antiga de retirada não está mais disponível para `authenticated`, para impedir o desvio do revogador; a operação final usa RPC exclusiva de `service_role` com validação de Administrador ativo.

- Testes fake cobrem revogação de todos os Acessos, falha best-effort, recusa de Membro, logs e respostas sem tokens. Nenhuma chamada real a fornecedor foi feita.
- Follow-up registrado: revogar no app os Acessos quando uma Participação é desativada; ficou fora deste ticket para não alterar o fluxo de membros.
- pgTAP específico: `retirar_integracao_revoga_acessos.sql` 10/10. Suíte inteira: `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_lu2_conexoes_32` passou.
- Deno: `deno test -A supabase/functions` passou (1.847 testes), `deno check supabase/functions/integration-connect/index.ts` passou. A invocação literal `deno test -A` na raiz também foi tentada e coleta testes do frontend fora da configuração DOM, falhando com erros de tipos preexistentes; por isso a suíte de funções foi rodada no caminho correto.
- Frontend: teste direcionado de Conexões passou (12/12); suíte completa passou (228 arquivos, 1.989 testes, 4 ignorados). A primeira execução teve dois timeouts transitórios em `revelar-email-em-lote.test.tsx`, que passou isolado (4/4); a repetição completa passou. `npm run lint` e `npx tsc -b` passaram; lint mantém avisos já existentes em outras áreas.
- O teste de conexão/revogação com fornecedor real fica pendente verificação humana após aplicar migration e publicar `integration-connect`.
