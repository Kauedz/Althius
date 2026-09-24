# 10: Enviar anexos persistentes e privados

**What to build:** substituir os anexos temporários da demo por arquivos privados que sobrevivem entre sessões e podem ser enviados somente pelo responsável quando o canal e a Conta remetente suportarem formato e tamanho. Outros participantes não recebem URL capaz de revelar o conteúdo.

**Blocked by:** 06: Executar passos e receber respostas pelo WhatsApp; 07: Executar passos e receber respostas pelo LinkedIn.

**Status:** ready-for-agent

- [ ] Upload associa o arquivo ao Workspace, responsável, Sequência e passo ou proposta corretos, com armazenamento privado.
- [ ] Somente o responsável obtém acesso temporário ao conteúdo; outro participante e outro Workspace não conseguem ler o objeto diretamente.
- [ ] Metadados, tamanho e formato são validados conforme o canal conectado antes de programar ou enviar.
- [ ] O envio Unipile v1 usa multipart e não depende de URL `blob:` ou base64 da versão v2.
- [ ] Arquivo inválido não bloqueia permanentemente os demais trabalhos nem é marcado como enviado.
- [ ] Logs, eventos públicos e mensagens de erro para terceiros não expõem nome sensível, corpo ou URL do anexo.
- [ ] Testes verificam persistência entre sessões, isolamento e ao menos um anexo real por canal suportado no ambiente de validação.

