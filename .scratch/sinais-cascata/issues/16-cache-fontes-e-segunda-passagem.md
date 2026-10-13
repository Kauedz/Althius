# 16: Cache das fontes e segunda passagem da validação

**What to build:** Três correções da validação de produção de 13/10/2026, sem citar fornecedor de coleta para o usuário.

1. **NCM nova na pauta.** A estatística de comércio exterior responde HTTP 429 na saída da função, mesmo depois da espera do ticket 15; de outro endereço ela responde em cerca de 10 s. O dado muda uma vez por mês. A execução lê primeiro a cópia guardada da consulta naquele mês de referência. Se não houver cópia, espera 10 s, depois 20 s e depois 40 s, sem passar do prazo da função. Se ainda vier 429, a execução termina `adiado` (tenta de novo depois) e não cobra crédito. Não é falha. Um relógio diário, onde o agendador existe, pode encher essa cópia fora do pedido de um Workspace.
2. **Grupo A ainda cativo.** A API de busca da lista de consumidores livres responde 403. A mesma lista oficial tem o arquivo CSV do mesmo recurso (portal de dados abertos, recurso `lista_agente_associado_2026`, conferido em 13/10/2026). A execução tenta a busca e, se ela falhar, o CSV. O resultado do mês fica em cache. Se todas as fontes falharem e não houver cópia recente, o Sinal continua marcado de que a exclusão não foi feita. A lista da agência reguladora de cadastro de agentes não serve: não traz a classe de consumidor livre.
3. **Segunda passagem da validação.** Com `validacao: true`, as cascatas de fotografia comparam na hora com a base já guardada, sem esperar o mês: `processos_publicos`, `entrada_de_socio`, `nova_planta_filial`, `novo_cd_ou_filial`, `nova_filial_icp_g`, `cruzando_faixa_de_headcount`, `troca_de_sede`. Só uma diferença real vira Sinal. Dado igual à base não gera Sinal. Sem `validacao`, o intervalo mensal continua.

**GATE:** nenhum bloqueio. O ticket 15 está na `main` (PR #194). Este ticket não edita `src/**/sinais/**`, a RPC de Sinais de mercado, `proposta_recusada` nem `catalogo.ts`. Sem deploy. Sem aplicar migração no projeto remoto. Migração nova só com timestamp maior que `20261014190000`.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Pode mexer

- Cliente da estatística de comércio (`comexstat.ts`, `fonte-publica.ts`) e o passo que o chama (`icp-a-resto.ts`).
- O passo da lista de consumidores livres (`icp-d.ts`) e o modelo dele só por migração nova.
- O motor, para fechar a execução como `adiado` sem crédito, e a porta `signal-cascade` para a segunda passagem e para o aquecimento do cache.
- Os passos de fotografia que pulam a Conta fotografada há pouco ou que só comparam com a base do mês anterior (`icp-b.ts`, `icp-g.ts`). Os outros diffs já comparam na segunda execução; o teste trava isso.
- Migração nova e pgTAP novo. Não editar migração já escrita.
- READMEs das funções só se o contrato da porta mudar, este ticket e `.scratch/RALPH-STATUS.md`.
- Testes Deno desses módulos.

## Não mexa

- `src/**/sinais/**`, a RPC `record_market_signal` / `list_market_signals` e qualquer migração que as redefina.
- `proposta_recusada` e `catalogo.ts`.
- Migrações já escritas, inclusive as do ticket 15.
- Segredos, Auth, deploy e qualquer escrita no projeto remoto.
- Frontend.

## Critérios

- [x] Vermelho antes do verde: cache da estatística antes da rede; espera 10/20/40 s; 429 esgotado vira `adiado` com 0 crédito; CSV da lista quando a busca bloqueia; cache da lista; segunda passagem só emite diferença real.
- [x] pgTAP novo: a tabela de cache é privada; anon e authenticated não leem nem executam; a chave de serviço lê e grava; `adiado` cobra 0 e libera a reserva; um Monitoramento adiado não impede a tentativa seguinte no mesmo dia.
- [x] Nenhum texto que o usuário lê cita fornecedor de coleta.
- [x] Migração só no repositório. Nada aplicado no remoto. Sem deploy.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Com o CI verde, aplicar no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql`, em bloco atômico, como em `docs/agents/migrations.md`. Se as migrações do ticket 15 ainda não estiverem aplicadas, elas vêm antes.

   - `supabase/migrations/20261015120000_cache_de_fontes_e_execucao_adiada.sql`
2. Publicar as funções que leem o cache e fecham a execução adiada, sem `--no-verify-jwt`:

```powershell
npx supabase functions deploy signal-cascade signal-runner --project-ref ycbdilsmydvzezhlymty
```

3. Não marcar cascata como disponível. Uma rodada com `validacao: true` confirma: NCM que tomar 429 termina `adiado` e o saldo de créditos não muda; a segunda chamada no mesmo mês, depois de uma cópia guardada, não espera a rede; Grupo A ou traz a exclusão pela lista ou marca que a lista não foi consultada; a segunda passagem de uma fotografia só grava Sinal quando o dado mudou de verdade.

## Comments

- Vermelho (tipo): `aquecerEstatistica`, `MotorDaConversa.aquecer` e `tokenDeRotina` ainda não existiam; `deno test` parou no check com TS2305/TS2353. Os testes de cache, 10/20/40, `adiado` e CSV já tinham falhado em runtime antes da implementação e passaram depois.
- Verde (2026-10-13): `deno check supabase/functions/*/index.ts` limpo. `deno test supabase/functions` 1344 passed / 0 failed / 34 ignored. Com `--allow-read`, mapa + icp-c + icp-g + icp-h: 77 passed / 0 failed.
- pgTAP `supabase/tests/cache_de_fontes_publicas.sql` (16 asserts) não rodou aqui: sem Postgres local. O job Banco do CI executa o arquivo. Não aplicar no remoto a partir daqui.
- O relógio diário chama o `signal-runner` com `{"action":"aquecer"}`. `signal-cascade` continua com `verify_jwt = true`. Sem deploy.
- CI Banco (run 38475956693): a migração `20261014200000` parou em `42723` porque `begin_cascade_run` usava `create function` e a função já existia. Correção: `create or replace` em `begin_cascade_run` e `finish_cascade_run`, arquivo renomeado para `20261015120000` (depois de `20261015110000`, que entrou na main com os PRs 195 e 196). Deno depois do merge: 1360 passed / 0 failed / 34 ignored; com `--allow-read`, 77 passed.
