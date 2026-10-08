# 13: Tirar o InMail da tela e recusá-lo no envio

**What to build:** o InMail está fora (decisão do Renan de 07/10/2026, nos Comments do ticket 07). A tela deixa de oferecer "InMail" no passo de LinkedIn. O Executor recusa um passo de InMail com um motivo próprio, sem mandar nada pela Unipile. Hoje ele manda esse passo como mensagem comum pelo `startChat`.

**Blocked by:** prospeccao-funcional C1: Ativar pela tela uma Sequência de WhatsApp ou LinkedIn (`.scratch/prospeccao-funcional/issues/C1-ativar-sequencia-de-chat.md`). Os dois mexem em `detalhe-sequencia.tsx` e em `motivos-do-envio.ts`.

**Status:** ready-for-human (tela e núcleo na `ralph/frente-canais`; checkboxes fechados; sem push; sem migration. O agente não reimplementa: os testes já nascem verdes. Falta o Nan: a consulta SQL de leitura e, depois do merge, o deploy do `sequence-runner`.)

- [x] O passo de LinkedIn oferece só "Convite com nota" e "Mensagem". Nenhum passo novo ou editado vira InMail.
- [x] Um passo já salvo como InMail não some nem aparece como outro tipo: nenhuma opção fica marcada, e a tela diz, junto das opções, que o InMail não é enviado e que é preciso escolher Convite ou Mensagem. Escolher um dos dois grava o subtipo novo, como hoje.
- [x] O núcleo do envio recusa todo passo com `linkedin_subtype = 'inmail'`, seja o Contato conexão ou não, com o motivo `linkedin_inmail_not_supported`, antes de consultar o perfil. Nada é chamado na Unipile: nem `getLinkedInProfile`, nem `startChat`, nem `sendInvitation`. O resultado é `blocked` com esse motivo: o Envio fica falho, sem nova tentativa, e a Sequência para nele até uma nova ativação, como nos outros impedimentos (`send-chat-step.ts:20-25`).
- [x] A tela traduz o motivo em `motivos-do-envio.ts`, com um texto que diga o que fazer, por exemplo: "o InMail não é enviado pela Althius; troque o passo para Convite ou Mensagem e ative os envios de novo".
- [x] O texto de `invalid_linkedin_subtype` (`supabase-sequencias.ts:74`) deixa de citar o InMail como tipo válido.
- [x] Deno: o teste "LinkedIn: InMail só para quem não é conexão" (`send-chat-step.test.ts:377-385`), que hoje fixa o envio como mensagem comum, passa a conferir a recusa para conexão e para não conexão, sem nenhuma chamada à Unipile. O trecho de InMail do teste de crédito (`:394-400`) sai ou vira essa recusa. As asserções de `decideLinkedInAction('inmail', …)` (`:160-161`) acompanham a mudança. Os testes de convite e de mensagem não mudam.
- [x] Vitest: `detalhe-sequencia.test.tsx:314` passa a conferir que não existe botão "InMail". Um teste novo cobre o passo já salvo como InMail: o aviso aparece, nenhuma opção está marcada, e trocar para Convite grava `convite`. `motivos-do-envio.test.ts` cobre o motivo novo.
- [x] Conferência visual no navegador, desktop e 360px: as duas opções do passo de LinkedIn e o aviso do passo antigo de InMail se leem sem estourar o cartão.

## Pode mexer

- `projeto-althius-frontend/src/paginas/detalhe-sequencia.tsx`: as opções do passo de LinkedIn (`:2195-2220` na `main` 59e53a6) e o aviso do passo antigo. O assunto (`:1376-1378`) e a prévia (`:2405-2420`) do InMail podem ficar como estão, para o passo antigo continuar legível.
- `projeto-althius-frontend/src/paginas/detalhe-sequencia.test.tsx`
- `projeto-althius-frontend/src/fonte/motivos-do-envio.ts` e `motivos-do-envio.test.ts` (o motivo novo)
- `projeto-althius-frontend/src/fonte/supabase-sequencias.ts`: só o texto de `invalid_linkedin_subtype`
- `supabase/functions/_shared/send-chat-step.ts`: `attemptLinkedIn` e `decideLinkedInAction`
- `supabase/functions/_shared/send-chat-step.test.ts`

## Não mexa

- Migrations e banco. `activate_sequence` continua aceitando o subtipo `inmail` (`20261002120000_anexos_dos_passos.sql:651`), e `record_chat_step_result` continua aceitando `linkedin_action = 'inmail'`. O passo antigo de InMail ativa e para no envio com o motivo. `last_error` é texto livre (`20261001150000_canais_whatsapp_e_linkedin.sql:1153`), então o motivo novo não pede migration. Nenhum pgTAP muda: `canais_whatsapp_linkedin.sql:114` usa InMail na ativação, e isso continua valendo.
- Os tipos `SubtipoLinkedIn` (`sequencias-tipos.ts:25`) e `LinkedInSubtype` (`send-chat-step.ts:17`). Documentos já salvos podem ter `inmail`: não tire o valor do tipo nem converta passo salvo em silêncio.
- A regra de convite e mensagem: quem já é conexão recebe mensagem, mensagem a quem não é conexão é impedimento, e o convite leva a nota (`send-chat-step.ts:184-190,340-357`).
- `send-chat-step-adapters.ts` e o corpo do `startChat`: não mande marca de InMail à Unipile.
- O que é do C1 (o diálogo "Ativar envios", o rodapé do passo de chat, os outros motivos do LinkedIn) e do C3 (respostas de chat).
- Seam de Canal: não una as RPCs de e-mail e de chat nem refatore `runEmail` / `runChat`.
- Ligar o canal LinkedIn no servidor (`set_chat_channel_enabled`).

## Migration

Nenhuma.

## Comments

- 2026-10-08: criado com o sim do Renan ao ajuste que a reconciliação de 07/10 deixou como risco no ticket 07 (Comments de 2026-10-07 e decisão 4 do `TICKETS-ABERTOS-2026-10-07.md`).
  - Na `main` 59e53a6, a tela oferece "InMail" (`detalhe-sequencia.tsx:2199`). `decideLinkedInAction` devolve `inmail` para quem não é conexão (`send-chat-step.ts:187`) e `mensagem` para quem é (`:185`). Os dois saem por `sendMessage` / `startChat` (`:359-361`), cujo corpo leva só `users_ids` e `text` (`send-chat-step-adapters.ts:181-186`). Ou seja, o passo de InMail sai como mensagem comum.
  - A recusa vale também quando o Contato já é conexão: o passo pediu InMail, que está fora, e mandar uma mensagem no lugar seria o mesmo desvio. O titular troca o passo para Mensagem.
  - Bloqueado pelo C1 porque os dois mexem em `detalhe-sequencia.tsx` e em `motivos-do-envio.ts`. As linhas citadas são da 59e53a6 e vão andar com o C1: procure por `subtipoLinkedIn` e `inmail`.
- 2026-10-08: tela e núcleo na `ralph/frente-canais`. O passo de LinkedIn oferece só Convite com nota e Mensagem. Passo já salvo como InMail fica sem opção marcada e mostra "O InMail não é enviado. Escolha Convite ou Mensagem." Trocar grava o subtipo. O Executor devolve `blocked` / `linkedin_inmail_not_supported` antes de qualquer chamada à Unipile, para conexão e para quem não é. A ativação continua aceitando o subtipo; a parada é no envio.
  - Frontend: `npm test` (`vitest run`) em `projeto-althius-frontend`, exit 0. Test Files 109 passed (109). Tests 1085 passed (1085). Duração 2132.63s. A corrida começou às 09:24, antes do aviso 8 do quadro (`--maxWorkers=2`).
  - Deno: `deno test supabase/functions` na raiz, exit 0. `ok | 710 passed | 0 failed` (24s), depois do teste renomeado.
  - `npx tsc -b` no frontend, exit 0. `deno check supabase/functions/*/index.ts`, exit 0.
  - pgTAP não rodou nesta máquina (sem Supabase CLI e sem Docker). Este ticket não muda SQL. `canais_whatsapp_linkedin.sql` continua ativando um passo InMail; a recusa é no Executor.
  - Conferência visual: desktop e cartão com coluna de cerca de 360px (viewport 688). Um viewport literal de 360px fica esmagado pela sidebar de 15.5rem e pelo `px-10`, arquivos fora deste ticket. Prints em `issues/prints/13-opcoes-linkedin-desktop.jpg`, `13-opcoes-linkedin-360.jpg`, `13-aviso-inmail-desktop.jpg`, `13-aviso-inmail-360.jpg`. Opções, aviso e compositor com scrollWidth igual ao clientWidth.
  - Revisão de padrões e de spec sem problema aberto. A linha do Envio segue `grid-cols-[80px_1fr]`; o `min-w-0` nas opções segura o aviso. A recusa fica em `decideLinkedInAction` e no retorno cedo de `attemptLinkedIn` de propósito.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Antes de publicar, ver quais Sequências têm passo de InMail. Elas vão parar nesse passo com o motivo novo. No SQL Editor do Supabase (só leitura):
   ```sql
   select d.sequence_id, s.status, step ->> 'id' as passo
   from private.sequence_documents d
   join public.sequences s on s.id = d.sequence_id
   cross join lateral jsonb_array_elements(
     case when jsonb_typeof(d.document -> 'steps') = 'array' then d.document -> 'steps' else '[]'::jsonb end
   ) as step
   where step ->> 'canal' = 'linkedin' and step ->> 'subtipoLinkedIn' = 'inmail';
   ```
2. Depois do merge, publicar o Executor (PowerShell, na raiz do repositório), antes de ligar o LinkedIn para clientes:
   `npx supabase functions deploy sequence-runner --project-ref ycbdilsmydvzezhlymty`
   Nenhum segredo novo e nenhuma migration.
