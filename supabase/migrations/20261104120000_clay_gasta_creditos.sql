-- O Clay gasta (conector-clay 01; decisão de 19/10/2026): as ferramentas do servidor MCP do Clay consomem os créditos do
-- workspace Clay do Cliente, no mesmo valor do trabalho feito no Clay (https://university.clay.com/docs/connect-to-clay-mcp).
-- Por isso o Clay passa a `writes`, e a Edge Function trata toda ferramenta dele como gasto (perfil `ferramentasGastam`):
-- sem regra do Administrador, cada chamada pede Aprovação (ADR-0022), e um Agente com Ler não chama nenhuma.
-- O padrão das Especialidades (`specialty_default_permissions`) fica como está: trocá-lo para Propor muda o que os testes
-- antigos de Agentes e Aprovações fixam, e espera a decisão registrada em conector-clay 01. Aditiva: só dados.
update private.integration_catalog set writes = true where id = 'clay';
