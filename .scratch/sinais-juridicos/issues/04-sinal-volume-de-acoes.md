# 04: Sinal "Volume de ações novas contra a Conta" (R)

**What to build:** quando o número de ações novas contra uma Conta-alvo (por CNPJ e assunto) num mês passa do normal dela, grava um Sinal externo da família Jurimetria com tribunal, classe, assunto, data e link da fonte, sem nome de parte pessoa física. Chave: `volume|<CNPJ>|<assunto>|<AAAA-MM>`. Só vira ticket de verdade se a pesquisa (01) mostrar uma fonte que traga a parte do processo.

**Blocked by:** 01, 02 e o primeiro ticket filho do 09 de `sinais-reais`.

**Status:** needs-triage

## Pode mexer

- A definir ao sair do `needs-triage`, depois da pesquisa (01).

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link`.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Teste com resultados de exemplo fictícios, sem dado pessoal.
- [ ] Nenhuma parte pessoa física na evidência (LGPD).
- [ ] O Sinal nunca dispara mensagem automática (política do ticket 02).
- [ ] Custo medido e estado "Em teste" antes de "Disponível".

## Passos do Nan

A definir ao sair do `needs-triage`.

## Comments
