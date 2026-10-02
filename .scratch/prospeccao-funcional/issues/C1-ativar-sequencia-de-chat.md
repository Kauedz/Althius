# C1: Ativar pela tela uma Sequência de WhatsApp ou LinkedIn

**What to build:** o titular ativa pela tela uma Sequência de WhatsApp ou de LinkedIn, inclusive uma Sequência que não tem passo de e-mail. O diálogo "Ativar envios" lista cada passo que vai sair, com o canal e o Destino que ficará fixado: o e-mail, o número ou o perfil. Uma Sequência só de chat deixa de ficar sem o botão de ativar.

**Blocked by:** None (pode começar agora). O merge na `main` espera o 00.

**Status:** ready-for-agent

- [ ] No Workspace operacional, a Sequência com passo de WhatsApp ou de LinkedIn, e nenhum passo de e-mail, mostra o controle de ativar. Hoje o painel só aparece quando existe passo de e-mail.
- [ ] O diálogo lista os passos de e-mail, WhatsApp e LinkedIn que ainda não saíram. Cada um mostra o canal e o Destino que a ativação vai fixar (ADR-0014). O texto deixa de dizer que só os passos de e-mail saem.
- [ ] Confirmar chama `activate_sequence`. Destino ausente aparece no diálogo antes do clique, com o passo identificado, e a ativação não segue no escuro.
- [ ] A Demonstração não ganha envio real. O painel de ativação real continua fora dela.
- [ ] Vitest cobre: Sequência só de WhatsApp abre o diálogo com o número; Sequência só de LinkedIn abre com o perfil; Sequência de e-mail continua mostrando o e-mail; Sequência sem nenhum Destino não ativa calada.
- [ ] Conferência visual no navegador, desktop e 360px: o diálogo inteiro se lê, o Destino não estoura o cartão, e ativar uma Sequência só de chat fecha o fluxo até a resposta da Fonte.

## Pode mexer

- `projeto-althius-frontend/src/paginas/detalhe-sequencia.tsx` (o painel e o diálogo de ativar)
- O teste de tela desse diálogo, novo ou o que já cobre a ativação
- `projeto-althius-frontend/src/fonte/supabase-sequencias.ts` e `motivos-do-envio.ts`, só se a ativação de chat devolver um motivo que a tela ainda não traduz

## Não mexa

- `activate_sequence` e as migrations de canal. O banco já fixa o Destino de chat; este ticket mostra esse Destino e deixa a Sequência só de chat chegar até a função.
- InMail. Não mude `decideLinkedInAction` nem trate InMail como mensagem comum.
- Seam de Canal: não una as RPCs de e-mail e de chat, não refatore `runEmail` / `runChat`.
- Respostas recebidas e propostas de resposta. Isso, no que for chat, é o C3; proposta de resposta de chat está fora.
- Ligar o canal no servidor (`set_chat_channel_enabled`). Com o canal desligado a ativação pode recusar, e a tela mostra o motivo que já existe. Não ligue o canal neste ticket.
- Conexões, Stripe, sinais jurídicos.
- O ciclo real de envio e de resposta na Unipile.

## Migration

Nenhuma.
