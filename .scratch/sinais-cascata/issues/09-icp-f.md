# 09: ICP F — Logística e transporte

**What to build:** As cascatas do ICP F (Mapa de Mercado): novo_cd_ou_filial, troca_de_sede, vaga_logistica; crescimento_comex_embarcador sem fonte.

**Blocked by:** 08 (a ordem é a das fatias da spec).

**Status:** ready-for-human

Commit: fatia 8 (`supabase/migrations/20261013200000_cascatas_icp_f.sql`)

## Pode mexer

- `supabase/migrations/20261013200000_cascatas_icp_f.sql` e `supabase/tests/cascatas_icp_f.sql`.
- `_shared/cascata-de-sinais/passos/icp-f*.ts` e testes.

## Não mexa

- O motor (`_shared/cascata-de-sinais/motor.ts`) e os tipos, salvo o que o ticket nomeia.
- Migrações já aplicadas: conserta-se com migração nova.
- Segredos e Supabase Auth; nada é aplicado em produção pelo agente.
- Outros ICPs.

## Critérios

- [x] Todos nascem `testing` (actor novo ou com menos de 20 usuários); `sem_fonte` com motivo e sem passos.
- [x] Nenhum texto do usuário cita fornecedor (pgTAP e deno provam).
- [x] Teto de dólar dimensionado para o pior caso; `eventKey` determinístico.
- [x] Apify e fontes públicas falsos; testes que leem a migração só rodam com `--allow-read`.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migração do ICP, em ordem (`docs/agents/migrations.md`): validar no remoto com `execute_sql` dentro de `begin; ... rollback;` e rodar `scripts/pgtap-no-remoto.sh supabase/tests/<arquivo>.sql` (falhas 0, total = plano).
2. Publicar `signal-runner`, `signal-cascade` e o worker do Hermes (lista completa na PR).
3. Antes de `set_signal_cascade_state('<sinal>', 'available')`: uma execução real de cada actor do Sinal, com teto baixo, conferindo `signal_cascade_run_steps` (custo real, erro real, campos). Os formatos lidos só da documentação pública estão listados em "Não conferido" na PR.
4. O lookup de CNPJ devolve um estabelecimento: a lista de filiais vem do mapa de filiais por raiz.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4. Aplicação de migração: `docs/agents/migrations.md`.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/189 (rascunho; sem merge, nada aplicado em produção).
