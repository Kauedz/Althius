# 05: Amostra em todas as cascatas de Conta

**What to build:** Com `validacao: true` (`permitirTeste` no motor), a execução guarda até 5 empresas achadas que não são Conta do Workspace: CNPJ de 14 dígitos ou nulo, e o nome. Nome com CPF, ou maior que 200 caracteres, fica de fora. Um passo não apaga a amostra que outro já guardou. Entra quem o casamento de fatos descarta, quem o casamento de vaga descarta, quem o CNAE eletrointensivo não casa com uma Conta, e quem o Grupo A acha e não é Conta (a lista da CCEE continua sem ser lida quando ninguém é Conta). Fora da validação, nada é gravado. Cascata de mercado não ganha amostra. Workspace sem Conta continua `sem_contas` antes dos passos.

**GATE:** nenhum bloqueio. Não editar `src/**/sinais/**`, a RPC de Sinais de mercado, `proposta_recusada` nem `catalogo.ts`. Sem deploy. Sem aplicar migração. Sem segredo. A coluna `validation_sample` já existe (`20261014170000`); não criar outra.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Pode mexer

- `lembrarAmostra` em `passos/empresas.ts` e a chamada em `casar-com-contas.ts`.
- Os passos D1 e D2 em `icp-d.ts`, só para guardar a empresa antes de descartá-la.
- Testes de `empresas.test.ts` e `icp-d.test.ts`.
- Este ticket.

## Não mexa

- A coluna e a migração `20261014170000_amostra_de_validacao.sql`.
- O teto de 5 e o descarte de nome com CPF.
- Catálogo e telas de Sinais.
- Segredos, Auth, deploy e o projeto remoto.

## Critérios

- [x] `casar_fatos_com_contas` guarda 5 CNPJs e descarta o sexto e o nome com CPF.
- [x] `casar_com_contas` acrescenta a empresa que não é Conta e não apaga a amostra que já estava.
- [x] D1, com validação, guarda GAMA CIMENTOS (`99000111000100`) e o Sinal da Alfa continua.
- [x] D2, com nove empresas que não são a Conta e validação ligada, guarda 5, não lê a lista da CCEE e não grava Sinal.

## Passos do Nan

Nenhuma migração neste ticket. O código entra no mesmo deploy do ticket 04: `signal-cascade` e `signal-runner`, sem `--no-verify-jwt`. Uma rodada com `validacao: true` de CNAE eletrointensivo ou de Grupo A, quando a empresa achada não é Conta, preenche a amostra da execução.

## Comments

- O teste do Grupo A precisa de ao menos uma Conta no Workspace que não seja nenhuma das empresas achadas. Sem Conta nenhuma, o motor nem chega nos passos.
