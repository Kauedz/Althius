# 01: Sem IA, nenhuma vaga aprovada; cargos com variações

**Status:** ready-for-agent

**Hermes:** não

**GATE:** Segue a [spec](../spec.md) (decisões D2 e D3 do Renan, 26/10/2026). Só código Deno (signal-runner e passo da cascata) com testes; sem migration, sem aplicar no remoto, sem deploy, sem segredo. Nenhum nome de provedor de IA em mensagem que chega ao usuário.

**Blocked by:** nenhum

**Decisões:** D2 (sem IA não aprova; descarta na rodada e registra o motivo) e D3 (variações óbvias de cargo, lista fechada) da spec.

## O que construir

### 1. Sem a IA de checagem, a vaga não é aprovada (D2)

Hoje `vagasDoNicho` (`supabase/functions/signal-runner/adaptadores/vagas.ts`, L107–124) aprova pela palavra-chave (`vagaDoNichoPelaRegra`) quando: não há `ctx.llm`; o modelo lança erro; o modelo não responde uma vaga (ou responde sem booleano). E os caminhos sem contexto `sinais()` de `vaga-linkedin.ts` (L42–45) e `vaga-indeed.ts` (L37–40) usam só a regra.

Depois deste ticket:

- Quando há recorte de nicho (hoje: `nichoCustom` nos adaptadores; nicho pronto ou Custom no passo `linkedinVagasMercado` de `_shared/cascata-de-sinais/passos/vagas-mercado.ts`), **só passa a vaga que o modelo respondeu `do_nicho: true`**. Sem modelo, com erro do modelo, ou sem resposta para a vaga: a vaga **não** passa.
- A função devolve também **quantas vagas ficaram sem conferência e por quê** (ex.: `{ aprovadas, semConferencia: number, motivo: 'sem-modelo' | 'falha-do-modelo' | 'sem-resposta' | null }`, nome a critério da sessão). `vagaDoNichoPelaRegra` não decide mais aprovação; pode sair ou ficar só como pré-filtro que **descarta** (nunca aprova) — escolha e explique no handoff.
- Os caminhos `sinais()` sem contexto deixam de aprovar pela regra quando há recorte: sem modelo, nenhuma vaga com recorte vira Sinal ali.
- **Motivo registrado:**
  - No mercado endereçável (cascata): quando alguma vaga ficou sem conferência, o passo grava o motivo onde a cascata já registra o que aconteceu no passo (`private.signal_cascade_run_steps.real_error`, ou o campo que o motor oferecer para o passo, como o `pular` faz em `motor.ts` ~L368–374) e, quando **todas** as vagas da rodada ficaram sem conferência, a rodada termina com uma frase do produto no erro amigável (`friendly_error` / `signal_monitor_runs.error`), ex.: "A checagem do nicho não estava disponível; N vagas não foram aprovadas e serão conferidas na próxima rodada." Sem nome de provedor.
  - Nos adaptadores por Conta (signal-runner): o motivo vai para o registro da rodada que o handler já grava (`signal_monitor_runs.error` ou equivalente existente), sem coluna nova. Se não houver onde registrar sem migration, registre em log estruturado sem dado pessoal e explique no handoff (não crie tabela).
- A vaga descartada não vira Sinal nem conta como repetida; na próxima rodada, se ainda estiver no período, é avaliada de novo. Não crie estado "pendente" novo no banco.
- O custo do modelo continua indo para `ctx.custo.adicionar` como hoje.

### 2. Cargos com variações óbvias (D3)

Hoje `vagaAtende` (`vagas.ts` L150–153) compara um cargo escrito (Custom) literalmente, e `buscasDasFuncoes` manda só ele para a busca.

- Uma tabela fechada, no mesmo arquivo ou num vizinho, de **variações de cargo de pré-vendas**, em pt e en, com sigla e nome por extenso. No mínimo:
  - SDR: `sdr`, `sales development representative`, `sales development rep`, `sales development`, `representante de desenvolvimento de vendas`, `pre vendas` (normalizado de "pré-vendas"/"pré vendas"), `prevendas`.
  - BDR: `bdr`, `business development representative`, `business development rep`, `representante de desenvolvimento de negocios`.
  - LDR: `ldr`, `lead development representative`, `lead development rep`.
  - Só acrescente outra entrada se for sigla consagrada com expansão inequívoca; nada de sinônimo de função diferente (ex.: não mapear SDR para "vendedor", "inside sales", "closer", "account executive").
- Casar é nos dois sentidos: o usuário escreve "SDR" e a vaga diz "Sales Development Representative" (casa); o usuário escreve "Pré-vendas" e a vaga diz "SDR Pleno" (casa). Comparação com `normalizar`/`cargoDaVaga` (acento, caixa, gênero), por palavra inteira como `contemAlgum` já faz ("SDR" não casa "SDRX").
- Cargo Custom que não está na tabela continua literal (comportamento de hoje).
- Busca: para cada cargo da tabela, a busca usa a forma mais comum de anúncio (ex.: a sigla) e **pode** acrescentar a forma por extenso se couber no limite de buscas que já existe (`MAX_BUSCAS`, `termosDaBusca`); não aumente o limite nem o custo por rodada.
- O SQL que conta cargos Custom (`private.normalized_role`/`private.suggested_job_roles`) não muda: o limite de 10 cargos escritos continua igual.

## Pode mexer

- `supabase/functions/signal-runner/adaptadores/vagas.ts`, `vaga-linkedin.ts`, `vaga-indeed.ts` e os testes deles (`vagas.test.ts` e vizinhos).
- `supabase/functions/_shared/cascata-de-sinais/passos/vagas-mercado.ts` e `passos/icp-e-vagas.test.ts` (ou um teste novo ao lado).
- `supabase/functions/signal-runner/handler.ts` só no ponto de registrar o motivo da rodada, sem mudar o contrato com o banco.
- `supabase/functions/signal-runner/README.md` (a linha que diz "senão palavra-chave").

## Não mexa

- Migrations e qualquer SQL (sem migration neste ticket).
- Frontend.
- O formato dos critérios (`nicho`, `nichoCustom`, `funcoes`): é o ticket 02.
- A exigência de recorte para ativar/rodar: é o ticket 03.
- `signal-plan/`, `_shared/plano-do-sinal/`, motor dos Agentes, worker do Hermes.
- Arquivos do Kauê (lista na spec).

## Critérios

- [ ] Deno: com recorte e **sem** `ctx.llm`, nenhuma vaga é aprovada (inclusive uma que cita o nicho no título), e o retorno diz quantas ficaram sem conferência e o motivo `sem-modelo`.
- [ ] Deno: com o modelo lançando erro, nenhuma vaga é aprovada; motivo `falha-do-modelo`.
- [ ] Deno: com o modelo respondendo só parte das vagas, só as respondidas `true` passam; as sem resposta não passam e contam em "sem conferência".
- [ ] Deno: sem recorte, o comportamento do filtro de nicho não muda (o ticket 03 é que exige recorte).
- [ ] Deno: `sinais()` de `vaga-linkedin` e `vaga-indeed` com `nicho: 'custom'` não aprovam vaga pela palavra-chave.
- [ ] Deno: no passo `linkedinVagasMercado`, sem modelo, a rodada não gera candidata e o motivo fica no registro do passo; com todas as vagas sem conferência, a mensagem amigável é a do produto e não cita provedor.
- [ ] Deno: "SDR" casa "Sales Development Representative", "SDR Pleno", "Pré-vendas"; "BDR" casa "Business Development Representative"; "LDR" casa "Lead Development Representative"; "SDR" **não** casa "Account Executive", "Inside Sales", "Vendedor" nem "SDRX"; um cargo Custom fora da tabela (ex.: "Closer") continua literal.
- [ ] Deno: a busca de "SDR" continua dentro de `MAX_BUSCAS` e o número de buscas por rodada não aumenta para um Monitoramento com 3 cargos.
- [ ] `deno check supabase/functions/*/index.ts` e `deno test -A supabase/functions` verdes.

## Passos do Nan

Nenhum passo manual além da revisão. Depois do merge, o deploy das funções `signal-runner` e da cascata é feito por quem publica (não por este ticket). O Sinal "Vagas BDR" continua pausado até os três tickets estarem no ar.

## Comments
