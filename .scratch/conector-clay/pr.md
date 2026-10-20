# Conector Clay: gasto pede Aprovação e desconectar revoga no app (conector-clay 01 a 03)

## Summary

O Clay passa a contar como Integração que **gasta**: as ferramentas dele consomem créditos do workspace Clay do Cliente. **Desconectar** passa a revogar o token no app (RFC 7009) para todo conector por OAuth.

```diff
 Ver ferramentas do Clay
-  find-and-enrich (readOnlyHint)  → "sempre" (roda sem Aprovação, gasta crédito)
+  toda ferramenta do Clay         → "Escreve ou gasta" → padrão "Pedir aprovação" (ADR-0022)
```

```diff
 Desconectar (tela Conexões)
-  rpc disconnect_integration_access          # apaga o Acesso; o token segue válido no app
+  integration-connect { action: 'desconectar' }
+    desconectarAcesso
+      descobre o servidor de autorização do app
+      se há revocation_endpoint (https, mesma origem do token_endpoint, mesmo emissor do token):
+        revoga refresh_token e access_token com o cliente que os recebeu
+      disconnect_integration_access_for_user  # RPC só de service_role; apaga mesmo se a revogação falhar
+    → { desconectado, revogacao: revogado | nao_suportado | falhou | nao_se_aplica }
+  tela: se 'falhou', aviso "remova a autorização da Althius nas configurações do <app>"
```

Novas migrations: `20261104120000_clay_gasta_creditos.sql` (`writes = true`) e `20261104121000_desconectar_pelo_servidor.sql` (RPC de serviço). Spec e tickets em `.scratch/conector-clay/`.

## Evidence

- **Before:** `integration-access.test.ts` › "as ferramentas do Clay gastam créditos": `buscar` (readOnlyHint) vinha com `escreve: false`. Os testes de desconectar (`oauth.test.ts`, `integration-access-desconectar.test.ts`, `handler-desconectar.test.ts`, `conexoes-clay.test.tsx`) falhavam por falta de `revogarToken`, `desconectarAcesso` e `action: 'desconectar'`.
  **After:**
  - `deno test supabase/functions`: 1632 passaram.
  - `deno check`: limpo.
  - vitest: 172 arquivos e 1432 testes passaram.
  - `tsc -b` e oxlint: sem erro.
  - pgTAP (`clay_gasta_creditos.sql`, `desconectar_pelo_servidor.sql`): roda no CI; não havia Postgres local.
- Prints com dublê do Supabase (`.scratch/conector-clay/issues/prints/`):
  - [ferramentas com "Pedir aprovação"](../../.scratch/conector-clay/issues/prints/03-ferramentas.jpg)
  - [aviso quando o app não confirma a revogação](../../.scratch/conector-clay/issues/prints/03-aviso-revogacao.jpg)
- **Não testado com conta Clay real.** O ticket 04 está `ready-for-human`.

## Merge Danger

**Door:** two-way. Só dados (`writes`) e uma função nova; a RPC antiga continua. Para reverter, basta voltar o frontend e `writes = false`.

**Blast Radius:** conexões. Desconectar muda para todos os conectores: para uma Integração sem `revocation_endpoint` (HubSpot, com endpoints fixos) só apaga, como antes. O frontend publicado continua na RPC antiga até o próximo deploy.

### Passos do Nan

Estão no ticket `.scratch/conector-clay/issues/04-publicar-e-validar-com-conta-clay-real.md`: consultas de conferência, aplicar as migrations, publicar as funções e o frontend, e o teste real. O Clay continua `available = false` até o teste real passar.

### Decisão pendente

O padrão das Especialidades no Clay (Propor, decisão do usuário) ficou em Ler, porque mudá-lo altera três pgTAP antigos. Ver o ticket 01.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
