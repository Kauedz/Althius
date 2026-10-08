# 10: Enviar anexos persistentes e privados

**What to build:** substituir os anexos temporários da demo por arquivos privados que sobrevivem entre sessões e podem ser enviados somente pelo responsável quando o canal e a Conta remetente suportarem formato e tamanho. Outros participantes não recebem URL capaz de revelar o conteúdo.

**Blocked by:** 06: Executar passos e receber respostas pelo WhatsApp; 07: Executar passos e receber respostas pelo LinkedIn.

**Status:** ready-for-human (código e testes conferidos; falta o anexo real por canal; os de WhatsApp e LinkedIn só depois do envio real dos tickets 06 e 07)

- [x] Upload associa o arquivo ao Workspace, responsável, Sequência e passo corretos, com armazenamento privado. (`register_sequence_attachment` grava `private.sequence_attachments` com Workspace, titular, Sequência, passo e canal; bucket privado `sequence-attachments`; pgTAP `anexos_dos_passos.sql` §2.) Anexo em proposta de resposta não entrou: as propostas são só texto hoje.
- [x] Somente o responsável obtém acesso temporário ao conteúdo; outro participante e outro Workspace não conseguem ler o objeto diretamente. (`get_sequence_attachment_path` só para o titular com Participação ativa e a responsabilidade; URL assinada de 2 min gerada pela Edge Function; nenhuma política em `storage.objects`; pgTAP §3 e §5, deno `sequence-attachments/handler.test.ts`.)
- [x] Metadados, tamanho e formato são validados conforme o canal antes de programar ou enviar. (Tipo lido dos primeiros bytes na função; tamanho, tipo e quantidade por canal em `private.attachment_limits` no upload, na ativação (`activate_sequence`) e no envio (`step_send_attachments`); pgTAP §4, §7 e §9.)
- [x] O envio não depende de URL `blob:`. **Decisão:** segue a Unipile **v2** (ADR-0015, adendo de 2026-09-26, e a spec: "Anexos: no envio, vão no JSON com o conteúdo em base64"), não a v1 com multipart que este critério citava: a conta é v2 e não aceita a v1. O núcleo baixa o arquivo do bucket e o leva em base64 no JSON do e-mail e da mensagem (`_shared/anexos-do-envio.ts`); os nomes dos campos estão marcados `não confirmado`.
- [x] Arquivo inválido não bloqueia permanentemente os demais trabalhos nem é marcado como enviado. (`fail_step_send_for_attachment`: o Envio fica `failed` com o motivo, sem nova tentativa; o Executor segue com os outros; falha passageira ao baixar volta como recusa e é tentada de novo; pgTAP §10, deno `_shared/anexos-do-envio.test.ts`.)
- [x] Logs, eventos públicos e mensagens de erro para terceiros não expõem nome, corpo ou URL do anexo. (O caminho no bucket não leva o nome; os logs da função e do Executor só levam códigos, tipo e tamanho; o nome fica só na tabela privada.)
- [ ] Testes verificam persistência entre sessões, isolamento e ao menos um anexo real por canal. Persistência e isolamento: feitos (pgTAP §6, vitest `sequencia-anexos-guardados.test.tsx`). O anexo real por canal é do Nan (Passos abaixo).


## Comments

- **2026-10-02 (agente).** Migration `20261002120000_anexos_dos_passos.sql`: interruptor `private.sequence_attachment_settings` (nasce desligado), limites `private.attachment_limits` (E-mail até 5 arquivos e 10 MB no total; WhatsApp 1 arquivo de até 16 MB; LinkedIn 1 de até 15 MB; só JPG, PNG, GIF, WebP e MP4, com GIF/WebP fora do WhatsApp e WebP fora do LinkedIn; `não confirmado` na Unipile v2), bucket privado `sequence-attachments`, tabela `private.sequence_attachments`, RPCs `sequence_attachment_limits`, `register_sequence_attachment`, `get_sequence_attachment_path` (titular), `mark_sequence_attachment_stored`, `discard_pending_sequence_attachment`, `step_send_attachments`, `fail_step_send_for_attachment` (service_role). Redefine `private.step_signature` (os ids dos anexos entram: trocar o arquivo de um passo pendente revoga a ativação) e `public.activate_sequence` (uma linha: anexo inválido para o canal barra a ativação), copiadas de `20261001150000`.
- Apagar a Conta-alvo (documento esvaziado) apaga os anexos, e cada registro apagado põe a pasta na fila do `storage-purge` (duas passadas), que passou a aceitar o bucket `sequence-attachments`.
- Edge Function nova `sequence-attachments` (`verify_jwt = true`): multipart para subir, `{ action: 'url' }` para abrir. Convite do LinkedIn não leva anexo (recusado no upload, na ativação e no envio).
- Frontend: `anexarArquivo` e `urlDoAnexoDoPasso` na Fonte real; o documento guarda só `{ id, tipo, nome, mime, tamanho }`; o módulo `anexos` entra quando `sequence_attachment_limits` devolve limites; a Demonstração continua com o endereço local.

- 2026-10-07 (reconciliação contra a `main` 59e53a6). Não conferi o remoto (o conector do Supabase não estava ligado nesta sessão); o GO-LIVE só cobre até a Etapa 5b, então não se sabe se a `20261002120000` foi aplicada.
  - Os critérios 1 a 6 conferem com o código: `20261002120000_anexos_dos_passos.sql` (`:127` tabela, `:116` bucket, `:267` registro, `:383` caminho só do titular, `:420` `step_send_attachments`, `:469` falha do anexo) e `_shared/anexos-do-envio.ts`.
  - Testes rodados: `deno test --allow-all supabase/functions/_shared/anexos-do-envio.test.ts` (14 passed) e `supabase/functions/sequence-attachments/handler.test.ts` (10), entre eles "outro participante não recebe URL nenhuma"; `npx vitest run src/sequencia-anexos-guardados.test.tsx` (6, entre eles "…continua lá numa nova sessão"); pgTAP `anexos_dos_passos.sql` (52) ok no CI 37707955273.
  - Passos do Nan: os passos 1 a 5 acima. Antes, no SQL Editor: `select version from supabase_migrations.schema_migrations where version in ('20261002120000','20261002121000');`.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Aplicar `supabase/migrations/20261002120000_anexos_dos_passos.sql` no projeto `ycbdilsmydvzezhlymty` conforme `docs/agents/migrations.md` (validar com rollback, rodar `scripts/pgtap-no-remoto.sh supabase/tests/anexos_dos_passos.sql`, aplicar e conferir o md5). Ela cria o bucket privado `sequence-attachments` no Storage (confira em Storage > Buckets que ele aparece como **Private**).
2. Publicar (PowerShell, na raiz do repositório):
   `npx supabase functions deploy sequence-attachments sequence-runner sequence-step-sends storage-purge --project-ref ycbdilsmydvzezhlymty`
   Nenhum segredo novo.
3. Ligar o módulo no SQL Editor: `select private.set_sequence_attachments_enabled(true);`
4. Conferência real, um anexo por canal (não confirmado pela documentação da v2: o campo `attachments` e os nomes `filename`, `content_type`, `content`): num passo de E-mail, num de WhatsApp e numa mensagem de LinkedIn (não convite), anexar uma imagem pequena, ativar e ver chegar no destino de teste. Se a Unipile recusar, o motivo fica no passo ("o provedor recusou"); a correção é em `_shared/anexos-do-envio.ts` e nos adaptadores.
5. Conferir o isolamento: com outro participante do Workspace, abrir a mesma Sequência e ver que não há anexo nem link.
