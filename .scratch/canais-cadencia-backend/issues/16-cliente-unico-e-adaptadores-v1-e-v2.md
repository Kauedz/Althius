# 16: Cliente único da Unipile e adaptadores v1 e v2

**What to build:** um cliente HTTP único e uma interface `UnipileBridge` (enviar e-mail, abrir chat, responder, convidar, resolver perfil, listar chats e contas, criar link, desconectar), com um adaptador v2 (o que o código já faz) e um adaptador v1 (portado do protótipo). Quem chama escolhe o adaptador pela **conexão ativa** (endereço, versão e chave vindos da configuração do canais-15), e nenhum arquivo escreve mais `api.unipile.com` nem lê `UNIPILE_API_KEY` direto.

**Blocked by:** canais-14 (contrato Zod) e canais-15 (conexão ativa por configuração).

**Status:** ready-for-agent

- [ ] Um cliente único cuida de cabeçalho `X-API-KEY`, tempo limite, JSON e multipart, e da classificação do erro (4xx definitivo exceto 408 e 429; o resto, incerto e nunca reenviado sozinho), com os erros tipados do canais-14.
- [ ] A interface `UnipileBridge` é a única porta que o Executor, o `sender-accounts`, o `reply-proposal-send` e os adaptadores de envio enxergam. Os testes deles continuam passando; só a fábrica muda.
- [ ] Adaptador v2: o que existe hoje, movido para atrás da interface, sem mudar contrato.
- [ ] Adaptador v1: link de conexão (`hosted/accounts/link`), listar contas (`cursor`), enviar e-mail (JSON, `body` HTML, `to[].identifier`, `Idempotency-Key` em UUID), abrir chat e responder (multipart com `account_id`), listar chats. Campos que o protótipo só alega ter conferido ficam `optional()` e marcados "não confirmado". Nenhum pedido é traduzido de uma versão para a outra.
- [ ] A conexão ativa vem do banco do canais-15 (endereço e versão) e do Vault (chave). Sem conexão ativa ou sem chave, o canal fica desligado e nada é enviado, nunca um envio simulado. Enquanto o Vault não tiver a chave, vale a reserva da variável de hoje.
- [ ] As quatro bases escritas no código (`sender-accounts`, `unipile-account-status`, `send-step-adapters`, `send-chat-step-adapters`) e as leituras diretas de `UNIPILE_API_KEY` (`sequence-runner`, `sequence-step-sends`, `reply-proposal-send`, `sender-accounts`, `unipile-account-status`) somem. Um teste (ou `grep` no CI) falha se voltarem.
- [ ] Script de diagnóstico só de leitura, `unipile:conferir`, que lista as contas e os 3 últimos chats da conexão ativa, e com `--link <provedor>` gera um link de conexão. Nunca imprime a chave.
- [ ] A frase da linha 87 do `ORDEM-BUILD-FUNCIONAL.md` deixa de dizer que a chave é a variável `UNIPILE_API_KEY` e passa a apontar a conexão ativa, sem mudar o resto da regra.
- [ ] Deno: um mesmo conjunto de testes do contrato roda contra os dois adaptadores com servidores simulados. Os 52 testes do 06 e do 07 passam sem mudar de asserção.

## Pode mexer

- `supabase/functions/_shared/unipile/` (cliente e adaptadores, junto do módulo do canais-14).
- Os arquivos que hoje leem a chave ou escrevem a base: `sender-accounts/index.ts`, `unipile-account-status/index.ts`, `sequence-runner/index.ts`, `sequence-step-sends/index.ts`, `reply-proposal-send/index.ts`, `_shared/send-step-adapters.ts`, `_shared/send-chat-step-adapters.ts`. Só a fábrica do cliente.
- O script de diagnóstico e `.scratch/ORDEM-BUILD-FUNCIONAL.md`, linha 87.

## Não mexa

- A decisão de envio, de bloqueio, de aprovação e de privacidade (`send-chat-step.ts`, `send-step.ts`).
- Migrations e banco: a leitura da conexão usa o que o canais-15 criou.
- O webhook e a tradução dos eventos v1: é do canais-17. `unipile-account-status` só ganha a fábrica nova.
- Anexos, InMail e o frontend.

## Migration

Nenhuma.

## Passos do Nan

1. Depois do merge, publicar as funções que usam o cliente: `sender-accounts`, `sequence-runner`, `sequence-step-sends`, `reply-proposal-send` e `unipile-account-status` (esta com `--no-verify-jwt`, como já é).
2. Rodar o `unipile:conferir` com a conexão ativa para ver que a conta responde. Com uma conta v1, esse é o primeiro contato real com os campos da v1: registrar nos Comments o que a Unipile devolveu de fato.

## Comments
