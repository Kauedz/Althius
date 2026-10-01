# 03: Sinal "Tese nova no setor da Conta" (J)

**What to build:** quando um tema repetitivo, súmula ou tese nova atinge o setor de uma Conta-alvo (pela tabela de tema por setor), grava um Sinal externo da família Jurimetria com data, fonte e link do tema. Chave do acontecimento: `tese|<tribunal>|<número do tema>`. Adaptador no padrão dos de `sinais-reais`, em estado "Em teste" até passar numa execução real.

**Blocked by:** 01, 02 e o primeiro ticket filho do 09 de `sinais-reais` (como registrar um Sinal que não vem do Apify).

**Status:** needs-triage

## Pode mexer

- A definir ao sair do `needs-triage`, depois da pesquisa (01).

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link`.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Teste com resultados de exemplo fictícios, sem dado pessoal.
- [ ] O Sinal nunca dispara mensagem automática (política do ticket 02).
- [ ] Custo medido e estado "Em teste" antes de "Disponível".

## Passos do Nan

A definir ao sair do `needs-triage`.

## Comments
