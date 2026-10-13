# 12: Catálogo do Hermes para os 8 ICPs

**What to build:** o Hermes só oferece os Sinais do Mapa de Mercado, por ICP, com o gatilho e a restrição de cada um, marcando os que estão sem fonte (sem custo, com o motivo) e os de mercado (não viram Sinal de uma Conta).

**Blocked by:** 11 (os ICPs precisam estar semeados).

**Status:** ready-for-human

Commit: fatia final

## Pode mexer

- `supabase/functions/_shared/mapa-de-sinais.ts` e o teste dele.
- `buscar_sinais` em `_shared/ferramentas-dos-agentes.ts` e `ferramentas-dos-agentes-sinais.test.ts`.
- `.github/workflows/ci.yml` (passo dos testes que leem migrações).

## Não mexa

- O motor, as migrações das cascatas e as demais ferramentas do Hermes.
- Prompts do worker além do que já carrega `REGRA_DE_MARCA`.

## Critérios

- [x] O catálogo devolvido ao Hermes só tem tipos do Mapa, agrupados por ICP com gatilho e restrição (OAB/LGPD no C; CFC no B; SUSEP/saúde no G; ANEEL no D; CVM/Bacen no H).
- [x] Pedir um tipo fora do Mapa devolve "não está no catálogo".
- [x] Um teste prova que os Sinais semeados pelas migrações são exatamente os do Mapa, no mesmo ICP.
- [x] Nada do que o Hermes lê cita fornecedor nem "actor".

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Reiniciar o worker do Hermes (comando do README do worker) depois de publicar `signal-cascade`.
2. Perguntar ao Hermes, numa conversa de teste, "quais Sinais você busca para o ICP C?" e conferir que ele cita a restrição e os tipos sem fonte, sem nomear fornecedor.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/189.
