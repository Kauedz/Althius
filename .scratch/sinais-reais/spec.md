# Spec: Sinais reais

**Status:** ready-for-agent

**Frente:** Sinais (backend real). Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md).
Telas e vocabulário: [`modulo-de-sinais`](../modulo-de-sinais/spec.md). Decisões: [ADR-0007](../../docs/adr/0007-sinal-disparado-torna-conta-quente.md),
[ADR-0019](../../docs/adr/0019-creditos-e-cobranca-por-usuario.md), sabatina de 29/09/2026 (Q50: lançar 9 Sinais com
aviso dos próximos). Pesquisa de actors: [`modulo-de-sinais/pesquisa-actors-apify.md`](../modulo-de-sinais/pesquisa-actors-apify.md).
Relação com a outra sessão: detalha o CRM-11 (`crm-real-e-stack`), que é da outra sessão. **Quem pegar um ticket daqui
combina com o Nan antes.**

## Problem Statement

Sinais são o diferencial da Althius: dizem por que uma Conta deve ser abordada agora. Hoje o módulo de Sinais é um
mockup com dados simulados; nenhum Monitoramento roda, nenhuma Conta fica Quente de verdade, e as Contas que não
deram Sinal ficam paradas para sempre.

## Solution

Um **registro de actors** do Apify (só a conta da Althius) liga cada tipo de Sinal a um actor testado. Um Monitoramento
real roda o actor sobre as Contas do público dele, grava Sinais com data, fonte e evidência, não repete o mesmo
acontecimento e deixa a Conta Quente por 30 dias. O lançamento traz **9 Sinais**; o catálogo mostra o estado de cada
card (Disponível, Em teste, Em breve) e **avisa que novos Sinais entram depois**. Uma **reativação** mensal automática,
dentro do teto, revisita as Contas que esfriaram, e a Conta tem o botão "Buscar Sinais de novo". Depois vêm os Sinais
próprios da Althius para as lacunas brasileiras e o Sinal personalizado.

## Catálogo de lançamento (9 actors)

| Sinal | Actor |
| --- | --- |
| Vaga aberta no LinkedIn | `curious_coder/linkedin-jobs-scraper` |
| Vaga no Indeed Brasil | `valig/indeed-jobs-scraper` |
| Contato mudou de emprego ou foi promovido | `harvestapi/linkedin-profile-scraper` |
| Nova liderança | `harvestapi/linkedin-profile-search` |
| Entradas e saídas na empresa | `harvestapi/linkedin-company-employees` |
| Anúncio público de movimentação | `harvestapi/linkedin-post-search` |
| Anunciando no LinkedIn | `silva95gustavo/linkedin-ad-library-scraper` |
| Anunciando na Meta | `curious_coder/facebook-ads-library-scraper` |
| Avaliações novas ou negativas no Google Maps | `compass/google-maps-reviews-scraper` |

Preço de cada um: "a confirmar" no console da Apify antes de entrar na tabela de créditos (ver a pesquisa).

**Sinais próprios, nesta ordem:** CNPJ novo e nova filial (bases abertas da Receita Federal), Gupy, monitor de anúncios
(começou ou parou), site fora do ar, Reclame Aqui, alvarás e lançamentos imobiliários.

## User Stories

1. Como participante, quero criar um Monitoramento de um Sinal disponível e vê-lo rodar de verdade.
2. Como participante, quero ver a evidência (fonte, data, trecho) de cada Sinal.
3. Como participante, quero que o mesmo acontecimento não conte duas vezes.
4. Como participante, quero saber quais Sinais estão disponíveis e quais chegam em breve.
5. Como Administrador, quero que a varredura automática respeite o teto aprovado.
6. Como participante, quero que as Contas com Fit que esfriaram sejam revisitadas todo mês.
7. Como participante, quero buscar Sinais de novo numa Conta, vendo o custo antes.
8. Como participante, quero descrever um Sinal que não existe e receber uma montagem ou um pedido ao time.
9. Como participante da Demonstração, quero ver o catálogo completo, simulado.

## Implementation Decisions

- **Registro de actors** (tabela de serviço): id, versão, preço conhecido, tipo de Sinal, estado (disponível, em teste,
  fora). Só o estado "disponível" deixa criar Monitoramento real.
- **Execução:** Edge Function `signal-scan` chama o actor com o token da Althius (segredo do Nan), teto de custo por
  execução, e grava o custo devolvido (`creditos-e-planos` 01). Toda varredura reserva e liquida crédito pelo contrato
  de `creditos-e-planos` 02 (1 por Conta varrida).
- **Deduplicação:** chave do acontecimento por tipo (ex.: empresa + cargo + data da vaga); reencontrar não conta nem
  renova a validade (ADR-0007).
- **Quente:** 30 dias a partir do Sinal; vencidos antes da abordagem, a Conta volta a Descoberta (`kanban-de-prospeccao` 02).
- **Reativação:** mensal, só Contas com Fit sem Sinal válido, dentro do teto; manual pelo botão, com o custo antes.
- **LGPD:** avaliações do Google Maps não guardam dado pessoal de quem avaliou; perfis do LinkedIn guardam só dado
  profissional público, com origem e data.
- **Tela:** as páginas de Sinais existentes passam a ler a Fonte real no Workspace operacional; a Demonstração continua
  simulada.

## Testing Decisions

- Deno: `signal-scan` com o Apify falso (sucesso, teto estourado, falha, repetição).
- pgTAP: Sinais só do Workspace; deduplicação; validade de 30 dias; crédito reservado e liquidado.
- Frontend: estados do card, aviso de "em breve", custo antes do botão.

## Out of Scope

- A conta do Apify do cliente (nunca: ADR-0019).
- Sinais internos do histórico comercial (CRM-10, da outra sessão).
- Actors fora dos 9 antes de passarem no teste.

## Further Notes

- Tickets em `issues/`. 01 começa já; 02 depende de 01 e de `creditos-e-planos` 02–03; 03–06 dependem de 02; 07 depende
  de 01; 08 depende de 02 e de `creditos-e-planos` 03; 09 e 10 dependem de 02.
