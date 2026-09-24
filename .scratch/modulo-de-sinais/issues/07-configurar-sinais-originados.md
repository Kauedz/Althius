# 07: Configurar sinais originados

**What to build:** permitir configurar verificações deliberadas para investigar necessidades comerciais e demonstrar seus resultados simulados como sinais de uma Conta-alvo.

**Blocked by:** 04 — Gerenciar vários Monitoramentos e simular disparos.

**Status:** ready-for-agent

- [ ] Disponibilizar cards e configurações prontas de teste de atendimento/lead oculto, erros ou indisponibilidade de site e testes de formulários ou fluxos públicos. Outras verificações personalizadas serão atendidas pelo ticket 08.
- [ ] Definir critérios e prazos adequados à verificação, nome e público com recomendação simulada; usar o ciclo compartilhado de Rascunho, revisão, ativação, edição, pausa e retomada.
- [ ] Demonstrar ao menos um percurso por tipo de verificação, da configuração ao resultado na Conta-alvo, com fatos observados, data de disparo e evidência explicitamente simulada.
- [ ] Aplicar origem Originados porque há uma ação deliberada de investigação. Ler um acontecimento externo por API não o reclassifica como originado.
- [ ] Aplicar contagem, deduplicação e validade compartilhadas, preservando Aderência e histórico. Pausa impede novos disparos sem apagar resultados anteriores.
- [ ] Não executar lead oculto, enviar mensagens, testar formulários, varrer sites ou chamar serviços de terceiros. Não exigir escolha de agente executor, Apify, Actors, credenciais ou configuração de API.
- [ ] Testar configuração e resultado visível, classificação, pausa e evidência pela aplicação renderizada e fontes simuladas injetadas, sem dependências externas.
- [ ] Verificar estados vazios e falhas recuperáveis aplicáveis, executar testes pertinentes, build e lint e revisar visualmente a clareza dos critérios e resultados.

