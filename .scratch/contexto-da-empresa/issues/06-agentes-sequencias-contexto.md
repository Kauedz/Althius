# 06: Agentes e Sequências usam Contexto da empresa

**What to build:** Conversar com os quatro especialistas e gerar Sequências usando os três textos vigentes, sem depender de seções do Playbook.

**Blocked by:** 01: Contexto da empresa com os três textos, como no Clay

**Status:** ready-for-agent

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [ ] Scopus, Ethos, Rhetor e Oraculum recebem contexto adequado e versão vigente, preservando seus papéis.
- [ ] Rhetor gera Sequência usando Empresa, ICP, Personas e configurações próprias do fluxo de Sequências.
- [ ] Retirar consultas operacionais às seções antigas nos consumidores deste ticket; não criar Playbook oculto nem importar seu conteúdo.
- [ ] Dados operacionais faltantes são obtidos no fluxo correspondente sem inventar scripts, SLA ou cadência.
- [ ] Salvar nova versão afeta próximas execuções; conversas, propostas e Sequências existentes preservam histórico e configuração.
- [ ] Manter permissão exclusiva de Administrador para alterar o contexto; ferramentas antigas não podem contornar essa regra.
- [ ] Ausência de contexto é comunicada e encaminhada para configuração quando necessária.

## Pode mexer

Fornecimento de contexto aos especialistas, ferramentas de memória afetadas, geração de Sequências e testes de execução relacionados.

## Não mexa

Motor de envio e agendamento de cadências, substituição das Especialidades, regras de cobrança e migração destrutiva.

## Validação

Testar respostas e geração com contexto manual, edição entre execuções, ausência de contexto e regressão de Sequências do Rhetor.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.
