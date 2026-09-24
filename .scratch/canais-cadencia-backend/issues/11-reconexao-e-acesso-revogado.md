# 11: Recuperar conexões e interromper acesso revogado

**What to build:** tornar a operação segura diante de desconexões, reconexões e saída do responsável do Workspace. A Althius preserva histórico e exclusividade, bloqueia novos envios imediatamente e reconcilia respostas acumuladas antes de liberar a continuação.

**Blocked by:** 09: Aprovar e enviar respostas nos três canais.

**Status:** ready-for-agent

- [ ] Conta remetente fora do estado pronto bloqueia novos passos e respostas aprovadas sem apagar histórico.
- [ ] Reconexão valida novamente o titular e processa o backlog comercial relevante de forma idempotente antes de liberar envios.
- [ ] A recuperação não importa toda a caixa de entrada pessoal nem publica conteúdo para o Workspace.
- [ ] Remover a participação do responsável impede imediatamente mutações, aprovações e novos envios em todas as suas Sequências.
- [ ] A Conta-alvo e o histórico permanecem preservados; nenhum participante recebe credenciais ou assume a propriedade automaticamente.
- [ ] Trabalhos pendentes revalidam participação e conexão no momento da execução e terminam em estado auditável quando bloqueados.
- [ ] Testes cobrem mensagem recebida durante indisponibilidade, evento duplicado no replay e remoção do responsável com trabalho já reservado.

