# 02: Cada Agente com a própria vez, em rodadas

**What to build:** a Coordenação escolhe os Agentes e cada um vira uma chamada separada ao modelo, lendo tudo o que já foi dito na Conversa; até 3 rodadas por pedido, parando antes quando um Agente precisa de informação do usuário ou de Aprovação. O texto de cada etapa é o trabalho do Agente, nunca "fui acionado".

**Blocked by:** 01: Orquestração compartilhada.

**Status:** ready-for-agent

## Pode mexer

- `_shared/orquestracao.ts` e os testes.
- Os eventos já existentes (`chamada`, `feito`, `resposta`, `falha`); se precisar de um tipo novo de evento, uma migration aditiva que só acrescenta o valor ao `check`.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] No máximo 3 rodadas; cada Agente vê as falas anteriores da rodada e das rodadas anteriores.
- [x] Um Agente que precisa de informação encerra a rodada com a pergunta ao usuário.
- [x] Teste que recusa etapa sem conteúdo ("fui acionado", "conversaram sobre") como falha `model_empty`.
- [x] O consumo de cada chamada (tokens) fica no evento, para os créditos.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Publicar a ponte e reiniciar o worker, como no ticket 01.
2. Testar no app: "Scopus e Ethos, montem o ICP e as Personas da minha empresa" e conferir as falas.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/93
- Etapa 5b (2026-10-01): com as ferramentas, o próximo Agente vê também o que o anterior FEZ (um mural com cada passo de ferramenta entra no contexto dele), na ponte e no worker do Hermes. Detalhes e Passos do Nan no CRM-14; o código do worker mudou, então reiniciar o worker do Hermes depois de atualizar.
