# 04: Bloco Sequência no detalhe da Conta-alvo

**What to build:** no detalhe da Conta-alvo (além de Sinais, Contatos e Interações) aparece a seção **Sequência**: status, cobertura e atalho para o documento quando existir; estado vazio com ação para criar quando não existir. Conta com um Contato pode ter sequência. Continua valendo no máximo uma sequência por Conta-alvo.

**Blocked by:** 02 (FonteDeSequencias e item Sequências na casca)

**Status:** ready-for-human

- [x] O detalhe da Conta-alvo mostra a seção Sequência com status e cobertura quando houver uma
- [x] Sem sequência, o vazio oferece criar
- [x] Conta com 1 Contato consegue ter sequência
- [x] Tentativa de segunda sequência na mesma Conta é rejeitada ou atualiza a existente (um único comportamento, testado)
- [x] Testes cobrem vazio, preenchido e regra de uma por Conta
