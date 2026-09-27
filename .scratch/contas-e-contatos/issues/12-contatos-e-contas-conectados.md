# 12: Contatos e Contas-alvo conectados

**What to build:** as duas abas e o detalhe passam a se conectar por navegação clara.

- **No detalhe:** a seção Contatos fica entre Sinais e Interações e mostra só as pessoas daquela Conta-alvo, na mesma tabela da aba Contatos, sem a coluna Empresa. A seção tem uma âncora.
- **Na tabela de Contas:** a célula Contatos é um link próprio para essa âncora, e clicar nela não dispara o clique da linha.
- **Na aba Contatos:** o nome da empresa leva à Conta-alvo.

**Blocked by:** 09 (Detalhe da Conta-alvo), 10 (Aba Contatos)

**Status:** closed

- [x] O detalhe mostra as seções Sinais, Contatos e Interações nessa ordem
- [x] A seção Contatos mostra só os Contatos daquela Conta-alvo, sem a coluna Empresa, e mostra "Nenhum contato" quando não há nenhum
- [x] Clicar nos Contatos de uma linha da tabela de Contas abre o detalhe na seção Contatos
- [x] Clicar no nome da empresa na aba Contatos abre aquela Conta-alvo

## Comments

- A seção Contatos do detalhe troca a tabela própria do ticket 09 (em caixa com fundo `bg-al-surface`) pela tabela da aba Contatos, sem a Empresa, como o ticket pede. Vale conferir o visual no detalhe. As pessoas aparecem pelo nome, a mesma ordem que têm dentro de uma empresa na aba Contatos.
- "Nenhum contato" na tabela de Contas também é link para a seção, que mostra "Nenhum contato".
- O detalhe rola até a âncora do endereço uma vez por navegação, depois que Sinais e Contatos carregam. O ticket 13 (voltar sem perder o lugar) precisa conviver com essa rolagem.

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.
