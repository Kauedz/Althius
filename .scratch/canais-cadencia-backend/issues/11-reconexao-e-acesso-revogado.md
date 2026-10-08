# 11: Recuperar conexões e interromper acesso revogado

**What to build:** tornar a operação segura diante de desconexões, reconexões e saída do responsável do Workspace. A Althius preserva histórico e exclusividade, bloqueia novos envios imediatamente e reconcilia respostas acumuladas antes de liberar a continuação.

**Blocked by:** 09: Aprovar e enviar respostas nos três canais.

**Status:** ready-for-human (código e testes conferidos; falta a conferência real de uma queda e reconexão; na prática não depende do 09)

- [x] Conta remetente fora do estado pronto bloqueia novos passos e respostas aprovadas sem apagar histórico. (Já existia: `sender_not_ready` nas liberações e em `release_approved_reply`, pgTAP `envios_de_passo_por_email.sql`, `propostas_de_resposta.sql` §15. **Novo:** a queda (credenciais revogadas ou expiradas, erro, conta removida, desconexão pela pessoa) pausa a Sequência com o motivo "Conta remetente de … desconectada", a tela mostra "Reconectar" ao titular e "Pausada: conta remetente do responsável desconectada" aos demais; pgTAP `reconexao_e_acesso_revogado.sql` §1.)
- [x] Reconexão valida novamente o titular e processa o backlog comercial relevante de forma idempotente antes de liberar envios. (Já existia: `complete_sender_connection_attempt` recusa outra identidade (`identity_mismatch`) e Participação removida; a reconciliação confere as conversas antes de liberar a conta, pgTAP `reconciliacao_da_conta_remetente.sql`. **Novo:** reconectar não retoma: a Sequência continua pausada até o titular retomar; pgTAP §3–§4.)
- [x] A recuperação não importa toda a caixa de entrada pessoal nem publica conteúdo para o Workspace. (`conversations_to_reconcile` e `chats_to_reconcile` só listam as conversas dos Envios das Sequências; o conteúdo vai para as tabelas privadas do titular; pgTAP §3.)
- [x] Remover a participação do responsável impede imediatamente mutações, aprovações e novos envios em todas as suas Sequências. (Já existia: toda RPC do titular e toda liberação confere Participação ativa; pgTAP §6, `envios_de_passo_por_email.sql` §8, `propostas_de_resposta.sql` §15, `sequencias_nas_contas_reais.sql` §5.)
- [x] A Conta-alvo e o histórico permanecem preservados; nenhum participante recebe credenciais ou assume a propriedade automaticamente. (pgTAP §6: a responsabilidade continua com a titular removida, o Administrador não lê o documento; a Transferência explícita é o CRM-17.)
- [x] Trabalhos pendentes revalidam participação e conexão no momento da execução e terminam em estado auditável quando bloqueados. (O Envio guarda `last_error` (`owner_not_responsible`, `sender_not_ready`); um passo vencido barrado porque a conta caiu de vez também pausa a Sequência pelo Executor (`hold_sequence_for_unready_send`), para o caso de o aviso da Unipile ter se perdido; pgTAP §5–§6, deno `sequence-runner/handler-reconexao.test.ts`.)
- [x] Testes cobrem mensagem recebida durante indisponibilidade, evento duplicado no replay e remoção do responsável com trabalho já reservado. (pgTAP `reconexao_e_acesso_revogado.sql` §2 e §6.)


## Comments

- **2026-10-02 (agente).** Migration `20261002121000_reconexao_e_acesso_revogado.sql`, aditiva (nenhuma função existente redefinida): `private.sequence_sender_holds` (o motivo da pausa, some na retomada ou no encerramento por gatilho), `hold_sequences_of_lost_sender` (Webhook Endpoint e desconexão), `hold_sequence_for_unready_send` (Executor) e `list_sequence_sender_holds` (só o estado, para qualquer participante ativo).
- **Decisão:** a pausa é pedida pelas Edge Functions, e não por um gatilho em `private.sender_accounts`, para não mudar o comportamento que os testes do canais-03/05/06 fixaram (a conta só sincronizando bloqueia o passo, que sai quando ela fica pronta). Uma conta em `syncing`/`connecting` não pausa nada; `reconnect_required` ou `disconnected` sem outra conta viva do canal, pausa.
- **Decisão:** a saída do responsável não pausa a Sequência (o `sequencias_nas_contas_reais.sql` fixa "fica como estava até a Transferência"); os envios dele param na hora com o motivo no Envio.
- Edge Functions: `unipile-account-status` chama a pausa depois de `account.status.disconnected`, `account.status.errored` e `account.remove`; `sequence-runner` a chama quando um passo vencido volta `sender_not_ready`; `sender-accounts` a chama depois da desconexão pela pessoa.
- Frontend: `pausadaPelaContaRemetente` na Sequência (lida de `list_sequence_sender_holds`, em silêncio se falhar); "Reconectar" leva a Configurações > Meu perfil > Minhas Contas remetentes; "Retomar" continua sendo a única forma de voltar a enviar.

- 2026-10-07 (reconciliação contra a `main` 59e53a6). Não conferi o remoto.
  - Os critérios 1 a 7 conferem: `20261002121000_reconexao_e_acesso_revogado.sql` (`:105` `hold_sequences_of_lost_sender`, `:145` `hold_sequence_for_unready_send`, `:178` `list_sequence_sender_holds`), chamadas em `unipile-account-status/handler.ts:28`, `sequence-runner/handler.ts:94` e `sender-accounts/index.ts:172`.
  - Testes rodados: `deno test --allow-all supabase/functions/sequence-runner/handler-reconexao.test.ts` (3 passed) e `supabase/functions/unipile-account-status/handler-reconexao.test.ts` (5); `npx vitest run src/sequencia-pausa-pela-conta-remetente.test.tsx` (4, entre eles "a responsável lê o motivo honesto, vê Reconectar e só ela retoma"); pgTAP `reconexao_e_acesso_revogado.sql` (42), `reconciliacao_da_conta_remetente.sql` e `envios_de_passo_por_email.sql` ok no CI 37707955273.
  - Observação, não bloqueia: a chamada em `sender-accounts/index.ts:172` não tem teste unitário.
  - Passos do Nan: os passos 1 a 3 acima, depois da `20261002120000` do ticket 10.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Aplicar `supabase/migrations/20261002121000_reconexao_e_acesso_revogado.sql` no projeto `ycbdilsmydvzezhlymty` conforme `docs/agents/migrations.md` (validar com rollback, rodar `scripts/pgtap-no-remoto.sh supabase/tests/reconexao_e_acesso_revogado.sql`, aplicar e conferir o md5). Depois da `20261002120000`.
2. Publicar (PowerShell, na raiz do repositório):
   `npx supabase functions deploy unipile-account-status --no-verify-jwt --project-ref ycbdilsmydvzezhlymty`
   `npx supabase functions deploy sequence-runner sender-accounts --project-ref ycbdilsmydvzezhlymty`
   Nenhum segredo novo; nenhum evento novo no Webhook Endpoint da Unipile (os `account.status.*` e `account.remove` já são assinados).
3. Conferência real: com uma Sequência ativa por E-mail, revogar o acesso da Althius na conta Google de teste (myaccount.google.com > Segurança > Apps de terceiros) ou desconectar a conta no app; ver a Sequência "Pausada" com "Reconectar". Responder ao e-mail com a conta fora do ar; reconectar pelo botão; ver a resposta registrada e a Sequência ainda pausada; só então "Retomar".
