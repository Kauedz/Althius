# 07: Importar Contas e Contatos por CSV

**What to build:** participante importa um CSV com prévia e validação, confirma as correspondências e acompanha o processamento até obter um relatório real por linha.

**Blocked by:** 05: Manter Contatos e Vínculos do Contato; 06: Atribuir responsabilidade e distribuir recomendações pela roleta.

**Status:** ready-for-agent

- [ ] Arquivo é enviado para Storage privado e processado em `import_batch` durável; browser não grava linhas comerciais diretamente.
- [ ] Prévia permite mapear colunas, revisar correspondências, conflitos, linhas inválidas e possíveis vínculos antes do commit.
- [ ] URL da empresa e nome da empresa são obrigatórios; nome do Contato é obrigatório ao importar Contato; LinkedIn, telefone e e-mail podem faltar.
- [ ] Correspondência por URL atualiza Conta; campo vazio não apaga dado; campo não vazio atualiza o campo mapeado conforme origem e correção manual.
- [ ] Contato existente oferece atualizar dados, adicionar vínculo ou transferir vínculo; nome sozinho não deduplica.
- [ ] Importador é responsável inicial; Administrador consegue distribuir linhas entre participantes ativos.
- [ ] Lotes são retomáveis e idempotentes; a tela apresenta progresso e contagens de criadas, atualizadas, vinculadas, ignoradas e com falha.
- [ ] Relatório de erros pode ser consultado/baixado sem expor arquivo a outro Workspace.

