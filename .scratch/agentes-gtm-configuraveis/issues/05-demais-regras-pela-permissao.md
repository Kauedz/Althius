# 05: Demais regras do banco pela Permissão

**What to build:** As regras do banco que ainda escolhem comportamento pela Especialidade passam a usar a Permissão e a autorização, para que qualquer Agente com acesso faça o trabalho, sem mudar o que o usuário vê hoje.

**Blocked by:** 03.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, decisão sobre mapear e migrar dependências de Especialidade.

## Critérios de aceite

- [ ] Existe uma lista, anexada aos Comments deste ticket, de toda função do banco na `main` que decide algo pela Especialidade, com a definição mais recente de cada uma (Aderência da Conta gravada, histórico e sugestões, Aprovações e guarda, coordenação de WhatsApp e Slack, Clay, análise de resposta, reserva de créditos, templates de Sequência e o que mais aparecer).
- [ ] Cada função da lista passa a usar a regra de capacidade do ticket 03, partindo da definição mais recente, ou fica registrada com o motivo de não precisar mudar.
- [ ] O comportamento para os Agentes padrão existentes não muda.
- [ ] Se a lista for grande demais para um ticket, dividir em lotes em tickets novos, cada um bloqueado pelo 03, antes de começar.

## Pode mexer

Funções do banco da lista (migrations novas), pgTAP novo.

## Não mexa

Funções de Sequência (ticket 04), worker, telas.

## Passos do Nan

- Aplicar as migrations no remoto seguindo `docs/agents/migrations.md`.

## Validação

pgTAP novo por função migrada: Agente com Permissão sem a Especialidade antiga consegue; sem Permissão continua barrado. Testes antigos continuam verdes sem alteração.
