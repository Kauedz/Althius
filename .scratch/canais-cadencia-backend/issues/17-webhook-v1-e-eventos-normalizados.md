# 17: Webhook da Unipile v1 e eventos normalizados

**What to build:** o webhook único, `unipile-account-status`, confere a assinatura e entende os eventos conforme a versão da **conexão ativa**. Com a conta ativa em v2, nada muda. Com uma conta v1, ele autentica pelo contrato da v1, traduz o evento para a mesma forma canônica que a v2 já produz e só então chama as operações do banco, que não mudam. Não há webhook por conta: eventos de contas que não são da conexão ativa são ignorados com 200.

**Blocked by:** canais-16 (cliente e adaptadores). Só é necessário antes de a primeira conta v1 ficar ativa; com uma conta v2 ativa, os canais-14, 15 e 16 bastam.

**Status:** ready-for-human (código e testes prontos; faltam os Passos do Nan: publicar `unipile-account-status`, o webhook v1 e a mensagem de teste; ver `.scratch/handoffs/canais-17.md`)

- [x] A autenticação segue a versão da conexão ativa. v2: HMAC-SHA256 de `<t>.<corpo bruto>` com janela de 5 minutos e o segredo da conexão (o que existe hoje). v1: cabeçalho `Unipile-Auth` igual ao segredo da conexão e, para o aviso do link de conexão, que não aceita cabeçalho, a chave `?k=` derivada por HMAC do pedido, válida só para o evento de conexão. A conferência vem **antes** de parsear o corpo, e falha dá 401.
- [x] Os eventos v1 (`message_received`, `mail_received`, `new_relation`, estado da conta e conexão) são validados com Zod e traduzidos, no limite, para a união canônica do canais-14. A mensagem própria, o grupo, o evento sem texto e o anúncio do LinkedIn (`sponsored`, `linkedin_offer`) viram "ignorar" com motivo.
- [x] O estado da conta da v1 (lista de fontes) vira `connected`, `attention` ou `disconnected` pela tabela do mapa (§1.5). Estado desconhecido não derruba nem conecta nada.
- [x] O id da mensagem v1 é prefixado com a conta, porque só é único dentro dela, para a deduplicação por `event_id` funcionar.
- [x] Evento de uma conta que não pertence à conexão ativa devolve 200 e não toca o banco. O texto da regra "cada handler ignora eventos de contas que não são dele" continua valendo.
- [x] `private.chat_message_fields` e as operações de ingestão **não** são alteradas: a v1 chega traduzida. Nenhum teste pgTAP muda.
- [x] Script para registrar os webhooks da v1 (os 4 do protótipo: mensagens, e-mail, estado da conta, relações), só com `--aplicar` para valer, avisando dos antigos sem apagá-los, e sem imprimir o segredo.
- [x] Deno: um evento de exemplo por tipo e por versão; assinatura válida, inválida e fora da janela; replay; evento de outra conta. A suíte do 06 e do 07 passa sem mudar de asserção.
- [x] Os campos da v1 só vistos na documentação (formato dos webhooks, nunca com tráfego real, segundo o protótipo) ficam marcados "não confirmado" e viram um item do canais-12 quando houver conta v1.

## Pode mexer

- `supabase/functions/unipile-account-status/` e o módulo `_shared/unipile/` (eventos e autenticação da v1).
- Um script novo de registro de webhooks da v1, e `scripts/wizard-unipile.sh` só para chamá-lo.

## Não mexa

- Migrations, banco, `private.chat_message_fields` e as operações de ingestão e de estado da conta.
- O adaptador de envio (canais-16) e o contrato (canais-14), a não ser para acrescentar um schema de evento.
- Reconciliação e Executor.
- Frontend.

## Migration

Nenhuma.

## Passos do Nan

1. Depois do merge, publicar `unipile-account-status` (com `--no-verify-jwt`).
2. Só quando a conta ativa for v1: rodar o script de registro dos webhooks na conta nova, com o segredo da conexão que o wizard do canais-15 gravou, e depois a mensagem de teste para conferir que o evento chega e é traduzido.

## Comments

- 2026-10-09 (canais-17): feito. Campos da v1 sem confirmação (viram item do canais-12 quando houver conta v1): ver a lista no handoff `.scratch/handoffs/canais-17.md`, seção "Não confirmado". A pendência herdada do canais-15 (funções SQL que buscam só por `unipile_account_id`) **não** está neste ticket ("Não mexa": banco e operações de ingestão): fica para um ticket com migration.
