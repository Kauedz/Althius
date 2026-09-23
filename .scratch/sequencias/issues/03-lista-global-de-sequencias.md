# 03: Lista global de Sequências

**What to build:** a página de lista do Workspace mostra as sequências do Workspace: título, descrição curta, contagem, busca por Conta-alvo, filtro por status, linha com Conta-alvo, status, cobertura e resumo do próximo step, estado vazio com orientação e erro com "Tentar de novo". Há caminho para "Nova sequência" pedindo Conta-alvo. Clique na linha abre o detalhe (mesmo que o detalhe ainda seja mínimo até o ticket 05).

**Blocked by:** 02 (FonteDeSequencias e item Sequências na casca)

**Status:** ready-for-agent

- [ ] A lista mostra Conta-alvo, status, cobertura e próximo step a partir da fonte
- [ ] Busca e filtro por status funcionam na sessão
- [ ] Estado vazio e erro com "Tentar de novo" seguem o padrão de Contas
- [ ] "Nova sequência" cria via fonte para uma Conta-alvo (máx. uma por Conta)
- [ ] Testes cobrem lista populada, vazia, erro e criação básica
