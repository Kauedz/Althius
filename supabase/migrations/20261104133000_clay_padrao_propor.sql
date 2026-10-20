-- O padrão das Especialidades no Clay passa a Propor (conector-clay 01; decisão do usuário em 19/10/2026): o Clay gasta
-- créditos do Cliente (`writes = true` desde 20261104120000), e o padrão de uma Integração que escreve ou gasta é Propor
-- (ADR-0002). Vale para os Agentes padrão semeados daqui em diante; as Permissões dos Agentes que já existem não mudam
-- (subir ou baixar a de um Agente existente é decisão do Administrador). Aditiva: só dados.
update private.specialty_default_permissions set permission = 'propor'
where integration_id = 'clay' and permission = 'ler';
