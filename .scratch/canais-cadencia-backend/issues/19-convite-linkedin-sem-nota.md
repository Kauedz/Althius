# 19: Convite de conexão no LinkedIn sem nota

**What to build:** a nota do convite do LinkedIn passa a ser opcional. Até aqui `public.activate_sequence` recusava com `empty_content` todo passo de corpo vazio, inclusive o de `subtipoLinkedIn = 'convite'`, e o envio sempre mandava `message` à Unipile (`POST /users/invite` na v1, `POST /users/me/relation-requests` na v2), com a nota ou com texto vazio.

**Status:** ready-for-human (código, migration `20261012120000_convite_linkedin_sem_nota.sql` e testes prontos na `claude/laughing-einstein-2y1gvz`; PR em rascunho, sem merge; falta o Nan aplicar a migration e publicar o `sequence-runner`).

- [x] **Ativação.** Com `canal = 'linkedin'` e `subtipoLinkedIn = 'convite'` (ou ausente, que vale convite), o corpo vazio ou só de espaços ativa. Mensagem e InMail do LinkedIn, WhatsApp e e-mail com o corpo vazio continuam recusados com `empty_content`.
- [x] **Envio.** Com o corpo em branco (depois de tirar os espaços), o convite sai sem o campo `message`, nunca como texto vazio. A regra mora no núcleo (`send-chat-step.ts`) e as pontes v1 e v2 repetem a garantia no pedido que montam (`invitationNote` em `unipile/common.ts`). Com nota, o pedido é o de antes.
- [x] **Tela.** O editor do passo de convite chama o campo de "Nota (opcional):", mostra o placeholder de nota opcional e conta até 300 caracteres. Um convite sem nota não mostra aviso de conteúdo vazio, e a prévia não mostra a nota vazia.
- [x] **Fica como está.** O limite de 300 caracteres (`invite_note_too_long`), o bloqueio `invite_already_sent`, o ritmo de envio (convites 20 por dia e 100 por semana) e o vínculo de `new_relation`. `private.release_chat_step_send` não mudou: já devolve `coalesce(corpo, '')`, e o teste pgTAP prova que o convite sem nota é liberado com o corpo vazio.

## Decisões a confirmar

- **Só espaços.** No banco, "vazio" é `btrim(corpo)` (que não tira quebra de linha), como em toda a ativação; no envio, `trim()` tira também quebra de linha e tabulação. Para o convite o banco não olha mais o corpo vazio, então a diferença só aparece no envio, onde o convite sai sem nota nos dois casos.
- **Prévia.** Entendi "não pode haver preview de conteúdo vazio" como: o convite sem nota não mostra o espaço "Nota do convite…" nem texto de "vazio". O botão Pré-visualizar continua existindo e mostra a nota quando há uma.
- **Variável que some.** Um corpo só com variáveis (ex.: `{{contato.primeiro_nome}}`) que renderiza vazio também sai sem nota; o banco guarda o corpo renderizado vazio no Envio.

## Passos do Nan

1. Aplicar a migration (conforme `docs/agents/migrations.md`), depois do CI verde e antes do merge.
2. Publicar: `npx supabase functions deploy sequence-runner --no-verify-jwt --project-ref <ref>`. Só o `sequence-runner` envia convites; as outras funções que importam a ponte da Unipile não chamam `sendInvitation`.
3. Conferir no primeiro convite real sem nota que a Unipile aceita o pedido sem `message` (v1: `POST /users/invite`; v2: `POST /users/me/relation-requests`). Os dois contratos já tinham `message` opcional, mas é "não confirmado" no protótipo.

## Testes (escritos antes do código)

- `supabase/tests/convite_linkedin_sem_nota.sql` (pgTAP, 15): ativar convite com o corpo vazio, só espaços e sem subtipo; liberar com o corpo vazio como convite de 300 caracteres; mensagem, InMail, WhatsApp e e-mail com o corpo vazio continuam `empty_content`.
- `send-chat-step.test.ts` (deno): o pedido do convite sem nota não traz `message` (corpo vazio, espaços, quebras de linha); com nota traz; `invite_already_sent` continua barrando o convite sem nota.
- `unipile/bridge.test.ts` (deno, v1 e v2): o corpo do POST não traz `message` sem nota ou com texto em branco, e traz com nota.
- `detalhe-sequencia.test.tsx` (vitest): rótulo de nota opcional, contador `0/300`, sem aviso nem nota vazia na prévia; a mensagem do LinkedIn mantém o rótulo e fica sem o contador.
