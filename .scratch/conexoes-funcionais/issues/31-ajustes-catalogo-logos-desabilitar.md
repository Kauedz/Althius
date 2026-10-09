# 31 — Logos, catálogo e desabilitação de Integrações

Status: ready-for-human
Type: task
Dependência: PR da branch `ralph/conexoes-08-notion` precisa entrar na `main` primeiro.

## Pode mexer

Cartões e confirmação de Conexões; Fontes real e simulada e seus contratos; catálogos usados por Conexões, Agentes e automação; testes do app, cliente falso, migration nova e pgTAP; este ticket e prints. Renan autorizou atualizar as expectativas antigas de catálogo nesta execução.

## Não mexa

Migrations antigas; Desconectar o próprio Acesso; regras de Agentes, Aprovações e Conversas; outros worktrees `Althius-*`; arquivos sem commit do `.scratch` principal; banco remoto, Auth, deploy e db push.

## Implementação

- **Logos:** `LogoDaIntegracao` no cabeçalho dos cartões operacionais e da Demonstração. Testes conferem HubSpot e Notion pela interface.
- **Catálogo:** migration aditiva `20261009132551_conexoes_catalogo_disponivel.sql` acrescenta `available boolean not null default true`, marca os outros ids como indisponíveis e filtra `list_workspace_integrations`. Nenhuma linha é apagada. `catalogoDeIntegracoes` oferece os dois apps; `catalogoDeIntegracoesDosAgentes` preserva referências completas para Agentes e automação. A Fonte simulada de Conexões não oferece Integrações futuras. O tipo `IntegracaoId` permanece completo.
- **Desabilitar:** a base já contém `disable_workspace_integration` em `20261001160000_acessos_as_integracoes.sql`. Reutilizada sem redefinição: exige Administrador ativo, remove todos os Acessos da Integração e seus segredos pelo trigger existente, exclui tentativas OAuth e a habilitação. A Fonte chama a RPC e atualiza a tela. Membro não vê o botão; Administrador confirma o aviso de desconectar todos ou cancela. Falha mantém habilitada e explica em português. Demonstração altera só a Fonte simulada. Desconectar continua removendo apenas o próprio Acesso.

## Validação

- Teste primeiro: logo ausente → logos; catálogo ampliado → dois apps; botão ausente → confirmação e RPC.
- Frontend: TOTAL_FRONTEND_PENDENTE.
- TypeScript, build e lint verificados; lint traz avisos preexistentes, sem erro.
- Deno check limpo; 747 testes passando, 0 falhas.
- pgTAP: 64 arquivos, 2.650 verificações; migrations aplicadas do zero em Postgres 16 portátil, instância exclusiva em `127.0.0.1:55439`. O Vault usa o esqueleto local já adotado nos testes do repositório; CI usa o Vault real.
- pgTAP próprio: catálogo 3/3 (Administrador, Membro, linhas ocultas preservadas); desabilitação 11/11 (Membro recusado, Administrador inativo recusado, dois Acessos e segredos removidos, tentativa cancelada, Notion preservado, anônimo sem execução).
- Testes do app: logos nos dois ambientes, catálogo, confirmação, cancelamento, parâmetros da RPC, ocultação para Membro, erro em português e isolamento da Demonstração.
- Conferência visual no navegador: Demonstração, logos, catálogo e confirmação/cancelamento. Operacional coberto nos testes do app; permissões no pgTAP.
- Nenhuma alteração aplicada no remoto nem Edge Function publicada.

## Passos do Nan

1. Entrar primeiro o PR de `ralph/conexoes-08-notion` e aguardar CI verde deste PR. Com o agente de execuções, validar e aplicar a migration conforme `docs/agents/migrations.md`, sem db push.
2. Gerar os blocos SQL exatos no PowerShell:

```powershell
cd C:\Users\usuario\Althius-conexoes-ajustes
$migrationConexoes = Get-Content -Raw -Encoding utf8 .\supabase\migrations\20261009132551_conexoes_catalogo_disponivel.sql
$validacaoConexoes = "begin;`n" + $migrationConexoes + "`nselect array_agg(id order by id) from private.integration_catalog where available;`nrollback;"
$validacaoConexoes | Set-Content -Encoding utf8NoBOM (Join-Path $env:TEMP 'conexoes-validar-migration.sql')
$aplicacaoConexoes = @(
  'do $apply$',
  'declare',
  '  m text := $m$__MIGRATION__$m$;',
  'begin',
  '  execute m;',
  '  insert into supabase_migrations.schema_migrations (version, name, statements, created_by)',
  "  values ('20261009132551', 'conexoes_catalogo_disponivel', array[m], 'Renan/agente de execuções');",
  'end',
  '$apply$;'
) -join "`n"
$aplicacaoConexoes.Replace('__MIGRATION__', $migrationConexoes) | Set-Content -Encoding utf8NoBOM (Join-Path $env:TEMP 'conexoes-aplicar-migration.sql')
Get-FileHash -Algorithm MD5 .\supabase\migrations\20261009132551_conexoes_catalogo_disponivel.sql
```

3. O agente de execuções envia a validação ao MCP Supabase `execute_sql` do projeto `ycbdilsmydvzezhlymty`: resultado `{hubspot,notion}`, com rollback. Executar os pgTAP tocados pelo procedimento de `scripts/pgtap-no-remoto.sh` conforme o guia. Depois, enviar uma única vez o bloco atômico de aplicação; conferir o hash do histórico e os advisors.

```sql
select version, md5(statements[1])
from supabase_migrations.schema_migrations
where version = '20261009132551';
```

4. **Funções:** este ajuste não alterou Edge Functions; não há publicação delas por este PR. Se as funções da dependência Notion ainda não estiverem publicadas, cumprir os Passos do Nan do ticket 08, incluindo a publicação indicada lá. A RPC de listagem é atualizada pela migration nova; a de desabilitação já pertence à base.
5. Publicar o frontend pelo fluxo de execuções. Em um Workspace de teste, conferir Administrador e Membro. Desabilitar desconecta todos; depois de habilitar, cada participante conecta novamente. Os passos remotos ficam para Renan e o agente de execuções.

## Comments

2026-10-09 — Renan autorizou atualizar as expectativas antigas incompatíveis com o catálogo reduzido, preservando cobertura de Acessos e permissões.

- [Catálogo e logos na Demonstração](prints/31-catalogo.jpg).
- [Confirmação](prints/31-confirmacao.jpg).

2026-10-09 — Unificado na `ralph/unificado-2026-10-09` (depois da `ralph/conexoes-08-notion`), sem conflito. A linha "Frontend: TOTAL_FRONTEND_PENDENTE" da Validação ficou sem número nesta execução; na branch unificada, o vitest completo deu 121 arquivos e 1156 testes verdes (ver `.scratch/PR-UNIFICADO-2026-10-09.md`). A migration `20261009132551` vem depois da `20261009060000` do S1 e não toca `accept_proposed_contact`.
