# 01: Diagnóstico: por que há 0 Sinais e o Monitoramento nunca rodou, e o caso TOTVS

**What to build:** Diagnóstico com evidência: os cinco elos em que o relógio pode falhar sem aviso e por que a busca TOTVS falhou sem rastro; consultas SQL de leitura prontas para o Nan.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

Commit: fatia 0 (`.scratch/sinais-cascata/diagnostico.md`)

## Pode mexer

- .scratch/sinais-cascata/diagnostico.md e evidencias/

## Não mexa

- Qualquer código.
- Produção.

## Critérios

- [x] Os cinco elos estão descritos, com o arquivo e a linha.
- [x] As dez consultas de leitura estão prontas para o Nan.
- [x] A causa do TOTVS é nomeada (sem rastro por passo).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Rodar as consultas SQL de leitura do diagnóstico no SQL Editor e colar o resultado na PR (nenhuma escreve).
2. Se `private.signal_runner_settings.url` for nulo ou o cron não existir: `configure_signal_runner` (ver o README de `signal-runner`).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4. Aplicação de migração: `docs/agents/migrations.md`.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/189 (rascunho; sem merge, nada aplicado em produção).
