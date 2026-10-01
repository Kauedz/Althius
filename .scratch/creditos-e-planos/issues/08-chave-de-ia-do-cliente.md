# 08: Chave de IA do cliente no Workspace

**What to build:** no setup, a Althius liga ao Workspace a chave de API do provedor de IA que o cliente preferir (ex.: Claude); a chave fica cifrada no Vault do Supabase, nunca no navegador; as Execuções desse Workspace usam esse modelo e gastam 20% do crédito.

**Blocked by:** 04: Debitar as Execuções de Agentes.

**Status:** ready-for-agent

## Pode mexer

- Migration aditiva com a referência ao segredo no Vault por Workspace e a função de serviço que a lê.
- A orquestração e o worker, para escolher o modelo por Workspace.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] A chave nunca volta ao navegador nem aparece em log.
- [x] Sem chave válida, a Execução falha com motivo claro.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Cadastrar a chave do cliente no Vault, pelo painel do Supabase, durante o setup (nunca pelo chat, nem em consulta SQL, que fica no histórico do painel): no painel, abra o **Vault** (em Integrations ou em Database, conforme a versão do painel), crie um segredo novo e dê a ele um nome, por exemplo `ia-cliente-norte`.
2. Ligar o segredo ao Workspace, uma vez por cliente, no SQL Editor (o `<id-do-workspace>` está na tabela `workspaces`; o modelo é o que o cliente quer usar):
   ```sql
   select public.set_workspace_ai_key('<id-do-workspace>', 'anthropic', 'claude-sonnet-5-5', 'ia-cliente-norte');
   ```
   Para o Workspace voltar ao modelo e ao preço da Althius: `select public.remove_workspace_ai_key('<id-do-workspace>');` (o segredo continua no Vault até você apagá-lo no painel).
3. Aplicar a migration `20260930210000_chave_de_ia_do_cliente.sql` e publicar a função dos Agentes (na raiz do repositório, com o `main` atualizado):
   ```powershell
   cd "$HOME\Althius"
   git checkout main
   git pull
   npx supabase db push
   npx supabase functions deploy agent-conversation --project-ref ycbdilsmydvzezhlymty
   ```
4. Reiniciar o worker do Hermes (`Ctrl+C` no terminal dele e ligar de novo), para carregar a checagem nova:
   ```powershell
   npx -y deno@2 run --node-modules-dir=none --allow-net --allow-env --allow-read --env-file=supabase/functions/_hermes-worker/.env supabase/functions/_hermes-worker/main.ts
   ```

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Seams testados (TDD): as funções SQL (pgTAP `chave_de_ia_do_cliente.sql`, 21 asserções; o Vault de verdade no CI e no Supabase, um esqueleto no Postgres puro do `pgtap-local.sh`), a ponte dos Agentes com banco e modelo injetados (Deno, `runner-chave-do-cliente.test.ts`, 9 testes, inclusive duas Execuções ao mesmo tempo com modelos diferentes), o worker do Hermes (2 testes) e as mensagens da tela (3 testes). Nenhum teste existente mudou.
- Banco: `private.workspace_ai_keys` guarda só o provedor, o modelo e o **nome** do segredo no Vault (a chave nunca fica na tabela). `set_workspace_ai_key`, `remove_workspace_ai_key`, `agent_run_ai_key` (a única que devolve a chave, só para o servidor) e `agent_run_uses_own_ai_key` (só sim ou não) são só de `service_role`. `begin_agent_round` foi redefinida a partir da definição do ticket 04: a rodada de um Workspace com chave própria custa 20% sem o chamador dizê-lo, então o preço e o modelo saem da mesma fonte.
- Ponte (`agent-conversation`): cada Execução lê a chave do Workspace dela e roda no modelo do cliente; sem chave, no modelo da Althius. Chave ligada que não dá para usar **nunca cai** no modelo da Althius: a Execução falha com `workspace_ai_key_unavailable` (sem valor no Vault), `workspace_ai_key_invalid` (o provedor recusou a chave) ou `workspace_ai_key_unsupported` (provedor que a função não usa), cada um com a mensagem em português na tela. A chave é removida de qualquer texto que vá para log, evento ou motivo, inclusive quando o provedor a repete no erro.
- Worker do Hermes: o Hermes tem o modelo dele e não sabe usar a chave do cliente. Um Workspace com chave própria **falha** com `workspace_ai_key_unsupported`, em vez de rodar no modelo da Althius e cobrar 20% como se usasse o do cliente. A chave em si nunca passa pelo worker (ele só pergunta se há uma).
- Decisões a confirmar: (1) só o provedor Anthropic é aceito por enquanto (o mesmo da ponte). (2) Com o Hermes como motor, o Workspace com chave própria não roda até o Hermes aceitar um modelo por Workspace (motor-hermes 01 vai dizer se os perfis por Workspace permitem). (3) A migration liga a chave por SQL, sem tela: o ticket diz que quem liga é a Althius, no setup. (4) `agent-conversation` só sobe se a Althius também tiver o próprio modelo configurado (`ANTHROPIC_API_KEY`); um Workspace com chave própria não faz a função subir sozinha.
