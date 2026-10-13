# Brief comum das fatias de ICP (B a H)

Contexto: a frente "Sinais em cascata de fontes" (spec nos anexos `.scratch/sinais/`). O motor (`supabase/functions/_shared/cascata-de-sinais/`) já roda um Sinal como cascata de passos (actor | fonte pública | regra) com UMA reserva de crédito, UM registro de execução com o rastro de cada passo, e `record_signal` no fim (ou `record_market_signal` quando o escopo é `mercado`). Esta fatia acrescenta as cascatas de UM ICP. O banco diz QUAIS passos formam cada cascata; o código diz COMO cada `handler` roda.

## Leia antes de escrever
- `.scratch/sinais/sinais-cascatas-apify.md` (a seção do seu ICP é a especificação; "Sinais sem actor adequado" também) e `.scratch/sinais/prompt-sinais-hermes-apify.md`.
- Padrões a copiar: `passos/icp-a-resto.ts` + `.test.ts` (fonte pública + regra, mercado), `passos/vagas.ts`, `passos/empresa-linkedin.ts`, `passos/cnpj-da-conta.ts`, `passos/casar-com-contas.ts`, `passos/empresas.ts` (Fato / EmpresaComFatos / `casar_fatos_com_contas`), `vaga-comex.test.ts` (cascata com actor e Apify falso, `falso-apify.ts`, `fixtures.ts`, `db-falso.ts`), `tipos.ts`, `motor.ts` (somente leitura), `fonte-publica.ts`, `comexstat.ts`, `llm-anthropic.ts`.
- Migração modelo: `supabase/migrations/20261013150000_cascatas_icp_a_resto.sql` (usa `private.seed_signal_cascade(jsonb)`; veja a assinatura em `20261013140000_cascatas_mercado_e_snapshots.sql`) e o pgTAP `supabase/tests/cascatas_icp_a_resto.sql`. Esquema das cascatas: `20261013130000_cascatas_de_sinais.sql`.
- `docs/agents/migrations.md` e `docs/visao-geral-da-plataforma.md` (regras que valem em todo lugar).

## Escopo: só estes arquivos (nada mais)
- `supabase/functions/_shared/cascata-de-sinais/passos/icp-<x>.ts` (hoje um stub `passosDoIcp_<x>(fetchFn)` que devolve `{passos:{}, fontes:{}}`; já está registrado em `passos/index.ts`: NÃO edite `index.ts`) e `passos/icp-<x>.test.ts`.
- Uma migração nova `supabase/migrations/<timestamp>_cascatas_icp_<x>.sql` com o timestamp que o chamador deu, e o pgTAP `supabase/tests/cascatas_icp_<x>.sql`.
- Evidência: `.scratch/sinais-cascata/evidencias/icp-<x>.txt` (saída vermelha do teste antes e verde depois, colada).
- Pode criar arquivos auxiliares NOVOS com nome próprio do ICP (ex.: `passos/icp-<x>-cnae.ts`). Não edite motor, tipos, db, db-falso, comum, empresas, fonte-apify, outros ICPs, handlers de função, frontend nem migrações existentes. Se achar que precisa de mudança no motor/tipos, NÃO a faça: descreva-a no relatório e implemente o que for possível dentro do escopo (o integrador decide).

## Regras (valem para todo Sinal)
1. TDD: escreva o teste, veja falhar (cole a saída), implemente, veja passar. Apify é SEMPRE falso (`apifyFalso`/`falso-apify.ts`); `fetch` de fonte pública é falso; nenhum teste usa a rede.
2. Estado: Sinal novo nasce `testing` (o padrão do seed). Sinal sem fonte confiável = `state: 'sem_fonte'` com `semFonteMotivo` verdadeiro e em palavras do produto, SEM passos e sem reservar crédito. Sinal de mercado (sem empresa/Conta) = `scope: 'mercado'` e itens com `payload`. Sinal de Conta = `scope: 'conta'`.
3. Só actors do plano Free (nada com `FLAT_PRICE_PER_MONTH`/aluguel). Cada passo de actor: `actorId`, `priceModel` (PAY_PER_EVENT | PRICE_PER_DATASET_ITEM | FREE), `estFixedUsd`, `estPerItemUsd`, `estItems`, `maxItems` e `knownPrice` com a fonte do preço (relatório de 12/10/2026). Defina `fallbacks` quando o relatório os cita (outro actor ou fonte pública aberta). Actor com menos de 20 usuários ou novo: continua `testing` (tudo é testing).
4. Teto duro por cascata (`capUsd`): padrão 0,50; use menos quando o custo estimado for bem menor; para jurimetria etc. com custo por CNPJ, dimensione `maxAccounts`/`maxItems` para que o pior caso caiba no teto. A cascata nunca gasta acima do teto (o motor aborta o passo seguinte).
5. Marca: nenhum texto que o usuário/Hermes lê (frase do Sinal, evidência, `semFonteMotivo`, `name`, `notes`, mensagens) cita Apify, "actor", nome de fornecedor de coleta. O `actorId` fica só na coluna técnica. O pgTAP deve provar isso (`!~* '(apify|\yactors?\y)'`).
6. Dado pessoal: o Sinal é da EMPRESA/CNPJ. Nada de nome/CPF de pessoa física, sócio, advogado ou parte de processo na frase, na evidência, no `eventKey`, nem no snapshot persistente (para sócio: só "entrou sócio", sem nome; para processo: só contagens por CNPJ). Nada de dado de saúde (G). Teste que prove o descarte de PF.
7. Idempotência: `eventKey` determinístico (empresa + fato + período), para repetir a rodada não gravar de novo. Frases/evidências em português, curtas, com os números do fato (use `recortar`/`LIMITES` de `signal-runner/adaptadores/comum.ts`).
8. Fontes públicas: confira o formato REAL com `curl`/WebFetch quando o sandbox alcançar (via proxy pré-configurado; nunca desligue TLS). O que não puder conferir (endpoint bloqueado, esquema de entrada do actor só da documentação pública) entra no relatório em "Não conferido", e o estado fica `testing`. Nunca invente campo de resposta como se tivesse conferido.
9. Nunca leia nem imprima segredos (`.env`, tokens). Nada de rede real em teste. Não rode actor real.
10. Fotografias (diff mensal): use `ctx.snapshots.ler/gravar`; a primeira rodada só grava (não emite Sinal: falta base); a segunda compara.
11. LLM só quando a spec pedir (`ctx.llm`, opcional): sem `ctx.llm`, o passo cai numa regra simples por palavra-chave (testada) e marca a evidência; o custo do modelo vai em `ctx.custo.adicionar`.

## Verificação (rode e cole o resultado)
- `deno test -A supabase/functions/_shared/cascata-de-sinais` (todos, não só o seu) e `deno check supabase/functions/*/index.ts`.
- pgTAP: `scripts/pgtap-local.sh pgtap_icp_<x> supabase/tests/cascatas_icp_<x>.sql` (o Postgres local já está de pé; cada agente usa o banco com o seu nome).
- Reveja o seu diff com olhar adversário (marca, PF, teto, idempotência) antes de commitar.

## Entrega
Commit na branch do seu worktree (sem push), mensagem `feat(sinais): ICP <X> — <resumo>` terminando com as linhas:
```
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017UPWqY2SyjqVdpt4ZMHZ1U
```
Relatório final (curto, útil para o integrador): por Sinal — `signalType`, nome, escopo, estado, passos/handlers, custo estimado por 100 resultados e créditos (custo×3 ÷ 0,30 por crédito), fallback; o que NÃO foi possível conferir; decisões que tomou; qualquer mudança que o motor precisaria; a lista de sinais (`signalType` + uma linha) para o catálogo do Hermes marcando `sem_fonte` e `mercado`; o caminho do commit.
