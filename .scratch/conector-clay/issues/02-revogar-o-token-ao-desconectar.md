# 02: Revogar o token no app ao desconectar o próprio Acesso

**What to build:** "Desconectar" passa pela Edge Function `integration-connect` (`action: 'desconectar'`). Para um Acesso por OAuth, ela revoga o refresh token e o access token no servidor de autorização quando ele anuncia `revocation_endpoint` (RFC 7009), com o cliente OAuth do Acesso, e depois apaga o Acesso por uma RPC de serviço. Se a revogação falhar, o Acesso é apagado do mesmo jeito, e a tela mostra um aviso. Vale para todo conector por OAuth (Clay, Notion, Calendly...). O Acesso por chave de API só é apagado.

**Blocked by:** nenhum.

**Status:** ready-for-human (código e testes prontos; falta aplicar, publicar e conferir com conta real no ticket 04)

- [x] `revogarToken` em `oauth.ts`, e `revocation_endpoint` lido na descoberta (https e mesmo host do emissor).
- [x] `desconectarAcesso` em `integration-access.ts`: revoga e depois apaga; nunca devolve token.
- [x] RPC `public.disconnect_integration_access_for_user(workspace, user, integration)`, só `service_role`, que confere a Participação ativa e apaga só o Acesso daquela pessoa, com pgTAP. A RPC antiga, chamada pelo navegador, continua existindo.
- [x] `integration-connect` com `action: 'desconectar'` → `{ desconectado, revogadoNoApp }`.
- [x] A Fonte de Conexões real chama a Edge Function e devolve o aviso; a tela mostra o aviso sem tratá-lo como erro.

## Pode mexer
- `supabase/functions/_shared/integracoes/oauth.ts`, `_shared/integration-access.ts`, `_shared/integracoes/banco-supabase.ts`, `integration-connect/handler.ts` e testes
- `supabase/migrations/<novo>_desconectar_revoga_no_app.sql`, `supabase/tests/desconectar_revoga_no_app.sql`
- `projeto-althius-frontend/src/fonte/conexoes-tipos.ts`, `supabase-conexoes.ts`, `src/paginas/conexoes.tsx`, `src/test/conexoes-no-banco.ts` e testes

## Não mexa
- `disable_workspace_integration` (retirar a Integração; a revogação ali é follow-up), as funções da Unipile e das Contas remetentes.

## Comments

**19/10/2026 (agente, branch `conector-clay-funcional`).**
- Testes escritos antes do código, todos vermelhos antes e verdes depois:
  - `oauth.test.ts`: lê `revocation_endpoint` só se for https; a revogação manda `token` e `token_type_hint` com Basic ou `client_id`; 4xx vira `recusado` e 5xx vira `indisponivel`, sem o token na mensagem.
  - `integration-access-desconectar.test.ts` (8 casos): revoga o refresh e o access token e depois apaga; apaga mesmo com a revogação recusada ou fora do ar; sem endpoint, `nao_suportado`; com outro emissor, o token não sai; sem o cliente que emitiu, não revoga; chave de API e Acesso sem token só apagam; sem Acesso, `desconectado: false`; Integração retirada apaga, Participação inativa recusa.
  - `handler-desconectar.test.ts`: o `userId` do corpo é ignorado (vale o JWT), o token não vai à resposta nem ao log, 403 com Participação inativa e 503 sem o banco dos Acessos.
  - pgTAP `desconectar_pelo_servidor.sql` (9): só `service_role`; apaga só o Acesso do Bruno; o segredo dele sai do Vault; de novo devolve falso; outro Workspace e Participação inativa são recusados; não exige habilitação.
- **Testes antigos do app alterados** (`conexoes-notion.test.tsx`, `conexoes-acessos.test.tsx`). O dublê de desconectar saiu da RPC `disconnect_integration_access` e foi para a Edge Function, e a asserção do pedido passou a esperar `{ action: 'desconectar', workspaceId, integrationId }`. O comportamento verificado (o cartão volta a "não conectou", e o outro Acesso continua) não mudou. Nenhum pgTAP antigo foi alterado.
- A RPC antiga `disconnect_integration_access` continua e não muda: o app publicado até o próximo deploy ainda a usa.
- **Revogação: só "best effort" por desenho.** Rede, 5xx ou recusa não impedem desconectar, e a tela mostra o aviso (print `03-aviso-revogacao.jpg`). O HubSpot fixa endpoints no perfil e não passa pela descoberta, então devolve `nao_suportado`, sem aviso.
- **Fora daqui (follow-up):** retirar a Integração (`disable_workspace_integration`) e desativar uma Participação apagam ou invalidam Acessos sem revogar no app.
