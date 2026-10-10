# 18: Ritmo de envio por Conta remetente (anti-bloqueio no LinkedIn e no WhatsApp)

**What to build:** o Executor mandava até 5 e-mails e 5 mensagens de conversa por execução, a cada minuto, sem pausa, e todo passo com a janela das 09:00 caía às 09:00:00. Com 50 passos às 9h, a mesma Conta mandava 5 por minuto em ritmo perfeitamente regular, o que arrisca bloqueio no LinkedIn e no WhatsApp. Não havia intervalo mínimo, limite por hora ou por dia por Conta remetente.

**Status:** ready-for-human (código, migration `20261010120000_ritmo_de_envio.sql` e testes prontos na `kaue/ritmo-de-envio`; PR em rascunho, sem merge; falta o Nan aplicar a migration, publicar as funções e ligar o ritmo).

- [x] **Variação no horário.** `schedule_next_step` soma ao horário do passo um deslocamento aleatório (0 a 15 min em WhatsApp e LinkedIn, 0 a 2 min em e-mail), que nunca sai da janela do passo e nunca cai no último segundo dela. Dois agendamentos iguais não caem no mesmo segundo. O passo que a janela empurra para o dia seguinte também ganha a variação.
- [x] **Intervalo por Conta remetente.** `private.sender_accounts.next_send_allowed_at`. Ao liberar um envio, a Conta só envia de novo daqui a um intervalo aleatório do canal (LinkedIn 2 a 5 min, WhatsApp 1 a 3 min, e-mail 20 a 60 s). Um passo que chega antes da hora não é enviado: `release_due_step_send` e `release_due_chat_step_send` o reagendam para o próximo horário possível dentro da janela, com o motivo `rate_limited`. A linha da Conta fica travada na liberação, então duas execuções sobrepostas não passam juntas.
- [x] **Limites por dia e por semana.** `private.send_caps`, por tipo de envio: `email`, `linkedin_invite`, `linkedin_message`, `whatsapp_new_contact`, `whatsapp_message`. Padrões: e-mail 100/dia; convites do LinkedIn 20/dia e 100/semana; mensagens do LinkedIn 50/dia; contatos novos do WhatsApp 25/dia; mensagens do WhatsApp 100/dia. Só os envios `sent` contam, no dia e na semana (segunda a domingo) de Brasília. Batido o limite, o passo vai para o início da janela do próximo dia útil (ou da próxima segunda), com o motivo `daily_cap` ou `weekly_cap`: sem erro, sem tentativa e sem `uncertain`.
- [x] **Executor.** Reserva no máximo um passo por Conta remetente por rodada (uma Conta com fila não ocupa o lote das outras). Pausa de 1 a 4 s entre dois envios da mesma execução. Renova a reserva dos passos que faltam antes de cada envio (`renew_due_step_send_claims`), para um lote lento de LinkedIn não perder a reserva de 2 minutos.
- [x] **Configuração.** `public.get_send_rate_settings`, `public.set_send_pacing` e `public.set_send_cap`, só para o administrador do Workspace. Os padrões são linhas de `private.send_rate_settings` e `private.send_caps` com `workspace_id` nulo; a linha do Workspace substitui o padrão. Não há tela neste ticket.
- [x] **Visibilidade.** `sequence_step_sends.deferred_reason` (`rate_limited`, `daily_cap`, `weekly_cap`) e `scheduled_for` já dizem à tela "agendado para HH:MM por limite da conta". Ele é limpo quando o passo é liberado. Ler isso na tela é de outro ticket.

## Decisões a confirmar

- **O ritmo nasce desligado** (`private.send_rate_switch`), como o interruptor dos canais de conversa. Ligá-lo muda o horário de todos os passos, e vários testes do e-mail e da v2 fixam horários exatos (`sequencia_em_segundo_plano.sql`), que continuam valendo desligado. Ligar é um passo do Nan.
- Os limites padrão acima são um ponto de partida conservador, não um número do provedor.
- O tipo do envio no LinkedIn vale a intenção do passo (`convite` ou `mensagem`); a Unipile só decide na hora se a pessoa já é conexão. Um passo de convite para quem já é conexão conta como convite.
- `weekly_cap` é um terceiro motivo, além de `rate_limited` e `daily_cap`, para a tela poder dizer "limite da semana".
- A resposta aprovada (`reply-proposal-send`) sai pela mesma Conta remetente, mas fora do ritmo e dos limites deste ticket.

## Passos do Nan

1. Aplicar a migration (conforme `docs/agents/migrations.md`), depois do CI verde e antes do merge.
2. Publicar: `npx supabase functions deploy sequence-runner sequence-step-sends --project-ref <ref>` (`sequence-runner` com `--no-verify-jwt`, como já é).
3. Ligar o ritmo, no SQL Editor: `select private.set_send_rate_enabled(true);`. Para desligar de novo: `select private.set_send_rate_enabled(false);`.
