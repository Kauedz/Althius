# Auditoria de produção dos Sinais (13/10/2026): catálogo e Sinais internos

**Origem:** auditoria de produção de 13/10/2026 sobre o catálogo de Sinais. Esta fatia fecha duas lacunas do **backend** e registra uma regra de produto. A tela de Sinais de mercado, os cartões e o layout mobile são de outro PR em andamento e **não** entram aqui.

## Problema

1. **`proposta_recusada` não tem regra.** O catálogo mostra o card "Proposta recusada", mas o banco só avalia `sem_resposta` e `negociacao_parada` (CRM-10, migração `20261009050000`). O card fica "Em breve" para sempre.
2. **Seis tipos genéricos do catálogo ficam "Em breve"** embora os coletores existam: o catálogo da tela (`catalogo.ts`) tem Abertura de vagas, Novo escritório ou unidade, Registros empresariais, Investimentos anunciados, Crescimento ou redução de equipes e Expansão geográfica, e as cascatas do Mapa de Mercado (`vaga_comex`, `vaga_logistica`, `nova_planta_filial`, `novo_cd_ou_filial`, `troca_de_sede`, `financiamento_bndes_finep`, `cruzando_faixa_de_headcount`...) já fazem o trabalho. Mas cada cascata é amarrada a **um ICP** (A a H) e a tela só conhece os tipos genéricos.

## Regra de produto (vale para todo Sinal por ICP)

> Os Sinais de cada ICP detectam eventos **nas empresas para quem o ICP vende** (as Contas-alvo do Workspace), **nunca no próprio ICP**.

Exemplos: o ICP "Contabilidade e tributário" vende a empresas novas e a empresas que mudam de porte; o Sinal olha essas empresas, não os escritórios de contabilidade. O ICP "Logística e transporte" vende a embarcadores; o Sinal olha o novo CD ou a vaga de logística do embarcador, não a transportadora. Consequências no código:

- Um tipo genérico só pode apoiar-se em cascatas de escopo `conta` (o acontecimento é numa Conta do Workspace). Cascata de escopo `mercado` (Comex Stat, DOU, Plano Safra) não é evento de empresa e nunca serve a um tipo genérico. O banco recusa o contrário.
- O Sinal interno `proposta_recusada` olha a Conta que recusou, nunca o vendedor.
- "Sem restrição de ICP": o Workspace escolhe o tipo genérico pelo acontecimento (vaga, filial, sede, financiamento, headcount), de qualquer ICP; a cascata de origem não limita quem pode monitorá-lo.

## Modelo

- **Sinal interno `proposta_recusada`**: a recusa que o Workspace **registrou** no desfecho de um Envio (`resposta_negativa`, classificado pela pessoa responsável pela Sequência ou por um Agente). É o único registro estruturado de recusa que existe; nenhuma Interação o grava. O Sinal dispara no dia em que o prazo venceu depois do registro, só quando a Conta não voltou a conversar depois da recusa. Mesmo padrão de `sem_resposta` e `negociacao_parada`: avaliação no banco, rodada gravada, uma chave por acontecimento, sem dado pessoal, sem crédito, sem fornecedor.
- **Tipo genérico → cascatas**: uma tabela de dados (`private.signal_type_cascades`) liga o tipo do catálogo às cascatas que o servem. O estado do tipo é o melhor estado das cascatas ligadas (disponível, em teste ou fora). O Monitoramento do tipo genérico roda cada cascata ligada e disponível pelo mesmo motor, com a mesma reserva de crédito por cascata, e **grava o Sinal no tipo genérico**, de modo que a tela não precisa conhecer o tipo da cascata.

## Fora de escopo

- Qualquer arquivo em `projeto-althius-frontend/src/**/sinais/**` (cascatas.tsx, cards, layout mobile, tela de Sinais de mercado) e qualquer RPC de `market_signals`: são de outro PR. O que a tela precisaria mudar está descrito no PR.
- Aplicar migração no remoto, publicar função, mexer em segredo.

Tickets: `issues/01..02`.
