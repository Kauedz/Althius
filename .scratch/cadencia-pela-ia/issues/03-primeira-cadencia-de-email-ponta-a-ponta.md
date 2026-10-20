# 03: Primeira Cadência de e-mail validada de ponta a ponta

Spec: [../spec.md](../spec.md) (US 11).

**What to build:** o Renan conecta a caixa de e-mail como Conta remetente, pede ao Rhetor uma Sequência para uma Conta-alvo de teste, aprova, ativa os envios e confere envio, resposta, Proposta de resposta e descadastro em produção.

**Blocked by:** [conversas-pelo-hermes/01](../../conversas-pelo-hermes/issues/01-ligar-as-conversas-em-producao.md); 01 e 02 daqui; PR #227 e #230 em `main` com os Passos do Nan; jornada mínima por e-mail (Nan); caixa de e-mail conectada pelo Renan.

**Status:** blocked

**Quem faz:** Renan (com o Nan nos passos de produção). **Esforço:** P.

## Critérios

- [ ] Caixa de e-mail conectada como Conta remetente (Conexões/Contas remetentes)
- [ ] Sequência proposta pelo Rhetor, aprovada e ativada ("Ativar envios")
- [ ] Primeiro passo enviado pelo Executor, com variáveis preenchidas e rodapé de descadastro
- [ ] Resposta do Contato pausa a Sequência e gera Proposta de resposta (Hermes) em Aprovações
- [ ] Clicar no descadastro registra a Supressão e pausa a Sequência com "Descadastro"
- [ ] Comments com data, Conta-alvo de teste e prints

## Como testar

- Roteiro acima com um e-mail próprio como Contato.

## Evidência (auditoria, vertical C)

- Runner e Unipile em `main` dependem de ops (`configure_sequence_runner`, `UNIPILE_API_KEY`, cron); descadastro e variáveis só no PR #227.
