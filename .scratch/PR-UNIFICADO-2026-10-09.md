# PR unificado — 2026-10-09

Branch: `ralph/unificado-2026-10-09`, a partir da `origin/main` 7929a2b (PR #152). Worktree `C:\Users\usuario\Althius-unificado`.
Compare: https://github.com/Kauedz/Althius/compare/main...ralph/unificado-2026-10-09

Sem merge na `main`, sem migration remota e sem deploy: isso fica com o Nan e o agente de execuções, depois do CI verde.

## Branches unificadas, na ordem (`git merge --no-ff`)

| # | Branch | HEAD | Ticket(s) |
|---|---|---|---|
| 1 | `ralph/B3-revelar-email` (PR #153) | 8396ea1 | prospeccao-funcional B3 |
| 2 | `enriquecimento/01-fornecedores-da-cascata` | 9fbf251 | enriquecimento-em-cascata 01 |
| 3 | `ralph/S1-aceite-autoriza-antes` | 9cada0a | prospeccao-funcional S1 |
| 4 | `ralph/frente-creditos` | 31e32d9 | creditos-e-planos 03 |
| 5 | `crm/10-interacoes-e-sinais-internos` | fc70191 | crm-real-e-stack 10 |
| 6 | `ralph/conexoes-08-notion` | 6620837 | conexoes-funcionais 08 |
| 6b | `conexoes/ajustes-catalogo-logos-desabilitar` (worktree `Althius-conexoes-ajustes`, commits do Renan de 09/10, fora da lista original) | 63dde37 | conexoes-funcionais 31 |
| 7 | `ralph/agentes-02-tokens` | ae2ebaa | agentes-em-conversa 02 |

## Tickets incluídos

| Ticket | Caminho | Status | Caixas |
|---|---|---|---|
| B3 — revelar e-mail | `.scratch/prospeccao-funcional/issues/B3-revelar-email.md` | ready-for-human | 7/7 |
| Enriquecimento 03 (só o registro do B3) | `.scratch/enriquecimento-em-cascata/issues/03-revelar-email-e-telefone.md` | ready-for-agent (lote com custo máximo; telefone espera o Nan) | 0/3 |
| Enriquecimento 01 — fornecedores da cascata | `.scratch/enriquecimento-em-cascata/issues/01-fornecedores-da-cascata.md` | ready-for-human | 0/2 (fecham depois da migration e do script real do Nan) |
| S1 — aceite autoriza antes | `.scratch/prospeccao-funcional/issues/S1-aceite-autoriza-antes-de-devolver.md` | ready-for-human | 5/5 |
| Créditos 03 — interruptores e tetos | `.scratch/creditos-e-planos/issues/03-interruptores-e-tetos.md` | ready-for-human | 3/3 |
| CRM-10 — Sinais internos das Interações | `.scratch/crm-real-e-stack/issues/10-interacoes-e-sinais-internos.md` | ready-for-human | 6/6 |
| Conexões 08 — Acesso ao Notion | `.scratch/conexoes-funcionais/issues/08-conectar-o-acesso-ao-notion.md` | ready-for-human | 5/5 |
| Conexões 31 — logos, catálogo e desabilitar | `.scratch/conexoes-funcionais/issues/31-ajustes-catalogo-logos-desabilitar.md` | ready-for-human | sem caixas |
| Agentes 02 — tokens | `.scratch/agentes-em-conversa/issues/02-cada-agente-com-a-propria-vez.md` | ready-for-human | 4/4 |

## Decisões do Renan registradas (2026-10-09)

- CRM-10: as 5 decisões propostas foram aceitas, inclusive a migration com a troca de 2 FKs e a recriação de `list_signal_monitors`.
- Agentes 02: os tokens de cache do Hermes (`cache_read_tokens`, `cache_write_tokens`) ficam fora da contagem.

## Migrations novas, na ordem de aplicação

Nenhuma migration antiga foi alterada (`git diff origin/main --stat -- supabase/migrations` só mostra arquivos novos).

1. `20261009010000_teto_das_propostas_de_resposta.sql` (créditos 03; a `20261008233000` do créditos 01 já está na `main`)
2. `20261009030000_revelar_email_so_cobra_valor_novo.sql` (B3)
3. `20261009040000_origem_do_contato_aceito.sql` (enriquecimento 01; redefine `accept_proposed_contact`)
4. `20261009050000_sinais_internos_das_interacoes.sql` (CRM-10; troca 2 FKs e recria `list_signal_monitors`, sem apagar dado)
5. `20261009060000_aceite_autoriza_antes_de_devolver.sql` (S1; última definição de `accept_proposed_contact`, autoriza antes do retorno idempotente)
6. `20261009132551_conexoes_catalogo_disponivel.sql` (Conexões 31; aditiva, não toca `accept_proposed_contact`)

Cada uma pelo `execute_sql` em bloco atômico, como em `docs/agents/migrations.md`, depois do CI verde.

## Funções a publicar (projeto `ycbdilsmydvzezhlymty`, na raiz, depois das migrations)

| Função | Por quê | JWT |
|---|---|---|
| `account-enrichment` | B3 e enriquecimento 01 (depois da `20261009030000` e da `20261009040000`) | padrão (sem `--no-verify-jwt`) |
| `reply-proposal-runner` | créditos 03 (só depois da `20261009010000`) e adaptador do Groq do agentes 02 | `verify_jwt = false` no `supabase/config.toml` |
| `agent-conversation` | agentes 02 (adaptador do Groq) | padrão |
| `integration-connect` | Conexões 08 (`_shared/integracoes/perfis.ts`) | padrão |
| `integration-tools` | Conexões 08 | padrão |
| `integration-callback` | Conexões 08 | `--no-verify-jwt` (`verify_jwt = false` no `config.toml`) |
| `crm-handoff` | também importa `_shared/integracoes/perfis.ts` (Conexões 08); a mudança só toca o perfil do Notion, mas a função publicada fica igual ao código | padrão |
| `_hermes-worker` (não é Edge Function: reiniciar o worker) | agentes 02 (`worker.ts` passa o consumo de tokens) e `perfis.ts` | — |

Além das funções: reiniciar o worker do Hermes (`_hermes-worker`, agentes 02: `Ctrl+C` no PowerShell do worker e `npx -y deno@2 run --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=supabase/functions/_hermes-worker/.env supabase/functions/_hermes-worker/main.ts`) e publicar o frontend (CRM-10, Conexões 31). Comandos exatos nos Passos do Nan de cada ticket.

```powershell
npx supabase functions deploy account-enrichment reply-proposal-runner agent-conversation integration-connect integration-tools crm-handoff --project-ref ycbdilsmydvzezhlymty
npx supabase functions deploy integration-callback --no-verify-jwt --project-ref ycbdilsmydvzezhlymty
```

## Conflitos da unificação

- `supabase/functions/_shared/provedor-de-contatos.test.ts` (B3 × enriquecimento 01, add/add): união dos dois arquivos de teste. Ficam os testes da leitura de `emails[i].email` do B3 e os da cascata só com o Apify e da falha que não vira vazio do enriquecimento 01; imports somados.
- `provedor-de-contatos.ts` e `account-enrichment/handler.ts`: o Git juntou sozinho (trechos diferentes). Conferido: `emailDoPerfil` lê `emails[i].email`; o revelar chama o actor direto e só cobra valor novo (`finishRevealContact`); a cascata padrão é `fornecedoresDaCascata` (só o Apify) e a falha de um fornecedor volta se nenhum achar.
- `.scratch/RALPH-STATUS.md` (créditos × main): união das duas seções.

## Validação na branch unificada

Rodado em 2026-10-09 nesta máquina (Windows, 8 GB de RAM com pouca memória livre; sem Docker).

| Validação | Resultado |
|---|---|
| `npm ci` (frontend) | ok, 456 pacotes |
| `npx tsc -b` | exit 0. A primeira tentativa morreu sem memória (OOM do Node) enquanto rodavam deno e pgTAP juntos; sozinha, passou |
| `npm run lint` (oxlint) | exit 0; 0 erros, 50 avisos (o mesmo número da `main` registrado no CRM-10) |
| `deno check` das 24 funções (`supabase/functions/*/index.ts`) | exit 0 |
| `deno check scripts/validar-enriquecimento-real.ts supabase/functions/_hermes-worker/main.ts` | exit 0 |
| `deno test supabase/functions` | 781 passed, 0 failed |
| pgTAP do zero (`scripts/pgtap-local.sh`, Postgres 16.10 portátil próprio em `127.0.0.1:55449`) | 69 arquivos, 2783/2783 asserções, 0 falhas. Todas as migrations aplicaram do zero. A 1ª rodada parou depois de 66 arquivos (2691/2691) com saída 1 sem nenhum FALHOU; os 3 restantes (`varredura_automatica_de_sinais` 41/41, `workspace_da_empresa` 30/30, `workspace_pessoal` 21/21) passaram numa 2ª rodada do script num banco novo, do zero |
| Vitest completo (`npx vitest run --maxWorkers=2`, 33 min) | 120 arquivos e 1146 testes passed, 0 falhas; saída 1 por 1 erro de infraestrutura: o worker de `src/paginas/sinais/sinais.test.tsx` não subiu a tempo (`Timeout waiting for worker to respond`). Esse arquivo, rodado sozinho em seguida: 10/10. Total: 121 arquivos, 1156 testes verdes |

Nenhuma correção de código foi necessária por causa da união.