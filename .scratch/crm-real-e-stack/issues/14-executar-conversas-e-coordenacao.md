# 14: Executar Conversas e Coordenação com estado recuperável

**What to build:** pedidos enviados a Agentes usam o provedor de modelo configurado no backend e produzem Conversa, etapas, chamadas de ferramenta e resposta que podem ser acompanhadas e retomadas.

**Blocked by:** 13: Persistir Agentes e permissões por integração.

**Status:** ready-for-agent

- [ ] Mensagem, execução, etapas, eventos e resposta são persistidos antes de declarar conclusão.
- [ ] Modelo é chamado exclusivamente pelo backend; sem provider/credencial configurados, a capacidade aparece indisponível em vez de roteirizada.
- [ ] Coordenação escolhe Agentes e agrega etapas sem agir como quinto Agente, conforme ADR-0004.
- [ ] @menções explicitamente solicitadas são incluídas; chamadas de ferramenta e fontes usadas são apresentadas com estado real.
- [ ] Streaming pode ser retomado/consultado após refresh ou desconexão sem duplicar execução.
- [ ] Contexto e consultas respeitam Workspace, permissão do Agent e minimização de dados.
- [ ] Falhas de modelo/ferramenta são persistidas e exibidas como falhas, sem resposta plausível inventada.

