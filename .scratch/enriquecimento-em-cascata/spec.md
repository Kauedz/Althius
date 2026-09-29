# Spec: Enriquecimento em cascata

**Status:** ready-for-agent (01–03 e 05); 04 depende das Conexões

**Frente:** dados de Contatos. Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md).
Decisões: [ADR-0019](../../docs/adr/0019-creditos-e-cobranca-por-usuario.md), sabatina de 29/09/2026.

## Problem Statement

Uma Conta com Fit só vira abordagem quando a Althius sabe quem são as 3 pessoas certas (Decisor, Influenciador,
Campeão) e como falar com elas. Hoje os Contatos são digitados ou importados à mão; não há coleta do comitê de compra
nem revelação de e-mail e telefone.

## Solution

Uma **cascata** de fornecedores de dados da Althius, em ordem (actors do Apify de LinkedIn e da Receita Federal
primeiro, fornecedores pagos depois), atrás de um contrato único. Quando uma Conta vira Fit, o Ethos busca os 3 perfis
das Personas do Playbook: sozinho no modo automático, só sugere no confirmar. Para um Contato, a cascata tenta os
fornecedores até achar o e-mail ou o telefone e **só cobra quando acha**. O que o cliente já tem no Apollo, no Lusha ou
no Clay é importado sem crédito; enriquecimento novo é sempre da Althius.

## User Stories

1. Como participante, quero que as 3 pessoas certas de uma Conta com Fit apareçam, conforme as Personas do Playbook.
2. Como participante, quero revelar o e-mail ou o telefone de um Contato e pagar só se achar.
3. Como Administrador, quero escolher se a coleta é automática (com teto) ou só sugerida.
4. Como participante, quero importar os contatos que já tenho no Apollo, no Lusha ou no Clay, sem gastar crédito.
5. Como participante, quero saber de onde veio cada dado e quando.
6. Como titular, quero que o meu dado seja apagado por inteiro quando o Contato for apagado.

## Implementation Decisions

- **Contrato único** da cascata: entrada (Conta ou Contato e o que procurar), saída (valor, fornecedor, confiança, custo).
  Cada fornecedor é um adaptador injetado, no padrão handler/index das Edge Functions.
- **Crédito:** pessoa coletada 1, e-mail 2, telefone 5, só quando acha; reserva antes, liquida pelo que achou, libera se
  não achou (`creditos-e-planos` 02). Automático só com teto (`creditos-e-planos` 03).
- **Gravação:** e-mails e telefones pelo `set_contact_channels` (ticket 27 do CRM, até 3 de cada); nunca redefinir as
  funções da frente de Conexões.
- **Origem e data** em todo dado coletado; o apagamento do Contato (CRM-18) leva os canais.
- **Apollo, Lusha, Clay do cliente:** só importam e sincronizam o que ele já tem, pelo Acesso dele (`conexoes-funcionais` 10–12).

## Testing Decisions

- Deno: a cascata com fornecedores falsos (acha no segundo, não acha em nenhum, falha no meio) e a cobrança só quando acha.
- pgTAP: canais gravados no Contato certo do Workspace; crédito liquidado; outro Workspace nunca lê.
- Frontend: botão revelar com custo, estado "não encontrado" sem cobrança.

## Out of Scope

- Comprar bases de dados em massa.
- Enriquecimento pelos créditos do Apollo, Lusha ou Clay do cliente.

## Further Notes

- Tickets em `issues/`. 01 começa já; 02 depende de 01, `playbook-do-workspace` 01 e `creditos-e-planos` 03; 03 depende
  de 01 e `creditos-e-planos` 02; 04 depende de `conexoes-funcionais` 10–12; 05 depende de 03.
