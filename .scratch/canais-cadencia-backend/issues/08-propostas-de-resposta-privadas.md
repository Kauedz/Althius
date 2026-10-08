# 08: Gerar Propostas de resposta privadas

**What to build:** depois de uma resposta comercial válida, usar o Rhetor para interpretar o contexto restrito daquela prospecção e preparar uma Proposta de resposta visível somente ao responsável. O serviço de IA não recebe ferramenta nem credencial capaz de enviar mensagens.

**Blocked by:** 04: Primeiro ciclo real por E-mail.

**Status:** blocked (só falta a parte de chat; espera o envio real dos tickets 06 e 07, que seguem `ready-for-human`; fazer junto com o 09)

- [ ] Uma resposta válida e já persistida cria trabalho idempotente para gerar uma única Proposta de resposta.
- [ ] O contexto enviado à IA contém apenas os dados comerciais necessários daquela Conta-alvo, Contato, Sequência e conversa relevante.
- [ ] O texto recebido e a proposta ficam acessíveis somente ao responsável; outros participantes veem apenas evento e status.
- [ ] A proposta registra mensagem de origem, canal, destinatário, revisão e estado, sem capacidade de envio automático.
- [ ] Falha ou indisponibilidade da IA preserva a resposta e a pausa, informa o titular e permite nova tentativa segura.
- [ ] Uma nova mensagem recebida marca a proposta anterior como desatualizada e impede seu envio sem nova revisão do titular.
- [ ] Testes demonstram que gerar a proposta não chama a Unipile e não retoma a Sequência.

## Dependências externas

- Serviço/modelo de IA e credencial de backend definidos para o Rhetor.


## Comments

- **2026-10-01, backend** (migration `20261001180000_propostas_de_resposta.sql`, aplicada): propostas privadas do titular, trabalho idempotente por mensagem de origem, revisões, desatualização quando chega outra mensagem, Aprovação da revisão exata e envio uma vez só. Edge Functions `reply-proposal-runner` (o Rhetor gera, sem ferramenta nem credencial de envio) e `reply-proposal-send`. O agendamento `althius-reply-proposal-runner` está ativo no remoto, e o token do Executor se gera sozinho no banco.
- **2026-10-01, tela:** bloco "Resposta sugerida" no detalhe da Sequência, só para o titular: texto editável (a edição vira uma nova revisão), "Aprovar e enviar", "Gerar de novo", "Rejeitar" e os estados (preparando, falhou, desatualizada, enviada, incerta). Enviar não retoma a Sequência. Testes em `src/paginas/resposta-sugerida.test.tsx` e `src/fonte/supabase-sequencias-propostas.test.ts`.
- **Parcial:** o envio da resposta sai por E-mail. WhatsApp e LinkedIn entram pelo enviador de chat quando esses canais forem ligados (canais 06 e 07).

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - Cumpridos para e-mail: contexto mínimo (Deno "gera a proposta: contexto mínimo, modelo sem ferramentas…"); privacidade (pgTAP `propostas_de_resposta.sql` §5); o registro da proposta (`20261001180000_propostas_de_resposta.sql:26-68`); falha da IA (Deno "a falha da IA vira falha do trabalho…", vitest "avisa enquanto o Rhetor prepara e quando a geração falha"); desatualização (pgTAP §13, vitest "não deixa aprovar uma proposta desatualizada"); não chama a Unipile nem retoma (Deno "…nenhuma chamada de rede").
  - Não feito para WhatsApp e LinkedIn: o único gatilho é `received_emails_reply_proposal` (`:305`); nada em `private.received_chat_messages` cria proposta.
  - Testes rodados: `deno test --allow-all supabase/functions/reply-proposal-runner/` (17 passed) e `supabase/functions/reply-proposal-send/` (18); `npx vitest run src/paginas/resposta-sugerida.test.tsx src/fonte/supabase-sequencias-propostas.test.ts` (6 + 5); pgTAP `propostas_de_resposta.sql` (132) ok no CI 37707955273.
  - Falta (agente): gatilho em `private.received_chat_messages` chamando `enqueue_reply_proposal` e `mark_reply_proposals_outdated`; `reply_proposal_context` (`:817-905`) lendo a conversa de chat; `list_reply_proposals` e `get_reply_proposal` (`:401,441`) com o trecho vindo de `received_chat_messages`; pgTAP novo. A `prospeccao-funcional` deixou a proposta de chat de fora; a decisão sobre o Seam de Canal vem antes.

- 2026-10-08 (frente canais): blocked, sem código. Pelo aviso 4 do CTO, a parte de chat só começa depois do envio real do 06 e do 07. Os dois seguem `ready-for-human`: nenhuma resposta real de WhatsApp ou LinkedIn chegou em `private.received_chat_messages`. Também falta a decisão sobre o Seam de Canal, que esta frente não pode mexer. Para desbloquear: o Nan faz os Passos do Nan do 06 e do 07 (envio e resposta reais) e marca os dois; aí o 08 volta para `ready-for-agent`.

## Passos do Nan

1. Publicar as funções:
   ```powershell
   npx supabase functions deploy reply-proposal-runner reply-proposal-send --project-ref ycbdilsmydvzezhlymty
   ```
2. As chaves de IA são as mesmas dos Agentes (`GROQ_API_KEY`, já configurada). Nada novo para guardar.
3. Testar: responder a um e-mail de uma Sequência e, em até 2 minutos, abrir a Sequência para ver a resposta sugerida.
