# 26: Nomes no lugar de UUIDs no modo operacional

**What to build:** no Workspace operacional, mostrar o nome do Workspace e da Conta-alvo onde hoje aparece o UUID ou um rótulo genérico.

**Blocked by:** None.

**Status:** ready-for-agent

- [x] O seletor "Selecione o Workspace" lista os Workspaces pelo nome, e não pelo UUID (hoje mostra `ca40c1d2-…` e `05bb7bb8-…`).
- [x] A barra lateral mostra o nome do Workspace escolhido, e não o rótulo genérico "Workspace".
- [x] O "Resumo da Conta-alvo" que outro participante vê mostra o nome da Conta-alvo, e não o UUID. A Participação ativa já pode ler `target_accounts`.
- [x] O detalhe de uma Sequência recém-criada mostra o nome da Conta-alvo desde a primeira renderização. Hoje o título e a trilha mostram o UUID até recarregar.

## Comments

- 2026-09-26: encontrado na conferência do canais-02, com as sessões reais na pré-produção. Prints: [Sequência recém-criada](../../canais-cadencia-backend/issues/prints/02-menu-de-canais.jpg) e [visão do Outro Membro](../../canais-cadencia-backend/issues/prints/02-outro-membro.jpg).
- 2026-09-27: resolvido só no frontend, sem migração: a Participação ativa já lê `workspaces` e `target_accounts`. A entrada lê os nomes dos Workspaces junto com as Participações; o seletor os lista pelo nome, em ordem alfabética (sem o nome, cai no identificador), e a barra lateral mostra o nome do Workspace escolhido, que sai da barra de cima. O Resumo da Conta-alvo mostra o nome da Conta. O detalhe da Sequência espera as Contas-alvo antes da primeira renderização, então o título e a trilha já nascem com o nome (se as Contas falharem, fica o identificador). Testes em `raiz.test.tsx` (seletor e barra lateral, Resumo de outro participante, Sequência recém-criada com as Contas-alvo atrasadas pelo novo `esperarLeitura` do `supabase-falso`) e em `detalhe-sequencia.test.tsx` (Contas atrasadas na Demonstração). Na pré-produção, os Workspaces da empresa criados pela migração `20260925140000` se chamam "Workspace da empresa"; enquanto dois Workspaces tiverem o mesmo nome, o seletor acrescenta o início do identificador para diferenciá-los (ex.: "Workspace da empresa (ca40c1d2)"). Renomeá-los é mudança de dados na pré-produção e depende do OK do usuário. Falta a conferência no navegador com as sessões reais.
