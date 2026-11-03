# Checklist de Publicação e Reversão — Sequências Coordenadas entre Contatos

> **Documento operacional do Ticket 10** (`.scratch/sequencias-multicontato/issues/10-aceite-integrado.md`)  
> **Aviso de segurança:** Nenhuma migration, deploy ou envio real deve ser executado pelo agente. A execução em ambiente produtivo cabe exclusivamente ao operador humano autorizado (Kauê / Renan).

---

## 1. Separação de Camadas e Pré-requisitos

1. **Código e testes locais:** Validados localmente via Vitest, Deno e pgTAP.
2. **Ambiente de homologação / Staging:** Antes de produção, aplicar e validar em base de homologação.
3. **E2E com provedor real (Unipile / LinkedIn / WhatsApp):** Exige autorização explícita do Renan e do Kauê; utilizar **exclusivamente contas remetentes e contatos de teste internos**. Nunca disparar testes contra contas-alvo reais de clientes.

---

## 2. Ordem Estrita de Publicação (Zero-Downtime)

A ordem obrigatória é: **Banco de Dados (Migrations) → Edge Functions → Workers → Frontend**. O frontend não deve ser publicado antes de as migrations e functions estarem ativas para evitar erros de RPC incompatível no cliente.

### Etapa 2.1: Banco de Dados (PostgreSQL / Supabase)

1. **Backup prévio:**
   ```bash
   pg_dump -Fc -h <host> -U postgres -d postgres > backup_pre_sequencias_$(date +%Y%m%d_%H%M%S).dump
   ```
2. **Execução das Migrations Aditivas:**
   Executar em bloco atômico via `execute_sql` conforme `docs/agents/migrations.md` (§ Applying on the remote), registrando e conferindo o MD5 na tabela `supabase_migrations.schema_migrations`:
   ```sql
   do $apply$
   declare
     m text := $m$<conteúdo exato do arquivo>$m$;
   begin
     execute m;
     insert into supabase_migrations.schema_migrations (version, name, statements)
     values ('<version>', '<slug>', array[m]);
   end
   $apply$;
   ```
   Conferir `select md5(statements[1]) from supabase_migrations.schema_migrations where version = '<version>';` contra o md5 do arquivo.
   - `20261106120000_dependencias_dos_passos_da_sequencia.sql` (Ticket 01: liberação e predecessor)
   - `20261107120000_templates_althius_de_sequencia.sql` (Ticket 07: templates Althius do catálogo)
   - `20261108120000_templates_proprios_de_sequencia.sql` (Ticket 08: persistência privada de templates)
   - `20261111120000_execucao_independente_da_sequencia.sql` (Ticket 02: agendamento e limites por Conta)
   - `20261112120000_retencao_por_resposta_da_conta.sql` (Ticket 03: retenção preventiva ao responder)
   - `20261204120000_retomada_seletiva_da_sequencia.sql` (Ticket 04: retomada por contato)
   - `20261205120000_analise_de_resposta_pela_ia.sql` (Ticket 05: análise de respostas pela IA)
   - `20261210131000_resultados_por_conta.sql` (Ticket 09: agregação de desfechos por Conta)
   - `20261218120000_variaveis_com_evidencia.sql` (Ticket 06: snapshots autorizados e evidências) — já aplicada e verificada no Supabase remoto (`ycbdilsmydvzezhlymty`) com MD5 `893dc04b2ffd8f57c6c0815a721334db`.

3. **Verificação pós-migração:**
   - Conferir se RLS e permissões de `service_role` / `authenticated` estão ativas em `private.authorized_message_snapshots`, `private.contact_indications`, `private.sequence_reply_holds`.

### Etapa 2.2: Edge Functions

Deploy das funções atualizadas:
```bash
supabase functions deploy sequence-runner --no-verify-jwt
supabase functions deploy sequence-step-sends --no-verify-jwt
supabase functions deploy agent-conversation
```

### Etapa 2.3: Frontend

1. Executar build de produção:
   ```bash
   (cd projeto-althius-frontend && npm run lint && npx tsc -b && npm run build)
   ```
2. Publicar os assets na CDN / servidor web.
3. Verificar carregamento das páginas `/sequencias` e `/sequencias/:id` sem erros de console.

---

## 3. Plano de Reversão Não Destrutiva (Rollback)

Como todas as migrations desta frente foram desenhadas de forma **estritamente aditiva** (sem remoção de tabelas ou colunas existentes e mantendo retrocompatibilidade com documentos legados):

1. **Reversão do Frontend:**
   - Fazer rollback do deploy para a versão/commit anterior. As RPCs continuarão respondendo normalmente porque os parâmetros antigos permanecem suportados.
2. **Reversão de Edge Functions:**
   - Fazer deploy da versão anterior das Edge Functions no Supabase.
3. **Banco de Dados:**
   - **Não executar `DROP TABLE`** em tabelas operacionais já criadas. Se for necessário desativar temporariamente a execução de novos campos, basta desmarcar/desativar a liberação na tela; sequências já existentes continuarão operando na fila tradicional.
   - Em caso de falha crítica irrecuperável antes do tráfego produtivo, restaurar o dump gerado na etapa 2.1.

---

## 4. Smoke Test de Homologação Pós-Deploy

1. Abrir `/sequencias`, selecionar template pronto e criar Sequência.
2. Atribuir dois Contatos reais da Conta em passos paralelos com um passo dependente.
3. Ativar envios com agenda (fuso e limites).
4. Verificar que a tela permanece intacta (mesmos blocos, sem novo layout).
5. Simular resposta e confirmar retenção preventiva no bloco de revisão.
6. Confirmar retomada seletiva de 1 Contato e manter o outro pausado.
