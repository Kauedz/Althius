# 08: Plano e consumo demonstrativo do Workspace

**What to build:** Mostrar o plano atual do Workspace e seu uso demonstrativo, com participantes, Execuções de Agentes e indicação de upgrade futuro.

**Blocked by:** 04: Workspace, participantes e papéis de acesso

**Status:** ready-for-agent

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 34–36.

## Acceptance criteria

- [ ] Apresentar nome do plano associado ao Workspace, sem confundir plano com identidade global do usuário.
- [ ] Mostrar quantidade de participantes ativos consistente com Pessoas e acesso, sem contar convites pendentes como participantes.
- [ ] Mostrar Execuções de Agentes em período explicitamente indicado com dados demonstrativos coerentes; decisões de Aprovação não contam como novas Execuções.
- [ ] Refletir alterações de participantes na contagem por meio da mesma fonte compartilhada, inclusive após recarregar.
- [ ] Apresentar possibilidade de upgrade com “Em breve”, sem destino quebrado, checkout ou cobrança.
- [ ] Não inventar preços, franquias ou limites comerciais; manter apresentação preparada para dados comerciais futuros.
- [ ] Testar vínculo ao Workspace, contagem de participantes após remoção, consumo no período e comportamento do upgrade; inspecionar claro/escuro.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.

