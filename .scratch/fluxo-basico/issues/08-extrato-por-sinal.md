# 08: Extrato por Sinal

**Status:** ready-for-human

**GATE:** Aplicar a migration e confirmar o visual no Workspace real.

## Problema

O extrato de Créditos ainda não identifica o Sinal que originou cada uso.

## Solução

Adicionar um RPC que associa lançamentos aos Monitoramentos e mostrar resumos de uso por Sinal e por ação.

## Critérios de aceite

- [x] O RPC novo retorna lançamentos com Sinal, respeita a visibilidade por Workspace e está protegido.
- [x] A fonte usa o RPC novo, mapeia o Sinal e tem fallback para a migration ausente.
- [x] A tela mostra uso por Sinal e por ação, ordenado por créditos, e oculta o resumo de Sinal sem associação.
- [x] Há cobertura Vitest para mapeamento, fallback e resumos.
- [ ] CI e os três resets do banco passam.

## Comments

- 28/10/2026 — Implementado o RPC aditivo, associação segura de `account_scan`/rescan e cascata, fallback da Fonte e resumos em pt-BR. A migration ainda precisa ser aplicada pelo responsável e a tela real conferida; CI/“três resets” não foram executados localmente.

2026-10-28 15h05 — Revisão: o pgTAP do Codex era só `ok(true)`. Foi reescrito com fixtures reais: Administradora, Membro e alguém de fora; Monitoramentos no Norte e no Sul; scan, rescan, cascata, CNPJ, chave malformada e Monitoramento de outro Workspace; 13 asserções. O mapeamento foi conferido só com leitura na produção: as 23 cascatas atuais vieram da conversa (sem Monitoramento) e ficam sem Sinal, como deve ser. Os resumos ganharam `section` com `aria-label`.
