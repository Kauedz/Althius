# 02: Tela do Playbook nas Configurações

**What to build:** uma página "Playbook" nas Configurações do Workspace operacional mostra as seções em abas; o Administrador edita (texto e tabelas das seções estruturadas), o Membro só lê, e cada seção mostra versão, autor e o histórico.

**Blocked by:** 01: Seções do Playbook no banco.

**Status:** closed (conferência visual como Administrador e como Membro feita em 2026-10-07)

## Pode mexer

- Fonte nova `projeto-althius-frontend/src/fonte/supabase-playbook.ts` e a simulada da Demonstração.
- Página nova em `projeto-althius-frontend/src/paginas/` e a rota nas Configurações.
- Testes de tela com o banco em memória (padrão de `test/agentes-no-banco.ts`).

## Não mexa

- Nas páginas de Agentes e Conversas.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Membro não vê botão de editar; Administrador edita e grava.
- [x] Tabelas das seções estruturadas (matriz de dores, 3 perfis, toques da cadência) editáveis linha a linha.
- [x] Histórico com versão, autor e data; restaurar pede confirmação.
- [x] A Demonstração mostra um Playbook de exemplo, sem backend.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Conferir a tela no navegador como Administrador e como Membro (a IA faz a conferência visual e anexa os prints; o Nan só entra se precisar de login real).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/90

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - Membro sem editar, Administrador grava: `src/paginas/configuracoes/secao-playbook.tsx:30-31,103,146-182,198`; testes "um Membro lê a seção e não vê como editar" e "edita o texto e grava uma versão nova, que entra no histórico".
  - Tabelas linha a linha: `src/fonte/regras-playbook.ts:13-35`, `TabelaEditavel` em `secao-playbook.tsx:257-303`; testes "edita a tabela linha a linha: adiciona, preenche e remove" e "mostra a tabela das seções estruturadas para leitura".
  - Histórico e restaurar com confirmação: `secao-playbook.tsx:185-215,305-350`; teste "restaurar pede confirmação e grava uma versão nova com o conteúdo antigo".
  - Demonstração sem backend: `src/fonte/simulada-playbook.ts:1-2,72-115`, `src/fonte/composicao.ts:50`; teste "aparece em Configurações, com as 16 seções na ordem do modelo".
  - Testes rodados: `npx vitest run src/paginas/configuracoes/playbook.test.tsx src/fonte/supabase-playbook.test.ts` → 13 passed.
  - Conferência visual (1400×900), no Workspace operacional, com a Fonte real (`supabase-playbook.ts`) sobre o dublê do Supabase: [Administrador, texto e histórico](prints/02-admin-icp-edicao-e-historico.jpg), [Administrador, tabela linha a linha](prints/02-admin-tabela-linha-a-linha.jpg), [restaurar pede confirmação](prints/02-admin-restaurar-pede-confirmacao.jpg), [Membro, só leitura](prints/02-membro-icp-so-leitura.jpg), [Membro, tabela](prints/02-membro-tabela-so-leitura.jpg); e a [Demonstração com o Playbook de exemplo](prints/02-demonstracao-playbook-de-exemplo.jpg). O Membro não vê "Salvar", "Restaurar" nem "Importar planilha"; o autor de cada versão sai pelo nome de quem participa. O único erro no console é o favicon da página de teste.
  - Os prints `02-*.png` da branch `backup/playbook-local-2026-10-01` são de outra implementação e não valem para esta.
