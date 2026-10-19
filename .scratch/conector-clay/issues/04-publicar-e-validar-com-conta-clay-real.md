# 04: Publicar e validar com uma conta Clay real

**What to build:** conferir no remoto o que a `main` tem, aplicar as migrations e publicar as funções; testar ponta a ponta com uma conta Clay real; só então ligar `available = true`.

**Blocked by:** 01, 02, 03 (PR mergeado com CI verde).

**Status:** ready-for-human

- [ ] Consultas de conferência rodadas, com o resultado colado aqui (sem segredos).
- [ ] Migrations `20261102140000_conector_clay`, a de 01 e a de 02 aplicadas (`docs/agents/migrations.md`).
- [ ] `integration-connect`, `integration-callback` e `integration-tools` publicadas a partir da `main`.
- [ ] Teste real: habilitar, autorizar, ver ferramentas, uma chamada sob Aprovação, desconectar (com a revogação conferida no Clay), reconectar, e o toggle Unknown desligado levando a "Precisa reconectar".
- [ ] `available = true` só depois de tudo acima.

## Passos do Nan

Nenhum passo pede chave nem senha no chat. O Clay se registra sozinho (registro dinâmico), então não há segredo novo: `CLAY_MCP_CLIENT_ID`/`_SECRET` continuam opcionais.

### 1. Conferir o ambiente (só leitura; rode no SQL Editor do projeto `ycbdilsmydvzezhlymty` e cole o resultado aqui)

```sql
-- 1. Quais migrations do Clay e desta leva já estão aplicadas, com o md5 para comparar com os arquivos.
select version, name, md5(statements[1]) as md5
from supabase_migrations.schema_migrations
where version in ('20261102140000', '20261104120000', '20261104121000')
order by version;

-- 2. O Clay no catálogo e no perfil de conexão.
select id, available, writes from private.integration_catalog where id = 'clay';
select integration_id, kinds, pins_portal from private.integration_connection_profiles where integration_id = 'clay';

-- 3. A RPC de desconectar pelo servidor (nula até a migration 20261104121000).
select to_regprocedure('public.disconnect_integration_access_for_user(uuid,uuid,text)') as desconectar_pelo_servidor;

-- 4. O cliente OAuth do Clay já registrado (sem o segredo) e quantos Acessos ao Clay existem.
select integration_id, issuer, redirect_uri, registered_at from private.integration_oauth_clients where integration_id = 'clay';
select state, count(*) from private.integration_accesses where integration_id = 'clay' group by state;

-- 5. Em que Workspaces o Clay está habilitado.
select workspace_id, enabled_at from public.workspace_integrations where integration_id = 'clay';
```

No PowerShell, as versões publicadas das funções:

```powershell
npx supabase functions list --project-ref ycbdilsmydvzezhlymty
```

O `md5` da consulta 1 tem de bater com `Get-FileHash -Algorithm MD5 supabase/migrations/<arquivo>.sql` (em minúsculas).

### 2. Depois do merge com CI verde: aplicar e publicar

1. Aplicar `20261102140000_conector_clay.sql` (se a consulta 1 não a mostrar), `20261104120000_clay_gasta_creditos.sql` e `20261104121000_desconectar_pelo_servidor.sql`, nessa ordem, pelo bloco atômico de `docs/agents/migrations.md`. Um agente com permissão no MCP do Supabase também pode fazer isso, se você autorizar.
2. Publicar as funções a partir da `main`:
   ```powershell
   npx supabase functions deploy integration-connect integration-callback integration-tools --project-ref ycbdilsmydvzezhlymty
   ```
3. Publicar o frontend (a tela de Conexões passou a desconectar pela Edge Function). Até lá, o app publicado continua chamando a RPC antiga, que apaga sem revogar.

### 3. Teste com uma conta Clay real (ainda com `available = false`, num Workspace de teste)

O cartão só aparece com `available = true`. Para testar sem abrir o Clay aos outros Workspaces, ligue-o, teste e desligue de novo se algo falhar:

```sql
update private.integration_catalog set available = true where id = 'clay';
```

1. No Clay, como admin do workspace Clay: *Settings > MCP users > Allowed MCP clients*, ligar **Unknown**. Sem isso, o Clay recusa a autorização da Althius.
2. Na Althius, como Administrador: Conexões > Clay > **Habilitar**.
3. **Conectar no Clay**: entrar no Clay, escolher o workspace, ver "Unverified application" com o retorno `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback` e autorizar. Esperado: "Clay conectado." e o cartão "Conectado".
4. **Ver ferramentas**: anotar aqui os nomes reais. Todas devem aparecer como "Escreve ou gasta", com "Pedir aprovação".
5. Pedir a um Agente com Propor no Clay uma busca pequena: deve nascer uma Aprovação, não uma chamada. Aprovar uma só e conferir no Clay quantos créditos foram gastos.
6. **Desconectar**: sem aviso amarelo, o cartão volta a "Você ainda não conectou". No Clay, a autorização da Althius não deve mais aparecer como ativa.
7. **Reconectar** pelo mesmo botão.
8. No Clay, desligar **Unknown**, e na Althius pedir de novo "Ver ferramentas" depois que o token vencer (ou forçar uma renovação): o cartão deve ir para "Precisa reconectar". Religar **Unknown** no fim.
9. Com outro participante, conferir que desconectar o seu Acesso não muda o dele (contagem de participantes).
10. Abrir a Demonstração e conferir que ela continua simulada e não mostra o estado do Workspace.

Se tudo passar, mantenha `available = true` e registre aqui. Se algo falhar, volte para `false` e anote a mensagem exata, sem colar tokens.

## Comments
