# 02: Tipos genéricos do catálogo ligados às cascatas

## GATE

Confira antes de começar; se um item falhar, pare e avise o Nan.

- [x] `main` em `d4fbf05` (PR #194 mergeado). Última migração: `20261014170000_amostra_de_validacao.sql`. A nova usa timestamp maior que `20261014190000`.
- [x] As cascatas existem na `main` (39 tipos, ICPs A a H, migrações `20261013130000` a `20261013220000`), todas em `testing` ou `sem_fonte`: nenhuma `available` ainda. O estado do tipo genérico acompanha o melhor estado das cascatas ligadas; não é estado novo.
- [x] As definições mais recentes de `private.signal_type_is_runnable` e `public.list_signal_catalog` são as de `20261013130000_cascatas_de_sinais.sql` (nenhuma migração posterior as redefiniu).
- [x] Onde o mapeamento da tela vive: `projeto-althius-frontend/src/fonte/sinais-reais-mapa.ts`, **não** `paginas/sinais/catalogo.ts`. Esse arquivo fica fora do escopo (`src/**/sinais/**` é de outro PR). Os testes de `paginas/sinais/` fixam `abertura-de-vagas` ↔ `vaga_linkedin` e os 9 Sinais do lançamento em `SINAL_REAL_DO_TIPO`, então esses dois não podem mudar.
- [x] Sem sobreposição com o outro PR: nenhum arquivo de `src/**/sinais/**`, nenhuma RPC de `market_signals`, nenhum `list_cascade_catalog`.
- [x] Ambiente de teste: Postgres 16 com pgTAP (`scripts/pgtap-local.sh`), Deno 2 e Vitest.

**What to build:** ligar seis tipos genéricos do catálogo (Abertura de vagas, Novo escritório ou unidade, Registros empresariais, Investimentos anunciados, Crescimento ou redução de equipes, Expansão geográfica) às cascatas que já existem, **sem restrição de ICP**, só no backend e no dado.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Mapeamento

| Tipo no catálogo da tela | Tipo no banco | Cascatas que o servem (ICP) |
| --- | --- | --- |
| Abertura de vagas | `vaga_linkedin` (já existia, com actor) | `vaga_comex` (A), `vaga_logistica` (F), `vaga_engenharia_manutencao` (E) |
| Novo escritório ou unidade | `novo_escritorio` | `nova_planta_filial` (D), `novo_cd_ou_filial` (F), `troca_de_sede` (F) |
| Registros empresariais | `registros_empresariais` | `cnpj_novo` (B), `mudanca_de_porte_ou_regime` (B), `entrada_de_socio` (B) |
| Investimentos anunciados | `investimentos_anunciados` | `financiamento_bndes_finep` (E), `expansao_de_planta` (E) |
| Crescimento ou redução de equipes | `crescimento_de_equipes` | `cruzando_faixa_de_headcount` (G) |
| Expansão geográfica | `expansao_geografica` | `nova_filial_icp_g` (G), `novo_cd_ou_filial` (F), `nova_planta_filial` (D) |

Ficam de fora: cascatas `sem_fonte` (`caged_por_empresa`, `crescimento_comex_embarcador`...) e as de escopo `mercado`.

## Regra

- **Banco:** `private.signal_type_cascades (signal_type, cascade_signal_type, position)`. O estado do tipo (`list_signal_catalog`) é o melhor estado das cascatas ligadas (disponível, depois em teste, depois fora). O tipo com actor (`vaga_linkedin`) fica com o melhor entre o actor e as cascatas. `signal_type_is_runnable` passa a olhar o mapeamento, então `save_signal_monitor` e o relógio aceitam o tipo quando uma cascata dele está disponível.
- **Runner:** o Monitoramento do tipo genérico pede o plano ao banco (`signal_type_cascade_plan`) e roda cada cascata disponível e devida pelo mesmo motor, uma reserva de crédito por cascata. O Sinal é gravado no tipo genérico (`registrarComo`). O tipo com actor disponível segue pelo actor.
- **Cadência:** uma cascata devida é a que não tem, para o Monitoramento, uma execução concluída, parcial ou em andamento dentro da cadência dela. A de 720 h não roda todo dia.
- **Regra de produto (3):** o evento é numa empresa compradora do Workspace, nunca no próprio ICP. O banco só aceita cascata de escopo `conta` e recusa que uma delas vire de mercado depois; o motor recusa `registrarComo` com cascata de mercado.
- **Frontend (só o mapeamento):** `SINAL_AGREGADO_DO_TIPO` em `src/fonte/sinais-reais-mapa.ts` (novo, junto de `SINAL_REAL_DO_TIPO` e `SINAL_INTERNO_DO_TIPO`). Nenhum componente muda.

## Pode mexer

- Uma migração nova `supabase/migrations/20261015110000_tipos_genericos_em_cascatas.sql` e o pgTAP `supabase/tests/tipos_genericos_em_cascatas.sql`.
- `supabase/functions/signal-runner/handler.ts` (caminho do tipo genérico) e o README da função; `_shared/cascata-de-sinais/{tipos,motor,index}.ts` só para `registrarComo` e `planoDoMonitor`; testes Deno novos.
- `projeto-althius-frontend/src/fonte/sinais-reais-mapa.ts` e um teste novo em `src/fonte/`.
- `CONTEXT.md` (a regra do ICP), este ticket, a spec e `.scratch/RALPH-STATUS.md`.

## Não mexa

- Migrações já escritas, inclusive `20261013*` e `20261014*`.
- `projeto-althius-frontend/src/**/sinais/**` (outro PR: cascatas.tsx, cards, layout mobile, tela de Sinais de mercado) e qualquer RPC de `market_signals`. O que a tela precisaria mudar está no PR.
- O estado das cascatas (todas seguem `testing`; só o Nan as marca `available`, depois de uma execução real).
- Remoto: nada aplicado, nada publicado, nenhum segredo.

## Critérios

- [x] Vermelho antes do verde: pgTAP e Deno escritos e falhando antes do código; vitest idem.
- [x] pgTAP: o mapeamento exato; só cascata de empresa; o estado acompanha o melhor das cascatas; com tudo em teste o tipo recusa Monitoramento; com uma disponível aceita; o relógio reivindica o tipo; o plano respeita a cadência (falha não conta, conversa não conta); o Sinal é gravado no tipo genérico; o tipo com actor fica com o melhor estado; as regras do mapeamento (mercado, cascata, interno, chaves); permissões e RLS.
- [x] Deno: cada cascata devida roda com a sua chave e `registrarComo`; nada devido não cobra; actor disponível segue o actor; actor indisponível cai nas cascatas; uma falha não derruba as outras; o tempo acabando deixa o resto devido; mensagens em palavras do produto, sem fornecedor.
- [x] Motor: `registrarComo` grava no tipo genérico, o mesmo acontecimento conta uma vez, a cascata de mercado é recusada sem reservar nada.
- [x] Frontend: os seis tipos mostram o estado do banco; o Monitoramento e os Sinais voltam para o card genérico; os 9 Sinais do lançamento não mudam; paridade com a migração.
- [x] Nenhum texto que o usuário lê cita fornecedor.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos, antes de declarar o ticket pronto. Nunca pula um passo manual e nunca roda no remoto o que é do Nan.**

1. Com o CI verde, aplicar `supabase/migrations/20261015110000_tipos_genericos_em_cascatas.sql` no projeto `ycbdilsmydvzezhlymty`, pelo `execute_sql`, em bloco atômico (`docs/agents/migrations.md`). **Depois** da `20261014170000` e das migrações das cascatas (`20261013120000` em diante) se ainda não estiverem aplicadas: sem elas, a migração falha nas chaves das cascatas, sem aplicar nada. Ela não apaga dado e não tem `drop`; redefine duas funções com `create or replace` (`private.signal_type_is_runnable`, `public.list_signal_catalog`, mesmo contrato).
2. Publicar `signal-runner` (o `supabase/config.toml` já traz `verify_jwt = false`: o relógio do banco o chama com o token do runner): `npx supabase functions deploy signal-runner --project-ref ycbdilsmydvzezhlymty`.
3. Publicar o frontend, como de costume.
4. Nada muda sozinho: os seis tipos aparecem "Em teste" até uma cascata ligada ser validada numa execução real e marcada disponível (`set_signal_cascade_state`, passo do Nan do ticket 15 de `sinais-cascata`). Daí o tipo passa a aceitar Monitoramento e roda só as cascatas disponíveis.

## Comments

- **Vermelho** (`evidencias/02-vermelho-pgtap.txt`, `02-vermelho-deno.txt`, `vermelho-frontend.txt`): o pgTAP falhou por `private.signal_type_cascades` não existir; o Deno por `registrarComo` e `planoDoMonitor` inexistentes; o Vitest em 7 de 8. **Verde:** pgTAP `tipos_genericos_em_cascatas.sql` 48/48; Deno 1340 passed / 0 failed / 32 ignored e `deno check supabase/functions/*/index.ts` limpo; Vitest 139 arquivos / 1253 testes (mais 2 de paridade com as migrações, rodados à parte: 10/10 no arquivo novo); `tsc -b` limpo; lint sem erro (avisos antigos).
- **pgTAP do zero** (`evidencias/pgtap-do-zero.txt`): 102 arquivos, 3786/3786.
- **Decisões a confirmar:** (1) o mapeamento da tabela acima (em especial `expansao_de_planta` em Investimentos e `troca_de_sede` em Novo escritório); (2) o tipo com actor (`vaga_linkedin`) ganhou as cascatas de vaga em vez de o card apontar para outro tipo, porque os testes de `paginas/sinais/` fixam `abertura-de-vagas` ↔ `vaga_linkedin`; com o actor disponível, o caminho do actor vence; (3) cada cascata devida reserva o seu crédito (um Monitoramento de Novo escritório pode gastar até 3 reservas por rodada, dentro do teto diário do Workspace e do teto da varredura automática); (4) os critérios do formulário genérico só valem onde a cascata os lê (as de vaga leem localização e período); a tela não avisa isso, e é mudança de UI fora deste PR.
- Limites: a "Buscar Sinais de novo" continua só com Sinais de actor; todos os seis tipos aparecem "Em teste" até uma cascata ligada ser marcada disponível.
