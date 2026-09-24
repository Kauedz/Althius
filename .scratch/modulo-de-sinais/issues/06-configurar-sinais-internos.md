# 06: Configurar sinais internos

**What to build:** permitir ao Cliente configurar Monitoramentos de comportamento no site e condições históricas comerciais, reconhecendo nas Contas-alvo os sinais simulados e o contexto que os fundamenta.

**Blocked by:** 04 — Gerenciar vários Monitoramentos e simular disparos.

**Status:** ready-for-agent

- [ ] Disponibilizar cards e configurações para visitas ao site e páginas específicas, incluindo preços/produto, negociação parada, ausência de resposta e proposta recusada há determinado tempo.
- [ ] Permitir nome, público recomendado, critérios adequados ao tipo e limites temporais ajustáveis ao negócio; oferecer Rascunho, revisão, ativação, edição, pausa e retomada pelo ciclo compartilhado.
- [ ] Distinguir o prazo configurado para detectar a condição da validade fixa de 30 dias após o disparo. Os exemplos simulados respeitam os critérios escolhidos e a data controlável.
- [ ] Preservar e tornar consultáveis no histórico comercial as Interações que fundamentam sinais internos; mostrar descrição, disparo e evidência simulada sem substituir a Interação pelo Sinal.
- [ ] Uma resposta comercial ou interpretação isolada de seu conteúdo continua como Interação e não gera Sinal automaticamente. Condições temporais elegíveis podem gerar sinais conforme os critérios.
- [ ] Alimentar as mesmas projeções de Último sinal, histórico e foguinho, sem alterar Aderência, duplicar acontecimentos ou produzir disparos enquanto o Monitoramento estiver pausado.
- [ ] Simular visitas sem identificação real de visitantes ou integrações externas. Não apresentar dados simulados como fatos verificados.
- [ ] Testar pelo aplicativo renderizado a configuração de páginas e prazos, disparos coerentes, preservação de Interações e ausência de sinal automático por resposta isolada, com fonte injetada e data fixa.
- [ ] Verificar estados vazios e falhas recuperáveis aplicáveis, executar testes pertinentes, build e lint e revisar visualmente os formulários e a evidência no detalhe da Conta-alvo.

