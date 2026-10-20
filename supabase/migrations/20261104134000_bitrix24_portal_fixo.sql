-- O Bitrix24 fixa o portal do Workspace (conector-bitrix24 01): é um CRM, e o primeiro Acesso fixa o portal para que dois
-- CRMs nunca se misturem (ADR-0017), como no HubSpot e no Pipedrive. O portal vem da resposta do token (member_id ou
-- domain; a confirmar com um portal real). Aditiva: só dados.
update private.integration_connection_profiles set pins_portal = true where integration_id = 'bitrix24';
