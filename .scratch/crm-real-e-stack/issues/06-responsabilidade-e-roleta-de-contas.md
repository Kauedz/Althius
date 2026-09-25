# 06: Atribuir responsabilidade e distribuir recomendações pela roleta

**What to build:** Contas recomendadas como novas pela Althius entram no CRM e recebem automaticamente um responsável por roleta entre participantes ativos; Conta manual e CSV preservam suas atribuições próprias.

**Blocked by:** 03: Convidar e gerenciar participantes; 04: Criar e consultar Contas-alvo reais.

**Status:** ready-for-agent

- [ ] Uma recomendação real de Conta com URL ainda inexistente cria a Conta e a atribui automaticamente a Administrador ou Membro ativo.
- [ ] Distribuição é rotativa, persistida e atômica mesmo com recomendações simultâneas.
- [ ] Recomendação que atualiza URL já existente não cria nova atribuição nem avança a roleta.
- [ ] Criação manual atribui ao criador; importação atribui inicialmente ao importador.
- [ ] Administrador pode distribuir linhas importadas entre participantes ativos; fluxo normal não permite reatribuições posteriores.
- [ ] Após saída do responsável, Administrador pode transferir para participante ativo por ação excepcional auditada.
- [ ] Auditoria registra origem, participantes elegíveis e responsável atribuído, sem permitir atribuição a membership inativa.

