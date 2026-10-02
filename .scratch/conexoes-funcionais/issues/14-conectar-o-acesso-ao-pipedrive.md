# 14: Conectar o Acesso ao Pipedrive

**What to build:** o Pipedrive entra no catálogo real (categoria: CRM) e cada participante conecta o próprio Acesso pelo servidor MCP oficial do app (ADR-0017), quando houver um confirmado; sem servidor oficial, fica "Em breve" com o motivo.

**Blocked by:** 03: Conectar e desconectar o próprio Acesso ao HubSpot (o mecanismo); 01: pesquisa dos servidores MCP, estendida para este app.

**Status:** needs-triage

## Pode mexer

- A entrada no catálogo (`private.integration_catalog`, migration aditiva) e o Acesso no mecanismo do ticket 03.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Confirmar na documentação oficial se o app tem servidor MCP; registrar a fonte.
- [ ] Permissões Ler, Propor e Executar valem para o Agente; o que escreve ou gasta tem teto (`creditos-e-planos` 03).

## Comments

- **2026-10-02 (conectores genéricos, ticket 30).** O Pipedrive tem servidor MCP oficial (`https://mcp.pipedrive.ai/mcp`), mas a conexão por ele (migration e perfil do branch `worktree-agent-a54f74a388c9810d2`) não entrou: quebra `perfis.test.ts` (`SEED_DO_BANCO.pipedrive` só com `api_key`) e `integration-connect/handler.test.ts` (`iniciar` no Pipedrive responde 400), que não podem mudar. Segue pela chave de API, e os Agentes já usam as ferramentas REST dele pelo `usar_conector`, sob a permissão por ferramenta (ADR-0022). Detalhes no [ticket 30](./30-conectores-genericos-e-permissao-por-ferramenta.md).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Criar a conta de teste no app e autorizar o Acesso no navegador.
2. Aplicar a migration e publicar (ticket 30): aplicar `supabase/migrations/20261002110000_permissao_por_ferramenta.sql` conforme `docs/agents/migrations.md` (validar com rollback, rodar `scripts/pgtap-no-remoto.sh supabase/tests/permissao_por_ferramenta.sql`, aplicar e conferir o md5); depois `npx supabase functions deploy integration-tools agent-conversation crm-handoff integration-connect integration-callback --project-ref ycbdilsmydvzezhlymty`.
3. Para ligar o MCP: o Nan concorda em atualizar aqueles dois asserts; então trazer a migration `20261002100000_pipedrive_pelo_mcp.sql` e o perfil daquele branch. Se o servidor não anunciar registro dinâmico, criar o app OAuth no Developer Hub do Pipedrive e gravar `PIPEDRIVE_MCP_CLIENT_ID` e `PIPEDRIVE_MCP_CLIENT_SECRET`.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
