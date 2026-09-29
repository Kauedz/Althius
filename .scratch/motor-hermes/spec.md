# Spec: Motor Hermes dos Agentes

**Status:** needs-info (falta o Nan escolher o modelo do Hermes; o resto está decidido)

**Frente:** Agentes. Parte do CRM-14 (Conversas e Coordenação) e do CRM-25 (Hermes). Decisões:
[ADR-0004](../../docs/adr/0004-coordenacao-sem-quinto-agente.md) e
[ADR-0018](../../docs/adr/0018-motor-dos-agentes-na-edge-function.md).

## Problem Statement

Hoje os Agentes respondem por uma ponte provisória, a Edge Function `agent-conversation`. O motor definitivo é o
Hermes Agent, que o Nan escolheu porque ele aprende com o uso. A Althius é um produto para vários clientes: cada
Workspace tem o próprio contexto, e o que der certo em prospecção num segmento deve melhorar as sugestões para os
outros clientes do mesmo segmento, sem quebrar a LGPD e sem que um cliente veja os dados de outro.

## Decisões do Nan (2026-09-29)

- O Hermes não aparece para o usuário nem diz que é o Hermes. Para o usuário, é a inteligência da Althius. O ADR-0004
  continua valendo: a Coordenação não tem nome e chama o Scopus, o Ethos, o Rhetor e o Oraculum.
- Ambientes (revisto): o app e o Hermes vão para uma VPS da Hostinger (plano de R$ 90). Antes, o Hermes roda no
  computador do Nan, com o worker `supabase/functions/_hermes-worker`, para ver o fluxo de ponta a ponta.
- O contrato com o banco do CRM-14 é o encaixe do Hermes: pedido guardado antes de rodar (`start_agent_run`), reserva
  única (`claim_agent_run`), passos gravados um a um (`append_agent_run_event`), fechamento com resposta ou falha
  (`finish_agent_run`) e a tela lendo os passos do banco. Trocar a ponte pelo Hermes não muda a tela nem as tabelas.

## Solution

O app continua dono da identidade, das permissões e dos dados; o Hermes raciocina e executa só o que o app permite.

```
Usuário → App (VPS) → Supabase: login, Workspace, regras, dados → worker na VPS → Hermes
                                   │                                    │
                                   │                                    └─ sugere, analisa, executa o permitido
                                   ├─ Dados privados do Workspace (ICP, Contas-alvo, Contatos, mensagens, respostas)
                                   └─ Inteligência coletiva aprovada (padrões por segmento, canal e resultado)
```

Três camadas de dado:

1. **Privada do Workspace.** ICP, ofertas, objeções, Contas-alvo, Contatos, Conversas, Envios e respostas. Outro
   Workspace nunca lê isso. Já existe em grande parte (isolamento por Workspace, Conversa privada de quem a começou).
2. **Padrões coletivos aprovados.** Aprendizados abstraídos, por exemplo: "em software para clínicas, por e-mail,
   citar um problema operacional antes da solução deu 18 respostas qualificadas em 240 envios nos últimos 90 dias".
   Guarda segmento, canal, abordagem, amostra e janela, nunca a conversa nem quem a teve. Só entra com a permissão do
   Workspace, depois de anonimizar, com amostra mínima e revisão humana.
3. **Skills versionadas.** Procedimentos que o Hermes aplica (pesquisar uma Conta, classificar uma objeção, escrever
   três variações de e-mail). Uma skill nova é testada e aprovada antes de valer para todos.

## Recomendações a conferir na documentação oficial do Hermes

Vieram de uma pesquisa do Nan (Perplexity) e ainda não foram verificadas na fonte. O ticket 01 as confirma ou corrige.

- Um perfil do Hermes por Workspace (não por pessoa), num gateway multiplexado (`/p/<perfil>/...`), cada perfil com a
  própria chave, `state.db`, memória e skills. O perfil separa estado, não é sandbox de segurança.
- Preferências de cada vendedor ficam no banco do app (`workspace_id`, `user_id`), não na memória nativa do perfil.
  A memória nativa é pequena (citado: `MEMORY.md` com 2.200 caracteres) e não é lugar para histórico de campanhas.
- Endpoints citados: `/v1/chat/completions`, `/v1/responses` e `/v1/runs` (com `run_id`, status, eventos SSE,
  cancelamento e `Idempotency-Key`). O `run_id` do Hermes seria guardado junto da Execução do app.
- Ferramentas por perfil só as necessárias. Nada de terminal, `execute_code` ou navegador sem sandbox. Ferramentas são
  APIs do app (`buscar_icp`, `consultar_contas`, `propor_mensagem`) que recebem o Workspace autenticado e impõem os
  limites; o Hermes nunca recebe chave mestra de Apollo, CRM ou banco.
- Envio, alteração de CRM e exportação ficam atrás das Permissões Ler, Propor e Executar e das Aprovações do app
  (ADR-0002, CRM-15), não só do prompt.
- Citado: limite padrão de 10 execuções simultâneas, configurável; estado global de registro de ferramentas no
  multiplexador (testar vazamento entre perfis antes de produção); container por Workspace para isolamento forte.
- "Autoaperfeiçoamento" é o Hermes criar e atualizar memórias e skills, não retreinar o modelo. Saber qual mensagem
  funciona exige medir o resultado (ticket 03).

## LGPD

A contribuição para a inteligência coletiva é desligada por padrão, com explicação do que é aproveitado, registro de
quando foi dada e retirada a qualquer momento. A permissão do cliente não torna os dados pessoais dos leads livres para
reuso: a finalidade coletiva precisa de base legal e aviso próprios. Antes de um padrão ser compartilhado, saem nomes,
contatos, empresas identificáveis, trechos literais e combinações que reidentifiquem. Nenhuma conversa bruta vai para
uma busca global. **O fluxo passa por um profissional de privacidade antes de produção.**

## Tickets

1. `01-pesquisar-a-documentacao-do-hermes.md`
2. `02-ligar-o-hermes-no-contrato-do-banco.md`
3. `03-medir-o-resultado-de-cada-mensagem.md`
4. `04-permissao-para-contribuir.md`
5. `05-biblioteca-de-padroes-coletivos.md`
6. `06-skills-versionadas.md`

## Out of Scope

Retreinar modelo; um Hermes por vendedor; expor o Hermes ou a chave dele ao navegador; o Hermes enviar mensagem sem
passar pelas Permissões e Aprovações do app.

## Em aberto

- Qual modelo o Hermes usa (Groq para teste e Claude na produção, ou outro).
