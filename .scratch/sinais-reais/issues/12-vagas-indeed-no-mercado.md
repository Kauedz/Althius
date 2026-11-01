# 12: Vagas do Indeed no mercado endereçável

**What to build:** permitir que o card de Abertura de vagas use também o actor `vaga_indeed` para encontrar empresas fora
da lista de Contas-alvo, preservando o parser, os critérios e a evidência específicos do Indeed.

**Blocked by:** 03: Sinais de vagas; 11: Descoberta de empresas por todos os Sinais (infraestrutura comum).

**Status:** ready-for-agent

## Critérios

- [ ] Monitoramento de mercado com `vaga_indeed` aceita critérios sem `accountIds`.
- [ ] A execução usa uma cascata própria do Indeed e o actor `valig~indeed-jobs-scraper`, sem reutilizar o actor do LinkedIn.
- [ ] Empresa conhecida recebe o Sinal e fica Quente; empresa nova vira candidata com fonte, data e evidência.
- [ ] Deduplicação mantém a chave de vaga e não cria Sequência nem mensagem.
- [ ] Retry/idempotência usam chave separada da cascata LinkedIn.
- [ ] Testes cobrem roteamento, identidade, deduplicação e isolamento do fluxo.

## Não mexa

- Nos demais Sinais: eles continuam Em breve.
- Em cobrança de descoberta do ticket 11; o preço/aceite continua pendente.
- Em secrets, envio ou funções de Contatos.

## Passos do Nan

- Aplicar a migration no remoto seguindo `docs/agents/migrations.md`.
- Publicar `signal-runner` após o merge e conferir uma rodada real do Indeed no modo mercado.
