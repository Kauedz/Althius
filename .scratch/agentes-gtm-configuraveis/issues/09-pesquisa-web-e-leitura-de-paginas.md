# 09: Pesquisa web e leitura de páginas de ponta a ponta

**What to build:** O usuário manda um link ou pede uma informação atual e o Agente pesquisa, lê e entrega a análise, em vez de responder que não tem acesso à internet.

**Blocked by:** 02.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, user stories 15–17, 22, 42; seção "Onde a integração limita o Hermes hoje", itens 1 e 2.

## Critérios de aceite

- [ ] Pesquisa web e leitura de páginas funcionam pela Conversa, usando a capacidade que o inventário do ticket 02 provou na versão fixada (nativa do Hermes ou ferramenta da Althius).
- [ ] As regras do prompt passam a mandar investigar com as ferramentas disponíveis antes de responder "não sei" ou de perguntar, mantendo "nunca inventar" e "nunca declarar feito o que depende de Aprovação".
- [ ] A ferramenta usada aparece na apresentação de ferramentas que já existe na Conversa.
- [ ] Site fora do ar ou bloqueado produz uma limitação específica ou uma alternativa, não uma recusa genérica.
- [ ] Texto de páginas é tratado como dado: não altera instruções nem concede autorização.
- [ ] Terminal, arquivos do servidor, execução de código e controle do computador continuam desligados.
- [ ] O custo da pesquisa entra no registro de créditos da Execução.

## Pode mexer

Regras do prompt do worker, configuração e documentação do Hermes, ferramenta de web da Althius se o inventário indicar.

## Não mexa

Ponte de ferramentas (ticket 10), limites gerais (ticket 11), banco.

## Passos do Nan

- Religar o toolset de web na configuração do Hermes da máquina do worker e reiniciar o serviço (o agente entrega os comandos PowerShell e o trecho de configuração).

## Validação

Testes do worker com Hermes simulado: pedido com link chama a ferramenta e grava o resultado; site indisponível gera limitação específica. Aceite com Hermes real: abrir um site e pesquisar uma informação atual, com evidência da ferramenta na Execução registrada nos Comments.
