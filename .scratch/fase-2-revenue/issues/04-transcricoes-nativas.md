# 04: Transcrições nativas do Google Meet, Zoom e Teams

**What to build:** trazer as transcrições nativas dessas ferramentas pelo Acesso de cada participante, com o aviso de consentimento.

**Blocked by:** Primeiro cliente pagando e a prospecção rodando (decisão da sabatina, Q3 e Q45).

**Status:** needs-triage

## Pode mexer

- A definir na triagem.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Triagem com o Nan antes de qualquer código.

## Notas

- LGPD: gravação e transcrição exigem o aviso aos participantes; a responsabilidade é do cliente, e a Althius mostra o aviso ao ligar o conector e ao subir o arquivo.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
