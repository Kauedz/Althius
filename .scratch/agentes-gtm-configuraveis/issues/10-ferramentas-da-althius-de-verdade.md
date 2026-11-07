# 10: Ferramentas da Althius como ferramentas de verdade do Hermes

**What to build:** O Hermes passa a enxergar e chamar as ferramentas da Althius como ferramentas próprias, no lugar da ponte de texto em que o modelo responde um JSON e o worker executa, para que o Agente escolha ferramentas e encadeie etapas de forma confiável.

**Blocked by:** 02, 04.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, user stories 18–21, 24; seção "Onde a integração limita o Hermes hoje", item 3.

## Critérios de aceite

- [ ] As ferramentas da Althius chegam ao Hermes pelo caminho que o inventário do ticket 02 indicou para a versão fixada (por exemplo, servidor MCP).
- [ ] Cada chamada revalida no servidor da Althius a Permissão, a Aprovação, o acesso à Integração e os Créditos antes do efeito. Um Agente criado por outro não herda autorização.
- [ ] O acesso de uma Execução é limitado ao Workspace e ao Agente dela; uma chamada não alcança dados de outro Workspace.
- [ ] Os eventos de ferramenta continuam gravados pelo contrato de Execuções e aparecem na apresentação de ferramentas que já existe.
- [ ] Repetir uma chamada após reconexão não duplica efeito externo.
- [ ] O modo atual pode ser mantido atrás de um interruptor até o aceite do ticket 18.

## Pode mexer

Worker, camada de ferramentas compartilhada, novo ponto de exposição das ferramentas, configuração do Hermes.

## Não mexa

Regras das ferramentas em si (o que cada uma faz), banco além do necessário para autorizar a chamada, telas.

## Passos do Nan

- Configurar no Hermes da máquina do worker o acesso às ferramentas da Althius e o segredo correspondente (o agente entrega o passo a passo; nunca pede chave no chat).

## Validação

Testes do worker: o Hermes simulado chama a ferramenta pelo caminho novo; Permissão negada impede o efeito; repetição não duplica. Aceite com Hermes real registrado nos Comments.
