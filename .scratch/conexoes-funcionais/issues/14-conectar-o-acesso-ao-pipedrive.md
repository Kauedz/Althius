# 14: Conectar o Acesso ao Pipedrive

**What to build:** o Pipedrive entra no catálogo real (categoria: CRM) e cada participante conecta o próprio Acesso pelo servidor MCP oficial do app (ADR-0017), quando houver um confirmado; sem servidor oficial, fica "Em breve" com o motivo.

**Blocked by:** 03: Conectar e desconectar o próprio Acesso ao HubSpot (o mecanismo); 01: pesquisa dos servidores MCP, estendida para este app.

**Status:** ready-for-human (código pronto: o Pipedrive conecta pelo servidor MCP oficial e pela chave de API; falta aplicar a migration, publicar as funções e a conferência real)

## Pode mexer

- A entrada no catálogo (`private.integration_catalog`, migration aditiva) e o Acesso no mecanismo do ticket 03.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Confirmar na documentação oficial se o app tem servidor MCP; registrar a fonte: `https://mcp.pipedrive.ai/mcp`, páginas oficiais do Pipedrive citadas em [`pesquisa-conectores-mcp-todos.md`](../pesquisa-conectores-mcp-todos.md) (fontes 7 a 10). O registro dinâmico do cliente OAuth não está confirmado.
- [x] O Pipedrive conecta pelos dois caminhos: autorização no app (`oauth_mcp`) e chave de API (`api_key`), e o primeiro Acesso continua fixando o portal (migration `20261002111000_catalogo_de_conectores.sql`, pgTAP `catalogo_de_conectores.sql`).
- [ ] Permissões Ler, Propor e Executar valem para o Agente; o que escreve ou gasta tem teto (`creditos-e-planos` 03).

## Comments

- **2026-10-02 (conectores genéricos, ticket 30).** O Pipedrive tem servidor MCP oficial (`https://mcp.pipedrive.ai/mcp`), mas a conexão por ele (migration e perfil do branch `worktree-agent-a54f74a388c9810d2`) não entrou: quebra `perfis.test.ts` (`SEED_DO_BANCO.pipedrive` só com `api_key`) e `integration-connect/handler.test.ts` (`iniciar` no Pipedrive responde 400), que não podem mudar. Segue pela chave de API, e os Agentes já usam as ferramentas REST dele pelo `usar_conector`, sob a permissão por ferramenta (ADR-0022). Detalhes no [ticket 30](./30-conectores-genericos-e-permissao-por-ferramenta.md).
- **2026-10-02 (catálogo ampliado, ticket 30).** Com o Nan de acordo em atualizar aqueles dois asserts, o MCP do Pipedrive entrou:
  - Banco: `20261002111000_catalogo_de_conectores.sql` acrescenta `oauth_mcp` aos `kinds` do Pipedrive (`pins_portal` segue `true`). A migration `20261002100000` do branch antigo não foi trazida; o mesmo `update` está na nova.
  - Perfil (`_shared/integracoes/perfis.ts`): servidor `https://mcp.pipedrive.ai/mcp`, registro dinâmico primeiro e os segredos `PIPEDRIVE_MCP_CLIENT_ID`/`PIPEDRIVE_MCP_CLIENT_SECRET` quando o servidor não aceitar; endereços de autorização e de token pela descoberta (RFC 9728/8414). A conta e o portal vêm de `/v1/users/me` com o token no cabeçalho ou, se a API REST recusar o token do MCP, da ferramenta `getAccountContext` (nome vindo do conector; os campos do resultado estão marcados como não confirmados). Testes novos: `perfis-pipedrive-mcp.test.ts` e `integration-connect/handler-pipedrive-mcp.test.ts`.
  - Asserts antigos mudados com autorização: `perfis.test.ts` (`SEED_DO_BANCO.pipedrive.kinds` passa a `['oauth_mcp', 'api_key']`) e `integration-connect/handler.test.ts` (o 400 de "a Integração sem o caminho pedido" usa `iniciar` no RD Station, que segue só com chave).
  - Tela: o cartão já monta os caminhos a partir dos `kinds`; o teste `conexoes-pipedrive-mcp.test.tsx` prova "Conectar no Pipedrive" com "Usar chave de API" como alternativa.
  - Não entrou o escritor específico do Pipedrive no Envio ao CRM (`a10aed0`): nada de código por app; o Envio ao CRM pela chave segue como está, e o caminho genérico é a fatia 4 do ticket 30.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Criar a conta de teste no app e autorizar o Acesso no navegador.
2. Aplicar a migration e publicar (ticket 30): aplicar `supabase/migrations/20261002110000_permissao_por_ferramenta.sql` conforme `docs/agents/migrations.md` (validar com rollback, rodar `scripts/pgtap-no-remoto.sh supabase/tests/permissao_por_ferramenta.sql`, aplicar e conferir o md5); depois `npx supabase functions deploy integration-tools agent-conversation crm-handoff integration-connect --project-ref ycbdilsmydvzezhlymty` e `npx supabase functions deploy integration-callback --no-verify-jwt --project-ref ycbdilsmydvzezhlymty`.
3. Aplicar `supabase/migrations/20261002111000_catalogo_de_conectores.sql` (o agente principal aplica, conforme `docs/agents/migrations.md`, com `scripts/pgtap-no-remoto.sh supabase/tests/catalogo_de_conectores.sql`) e publicar de novo `integration-connect` e `integration-callback` (comandos do passo 2).
4. Conferir no navegador `https://mcp.pipedrive.ai/.well-known/oauth-protected-resource` e o metadado do servidor de autorização que ele indica: se houver `registration_endpoint`, nada a fazer. Se não houver, criar o app OAuth no Developer Hub do Pipedrive com a URL de retorno `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback` e gravar, digitando o valor só no terminal:
   `npx supabase secrets set PIPEDRIVE_MCP_CLIENT_ID=<valor> --project-ref ycbdilsmydvzezhlymty` e `npx supabase secrets set PIPEDRIVE_MCP_CLIENT_SECRET=<valor> --project-ref ycbdilsmydvzezhlymty`.
5. Conferência real: em Conexões, habilitar o Pipedrive, clicar "Conectar no Pipedrive", autorizar e ver a conta e o portal no cartão; abrir "Ver ferramentas" e conferir a lista do servidor. Se a conta não aparecer, anotar o resultado de `getAccountContext` para ajustar os campos do perfil.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
