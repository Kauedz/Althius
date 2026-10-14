# Confiabilidade das cascatas (PR-B)

**Origem:** validação de produção de 13/10/2026 e a rodada cancelada `bc-b38b6a82`. A spec de cascatas continua em `.scratch/sinais-cascata/`. Este diretório só cobre o que a rodada real quebrou ou deixou caro.

## Problema

1. O Diário Oficial devolve a data como `dd/mm/aaaa`. Uma leitura que trata isso como mês/dia joga a publicação fora da janela e a cascata diz que o resultado não confere.
2. A meta ESG manda todas as Contas numa busca só. Com doze Contas e duas consultas, a chamada estoura o prazo da função.
3. O custo gravado na execução às vezes é a soma dos eventos, que fecha antes do total da rodada. O livro da rodada fica abaixo do que a conta de coleta cobra.
4. CNPJ novo pediu 100 empresas e chegou perto do teto de US$ 0,50 da cascata.
5. A amostra de validação (`validation_sample`) só era preenchida quando o casamento de fatos achava a empresa. Cascatas que descartam a empresa antes disso (CNAE eletrointensivo, Grupo A, vaga que não é Conta) saíam sem amostra.

## O que muda

- Data do DOU: `dd/mm/aaaa` primeiro, data ISO como reserva, data impossível não passa. A frase exata do termo continua obrigatória. A amostra real de 13/10/2026 fica em `supabase/functions/_shared/cascata-de-sinais/__fixtures__/dou_brasildados.json`.
- Meta ESG: lotes de 10 Contas (1 a 50, pelo pedido `empresasPorLote` ou pelo modelo do passo), prazo de 35 s por lote (10 a 90, `prazoSegundos`). O cursor `busca-esg` guarda o índice. Lista de Contas diferente recomeça. O que já voltou fica quando o prazo acaba ou um lote seguinte falha.
- Custo: `GET /v2/actor-runs/{id}` até `usageTotalUsd` (ou o de `stats`) ficar positivo e igual em duas leituras. Sem total, vale a leitura antiga (soma dos eventos). Nunca a estimativa do passo no lugar de um número lido. O rodízio `APIFY_TOKEN_1`..`APIFY_TOKEN_5` e o legado `APIFY_TOKEN` não mudam.
- CNPJ novo: no máximo 25 empresas e US$ 0,20 por rodada, no código mesmo se o banco ainda disser 100. O pedido ou o modelo podem subir (`tetoResultados`, `tetoUsd`), sem passar de `maxItems`. A chamada para no menor entre esse teto e o que resta da cascata. O teto da cascata continua US$ 0,50.
- Amostra: até 5 empresas que não são Conta, sem nome com CPF. Junta com o que o passo anterior já guardou. O motor só grava quando a rodada é de validação.

## Fora

Catálogo e telas de Sinais (outro PR). Marcar cascata como disponível. Deploy. Segredos. Aplicar migração no projeto remoto. A busca longa do Diário Oficial continua fora das reservas.

## Tickets

1. Data do DOU.
2. Lotes da meta ESG.
3. Custo real do run.
4. Teto do CNPJ novo.
5. Amostra em todas as cascatas de Conta.
