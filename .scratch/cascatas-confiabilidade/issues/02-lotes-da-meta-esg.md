# 02: Lotes da meta ESG

**What to build:** A busca da meta ESG não manda todas as Contas de uma vez. O padrão é 10 Contas por chamada (pedido `empresasPorLote` ou o modelo do passo, de 1 a 50) e 35 segundos por lote (`prazoSegundos`, de 10 a 90). As Contas saem ordenadas pelo id. O cursor `busca-esg` guarda índice, assinatura (os ids juntos) e total. Lista diferente recomeça do zero. Quando o prazo da função acaba ou um lote seguinte falha, o que já voltou fica e o cursor avança só os lotes concluídos. Na rodada seguinte a busca continua dali. No fim da lista o índice volta a zero. A cadência continua mensal: uma rodada cobre o que couber no prazo da função.

**GATE:** nenhum bloqueio. Não editar `src/**/sinais/**`, a RPC de Sinais de mercado, `proposta_recusada` nem `catalogo.ts`. Sem deploy. Sem aplicar migração. Sem segredo.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Pode mexer

- O passo `busca_esg` em `passos/icp-d.ts`.
- O motor, só para guardar resultado parcial quando o lote declara retomada (`parcial`). Lote de CNPJ sem essa marca continua caindo na alternativa e descartando o parcial.
- Testes de `icp-d.test.ts`.
- Este ticket.

## Não mexa

- O casamento de domínio da marca (natura.net, naturaeco.com).
- A confirmação por palavra-chave na página.
- Catálogo e telas de Sinais.
- Migrações já escritas, segredos, Auth, deploy e o projeto remoto.

## Critérios

- [x] Doze Contas, com o relógio apertado a 10 s de folga, fazem um POST de 20 linhas (10×2), sem a Empresa 10, e o cursor fica em 10.
- [x] A rodada seguinte, com esse cursor, busca só a Empresa 10 e a 11 e o cursor volta a 0.
- [x] Assinatura diferente recomeça na Empresa 00.
- [x] Sem aperto de prazo, doze Contas viram dois POSTs (20 e 4 linhas) e o prazo pedido na consulta é 35 s.
- [x] `empresasPorLote: 3` em quatro Contas faz dois lotes, e o primeiro não traz a Empresa 03.
- [x] As duas Contas do teste antigo (Norte antes de Sul) continuam na mesma ordem de consulta.

## Passos do Nan

Nenhuma migração neste ticket. O código entra no mesmo deploy do ticket 04: `signal-cascade` e `signal-runner`, sem `--no-verify-jwt`. Não marcar cascata como disponível.

## Comments

- O relógio dos testes é fixo. Para o primeiro lote rodar e o segundo não, o teste avança o relógio no POST: antes, restam 10,5 s (o passo começa e o prazo da consulta cai para 10 s); depois, o segundo lote vê o prazo estourado.
