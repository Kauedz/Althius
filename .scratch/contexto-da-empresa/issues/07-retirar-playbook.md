# 07: Retirar o Playbook e concluir a transição

**What to build:** Usar exclusivamente Contexto da empresa na experiência comercial e concluir a migração de consumidores restantes, preservando dados históricos.

**Blocked by:** 03: Configuração automática no onboarding; 05: Avaliar Aderência usando o novo contexto; 06: Agentes e Sequências usam Contexto da empresa

**Status:** ready-for-agent

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [ ] Auditar consumidores restantes de Playbook e mini-ICP, incluindo sinais, catálogo, importações, aprovações e atalhos; migrar ou retirar cada dependência conforme a spec.
- [ ] Remover navegação, telas e operações de importação/edição do Playbook; entradas antigas levam ao Contexto quando pertinente.
- [ ] Nenhuma operação ativa lê conteúdo legado como fallback ou exige seção retirada.
- [ ] Manter somente Empresa, ICP e Personas na configuração; nenhuma seção antiga reaparece em outra tela de contexto.
- [ ] Preservar registros legados, Contas-alvo e histórico; não apagar dados nem reclassificar toda a base.
- [ ] Atualizar documentação de domínio e decisão de origem do ICP, explicitando substituição da decisão 6 da ADR-0034 sem revogar suas demais regras.
- [ ] Conferir os fluxos migrados e a Demonstração; registrar inventário de consumidores e resultado da auditoria.

## Pode mexer

Navegação e rotas antigas, consumidores remanescentes diretamente ligados ao Playbook/mini-ICP, documentação de domínio e compatibilidade de transição.

## Não mexa

Apagamento de tabelas ou registros, reescrita de Sinais/CRM/cadência e alterações independentes encontradas na auditoria.

## Validação

Verificar ausência de chamadas ativas ao legado, rotas antigas, estados vazios, isolamento, histórico preservado e regressões dos consumidores migrados.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.
