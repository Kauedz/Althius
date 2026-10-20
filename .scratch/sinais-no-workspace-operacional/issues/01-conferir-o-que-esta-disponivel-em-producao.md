# 01: Conferir em produção quais Sinais estão disponíveis

Spec: [../spec.md](../spec.md) (US 3, 4).

**What to build:** um registro, com dado de produção, do estado de cada actor e de cada tipo do catálogo interno, e da resposta de `sinaisDisponiveis` para um Workspace real. Decide se o módulo fica indisponível só por falta da A3 ou por outro motivo.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

**Quem faz:** deploy-Nan. **Esforço:** P.

## Critérios

- [ ] Tabela nos Comments com `signal_type` e `state` de `list_signal_actors` e `list_signal_catalog` em produção
- [ ] Conferido se algum Sinal interno está `available`; se estiver e o módulo seguir indisponível, abrir bug com o erro do RPC
- [ ] Conferido se o cron `althius-internal-signals` está agendado
- [ ] Decisão registrada: a A3 basta para ligar o módulo?

## Passos do Nan

1. No SQL editor de produção (só leitura): `select signal_type, state from private.signal_actors order by 1;` e o equivalente do catálogo interno (`list_signal_catalog`).
2. `select jobname, schedule, active from cron.job where jobname like '%signal%';`
3. Colar o resultado nos Comments (sem segredos).

## Evidência (auditoria, vertical D)

- `supabase-sinais.ts:95-108`: `sinaisDisponiveis` = algum `available` nos dois RPCs.
- `20260930130000_registro_de_actors.sql`: actors nascem `testing`; `supabase/tests/registro_de_actors.sql` espera 12 em `testing`.
- O Monitoramento só processa actor `available`.
