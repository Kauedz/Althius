# 10: Registrar Sinais internos a partir de Interações reais

**What to build:** participantes configuram Monitoramentos internos e veem Sinais derivados de Interações reais no módulo de Sinais e na Conta correspondente.

**Blocked by:** 04: Criar e consultar Contas-alvo reais.

**Status:** ready-for-agent

- [ ] Catálogo, Monitoramento, execução e Sinal encontrado são registros separados e persistidos.
- [ ] Monitoramentos internos usam Interações persistidas, com configuração independente e estados rascunho, ativo e pausado.
- [ ] Sinal encontrado guarda Conta, origem, data e identidade de deduplicação para rastrear o acontecimento observado.
- [ ] Sinal aparece na lista/detalhe de Sinais e na projeção da Conta, com fonte e estados vazios/erro.
- [ ] Duplicata não renova prazo; Sinal válido torna a Conta Quente por 30 dias independentemente de Fit/Não fit.
- [ ] Nenhuma execução interna mostra dados roteirizados ou resultado simulado no Workspace real.

