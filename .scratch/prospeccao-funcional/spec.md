# Spec: Prospecção funcional

**Status:** closed (28/10/2026: todos os tickets `closed`, salvo o B5 `wontfix`; migrations conferidas no remoto)

Sinais, Enriquecimento e Envio no Workspace operacional. Conferido na `origin/main` (`fdafd00`, PRs #145 a #147) em 02/10/2026. A auditoria de 01/10 (`.scratch/AUDITORIA-2026-10-01.md`, base `bda4514`) continua valendo neste recorte: esses PRs mudaram Conexões, o catálogo de conectores e o pedido de envio ao sistema comercial do cliente. Não mudaram o editor de Monitoramento, a ação `cnpj-receita`, o comitê, o revelar, o apagamento definitivo nem a ativação da Sequência.

A Althius é um Revenue OS. O sistema comercial do cliente continua sendo o principal.

## O que esta spec cobre

1. No Workspace operacional dá para criar um Monitoramento com id do banco e público feito das Contas reais, e o Sinal gravado aparece na Conta Quente.
2. A consulta de CNPJ, o comitê e o revelar de e-mail rodam com sessão, crédito e a entrada real do actor. Falha fica falha. A Persona chega ao Contato. Apagar a Conta leva o dado pessoal que hoje sobra.
3. Uma Sequência de WhatsApp ou LinkedIn, inclusive só de chat, se ativa pela tela, com os Destinos à vista. O titular vê as respostas desses canais.

## Decisões

- ~~Telefone fica de fora. A tela mostra a revelação de telefone como indisponível e não reserva nem debita crédito.~~ Superada em 28/10/2026 (decisão do Kauê, PR #342, `20261218020000_revelar_telefone_5_creditos.sql`): o telefone se revela por 5 créditos, com as mesmas regras do e-mail. O B5 virou `wontfix` e o critério de telefone do B3 deixou de valer.
- Crédito do Workspace de teste é passo humano. Nenhum ticket chama `grant_credits` nem altera saldo, teto ou plano.
- O preço em créditos da consulta de CNPJ não está na tabela (`account_scan` 1, `person_collected` 1, `email_revealed` 2, `phone_revealed` 5, `account_discovery` 5). O B1 pergunta o valor ao Nan antes de gravar a migration. Não inventa.
- Cada ticket que mexe no banco leva uma migration nova, timestamp UTC maior que `20261002112000`, e um pgTAP novo. Migration já aplicada não se edita. Função redefinida parte da definição mais recente na `main`.
- Teste antigo não se altera. Exceção autorizada: o `it` de `projeto-althius-frontend/src/fonte/supabase-contas.test.ts` nas linhas 136–141 (ticket A2).
- O 00 bloqueia o merge de todos. Os outros podem ser implementados em paralelo, respeitando o `Blocked by` de quem divide arquivo.
- C2 não foi publicado. O ciclo real da Unipile (canais 06 e 07) não rodou: os dois tickets seguem com o primeiro envio real por fazer, e o `GO-LIVE.md` ainda lista os campos de chat como não confirmados. Não há registro de uma resposta `@lid` vinda de outro chat. O comentário no código só diz que o id `@lid` não está confirmado.

## Tickets

| Ticket | Entrega | Bloqueado por |
| --- | --- | --- |
| 00 | Os seis checks da main verdes, do zero | Nenhum |
| A1 | Criar Monitoramento no modo real | Merge espera o 00 |
| A2 | Sinal visível na Conta Quente, sem fallback simulado no real | Merge espera o 00 |
| A3 | Actors validados ficam `available` por migration | A validação real; merge espera o 00 |
| B1 | `cnpj-receita` confere a sessão e reserva crédito | Merge espera o 00 |
| B2 | Comitê com a entrada do actor, falha visível, custo gravado, Persona no Contato | B1; merge espera o 00 |
| B3 | Revelar e-mail só cobra valor novo | B2; merge espera o 00 |
| B4 | Apagar a Conta leva Receita, propostas e Sinais com nome e LinkedIn | Merge espera o 00 |
| C1 | Ativar pela tela Sequência de WhatsApp ou LinkedIn | Merge espera o 00 |
| C3 | O titular vê as respostas de WhatsApp e LinkedIn | C1; merge espera o 00 |
| B5 | As RPCs de revelar recusam telefone (acrescentado em 24/10; superado pelo PR #342) | Nenhum |
| S1 | O aceite confere a permissão antes de devolver (acrescentado da auditoria de arquitetura) | Migration depois da `20261009040000` |

B1, B2 e B3 dividem `account-enrichment/handler.ts`. B2 e B3 dividem o provedor de contatos. C1 e C3 dividem o detalhe da Sequência. Por isso a cadeia, e não por uma dependência de produto entre o CNPJ e o comitê.

## Fora

Conexões e o catálogo de conectores. InMail. Seam de Canal. Stripe, plano e a tela de saldo. Sinais jurídicos. Reativação só no estágio Fit. Fila de Aprovações. Status e texto das outras specs. Proposta de resposta para WhatsApp e LinkedIn. Créditos do Workspace de teste.
