# 09: Consultar Sinais encontrados

**What to build:** permitir consultar resultados globais e acessar a Conta-alvo correspondente, reconhecendo os mesmos sinais, datas e evidências que aparecem em Último sinal e no histórico.

**Blocked by:** 04 — Gerenciar vários Monitoramentos e simular disparos.

**Status:** ready-for-agent

- [ ] Conectar o acesso discreto Sinais encontrados à lista simples na página principal, alternando com o catálogo e permitindo retorno explícito; não criar dashboard, gráficos ou análise extensa.
- [ ] Exibir empresa, sinal disparado e data a partir dos mesmos registros que alimentam Contas e Contatos, por fonte assíncrona observável injetada; não criar cópias independentes de resultados.
- [ ] Abrir a Conta-alvo a partir de um resultado e permitir consultar fonte/evidência disponíveis no detalhe. O sinal mais recente corresponde a Último sinal; resultados mais antigos correspondem às respectivas entradas do histórico.
- [ ] Manter descrições e datas consistentes entre resultados e histórico após novos disparos, duplicatas e pausa de Monitoramentos. Mostrar evidências simuladas como demonstração.
- [ ] Sinais expirados podem permanecer nos resultados e no histórico, sem contar no foguinho; datas futuras não aparecem como sinais já disparados. A navegação preserva a distinção entre Quente e Aderência.
- [ ] Demonstrar empresas importadas e recomendadas, preservando Fit nas recomendadas e qualquer avaliação original nas importadas.
- [ ] Oferecer carregamento, falha recuperável e ausência de resultados com ação clara para continuar no catálogo.
- [ ] Testar ida e volta entre catálogo/resultados e navegação à Conta-alvo, consistência de descrição/data/evidência e limites de validade pelo aplicativo renderizado com fontes injetadas e data fixa.
- [ ] Manter este ticket independente da expansão do catálogo: usar Monitoramentos de vagas e registros simulados disponíveis no ticket 04; os demais tipos usam a mesma projeção quando forem entregues.
- [ ] Executar testes pertinentes, build e lint e inspecionar visualmente lista e detalhe da mesma conta, incluindo um e dois sinais, preservando os roteiros existentes de Contas, Contatos, Agentes e Sequências.
