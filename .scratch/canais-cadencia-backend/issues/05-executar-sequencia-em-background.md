# 05: Executar a Sequência com o navegador fechado

**What to build:** executar os passos aprovados por meio de trabalho durável no backend, mesmo quando o navegador está fechado, respeitando ordem, dias úteis, janela, versão autorizada, pausa e retomada explícita. O executor nunca espera dias dentro de uma requisição nem usa o estado visual da demo como autorização.

**Blocked by:** 04: Primeiro ciclo real por E-mail.

**Status:** ready-for-agent

- [ ] Ativar a Sequência registra a versão autorizada e programa somente passos válidos, com destinos e Contas remetentes prontos.
- [ ] O executor calcula horários em `America/Sao_Paulo`, de segunda a sexta, sem calendário de feriados nesta entrega.
- [ ] Antes de cada envio, o backend revalida responsável, participação ativa, versão, pausa, janela, destino e conexão.
- [ ] Editar um passo pendente invalida a autorização da versão anterior e exige nova confirmação; passos enviados preservam seu histórico.
- [ ] Falha não avança o passo como enviado; tentativas têm reserva exclusiva, limite, motivo e próxima execução persistidos.
- [ ] E-mail manual exige ação explícita do titular e não vira envio automático.
- [ ] Retomar uma Sequência pausada reprograma os passos pendentes a partir da retomada, sem rajada de atrasados.
- [ ] Teste de integração comprova execução com o navegador fechado e bloqueio de novos envios depois de uma pausa persistida.

## Implementação local

Três PRs em sequência: (1) banco, (2) executor e (3) tela.

- **PR 1 (banco):** migration `supabase/migrations/20260927013000_sequencia_em_segundo_plano.sql`.
  - **Versão autorizada** (`private.sequence_authorizations`):
    - "Ativar envios" (`activate_sequence`) copia o documento e fixa o Destino de cada passo de E-mail pendente (ADR-0014).
    - Ativar conta como a confirmação do documento inteiro. Por isso a tela do PR 3 mostra os Destinos antes de ativar.
    - Um bloqueio volta como desfecho, com o passo: `contact_unlinked`, `contact_without_email`, `empty_content`, `destination_bounced`, `sender_not_ready`, `sequence_not_active` ou `no_steps`.
    - O status visual "Ativa" não autoriza nada.
  - **Agenda:** um passo por vez.
    - Estados: `waiting` (espera a vez), `scheduled` (automático, sai no horário) e `confirmed` (manual, espera o titular).
    - O horário (`private.next_send_slot`) soma os dias úteis desde o envio anterior, de segunda a sexta em America/Sao_Paulo, sem feriados. Fica dentro da janela do passo, ou da janela padrão (09:00–18:00 quando não há janela válida).
    - O horário nunca fica no passado: um passo vencido sai no próximo horário válido.
    - O titular também só envia um passo da versão na hora dele e dentro da janela (`not_due`, `outside_window`). Reconfirmar não adianta o passo.
  - **Canal ainda não enviado** (LinkedIn, WhatsApp): a Sequência para no passo até o canais-06/07.
  - **Executor:**
    - `claim_due_step_sends` reserva os passos automáticos vencidos por 2 minutos (`for update skip locked`).
    - `release_due_step_send` revalida titular, Participação, responsabilidade, versão, pausa, janela, Conta remetente e Destino. Também não manda para um endereço que já voltou na Sequência.
    - Atrasado, fora da janela, o passo vai para o próximo horário válido.
    - Um bloqueio que deixa o passo programado (ex.: `sender_not_ready`) fica gravado no Envio, e o executor espera 15 minutos antes de tentar de novo.
  - **Falhas:**
    - O passo automático tenta de novo em 5 e depois em 30 minutos, ou depois do prazo que o provedor pediu (`p_retry_after_seconds`). Na terceira falha fica `failed`, e a Sequência para nele até o titular reconfirmar.
    - Incerto nunca tenta de novo. O eco reconcilia, inclusive o de uma tentativa dada como falha. Sem eco, o titular resolve (`resolve_uncertain_step`): saiu ou não saiu.
  - **Edição e retomada:**
    - Editar um passo pendente (conteúdo, Contato, canal, atraso, janela, modo ou ordem) revoga a versão e cancela os pendentes dela. Editar um passo já enviado não revoga.
    - Um passo em voo numa reativação entra na versão nova ao ser reconfirmado ou enviado.
    - Retomar leva o passo vencido para o próximo horário válido, sem rajada.
    - A tela só manda o status quando a pessoa o muda. Salvar o documento não desfaz a pausa de uma resposta.
  - **Histórico:** o Envio guarda o assunto e o corpo que saíram. Um bounce continua como histórico mesmo com a versão revogada. A Demonstração e a confirmação avulsa (`confirm_sequence_step` fora de uma versão) continuam manuais.
  - **Travas:** a da Sequência vem sempre antes da linha do Envio, como na liberação.
  - **Relógio:** toda decisão de quando um passo sai lê `private.clock_now()`. Os testes o substituem dentro da transação.
  - **Testes:**
    - pgTAP `supabase/tests/sequencia_em_segundo_plano.sql` (109 asserções). Cobre:
      - ativar, programar, reservar e liberar;
      - a pausa persistida bloqueando os envios seguintes e a retomada sem rajada;
      - as tentativas e o Retry-After, e o eco durante a nova tentativa;
      - o E-mail manual, a revogação por edição e o passo em voo numa reativação;
      - o incerto resolvido pelo titular, o bounce e o atraso fora da janela.
    - Vitest: a tela não regrava o status lido.
