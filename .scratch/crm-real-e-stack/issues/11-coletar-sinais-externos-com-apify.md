# 11: Coletar o primeiro Sinal externo com Apify

**What to build:** participante configura o Monitoramento externo de abertura de vagas já previsto no produto e acompanha uma coleta real via Apify Actor até os Sinais evidenciados aparecerem no histórico da Conta.

**Blocked by:** 10: Registrar Sinais internos a partir de Interações reais.

**Status:** ready-for-agent

- [ ] Um Actor Apify compatível com a fonte selecionada é escolhido e sua entrada/saída é normalizada no contrato de Sinais.
- [ ] Token Apify fica no backend; execução assíncrona registra estado, timestamps, custo/limites disponíveis, erro e correlação.
- [ ] Somente resultado retornado pelo Actor com referência verificável é persistido como Sinal externo.
- [ ] Retry, callback e repetição do mesmo evento são idempotentes; falha não vira resultado de demonstração.
- [ ] A execução respeita limites/custos configurados e pode ser pausada; nenhum Monitoramento sem Actor habilitado promete coleta.
- [ ] Sinais aparecem nos módulos de Sinais e Contas com fonte/evidência, preservando regra de deduplicação e Quente.

