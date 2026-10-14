# 06: A cascata entrega as empresas que não são Conta ao resolvedor

**What to build:** os passos `casar_com_contas` e `casar_fatos_com_contas` guardam as empresas sem Conta e o motor chama `record_signal_for_company`.

**GATE:** só migração nova (versão maior que `20261017160000`), aditiva e idempotente, RLS por Workspace mantida; sem aplicar no remoto, sem deploy, sem segredo, sem SQL destrutivo de dado; nenhum conector ou integração (HubSpot, Pipedrive, Notion, Unipile, WhatsApp, LinkedIn, e-mail); textos da tela em pt-BR, sem letra de nicho A–H e sem emojis; nenhuma mudança de rota, menu ou layout.

**Blocked by:** 02, 05.

**Status:** ready-for-agent

## Critérios
- [ ] As empresas sem Conta, com CNPJ ou site, saem do passo com o acontecimento (chave, frase, data, fonte, evidência).
- [ ] O motor grava cada uma pelo resolvedor, com o peso do tipo vindo de `pontuacao.ts`, sem mexer em créditos nem no desfecho da execução.
- [ ] Uma falha ao gravar uma empresa não derruba a execução.
- [ ] O signal-runner não muda: ele só varre Contas.

## Passos do Nan

Aplicar as migrações do PR na ordem e publicar as Edge Functions listadas no corpo do PR (`docs/agents/migrations.md`).
Não usar `apply_migration`; conferir `md5(statements[1])` contra o `md5sum` do arquivo.
