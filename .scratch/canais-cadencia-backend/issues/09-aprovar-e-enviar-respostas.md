# 09: Aprovar e enviar respostas nos três canais

**What to build:** permitir que somente o titular revise, aprove ou rejeite a Proposta de resposta e, quando aprovada, envie exatamente aquela revisão pelo canal e destinatário associados. Aprovação autoriza uma mensagem, não ativa resposta automática nem retoma a Sequência.

**Blocked by:** 06: Executar passos e receber respostas pelo WhatsApp; 07: Executar passos e receber respostas pelo LinkedIn; 08: Gerar Propostas de resposta privadas.

**Status:** ready-for-agent (só falta a parte de chat; depende do 08-chat)

- [ ] Somente o titular da Conta remetente lê e decide a proposta; Membro, Administrador e usuário de outro Workspace são rejeitados pelo backend.
- [ ] Aprovar registra titular, revisão, destinatário e canal e cria um único trabalho de envio.
- [ ] Rejeitar não chama a Unipile; aprovar duas vezes ou repetir a requisição não duplica o envio.
- [ ] Editar texto, canal ou destinatário cria nova revisão que exige nova Aprovação.
- [ ] Proposta desatualizada, Conta remetente desconectada, participação removida ou responsabilidade alterada bloqueiam o envio mesmo após aprovação anterior.
- [ ] A resposta aprovada usa o contrato correto de E-mail, WhatsApp ou LinkedIn e persiste resultado ou incerteza para reconciliação.
- [ ] Aprovar ou enviar a resposta mantém a Sequência pausada até uma retomada explícita do responsável.


## Comments

- **2026-10-01, backend** (migration `20261001180000_propostas_de_resposta.sql`, aplicada): propostas privadas do titular, trabalho idempotente por mensagem de origem, revisões, desatualização quando chega outra mensagem, Aprovação da revisão exata e envio uma vez só. Edge Functions `reply-proposal-runner` (o Rhetor gera, sem ferramenta nem credencial de envio) e `reply-proposal-send`. O agendamento `althius-reply-proposal-runner` está ativo no remoto, e o token do Executor se gera sozinho no banco.
- **2026-10-01, tela:** bloco "Resposta sugerida" no detalhe da Sequência, só para o titular: texto editável (a edição vira uma nova revisão), "Aprovar e enviar", "Gerar de novo", "Rejeitar" e os estados (preparando, falhou, desatualizada, enviada, incerta). Enviar não retoma a Sequência. Testes em `src/paginas/resposta-sugerida.test.tsx` e `src/fonte/supabase-sequencias-propostas.test.ts`.
- **Parcial:** o envio da resposta sai por E-mail. WhatsApp e LinkedIn entram pelo enviador de chat quando esses canais forem ligados (canais 06 e 07).

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - Cumpridos para e-mail: só o titular decide (pgTAP `propostas_de_resposta.sql` §5, Deno "quem não participa do Workspace é recusado…"); aprovar cria um único trabalho (`20261001180000_propostas_de_resposta.sql:543-573`, pgTAP §10); rejeitar e repetir não duplicam (pgTAP §17, Deno "aprovar e clicar duas vezes…"); bloqueios depois da aprovação (pgTAP §13-15); a Sequência continua pausada (Deno "a função só libera, envia e grava: não toca na Sequência").
  - Parcial (critério 4): a troca de canal é recusada (`:507-509`) e o destinatário só aceita e-mail (`:511-515`).
  - Não feito (critério 6) para chat: `reply-proposal-send/index.ts:79` só registra `enviadorDeEmail`; `conversation_for_reply` é só e-mail (`:1087`); a recusa `channel_not_supported` está em `:1154` (Deno "um canal sem enviador nunca é enviado pelo e-mail…").
  - Testes rodados: `deno test --allow-all supabase/functions/reply-proposal-send/` → 18 passed; pgTAP `propostas_de_resposta.sql` ok no CI 37707955273.
  - Falta (agente): o enviador de chat (reusar `sendChatMessage` no chat de origem); `conversation_for_reply` e `release_approved_reply` para chat, com o destinatário validado pelo telefone ou pelo perfil; pgTAP e Deno.

## Passos do Nan

1. Publicar as funções:
   ```powershell
   npx supabase functions deploy reply-proposal-runner reply-proposal-send --project-ref ycbdilsmydvzezhlymty
   ```
2. As chaves de IA são as mesmas dos Agentes (`GROQ_API_KEY`, já configurada). Nada novo para guardar.
3. Testar: responder a um e-mail de uma Sequência e, em até 2 minutos, abrir a Sequência para ver a resposta sugerida.
