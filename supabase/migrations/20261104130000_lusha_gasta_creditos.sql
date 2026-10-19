-- O Lusha gasta (conector-lusha 01): as ferramentas do servidor MCP do Lusha consomem os créditos do Cliente (e-mail
-- verificado 1, telefone 5, empresa 1; https://docs.lusha.com/faq/mcp). Mesmo desenho do Clay (20261104120000): o Lusha
-- passa a `writes`, e a Edge Function trata toda ferramenta dele como gasto (`ferramentasGastam`). O padrão das
-- Especialidades fica como está, pela mesma decisão pendente (conector-clay 01). Aditiva: só dados.
update private.integration_catalog set writes = true where id = 'lusha';
