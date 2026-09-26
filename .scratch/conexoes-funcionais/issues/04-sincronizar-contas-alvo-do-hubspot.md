# 04: Sincronizar Contas-alvo do HubSpot

**What to build:** quem tem Acesso ao HubSpot aperta "Sincronizar agora" e, pelo próprio Acesso, as Companies cujo HubSpot owner é participante ativo do Workspace chegam como Contas-alvo. Uma Conta-alvo nova fica sob a responsabilidade desse owner; uma que já existe mantém o responsável. A pessoa acompanha o andamento e vê ao final quantas Contas-alvo foram criadas, atualizadas, ignoradas e quantas falharam, com os ignorados e o motivo. A Sincronização é retomável e roda uma por vez por Workspace ([ADR-0016](../../../docs/adr/0016-sincronizacao-do-hubspot-so-le-e-respeita-o-responsavel.md)).

**Blocked by:** 03 (Conectar e desconectar o próprio Acesso ao HubSpot).

**Status:** ready-for-agent

- [ ] Só quem tem o próprio Acesso conectado sincroniza; sem Acesso, o cartão pede para conectar.
- [ ] Uma função SQL executável só pelo backend aplica um lote de Companies e decide todas as mudanças. A Edge Function só lê as páginas do HubSpot, entrega os lotes e guarda o cursor.
- [ ] A leitora da Edge Function usa a busca do servidor MCP do HubSpot em janelas pela data de modificação, para nunca passar de 10.000 resultados por consulta. Se a ferramenta não expuser o cursor, o filtro ou o e-mail do owner, a leitora troca para um app OAuth separado, sem mudar a função SQL, a tela nem a Fonte de Conexões ([pesquisa](../pesquisa-servidores-mcp.md)).
- [ ] Correspondência pela Identidade externa; senão pela URL canônica do `website` ou, na falta dele, do `domain`. Uma Company sem os dois é ignorada com o motivo.
- [ ] Uma Company sem owner participante ativo não entra.
- [ ] Campos trazidos: nome, URL, LinkedIn e segmento. O valor do HubSpot prevalece, e um valor vazio nunca apaga.
- [ ] A Identidade externa fica numa relação própria, e a Conta-alvo guarda a origem "HubSpot", mostrada discretamente no detalhe.
- [ ] As Contas-alvo sincronizadas aparecem na aba Contas como as demais.
- [ ] Uma Sincronização interrompida continua do cursor. Duas pedidas ao mesmo tempo não viram duas. A mesma Company nunca vira duas Contas-alvo.
- [ ] A Sincronização não usa as funções que os usuários chamam, nem as de Sequências, Interações ou Contas remetentes.
- [ ] pgTAP cobre correspondência, responsável, vazio que não apaga, ignorados, idempotência e a Sincronização única; os testes do app cobrem o botão, o andamento e o resultado.
- [ ] Conferência visual no navegador do andamento e do resultado, com prints no `## Comments` deste ticket.
