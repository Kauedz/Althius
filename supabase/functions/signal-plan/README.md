# signal-plan

Propõe o **Plano do Sinal** a partir do **Briefing** (agente-de-sinal 01, escopo Contas escolhidas). A pessoa escreve o que quer acompanhar, escolhe as Contas e recebe um Plano estruturado para revisar. A função **não grava nada**: quem grava o Plano, como rascunho do Monitoramento, é `public.save_signal_plan`, depois da revisão. Nada roda, nada é cobrado e nada é ativado.

## Quem chama

O navegador, com o JWT da pessoa (`verify_jwt = true`). Corpo:

```json
{ "workspaceId": "<uuid>", "briefing": "até 1.000 caracteres", "escopo": { "tipo": "contas", "contaIds": ["<uuid>", "..."] } }
```

Resposta `200`: `{ "plano": <Plano do Sinal v1>, "avisos": [] }`. Quando o Plano sai da regra e não da IA, `avisos` traz `"Montamos um plano inicial. Revise os critérios."`.

O formato do Plano, os limites e os campos de critério de cada tipo estão em `_shared/plano-do-sinal/` (a fonte única; o banco repete o contrato em `private.validate_signal_plan`).

## O que faz

1. Valida a entrada (de 1 a 50 Contas, Briefing de 1 a 1.000 caracteres). Entrada inválida volta `400` **antes** de contar no limite do dia.
2. `begin_signal_plan_request`, com a sessão da pessoa: confere a Participação ativa e o limite de Planos do dia (**DECISÃO PENDENTE 13**: 20 por Workspace nas últimas 24 horas, em `private.signal_plan_limit`) e devolve os tipos que o Plano aceita, isto é, os actors `available` de `private.signal_actors` cujos campos de critério o servidor conhece. A lista nunca é fixa no código.
3. Monta o Plano com o motor dos Sinais (`escolherLlmDosSinais`, `SIGNALS_LLM_PROVIDER`: `hermes`, `openai` ou `regra`, padrão `regra`). O Briefing vai só no texto do usuário, entre `<briefing>` e `</briefing>`, e o prompt de sistema manda ignorar qualquer instrução dentro dele. A saída é só JSON; o servidor aproveita o tipo, os critérios e a explicação, e põe ele mesmo a origem, o escopo e o limite de empresas por Rodada.
4. Saída inválida (tipo fora do catálogo, critério fora das opções ou dos limites, JSON ruim), erro, motor desligado ou demora de mais de 25 s caem no **planejador por regra** (`planejador-por-regra.ts`): palavras do Briefing escolhem o tipo entre os aceitos (vaga e contratando: Abertura de vagas; novo diretor, gerente e liderança: Nova liderança; anúncio, Meta e Instagram: Anunciando na Meta; LinkedIn Ads: Anunciando no LinkedIn; e mais alguns) e os cargos entre aspas ou depois de "vaga de" e "cargo de" viram critério.
5. `finish_signal_plan_request` registra como o Plano saiu (`ia`, `regra` ou `falhou`). Se essa chamada falhar, a resposta segue.

Erros (sempre em palavras do produto, sem texto cru do modelo, erro de fornecedor, custo nem nome de ferramenta): `400` entrada inválida, `401` sem sessão, `403` sem Participação, `409 sem_tipos` (nenhum Sinal disponível), `429 limite_diario`, `500` "Não deu para montar o plano agora. Tente de novo.". O erro real e o desfecho (`ia`, `regra`, `motor_falhou`...) ficam no log técnico, sem o Briefing.

## Motor e segredos

Nenhum segredo novo. Lê os mesmos de `signal-runner` e `signal-cascade`: `SIGNALS_LLM_PROVIDER` (e, com `openai`, `OPENAI_API_KEY` e `OPENAI_MODEL`), mais `APP_ORIGIN`, `SUPABASE_URL` e a chave de serviço (para a fila do Hermes). `SIGNALS_LLM_TIMEOUT_MS` é fixado em 25 s por esta função. No provedor `hermes` o pedido entra na fila `private.signal_llm_requests` com a finalidade `sinal`, e o worker do Hermes que já existe o responde: **o worker não precisa de mudança**. Sem motor (`regra`), a regra responde sozinha.

O custo do modelo (frações de centavo) não é cobrado do Cliente nem devolvido: gerar o Plano não gasta crédito.

## Testes

`deno test supabase/functions/signal-plan supabase/functions/_shared/plano-do-sinal` (os testes que leem as migrations pedem `--allow-read=supabase/migrations,supabase/functions`). Os testes rodam sem rede: o banco e o motor entram por injeção de dependência.
