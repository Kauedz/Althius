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

## Comments

- 2026-10-31, tentativa de validação pelo agente (nenhum critério comprovado; segue `blocked`):
  - Reavaliado pelo código: PR #227 (`53a48790`) e #230 (`3790c6ba`) estão em `main`; a migration `20261103100000_descadastro_e_variaveis_da_cadencia.sql` e as funções `sequence-runner` e `sequence-step-sends` existem no repositório. Esse bloqueio caiu.
  - Bloqueio concreto 1: o MCP do Supabase deste ambiente negou `execute_sql`, `list_edge_functions` e `list_migrations` no projeto `ycbdilsmydvzezhlymty` ("You do not have permission"). Sem ele não dá para confirmar remotamente a migration `20261105100000_sequencia_proposta_pelo_rhetor.sql`, as Edge Functions publicadas, `configure_sequence_runner`, o cron, a conexão Unipile ativa nem a Conta remetente. Não contornei a negação por outro caminho (CLI, chave de serviço).
  - Bloqueio concreto 2: não há sessão de teste. Não existe `~/.althius-qa.env`, e a conta QA do `e2e/` nem tem Conta-alvo. A sessão do Vendedor responsável exigiria a chave de serviço, que não está disponível, e a Aprovação é dele (ADR-0009).
  - Bloqueio concreto 3: a caixa de e-mail como Conta remetente só se conecta pelo fluxo hospedado da Unipile, pelo dono da caixa. Sem ela, não há envio, resposta nem descadastro reais a provar.
  - Bloqueio de código, ticket 01: Recusar não chega ao Rhetor na Conversa (comentário de 31/10 do 01). O ciclo "recusa e pede ajuste" do roteiro depende disso.
  - Não escrevi roteiro E2E: sem sessão e sem remoto ele não teria como ser executado nem verificado, e não vou entregar código de validação sem tê-lo rodado. Não enviei mensagem alguma nem alterei o remoto.
  - Para destravar, preciso de uma destas autorizações: permissão do MCP (ou outro acesso de leitura/escrita) ao projeto, mais um arquivo `~/.althius-qa.env` com a sessão do Vendedor responsável; e a caixa de teste conectada como Conta remetente.
