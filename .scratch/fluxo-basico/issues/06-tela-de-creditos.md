# 06: Tela de Créditos

**Status:** ready-for-human

**GATE:** Sem migration. Nenhuma Edge Function esperada.

## Problema

O Workspace já possui saldo, preços e lançamentos no backend, mas a pessoa precisa consultar essas informações em uma tela clara, sem valores em moeda nem linguagem interna.

## Solução

Adicionar Créditos como seção de Configurações, com saldo, preços por ação, extrato filtrável e orientação para falar com a equipe Althius.

## Pode mexer

- `projeto-althius-frontend/src/fonte/creditos.ts`, tipos e fonte simulada
- `projeto-althius-frontend/src/paginas/configuracoes/`
- testes correspondentes

## Não mexa

- Stripe, conectores, canais, Edge Functions e banco remoto
- valores em US$, a palavra “Teto” e letras de nicho A–H na interface

## Critérios de aceite

- [x] A tela de Créditos é acessível em Configurações e mostra saldo disponível, reservado e lançado, ou “Ilimitado (interno)”.
- [x] A tabela de preço por ação usa o catálogo existente e mostra apenas créditos.
- [x] O extrato mostra data, ação em pt-BR, Sinal quando disponível e créditos positivos/negativos, com filtros por ação e Sinal.
- [x] A tela explica que créditos são concedidos pela equipe Althius por contrato e oferece orientação de contato em texto.
- [x] A Demonstração continua renderizando com dados simulados.
- [ ] CI e os três resets do banco passam.

## Comments

- 28/10/2026 — Implementação em andamento; nenhuma migration ou Edge Function prevista.
- 28/10/2026 — A seção foi adicionada a Configurações, usando `get_credit_balance`, `list_credit_action_prices` e `list_credit_entries`; a Demonstração recebeu dados simulados. O RPC existente não expõe o Sinal associado ao lançamento, então a coluna permanece “—” no Workspace real até uma decisão/migration de associação. Não há migration nem deploy de Edge Function.
- 28/10/2026 — `tsc -b --noEmit`, teste focado de Plano (7 testes), `npm run lint` e `npm run build` passaram; lint tem apenas avisos preexistentes. O teste específico da tela, suíte completa e CI/“três resets” ainda precisam ser executados pelo CI/revisor.
- 28/10/2026 — `tsc -b --noEmit`, testes focados da seção/fonte (4 testes) e lint passaram; lint mantém apenas avisos preexistentes. A tela agora trata saldo indisponível e ilimitado, catálogo sem preços/descrições internas, extrato vazio, rótulos de lançamentos e filtros; nenhum migration ou Edge Function foi alterado. A suíte completa/build e CI/“três resets” ainda precisam ser confirmados pelo CI/revisor.

- 28/10/2026 14h25 (revisão Grok Bot) — Seção reescrita em JSX legível com partes puras (CartaoDeSaldo, TabelaDePrecos, Extrato); Ilimitado (interno) num só cartão; saldo nulo vira mensagem; descrição do catálogo com moeda/limite interno não aparece; nomes pt-BR para as 8 ações do catálogo de prod e 'Outra ação' para chave desconhecida. Vitest `secao-creditos.test.tsx` 10/10; suíte completa, lint e build verdes. O Sinal no extrato real vem no PR seguinte (8b, com migration).
