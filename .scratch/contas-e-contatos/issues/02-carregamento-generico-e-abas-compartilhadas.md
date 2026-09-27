# 02: Preparação: carregamento genérico e abas sublinhadas compartilhadas

**What to build:** preparar o código para uma segunda fonte de dados, sem mudar nada do que o usuário vê.

- **Carregamento:** hoje o carregamento de dados só funciona com a fonte dos Agentes. Depois deste ticket, ele serve qualquer fonte com operações assíncronas e um `observar`, para que as telas do módulo Contas e Contatos carreguem da `FonteDeContas` do mesmo jeito.
- **Abas:** a navegação de abas sublinhadas da página do Agente vira um componente reutilizável, que a aba Contas/Contatos vai usar.

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] O carregamento de dados não depende mais do tipo `FonteDeAgentes` e continua recarregando quando a fonte avisa uma mudança
- [x] As abas sublinhadas são um componente compartilhado, e a página do Agente passa a usá-lo
- [x] Nada muda na tela: os testes de comportamento atuais passam sem alteração no que verificam

## Comments

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.
