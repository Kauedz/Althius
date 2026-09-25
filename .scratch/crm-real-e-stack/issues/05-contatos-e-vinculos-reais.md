# 05: Manter Contatos e Vínculos do Contato

**What to build:** participantes mantêm a identidade de um Contato no Workspace e administram seus vínculos com Contas-alvo, conservando a história da empresa onde cada Interação aconteceu.

**Blocked by:** 04: Criar e consultar Contas-alvo reais.

**Status:** ready-for-agent

- [ ] Contato possui identidade persistente única por Workspace, com e-mail, telefone e LinkedIn opcionais.
- [ ] Cadastro, leitura, edição, busca, filtros e detalhe usam dados reais na experiência existente.
- [ ] Um Contato pode ter vínculos simultâneos com múltiplas Contas quando atua nelas; o nome sozinho não mescla Contatos.
- [ ] Encerrar vínculo e abrir outro preserva Interações anteriores na Conta de origem.
- [ ] Membro só cria/edita Contatos das Contas sob sua responsabilidade; Administrador tem permissões administrativas definidas.
- [ ] Contato sem e-mail, telefone, LinkedIn ou foto continua consultável e exibe os fallbacks existentes.
- [ ] Dados e vínculos respeitam isolamento por Workspace também em consultas e atualizações concorrentes.

