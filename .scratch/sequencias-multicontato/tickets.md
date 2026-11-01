# Tickets — Sequências coordenadas entre Contatos

Status: ready-for-agent

Situação em 2026-10-24: 01, 02, 03, 07 e 08 já estão na main (#244, #249, #251/#255, #248 e #250); conferidos ticket a ticket, com validação visual humana pendente.

Divisão aprovada pelo usuário; um PR por ticket. Layout atual é GATE em todos. Sugestões de templates pela IA: 07; templates próprios: 08; análise de respostas: 05. A IA nunca autoriza envios.

| Ticket | Bloqueado por |
|---|---|
| [01 — Preparar passos e dependências na tela atual](issues/01-passos-e-dependencias.md) | Nenhum |
| [02 — Autorizar e executar caminhos independentes com limites](issues/02-execucao-independente.md) | 01 |
| [03 — Reter envios ao receber resposta e decidir em conjunto](issues/03-respostas-e-retencao.md) | 02 |
| [04 — Retomar seletivamente sem ignorar bloqueios](issues/04-retomada-seletiva.md) | 03 |
| [05 — Analisar respostas com IA e recomendar decisões](issues/05-ia-analisa-respostas.md) | 03 |
| [06 — Personalizar passos com referências verificáveis entre Contatos](issues/06-variaveis-com-evidencia.md) | 02 |
| [07 — Criar Sequência a partir de templates da Althius](issues/07-templates-althius.md) | 01 |
| [08 — Salvar e reutilizar templates próprios privados](issues/08-templates-proprios.md) | 07 |
| [09 — Apurar resultados por Conta-alvo](issues/09-resultados-por-conta.md) | 02, 03 |
| [10 — Validar o fluxo integrado e a preservação do layout](issues/10-aceite-integrado.md) | 04, 05, 06, 08, 09 |

Primeira frente disponível: 01. Após 01, 02 e 07 podem iniciar em worktrees separados, coordenando arquivos compartilhados. Após 02, 03 e 06; após 03, 04, 05 e 09; após 07, 08. 10 integra as entregas. Blockers devem estar integrados em main; nenhum paralelismo dispensa alinhamento com Renan.

Verificação documental: 10 arquivos individuais, status, seções obrigatórias e grafo sem ciclos validados. Isso não significa código implementado nem testes de aplicação executados.
