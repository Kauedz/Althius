# 09: Status, pause e métricas de demo

**What to build:** a demo consegue mostrar status Ativa / Pausada / Reunião / Esgotada de forma coerente. Quando a demo registra uma Interação de resposta na Conta-alvo, a sequência inteira fica Pausada (pause da conta, não só de um Contato). Métricas de step (enviados, replies etc.) são inventadas só para narrativa e claramente de demonstração — ausentes não quebram a UI. Sequência só criada continua não sendo Interação.

**Blocked by:** 04 (Bloco Sequência no detalhe da Conta-alvo), 05 (Detalhe da sequência — documento e timeline)

**Status:** closed

- [x] Interação de resposta na demo leva a sequência da Conta a Pausada
- [x] Fica explícito na UI que o pause é da Conta inteira
- [x] Métricas de demo aparecem rotuladas como demonstração e são opcionais
- [x] Criar sequência sozinha não cria Interação
- [x] Testes cobrem transição para Pausada e UI sem métricas
