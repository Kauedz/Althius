# 09: Aprovar e enviar respostas nos três canais

**What to build:** permitir que somente o titular revise, aprove ou rejeite a Proposta de resposta e, quando aprovada, envie exatamente aquela revisão pelo canal e destinatário associados. Aprovação autoriza uma mensagem, não ativa resposta automática nem retoma a Sequência.

**Blocked by:** 06: Executar passos e receber respostas pelo WhatsApp; 07: Executar passos e receber respostas pelo LinkedIn; 08: Gerar Propostas de resposta privadas.

**Status:** ready-for-agent

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

## Passos do Nan

1. Publicar as funções:
   ```powershell
   npx supabase functions deploy reply-proposal-runner reply-proposal-send --project-ref ycbdilsmydvzezhlymty
   ```
2. As chaves de IA são as mesmas dos Agentes (`GROQ_API_KEY`, já configurada). Nada novo para guardar.
3. Testar: responder a um e-mail de uma Sequência e, em até 2 minutos, abrir a Sequência para ver a resposta sugerida.
