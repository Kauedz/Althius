# 08: Criar sinais personalizados

**What to build:** permitir ao Cliente descrever livremente a necessidade que quer investigar e revisar critérios preparados de forma simulada antes de ativar um Monitoramento personalizado.

**Blocked by:** 04 — Gerenciar vários Monitoramentos e simular disparos.

**Status:** ready-for-agent

- [ ] Oferecer Criar sinal personalizado em destaque no catálogo, abrindo página própria com retorno explícito, sem painel lateral.
- [ ] Receber descrição livre e fonte opcional, armazenando-as junto do nome, identificação, tipo, origem, público, critérios e estado do Monitoramento.
- [ ] Representar Em preparação e devolver critérios editáveis por cenários simulados, inclusive para descrição livre fora dos exemplos previstos. Não sugerir que uma coleta real foi concluída.
- [ ] Permitir corrigir os critérios, salvar Rascunho e revisar critérios e público antes de ativar. Preparação por si só não ativa o Monitoramento.
- [ ] Permitir personalizados de qualquer origem, respeitando o significado de Externos, Internos e Originados; incluir a possibilidade de outras verificações personalizadas sem depender dos tipos prontos dos tickets 05, 06 ou 07.
- [ ] Permitir listas, descoberta ou ambos com recomendação de público simulado em todos os modos, sem pedir código, configuração de API ou agente executor.
- [ ] Reutilizar gestão independente, estados, edição, pausa, retomada e disparos simulados compartilhados; preservar a separação entre tipo, Monitoramento e Sinal.
- [ ] Mostrar preparação em andamento, retorno editável e falha recuperável com continuidade clara, sem perder a descrição fornecida.
- [ ] Testar pelo aplicativo renderizado descrição livre, fonte opcional, preparação, edição, revisão/ativação e resultado na Conta-alvo, usando fontes injetadas sem chamadas externas.
- [ ] Executar testes pertinentes, build e lint e inspecionar visualmente o percurso completo de criação personalizada conforme o mockup aprovado.

