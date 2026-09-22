---
status: superseded by ADR-0005
---

# Agentes fixos, sem criação pelo Cliente

A Althius oferece um conjunto fechado de Agentes (Scopus, Ethos, Rhetor, Oraculum). O Cliente só pode personalizar esses Agentes (instruções, tom de voz, base de conhecimento, ferramentas, canais), e não pode criar Agentes próprios nem renomeá-los. A intenção é, no futuro, montar planos a partir de quais Agentes cada Cliente usa, e um catálogo fechado com nomes estáveis mantém essa porta aberta. O modelo de cobrança ainda não foi definido, e hoje os Agentes **não** são vendidos um a um.

## Considered Options

- Permitir que o Cliente crie Agentes (formulário e conversa): descartado, porque dilui um futuro modelo de planos por Agente.
