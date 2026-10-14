# Automação com limite e "Contrato inativo"

Workspace sem contrato ativo fica pausado. A Equipe Althius (créditos ilimitados) continua. A renovação devolve o automático pausado por teto. A tela de Automação tem um limite mensal só, o do contrato.

## Decisão

Workspace sem contrato ativo (`private.workspace_contracts.status <> 'ativo'`, ou sem linha) e sem `credits_unlimited` não roda Monitoramentos, cascatas, rotinas nem Sequências. O motivo é `contrato_inativo`. Nada é apagado. A Equipe, ilimitada, roda.

## O que muda

1. **Pausa.** `private.automation_contract_block` devolve `contrato_inativo` ou nulo. Os relógios (Monitoramento, busca mensal, cascata, Rotina, Sequência) consultam isso antes de trabalhar.
2. **Aviso.** Banner na home (a visão geral do Workspace), em Sinais e em Sequências: "Contrato inativo. Fale com a equipe Althius para reativar." O botão abre o modal já existente.
3. **Equipe.** As três linhas `acao:varredura`, `acao:enriquecimento` e `acao:agentes` nascem em `automatico` sem teto. A tela diz "Ilimitado".
4. **Renovação.** Ao conceder os créditos do mês, `paused_at` dos três tipos de ação sai e os Administradores recebem o Aviso "Automação retomada com os créditos do novo mês" quando havia pausa por teto.
5. **Tela.** Um limite mensal do Workspace, o do contrato, editável pelo Administrador até os créditos da faixa. Por tipo de ação, só o interruptor Confirmar/Automático. O uso aparece como "X de Y créditos usados no mês". Agente, Integração e Rotina seguem com o teto próprio.

## Fora

Conectores, segredos, deploy, aplicar migração no remoto, merge, apagar dado.
