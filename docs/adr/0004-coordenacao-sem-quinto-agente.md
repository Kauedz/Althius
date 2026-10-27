# Coordenação pela Althius, sem um 5º Agente

> Parcialmente substituída pela [ADR-0033](0033-sinais-first.md) em 26/10/2026: o composer de `/` passa a classificar a intenção entre criar um Sinal, sugerir um Modelo ou responder direto, em vez de rotear sempre para as quatro Especialidades; continua não sendo um Agente.

A página de Agentes ganha um composer onde o usuário faz um pedido sem escolher um Agente, e a LLM da plataforma divide o pedido entre os Agentes necessários (incluindo sempre os @mencionados) e junta as respostas, no estilo do Grok. Decidimos que essa Coordenação **não é um Agente**: não tem nome, persona, página, Memória nem Personalização, e não age sobre Integrações. Assim o catálogo fechado de 4 Especialidades (ADR 0005) continua intacto e toda ação externa continua tendo um Agente responsável, sob a sua Permissão (ADR 0002). Quando precisa de uma Especialidade, a Coordenação chama o Agente padrão, a menos que o pedido mencione um Agente criado. A Coordenação existe só no composer; nos Canais continua sendo preciso @mencionar um Agente.

## Considered Options

- Um 5º Agente coordenador, com nome e página: descartado, porque dilui o catálogo de Especialidades que vai sustentar os planos (ADR 0005).
- A própria marca Althius como persona que responde: descartado, porque confunde a plataforma com quem fala.
- Coordenação que também age sobre Integrações: descartado, porque criaria ações externas sem um Agente responsável na Atividade e nas Aprovações.
