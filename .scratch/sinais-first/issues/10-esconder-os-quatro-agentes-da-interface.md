# 10: Esconder os quatro Agentes da interface

**Status:** ready-for-agent

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Nenhuma migration apaga dado: as linhas de `private.agents`, `agent_conversations`, `agent_memory_facts`, `agent_skills` e `agent_routines` continuam existindo, só deixam de aparecer na interface de criação/uso. Sem aplicar no remoto, sem deploy, sem segredo.

**Blocked by:** 08 (Composer cria o Sinal) — a tela `/` precisa ter o novo composer funcionando antes de a grade dos 4 Agentes sair dali, para a tela inicial nunca ficar sem composer.

**Decisões:** D1 (as quatro Especialidades saem do produto; dado existente fica só leitura) e D9(a) (esconder da interface é o primeiro passo da retirada) da ADR-0033.

## O que construir

- A grade dos 4 Agentes em `src/paginas/agentes.tsx` (a tela `/`) sai de cena: `/` passa a mostrar só o composer de Sinal (tickets 07/08), sem a grade acima dele.
- A seção "Especialistas" da barra lateral (`src/components/casca.tsx`, hoje renderizada a partir de `agentesPadrao`) deixa de aparecer. A seção "Workspace" (Agentes, Aprovações, Conexões) e o resto da casca não mudam.
- O botão "Novo agente" e o fluxo de criação de Agente a partir de uma Especialidade saem da interface — ninguém cria mais um Agente de Scopus/Ethos/Rhetor/Oraculum.
- O autocompletar de @menção deixa de oferecer os 4 Especialistas (padrão ou criados).
- As rotas antigas de cada Agente (`/agentes/:agenteId/:secao`) passam a abrir uma versão **só leitura** das mesmas sub-abas que já existem (Conversa, Memória, Habilidades, Rotinas, Atividade): mostra o que já existia, sem caixa de novo pedido, sem Configuração editável e sem oferecer continuar a Conversa. Isso é o que preserva a história 21 da spec (quem tinha dado com esses Agentes continua enxergando).
- Nenhuma linha é apagada: `private.agents` e as tabelas dependentes continuam com o mesmo dado; só a interface deixa de oferecer criação e interação nova.

## Pode mexer

- `projeto-althius-frontend/src/paginas/agentes.tsx`, `src/components/casca.tsx`, `src/paginas/agente.tsx` (página de um Agente, convertida em leitura) e o componente de @menção, com testes.
- `projeto-althius-frontend/src/App.test.tsx`: os testes que hoje contam "a grade mostra os 4 Agentes" e "existe botão Novo agente" são atualizados para refletir o novo comportamento (grade ausente, Novo agente ausente); os que testam leitura de Memória/Conversa/Rotina seguem válidos, só sem a ação de escrever.

## Não mexa

- `private.agents`, `agent_conversations`, `agent_memory_facts`, `agent_skills`, `agent_routines`, `agent_events`, `agent_runs`: nenhuma linha muda ou é apagada.
- `private.specialty_catalog` (o `CHECK` dos 4 nomes) e `private.protect_default_agent`: continuam como estão; a retirada de schema é o ticket 15, por último.
- `private.seed_default_agents`: continua rodando normalmente; parar de semear é o ticket 13.
- O gate de Sequência (`specialty = 'rhetor'`): não muda aqui; é o ticket 11.
- `supabase/functions/_shared/orquestracao.ts` e o worker do Hermes: a limpeza de persona é o ticket 14.
- Arquivos do Kauê listados na spec.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.

## Critérios

- [ ] `/` mostra só o composer de Sinal, sem a grade dos 4 Agentes.
- [ ] A barra lateral não mostra mais "Especialistas".
- [ ] Não existe mais caminho na interface para criar um Agente a partir de uma Especialidade.
- [ ] O @menção não sugere mais nenhum dos 4 Especialistas.
- [ ] As rotas antigas de cada Agente abrem uma versão só leitura das sub-abas existentes, sem ação de escrever nem continuar Conversa.
- [ ] Nenhuma linha de `private.agents` ou tabela dependente é apagada ou alterada por este ticket (conferido por teste que lê o dado antes e depois).
- [ ] Vitest cobrindo a ausência da grade, da seção "Especialistas" e do botão "Novo agente", e a leitura só-leitura das sub-abas antigas; lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot publica o frontend.

## Comments
