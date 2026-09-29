# Créditos por Workspace, cobrança por usuário e a inteligência sempre da Althius

A Althius cobra um **setup** fechado (R$ 5.000, o serviço de implementação: o playbook completo do cliente, os Sinais
escolhidos, 1 Sinal personalizado, CRM e canais conectados) e uma **mensalidade de R$ 500 por usuário**. Cada usuário
traz uma cota de créditos para um **saldo único do Workspace**; o Administrador pode limitar o gasto de cada pessoa.
O Observador (quem só olha, sem canais nem Agentes) não paga. Paga o Workspace onde a ação acontece: o pessoal gasta o
seu, o da empresa gasta o da empresa, e não há transferência entre eles.

Gastam crédito as ações que custam dinheiro à Althius: varredura de Sinais (por Conta varrida), enriquecimento (por
pessoa coletada e por dado revelado, **só quando acha**) e Execuções de Agentes (por Agente e por rodada). A Execução
com a chave de IA do próprio cliente gasta 20% do normal, que paga a orquestração. Nada automático roda sem um **teto
mensal aprovado**; chegou no teto, pausa e avisa. Cada tipo de ação tem um interruptor "confirmar ou automático", o
mesmo das Permissões ([ADR-0002](./0002-permissoes-ler-propor-executar.md)). Saldo zerado para as ações pagas; dados,
leitura, Sequências em andamento e o CRM continuam.

A inteligência é da Althius: Sinais, coleta e enriquecimento novo rodam na conta do Apify e nos fornecedores da
Althius. O Apollo, o Lusha e o Clay do cliente servem para trazer o que ele já tem, não para substituir a cascata da
Althius; o que a Althius faz em cima do dado (Fit, Personas, escrita, Sinais) sempre gasta crédito.

Não há uso grátis enquanto não houver clientes: a Demonstração fica aberta para ver o produto, e o Workspace real só é
liberado ao assinar. Um login não pode ser compartilhado: sessão única, canais presos à pessoa e termos de uso.

A tabela de créditos por ação e a cota de cada usuário são provisórias até medir o custo real de um cliente por um mês;
o preço do crédito é o custo real vezes uma margem (referência inicial: 3x).

## Considered Options

- Cota por usuário, sem saldo comum: descartada, porque trava quem usa muito enquanto sobra crédito de quem usa pouco.
- Cascata começando pelo Apollo ou Lusha do cliente: descartada pelo Nan; muitas empresas brasileiras não estão nessas
  bases, e a coleta pela Receita Federal e pelos Sinais é o diferencial da Althius.
- Teste grátis com créditos: descartado por ora, porque a Althius não tem receita para bancar o custo; revisitar com
  clientes pagando.
