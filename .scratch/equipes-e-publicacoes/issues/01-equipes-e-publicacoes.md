# 01: Equipe crescendo (foto de headcount) e Publicações da empresa

**What to build:** a foto mensal de headcount e o adaptador `crescimento_de_equipes` (10% e +5 em 90 dias, ou vagas reforçando), e o adaptador `publicacao_da_empresa` com classificação dos posts, no `signal-runner`.

**GATE:** só migração nova (versão maior que `20261021100000`), aditiva e idempotente, RLS ligada na tabela nova e funções que conferem o Workspace; sem aplicar no remoto, sem deploy, sem segredo, sem SQL destrutivo; nenhum conector ou integração; `AGENT_PROVIDER` não muda; sem execução paga de actor; sem mudança de tela; sem emojis; pt-BR; sem a palavra "CRM"; sem as letras A–H dos nichos.

**Blocked by:** nenhum.

**Status:** closed

## Pode mexer

- `supabase/functions/signal-runner/` (handler: contexto opcional para os adaptadores; index; adaptadores novos e testes)
- `supabase/functions/account-discovery/pontuacao.ts` (peso do tipo novo)
- `supabase/migrations/` (arquivo novo), `supabase/tests/` (arquivo novo; o mínimo em `registro_de_actors.sql`)
- `scripts/validar-sinais-reais.ts`, `.scratch/sinais-reais/registro-apos-o-teste.sql`

## Não mexa

- `_shared/unipile`, `sender-accounts`, `unipile-account-status`, `_shared/integracoes`, `integration-*`, HubSpot, Pipedrive, Notion
- segredos, dado remoto, `AGENT_PROVIDER`, telas

## Critérios

- [x] Foto de headcount por Conta, com RLS e funções que conferem o Workspace (pgTAP)
- [x] 10% e +5 em 90 dias dispara; menos que isso com 3 ou mais vagas dispara; sem foto anterior só grava (Deno)
- [x] Posts classificados com resposta de exemplo do modelo e pela regra sem modelo; irrelevante não vira Sinal (Deno)
- [x] Actors em teste; `credits_per_account` = 2 nos dois tipos (pgTAP)
