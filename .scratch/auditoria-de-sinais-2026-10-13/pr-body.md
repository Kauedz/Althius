## Summary

Duas lacunas do catálogo de Sinais, só no backend e em dado. Tickets (GATE primeiro): `.scratch/auditoria-de-sinais-2026-10-13/issues/01` e `02`.

**1. Sinal interno `proposta_recusada`**, no padrão de `sem_resposta` e `negociacao_parada`:

```text
private.internal_signal_candidates(..., 'proposta_recusada', prazo)
  recusa = envio enviado com desfecho resposta_negativa     # único registro estruturado de recusa
           (a mais recente da Conta; chave = id do Envio)
  vale se a Conta não voltou a conversar depois do registro   # envio nosso não supera
  dispara em classified_at + prazo; sem crédito, sem fornecedor
  frase/evidência: só dias e prazo, sem nome, e-mail, canal nem texto
```

**2. Seis tipos genéricos ligados às cascatas, sem restrição de ICP**, por dado:

```diff
 src/fonte/sinais-reais-mapa.ts          # único arquivo de UI tocado, fora de sinais/
+SINAL_AGREGADO_DO_TIPO   novo-escritorio, registros-empresariais, investimentos-anunciados,
+                         crescimento-de-equipes, expansao-geografica
+'proposta-recusada' em SINAL_INTERNO_DO_TIPO
```

```text
private.signal_type_cascades (tipo genérico → cascatas de empresa, na ordem)
  vaga_linkedin (Abertura de vagas)  vaga_comex (A) · vaga_logistica (F) · vaga_engenharia_manutencao (E)
  novo_escritorio                    nova_planta_filial (D) · novo_cd_ou_filial (F) · troca_de_sede (F)
  registros_empresariais             cnpj_novo · mudanca_de_porte_ou_regime · entrada_de_socio (B)
  investimentos_anunciados           financiamento_bndes_finep · expansao_de_planta (E)
  crescimento_de_equipes             cruzando_faixa_de_headcount (G)
  expansao_geografica                nova_filial_icp_g (G) · novo_cd_ou_filial (F) · nova_planta_filial (D)

list_signal_catalog / signal_type_is_runnable   estado do tipo = melhor estado das cascatas ligadas

signal-runner.varrerMonitor
  cascata própria?            → como antes
  actor disponível?           → caminho do actor, como antes
  senão signal_type_cascade_plan(monitor)   # disponíveis e devidas (cadência da cascata)
    para cada devida: rodar(signalType = cascata, registrarComo = tipo genérico,
                            chave = monitor:<id>:<slot>:<cascata>)   # uma reserva de crédito por cascata
```

**Regra 3** (CONTEXT.md, `Sinal`): os Sinais de cada ICP detectam eventos nas empresas para quem o ICP vende, nunca no próprio ICP. No banco: só cascata de escopo `conta` atende um tipo genérico (a de `mercado` é recusada, inclusive se uma cascata ligada virar de mercado depois); o motor recusa `registrarComo` com cascata de mercado.

## Evidence

- **Before:** `sinal_proposta_recusada.sql` falha no primeiro assert (catálogo sem `proposta_recusada`) e `signal type is not available` ao criar o Monitoramento. `tipos_genericos_em_cascatas.sql` falha: `private.signal_type_cascades` não existe. Deno: `registrarComo`/`planoDoMonitor` inexistentes. Vitest: 7 de 8 falham (`.scratch/auditoria-de-sinais-2026-10-13/evidencias/`).
  **After:**

| Verificação | Resultado |
| --- | --- |
| pgTAP `sinal_proposta_recusada.sql` | 40/40 |
| pgTAP `tipos_genericos_em_cascatas.sql` | 48/48 |
| pgTAP do zero (Postgres 16 local, migrations em ordem) | 102 arquivos, 3786/3786 |
| `deno test supabase/functions` | 1340 passed, 0 failed, 32 ignored |
| `deno check supabase/functions/*/index.ts` | limpo |
| Vitest (suíte inteira, 2 workers) | 139 arquivos, 1253/1253 (+ arquivo de paridade novo, 10/10) |
| `tsc -b` / `oxlint` | limpo / 0 erros (avisos antigos) |

```text
dado: Alfa recusou há 40 dias, Gama recusou e respondeu depois, Epsilon recusou duas vezes
quando: Monitoramento proposta_recusada, prazo 30
então: Sinais só para Alfa (dispara há 10 dias), Delta e Epsilon (na recusa mais recente)
       reencontrar não renova o prazo; reclassificar o mesmo Envio mantém a chave
dado: nova_planta_filial disponível, as outras em teste
então: novo_escritorio e expansao_geografica "available"; registros_empresariais "testing"
       o plano devolve só nova_planta_filial; execução concluída há 10 dias a tira até 30 dias
```

Testes antigos alterados (necessário): três asserções de `sinais_internos_das_interacoes.sql` que cravavam "proposta recusada não existe" (55/55 depois).

## Merge Danger

**Door:** two-way

As duas migrações não têm `drop` nem apagam dado. A primeira insere uma linha no catálogo e redefine `private.internal_signal_candidates` (`create or replace`, as duas regras antigas intactas). A segunda cria uma tabela fechada e redefine `private.signal_type_is_runnable` e `public.list_signal_catalog` com o mesmo contrato. **Nada foi aplicado no remoto nem publicado.**

**Blast Radius:** Sinais

- O catálogo muda para quem já usa Sinais: `vaga_linkedin` (Abertura de vagas) passa a ser o melhor entre o actor e as cascatas de vaga. Com o actor disponível nada muda; sem ele, o card passa de "Em breve" a "Em teste". Os seis tipos ficam "Em teste" até uma cascata ligada ser validada e marcada disponível (`set_signal_cascade_state`, passo do Nan). Nenhum crédito é gasto antes disso.
- Quando uma cascata ficar disponível, o Monitoramento do tipo roda uma reserva de crédito **por cascata devida** (até 3 por rodada em Novo escritório), dentro do teto diário e do teto da varredura automática; a cadência da cascata (ex.: 720 h) evita rodar todo dia.
- **Mudança de UI que não fiz** (fora de `src/**/sinais/**`, é do outro PR): `paginas/sinais/editor.tsx` precisa de uma entrada em `COMO_O_INTERNO_DISPARA` para `proposta-recusada`, por exemplo "Dispara quando a recusa registrada no desfecho de um Envio completa o prazo e a Conta não voltou a conversar."; sem ela o editor mostra só o parágrafo genérico, que fala de Interações. A tela também não avisa que os critérios do formulário genérico só valem onde a cascata os lê (as de vaga leem localização e período).
- O mapeamento fica em `src/fonte/sinais-reais-mapa.ts`, não em `catalogo.ts`: os testes de `paginas/sinais/` fixam `abertura-de-vagas` ↔ `vaga_linkedin` e exatamente os 9 Sinais do lançamento em `SINAL_REAL_DO_TIPO`.

**Passos do Nan** (depois do CI verde; a `20261014170000` e as migrações das cascatas antes, se ainda não aplicadas):

1. Aplicar pelo `execute_sql`, em bloco atômico (`docs/agents/migrations.md`): `20261015100000_sinal_proposta_recusada.sql` e depois `20261015110000_tipos_genericos_em_cascatas.sql`.
2. `npx supabase functions deploy signal-runner --project-ref ycbdilsmydvzezhlymty`
3. Publicar o frontend.

**Decisões a confirmar:** "proposta recusada" = resposta negativa registrada no desfecho de um Envio (não há objeto Proposta); o mapeamento da tabela acima; a recusa e a negociação parada podem coexistir na mesma Conta.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01VKZ9geP2d1VoTuvjzFG4Sb
