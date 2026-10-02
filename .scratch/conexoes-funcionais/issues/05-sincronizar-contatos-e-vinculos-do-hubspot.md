# 05: Sincronizar Contatos e Vínculos do HubSpot

**What to build:** a mesma Sincronização passa a trazer os Contacts associados às Companies sincronizadas, como Contatos com Vínculo do Contato em cada Conta-alvo correspondente. Um Contact já sincronizado é reencontrado mesmo com outro e-mail, e um Contact com o Destino de um Contato existente atualiza esse Contato, sem duplicar. O resultado ganha as contagens de Contatos criados, atualizados, vinculados, ignorados e com falha.

**Blocked by:** 04 (Sincronizar Contas-alvo do HubSpot).

**Status:** wontfix (substituído pelo caminho genérico dos conectores, ver Comments)

- [ ] Correspondência pela Identidade externa; senão por e-mail, telefone ou LinkedIn de um Contato do Workspace.
- [ ] Um Contact cujos Destinos batem com dois Contatos diferentes é ignorado com esse motivo, sem mesclar.
- [ ] Um Contact sem e-mail, telefone e LinkedIn, ou sem Company sincronizada, é ignorado com o motivo.
- [ ] Um Contact associado a várias Companies sincronizadas ganha um Vínculo com cada Conta-alvo.
- [ ] Campos trazidos: nome, cargo, e-mail, telefone (principal ou celular) e LinkedIn, quando o portal tiver a propriedade. O valor do HubSpot prevalece e o vazio nunca apaga.
- [ ] Um valor que a validação da Althius recusa (e-mail inválido, telefone sem DDD) é ignorado só naquele campo e contado.
- [ ] Uma mudança de e-mail atualiza o Contato e não toca o documento da Sequência nem o Destino de um passo confirmado ([ADR-0014](../../../docs/adr/0014-passo-confirmado-guarda-o-destino.md)).
- [ ] O Contato sincronizado guarda a origem "HubSpot" e aparece na aba Contatos como os demais.
- [ ] pgTAP cobre correspondência, conflito de Destinos, Vínculos, vazio que não apaga, campos inválidos e idempotência; os testes do app cobrem as contagens novas.
- [ ] Conferência visual no navegador do resultado com Contatos, com prints no `## Comments` deste ticket.

## Comments

- 2026-10-02: substituído pelo caminho genérico dos conectores ([ticket 30](./30-conectores-genericos-e-permissao-por-ferramenta.md), [ADR-0022](../../../docs/adr/0022-permissao-por-ferramenta-do-conector.md) e [ADR-0023](../../../docs/adr/0023-envio-ao-crm-pelas-ferramentas-do-conector.md)). Os Agentes já leem o HubSpot (e qualquer CRM conectado) pelas ferramentas do próprio servidor MCP, com `usar_conector`, sem uma Sincronização com código específico do app. O Nan decidiu que os conectores funcionam como os do Claude ("não existe conector especial"), por isso a Sincronização dedicada fica fechada como `wontfix`. O texto original fica acima, como registro.
