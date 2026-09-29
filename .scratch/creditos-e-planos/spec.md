# Spec: Créditos e planos

**Status:** ready-for-agent (tickets 01–05 e 07); 06 e 08 dependem de decisões externas

**Frente:** cobrança e uso. Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md).
Decisão: [ADR-0019](../../docs/adr/0019-creditos-e-cobranca-por-usuario.md), sabatina de 29/09/2026.

## Problem Statement

A Althius vai rodar coisas que custam dinheiro de verdade: actors do Apify (conta da Althius), fornecedores de dados e
chamadas de modelo. Hoje nada é medido, nada tem limite e qualquer um que cria conta usa tudo de graça. Um Monitoramento
automático sem teto pode gastar sem ninguém ver.

## Solution

Cada Workspace tem um **saldo de créditos** único, abastecido pelo plano (R$ 500 por usuário por mês, cada assento traz
a sua cota) e por pacotes, e um extrato de lançamentos. O que gasta: varredura de Sinais (1 por Conta), pessoa coletada
(1), e-mail revelado (2), telefone revelado (5, só quando acha) e cada Execução de Agente (1 por rodada; com a chave de
IA do cliente, 20%). O setup (R$ 5.000) é serviço e libera o Workspace. Nada automático roda sem um teto aprovado; um
interruptor "confirmar ou automático" por tipo de ação fica numa página só. Saldo zero pausa o que é pago. Sem
assinatura, a pessoa só entra na Demonstração.

## User Stories

1. Como Administrador, quero ver o saldo e o extrato do Workspace, para saber onde o crédito foi.
2. Como Administrador, quero um limite mensal por pessoa, para ninguém gastar o saldo de todos.
3. Como Administrador, quero escolher confirmar ou automático por tipo de ação e um teto para cada automático.
4. Como participante, quero ver o custo antes de rodar uma ação paga no modo confirmar.
5. Como participante, quero que a ação pare com um motivo claro quando o saldo acaba, sem nada inventado.
6. Como Administrador, quero adicionar um Observador que só consulta e não paga assento.
7. Como dono da Althius, quero que o Workspace real só abra com assinatura, e a Demonstração fique aberta.
8. Como dono da Althius, quero que uma conta não seja usada por várias pessoas (sessão única).
9. Como cliente, quero usar a minha chave de IA (ex.: Claude), gastando menos crédito.
10. Como dono da Althius, quero o custo real de cada ação, para fechar a tabela e as cotas.

## Implementation Decisions

- **Medir antes de cobrar (ticket 01):** tokens e modelo por Execução; custo devolvido pelo Apify por execução de
  actor; relatório por Workspace e mês. Os números da tabela de créditos são provisórios até esse dado existir.
- **Contrato de crédito (ticket 02):** tabela privada de lançamentos e funções `reserve_credits`, `settle_credits`,
  `release_credits` e `get_credit_balance`, idempotentes pela chave da ação. Toda ação paga reserva antes, liquida pelo
  custo real (que pode ser zero: telefone não achado) e libera na falha. Nenhuma outra spec debita fora desse contrato.
- **Quem paga:** o Workspace onde a ação acontece. Crédito não passa de um Workspace para outro. O Observador não gasta.
- **Interruptor e teto (ticket 03):** uma página só nas Configurações; o padrão de todo tipo é "confirmar". Automático
  exige teto mensal; ao atingir, vira confirmar até o próximo ciclo e avisa o Administrador.
- **Planos e assentos (ticket 05):** assento pago por usuário; papel Observador novo (só leitura, sem canais, sem
  crédito, fora dos assentos), por migration aditiva, sem mudar os papéis existentes.
- **Assinatura (ticket 06):** o meio de pagamento é decisão do Nan (a confirmar); até lá, a liberação é manual pelo
  setup. A Demonstração continua aberta e sem backend.
- **Sessão única (ticket 07):** entrar noutro aparelho encerra a sessão anterior; os canais continuam presos à pessoa;
  termos de uso proíbem compartilhar acesso. Mexer nas configurações do Supabase Auth é passo do Nan.
- **Chave de IA do cliente (ticket 08):** cifrada no Vault do Supabase, lida só pela Edge Function; nunca no navegador
  nem no chat.
- **Apify:** só a conta da Althius; o cliente nunca conecta a dele (ADR-0019).

## Testing Decisions

- pgTAP: reservar, liquidar e liberar idempotentes; saldo nunca negativo; limite por pessoa; outro Workspace nunca lê
  nem debita; Observador sem gasto; teto do automático.
- Deno: a ação paga reserva antes e libera na falha (fornecedor falso).
- Frontend: saldo, extrato, página de interruptores, custo antes de rodar, com o banco em memória.

## Out of Scope

- Nota fiscal e contabilidade.
- Preço dos pacotes avulsos (a confirmar com o dado do ticket 01).
- Cobrança do setup (é contrato de serviço, fora da plataforma).

## Further Notes

- Tickets em `issues/`. 01 e 07 começam já; 02 depende de 01; 03, 04 e 05 dependem de 02; 06 depende de 05 e da
  escolha do pagamento; 08 depende de 04.
- As specs `sinais-reais` e `enriquecimento-em-cascata` só ligam o automático depois do ticket 03 desta spec.
