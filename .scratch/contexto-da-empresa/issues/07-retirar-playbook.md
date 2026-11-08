# 07: Retirar o Playbook e concluir a transição

**What to build:** Usar exclusivamente Contexto da empresa na experiência comercial e concluir a migração de consumidores restantes, preservando dados históricos.

**Blocked by:** 03: Configuração automática no onboarding; 05: Avaliar Aderência usando o novo contexto; 06: Agentes e Sequências usam Contexto da empresa

**Status:** in-review (implementado; falta o pgTAP rodar no CI, aplicar a migration no remoto antes do merge e publicar as funções)

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [x] Auditar consumidores restantes de Playbook e mini-ICP, incluindo sinais, catálogo, importações, aprovações e atalhos; migrar ou retirar cada dependência conforme a spec.
- [x] Remover navegação, telas e operações de importação/edição do Playbook; entradas antigas levam ao Contexto quando pertinente.
- [x] Nenhuma operação ativa lê conteúdo legado como fallback ou exige seção retirada.
- [x] Manter somente Empresa, ICP e Personas na configuração; nenhuma seção antiga reaparece em outra tela de contexto.
- [x] Preservar registros legados, Contas-alvo e histórico; não apagar dados nem reclassificar toda a base.
- [x] Atualizar documentação de domínio e decisão de origem do ICP, explicitando substituição da decisão 6 da ADR-0034 sem revogar suas demais regras.
- [x] Conferir os fluxos migrados e a Demonstração; registrar inventário de consumidores e resultado da auditoria.

## Pode mexer

Navegação e rotas antigas, consumidores remanescentes diretamente ligados ao Playbook/mini-ICP, documentação de domínio e compatibilidade de transição.

## Não mexa

Apagamento de tabelas ou registros, reescrita de Sinais/CRM/cadência e alterações independentes encontradas na auditoria.

## Validação

Verificar ausência de chamadas ativas ao legado, rotas antigas, estados vazios, isolamento, histórico preservado e regressões dos consumidores migrados.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.

## Comments

- 2026-11-07: implementado na branch `contexto-da-empresa-03-onboarding`. Inventário completo e resultado da auditoria em
  `.scratch/contexto-da-empresa/inventario-do-playbook.md`.
  - Decisões do usuário em 07/11/2026: os critérios de passagem do kanban (seção SLA e metas) e o "Pedir ao Ethos" saem; as
    RPCs antigas do Playbook ficam no banco sem uso (fechar para `authenticated` fica para depois, porque exige mexer em
    pgTAP antigo).
  - Banco: `20261221050000_retirada_do_playbook.sql` redefine `reply_proposal_context` (de `20261001180000`, a única
    definição): o rascunho de resposta do Rhetor recebe `contexto` (os três textos vigentes e a versão) no lugar das seções
    do Playbook. pgTAP novo `retirada_do_playbook.sql` (7). Uma asserção de `propostas_de_resposta.sql` afirmava as seções
    do Playbook no contexto; foi trocada pela do Contexto da empresa, com o mesmo `plan` e duas linhas de contexto no
    preparo (mesmo caso do ticket 05: o teste afirmava o que o ticket retira).
  - Edge Functions: `reply-proposal-runner` escreve pelos três textos (aceita o banco sem a migration como "sem contexto");
    `signal-plan` lê `get_company_context` no lugar da seção ICP e do mini-ICP; `account-discovery` perde a ação `criteria`
    e o leitor do ICP do Playbook; o Canal troca as duas leituras do Playbook por `consultar_contexto_da_empresa`;
    `icp-site-read` (sem chamador desde o ticket 03) saiu do código e do `config.toml`.
  - Tela: saem Configurações → Playbook (edição, histórico, importação `.xlsx`; `read-excel-file` removido) e →
    Memória do Workspace; `/configuracoes/playbook[/*]` e `/configuracoes/memoria[/*]` levam ao Contexto da empresa. As
    revisões antigas do Playbook ficam em Aprovações e na Conversa só como registro (sem decisão, sem ler o Playbook, fora
    da contagem de pendentes). O Mercado da Demonstração usa a preparação por perfis, e a fonte operacional perdeu o
    caminho antigo; a proteção do visitante passou para `buscarPorPerfis`. "Para o seu nicho", o público recomendado dos
    editores de Monitoramento e o bloco de contexto da página do Agente leem o Contexto da empresa; a Persona na tabela de
    Contatos e as Habilidades não leem mais a Memória simulada. Ajuda → Contexto reescrita.
  - Documentação: ADR-0035 (substitui só a decisão 6 da ADR-0034, anotada nela), `CONTEXT.md` (ICP, Contexto da empresa,
    Memória do Workspace, Revisão, Playbook, Persona, Setup) e `docs/visao-geral-da-plataforma.md`. e2e (smoke de produção)
    passou a semear e conferir o ICP no Contexto da empresa; não foi executado (roda contra a produção).
  - Fica de fora, anotado no inventário: retirar a Memória do Workspace simulada da Demonstração (fonte, revisões e avisos;
    os testes de avisos do navegador a exercitam pela fonte) e fechar/apagar o Playbook no banco.
  - Testes: vitest `retirada-do-playbook.test.tsx` (6), `nicho-pelo-contexto.test.tsx` (2), `revisao-do-playbook-real`,
    `kanban-de-contas`, `descobertas`, `notificacoes`, `plano`, `raiz`, `App` (bloco do Agente) e os de fontes ajustados;
    deno `reply-proposal-runner`, `signal-plan`, `account-discovery`, `ferramentas-plataforma`; suíte Deno 1966/0 e
    `deno check` limpo; `tsc -b` e oxlint sem erro. Conferência visual na Demonstração em 07/11/2026: a entrada antiga do
    Playbook abre o Contexto da empresa, as abas não têm Playbook nem Memória, o Mercado mostra os perfis do contexto e a
    busca traz a candidata, o kanban não mostra critério nem "Pedir ao Ethos", e a Memória do Scopus mostra os três textos;
    sem erro no console. O pgTAP roda no CI (sem Docker na máquina).
  - Passos do Nan: seguir a [ordem de publicação da spec](../validacao.md#ordem-de-publicação). Nenhum segredo novo.
- 2026-11-08: no ajuste solicitado após a validação remota, `propostas_de_resposta.sql` passou a fixar o relógio
  da agenda em dia útil e a restringir consultas e alterações aos dados da própria fixture. As 132 asserções foram
  mantidas e passaram em transação com rollback na pré-produção. O teste do ticket 06 também passou (16/16) após
  corrigir os papéis das consultas privadas e verificar a sugestão sem ICP antes de cadastrar o contexto do Sul.
