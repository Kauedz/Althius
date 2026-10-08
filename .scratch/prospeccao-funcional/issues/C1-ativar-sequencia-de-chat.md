# C1: Ativar pela tela uma Sequência de WhatsApp ou LinkedIn

**What to build:** o titular ativa pela tela uma Sequência de WhatsApp ou de LinkedIn, inclusive uma Sequência que não tem passo de e-mail. O diálogo "Ativar envios" lista cada passo que vai sair, com o canal e o Destino que ficará fixado: o e-mail, o número ou o perfil. Uma Sequência só de chat deixa de ficar sem o botão de ativar.

**Blocked by:** None (pode começar agora). O merge na `main` espera o 00.

**Status:** ready-for-agent (nada implementado; ampliado com a tela de chat que faltava aos canais 06 e 07, ver Comments de 2026-10-07)

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

## Comments

- 2026-10-07 (reconciliação contra a `main` 59e53a6): os seis critérios estão em aberto. Não é duplicado dos canais 06 e 07: eles provam o envio no backend; este ticket é o caminho de tela até ele.
  - Painel só com e-mail: `src/paginas/detalhe-sequencia.tsx:909` exige `s.canal === 'email'` (a auditoria citou a linha 882).
  - Diálogo: `:933` filtra só e-mail, `:940` mostra só o e-mail e o texto de `:927-928` diz "Os passos de E-mail abaixo"; `PainelDosEnvios` (`:1983`) fala só de E-mail.
  - Ativação: a chamada existe (`src/fonte/supabase-sequencias.ts:575-589`) e os motivos de chat depois do clique já são traduzidos (`:69-76`). Nada aparece antes do clique, e `empty_content` diz "Um passo de E-mail" também para passo de chat (`:64`).
  - A premissa do "Não mexa" está errada: com o canal desligado, a ativação não recusa. Ela pula os passos de chat (`20261002120000_anexos_dos_passos.sql:600-601`) e devolve `activated` (`:749`), ou seja, uma Sequência só de chat "ativa" no escuro. `list_enabled_chat_channels` (`20261001150000_canais_whatsapp_e_linkedin.sql:63-77`, "a tela pergunta…") não tem consumidor.
  - A Demonstração já não ganha envio real (o painel fica atrás de `!permiteAcoesDeDemonstracao`, `:909`).
  - Testes rodados: `npx vitest run src/raiz.test.tsx -t "Envios automáticos da Sequência"` → 6 passed, só e-mail; não há teste de chat.
  - Ampliação recomendada (vinda dos canais 06 e 07): ler `list_enabled_chat_channels` e dizer no diálogo que o passo de chat não sai com o canal desligado; o rodapé do passo de chat (`detalhe-sequencia.tsx:1833-1834`, hoje sempre "ainda não disponível") passa a mostrar o Envio, adaptando os textos de e-mail de `:1797-1799`; traduzir em `src/fonte/motivos-do-envio.ts` os motivos do LinkedIn (`insufficient_credits`, `subscription_required`, `linkedin_not_connected`, `not_connected`, `recipient_not_found`, `provider_limit_reached`, `invite_already_pending`); `empty_content` por canal. Tudo dentro do "Pode mexer" (`detalhe-sequencia.tsx`, `supabase-sequencias.ts`, `motivos-do-envio.ts`). Pode entrar junto o rótulo cru do resumo público achado no crm-real-e-stack 17 (`detalhe-sequencia.tsx:2674`), se o Nan aprovar tocar nessa função.
  - Conferência visual depois (agente, desktop e 360px): o detalhe da Sequência do titular com "Envios automáticos", o diálogo "Ativar envios" com Sequência só de WhatsApp, só de LinkedIn e mista, e o rodapé do passo de chat depois de ativar.
