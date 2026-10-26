# Handoff — sinais-first-12

## Estado

Implementação documental do ticket 12 concluída no worktree `ralph/sinais-first-12-auditoria-de-presenca-em-llm-como-ferram`, a partir do commit-base `d8dcd00` (`docs/sinais-first`). O ticket está `ready-for-human` para revisão/integração. Não houve commit: a regra de git desta sessão proíbe `git add` e `git commit`, e a matriz commita.

## Resultado

- O protótipo da página de Agentes não atribui mais exclusivamente ao Oraculum a auditoria de presença em LLMs (história, exemplo de Rotina, caso da Coordenação e mapeamento da ferramenta).
- A spec Sinais first e a ADR-0033 registram a auditoria como candidata a ferramenta interna, sem Especialidade proprietária nem implementação de produção.
- O ticket 12 foi atualizado com critérios e comentário datado, conforme o processo local.
- Referências: `.scratch/sinais-first/issues/12-auditoria-de-presenca-em-llm-como-ferramenta-interna.md`, `.scratch/pagina-de-agentes/spec.md`, `.scratch/sinais-first/spec.md`, `docs/adr/0033-sinais-first.md`.

## Verificação

- TDD documental: verificação de aceitação executada antes da edição e falhou nos seis pontos; repetida após a edição e passou nos sete pontos.
- `npx vitest run --maxWorkers=2 src/App.test.tsx`: 69 testes passaram.
- `npm run lint`: passou com avisos preexistentes.
- `npx tsc -b`: passou.
- Suíte completa `npx vitest run --maxWorkers=2`: excedeu 300 s; não concluiu e não relatou falhas antes do timeout.
- Sem migrations e sem mudanças de código de produção.
- Revisão: Spec não encontrou findings nem escopo extra. Standards apontou o AC marcado antes da verificação e a ambiguidade de `ready-for-human`; corrigi o comentário após os 69 testes focados passarem e mantive `ready-for-human` para a revisão e integração humana do worktree ainda não integrado. Nenhum smell foi identificado.

## Sugestão de skills

- `code-review` — se for necessária nova revisão depois de mudanças.
- `implement` e `tdd` — se a revisão solicitar alterações.
