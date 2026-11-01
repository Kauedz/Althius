# 6a: Aderência pelo setor, não pelo nome

**Status:** ready-for-human

**GATE:** A migration precisa de backup + apply antes do merge; depois, publicar a Edge Function `account-discovery`.

## Problema

Empresas cujo nome ou descrição contém o setor do ICP estavam recebendo Aderência alta mesmo quando o setor declarado no LinkedIn era incompatível.

## Solução

Avaliar Setor pelo setor declarado e pelo CNAE quando houver, usando um vocabulário determinístico pt-BR → setores do LinkedIn/CNAE. Descrição e tags continuam sinais auxiliares, mas não vencem um setor declarado divergente; sem setor/CNAE, o resultado fica sem dado.

## Pode mexer

- `supabase/functions/account-discovery/` (pontuação, normalização, vocabulário e testes)
- Uma migration aditiva em `supabase/migrations/` no intervalo desta lane
- Um teste pgTAP em `supabase/tests/`

## Não mexa

- Frontend, outras Edge Functions, `criterios.ts` e o contrato HTTP de `handler.ts`.

## Critérios de aceite

- [x] Setor declarado incompatível não vira match por nome, descrição ou tags; a exclusão continua olhando todos esses campos.
- [x] O vocabulário pt-BR → LinkedIn/CNAE cobre os setores exigidos e termos não mapeados usam comparação sem acento no setor/CNAE.
- [x] Palavras-chave continuam separadas e não vencem setor declarado incompatível.
- [x] Sem setor/CNAE, descrição/tags não ajudam nem prejudicam: o motivo fica `atende: null`.
- [x] A regra é espelhada em `private.score_market_discovery_icp(uuid)` com migration aditiva e teste pgTAP.
- [x] Fixtures derivadas dos casos reais cobrem Logistica Total, Logistica Talks, Logística em tudo, logística real, seguros e candidata sem setor.
- [ ] Backup, apply da migration, CI e smoke de produção.

## Comments

- 28/10/2026 — A escolha conservadora para fonte sem setor/CNAE é `atende: null`, mesmo que descrição ou tags citem o setor; isso evita transformar texto editorial em declaração de atividade.
- 28/10/2026 — Para a Trilha B (agente): a capacidade permanece exposta pela avaliação determinística de `account-discovery`; não foi alterado o registro de ferramentas do agente.
- 28/10/2026 — TDD: o teste focado começou vermelho (19 passaram, 2 falharam), depois ficou verde; a suíte completa de `account-discovery` passou com 56 testes, 0 falhas.
- 28/10/2026 — `~/.deno/bin/deno check supabase/functions/account-discovery/index.ts` passou. A migration e o pgTAP foram escritos, mas não executados localmente porque o repositório não tem Docker/runner pgTAP.
- 28/10/2026 — Revisão: o espelho SQL comparava o setor do ICP com acento ("logística") contra chaves sem acento e nunca batia; trocado por `private.icp_sector_matches` (sem acento, palavra inteira, raízes como "segur" e "logistic") e o vocabulário ganhou nomes do CNAE em português ("Transporte rodoviário de carga"). ICP só com palavras-chave volta a bater na descrição (antes ficava sempre falso). Recalcula as candidatas de mercado existentes (0 em produção hoje). Migration ensaiada em produção numa transação desfeita: as 6 checagens bateram. Deno: 59 passaram, 0 falharam.
