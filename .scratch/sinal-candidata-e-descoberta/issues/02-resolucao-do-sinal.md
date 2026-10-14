# 02: Resolução do Sinal em Conta ou candidata

**What to build:** `public.record_signal_for_company`: acha a Conta por CNPJ e depois domínio, ou cria/atualiza a candidata; ganchos nos Sinais de mercado com CNPJ.

**GATE:** só migração nova (versão maior que `20261017160000`), aditiva e idempotente, RLS por Workspace mantida; sem aplicar no remoto, sem deploy, sem segredo, sem SQL destrutivo de dado; nenhum conector ou integração (HubSpot, Pipedrive, Notion, Unipile, WhatsApp, LinkedIn, e-mail); textos da tela em pt-BR, sem letra de nicho A–H e sem emojis; nenhuma mudança de rota, menu ou layout.

**Blocked by:** 01.

**Status:** ready-for-agent

## Critérios
- [ ] Empresa que já é Conta: o Sinal vai para a Conta pelo `record_signal` e a Conta fica Quente.
- [ ] Empresa que não é: cria ou atualiza a candidata com `origin = 'sinal'`, grava o Sinal com `discovered_account_id` e o motivo.
- [ ] Nunca duas candidatas para a mesma empresa (CNPJ ou domínio); a regra de comparação é a de `private.discovery_duplicate`.
- [ ] `record_market_signal` com `cnpj` no payload segue o mesmo caminho e guarda o vínculo (`market_signal_id`); sem empresa, só o painel de Mercado.
- [ ] Frases e fontes que vão à tela não citam fornecedor, e-mail, CPF nem telefone.
- [ ] Criar candidata não gasta crédito.

## Passos do Nan

Aplicar as migrações do PR na ordem e publicar as Edge Functions listadas no corpo do PR (`docs/agents/migrations.md`).
Não usar `apply_migration`; conferir `md5(statements[1])` contra o `md5sum` do arquivo.
