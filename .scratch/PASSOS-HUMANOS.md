# Passos humanos para deixar a Althius funcional (Nan e Kauê)

Gerado em 08/10/2026 a partir dos tickets das quatro frentes (branch `ralph/consolidado`). Projeto Supabase: `ycbdilsmydvzezhlymty`. Todos os comandos rodam no PowerShell, na raiz do repositório. Nenhuma chave vai para chat: segredos só com `npx supabase secrets set NOME=valor`, digitando no terminal.

Regra de ouro: nada daqui roda antes do merge na `main` com o CI verde. O merge só acontece com o sim do Renan.

## 0. Antes de tudo

1. Abrir o PR do bloco e esperar o CI verde. Conferir no CI os pgTAP que não rodaram na máquina local: `consulta_cnpj_reserva_credito.sql` (B1, plan 19) e `persona_do_contato_no_comite.sql` (B2, plan 16).
2. Merge na `main` (só com o sim do Renan).
3. Ver o que já está no remoto:
   ```powershell
   npx supabase link --project-ref ycbdilsmydvzezhlymty
   npx supabase migration list --linked
   npx supabase functions list --project-ref ycbdilsmydvzezhlymty
   npx supabase secrets list --project-ref ycbdilsmydvzezhlymty
   ```

## 1. Migrations antigas que podem estar faltando

Aplicar só as que a `migration list` mostrar como pendentes, em ordem de timestamp, como manda `docs/agents/migrations.md` (validar com rollback, rodar o pgTAP no remoto, aplicar e conferir o md5):

- `20261001200000_envio_ao_crm.sql`
- `20261001210000_ferramentas_dos_agentes.sql` (CRM-14 e CRM-15)
- `20261002110000_permissao_por_ferramenta.sql` (CRM-15)
- `20261002111000_catalogo_de_conectores.sql` (conexões 30)
- `20261002112000_envio_ao_crm_pelo_conector.sql` (conexões 30)
- `20261002120000_anexos_dos_passos.sql` e `20261002121000_reconexao_e_acesso_revogado.sql` (canais 10 e 11)

## 2. Migrations de 08/10, nesta ordem

| Migration | Ticket |
|---|---|
| `20261008153000_apagar_conta_limpa_dado_pessoal.sql` | prospecção B4 |
| `20261008160000_aviso_de_conta_existente.sql` | auth 03 |
| `20261008203000_consulta_cnpj_reserva_credito.sql` | prospecção B1 |
| `20261008223000_persona_do_contato_no_comite.sql` | prospecção B2 |
| `20261008233000_custo_das_propostas_de_resposta.sql` | créditos 01 |

## 3. Antes de publicar o Executor (canais 13)

Ver quais Sequências têm passo de InMail; elas vão parar nesse passo com o motivo novo. No SQL Editor (só leitura):

```sql
select d.sequence_id, s.status, step ->> 'id' as passo
from private.sequence_documents d
join public.sequences s on s.id = d.sequence_id
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(d.document -> 'steps') = 'array' then d.document -> 'steps' else '[]'::jsonb end
) as step
where step ->> 'canal' = 'linkedin' and step ->> 'subtipoLinkedIn' = 'inmail';
```

## 4. Publicar as funções

Conferir antes que `RESEND_API_KEY` e `APP_ORIGIN` aparecem na `secrets list`.

```powershell
npx supabase functions deploy existing-account-email --project-ref ycbdilsmydvzezhlymty
npx supabase functions deploy account-enrichment account-discovery signal-runner signal-scan --project-ref ycbdilsmydvzezhlymty
npx supabase functions deploy reply-proposal-runner reply-proposal-send sequence-runner --project-ref ycbdilsmydvzezhlymty
npx supabase functions deploy agent-conversation crm-handoff integration-tools integration-connect --project-ref ycbdilsmydvzezhlymty
npx supabase functions deploy integration-callback --no-verify-jwt --project-ref ycbdilsmydvzezhlymty
```

Por quê: B1/B2 mexeram no `account-enrichment`; créditos 01 no `reply-proposal-runner`, `agent-conversation` e no código comum do Apify (que entra em `account-discovery`, `signal-runner` e `signal-scan`); canais 13 no envio de chat (`sequence-runner` e `reply-proposal-send`); CRM-15 e conexões 30 nas funções de integração. A mudança em `_shared/cors.ts` é só comentário e não pede deploy.

Depois, publicar o frontend como de costume.

## 5. Ambiente do login (auth 10)

1. Cloudflare Turnstile: widget "Althius", hostnames `localhost` e o domínio de cada ambiente, modo Invisible. Guardar a site key e a secret.
2. Google Cloud (Google Auth Platform): Branding "Althius" com `/privacidade` e `/termos`, Audience External, escopos `openid`, `email` e `profile`, cliente Web com as origens de cada ambiente; verificar o domínio.
3. Front: `VITE_GOOGLE_CLIENT_ID` e `VITE_TURNSTILE_SITE_KEY` no ambiente de cada deploy.
4. Supabase Auth: Email com "Confirm email" e código de 6 dígitos; Google ligado; modelos "Confirm signup" e "Reset Password" com `{{ .Token }}` e `{{ .ConfirmationURL }}`; Site URL e `https://<origem>/**` (inclui `/redefinir-a-senha`); Rate Limits de produção; CAPTCHA com Turnstile só depois do passo 3.
5. Textos finais de Termos e Privacidade (Nan).

## 6. Agentes e Hermes (CRM-14, motor-hermes 02)

1. Cadastrar a chave do modelo de IA (segredo, digitado no terminal).
2. Atualizar o código de `supabase/functions/_hermes-worker` na máquina que roda o Hermes e reiniciá-lo (README da pasta). Hoje ele só roda no computador do Nan.

## 7. Envio real de WhatsApp e LinkedIn (canais 06 e 07)

Destrava os canais 08, 09, 10, 11 e 12.

1. Conectar a Conta remetente de WhatsApp e a de LinkedIn pela Unipile.
2. Recadastrar o webhook com o evento `message.new`: `bash scripts/wizard-unipile.sh`.
3. No SQL Editor:
   ```sql
   select private.set_chat_channel_enabled('whatsapp', true);
   select private.set_chat_channel_enabled('linkedin', true);
   ```
4. Enviar um teste por canal para um número e um perfil próprios e responder: a resposta deve pausar a Sequência.
5. Marcar 06 e 07 como closed e voltar o canais 08 para ready-for-agent.

## 8. Cobrança (créditos 06)

Stripe: produto, preço, webhook e as duas funções do Stripe (o `scripts/wizard-go-live.sh` não as publica). Passos 1 a 7 no ticket `creditos-e-planos/issues/06`.

## 9. Limpeza (CRM-17)

Limpar as Sequências órfãs e validar as chaves no remoto, como no ticket `crm-real-e-stack/issues/17`.

## 10. Conferências reais (depois de tudo publicado)

- auth 03: em janela anônima, cadastrar um e-mail que já tem conta; a caixa recebe "Você já tem conta na Althius". Abrir `/termos` e `/privacidade`.
- auth 05: redefinir a senha num navegador sem escolha salva.
- auth 09: entrar por convite com o Google real.
- CRM-15: como Membro, pedir na Conversa um envio ao HubSpot; como Administrador, aprovar em `/aprovacoes` e ver a empresa no HubSpot.
- B1/B2: consultar um CNPJ (cobra 1 crédito só quando a Receita devolve) e rodar o comitê de uma Conta.

## Decisões do Nan que seguram ticket

- Preço do telefone (enriquecimento 03).
- Papel Observador e cota de assentos (créditos 05).
- As quatro perguntas do onboarding no Workspace operacional (CRM-24).
- Repetir a busca do comitê deve cobrar de novo quem já foi proposto? (B2; recomendação do CTO: não.)
- Fila de Aprovações abre sem checar se `crm-handoff` está publicada (CRM-15).