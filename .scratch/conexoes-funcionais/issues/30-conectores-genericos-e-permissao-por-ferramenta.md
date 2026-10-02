# 30: Conectores genéricos, como os do Claude, com permissão por ferramenta

**What to build:** "Os conectores funcionam como os do Claude: o usuário conecta, e o Agente usa as ferramentas do conector. Não existe conector especial" (Nan, 2026-10-02). Nenhum código específico por app para ler ou escrever: o app é só DADO de perfil (URL do servidor MCP, OAuth, segredos do cliente pré-registrado), e o que o conector faz vem do `tools/list` do próprio servidor. Cada ferramenta tem, no Workspace, uma de três permissões decididas pelo Administrador: sempre permitir, pedir aprovação ou bloquear ([ADR-0022](../../../docs/adr/0022-permissao-por-ferramenta-do-conector.md), que complementa a ADR-0002).

**Blocked by:** 03 (o mecanismo do Acesso); CRM-15 (Aprovações); a [pesquisa de 2026-10-02](../pesquisa-conectores-mcp-todos.md).

**Status:** ready-for-human (fatias 1 a 3, 5 e 6 prontas; o catálogo ampliado e o Pipedrive pelo MCP prontos, exceto o Salesforce, que espera a autorização de um assert antigo; o Enviar ao CRM pelo caminho genérico ficou descrito, ver Comments)

## Pode mexer

- `supabase/functions/_shared/integracoes/` (perfis como dado, `regras.ts`), `integration-access.ts`, `ferramentas-dos-agentes.ts`, `executor-de-aprovacoes.ts`, `integration-tools`.
- Migrations novas na faixa `20261002110000`–`20261002119999`.
- Conexões e a Conversa no frontend, só acrescentando.

## Não mexa

- Em testes existentes (nem o `raiz.test.tsx`, que mantém a fila `/aprovacoes` desligada).
- No escritor por app do Envio ao CRM (`envio-ao-crm.ts`): o caminho REST por chave de API continua como está.

## Critérios

- [x] Perfis de todo o catálogo com servidor MCP remoto oficial e OAuth para terceiros, como dado: Slack, Google Calendar, Google Sheets, Calendly, Bitrix24, TikTok Ads (`_shared/integracoes/conectores.ts`); o que a pesquisa não confirmou está em `naoConfirmado`; nenhuma URL inventada (os endereços de autorização vêm da descoberta RFC 9728/8414).
- [x] Os apps novos no catálogo do banco e o Pipedrive pelo MCP: migration `20261002111000_catalogo_de_conectores.sql` (Slack, Google Calendar, Google Sheets, Calendly, Bitrix24 e TikTok Ads habilitáveis; Zoho CRM "Em breve"; o Pipedrive com `oauth_mcp` e `api_key`), pgTAP `catalogo_de_conectores.sql` (10), as categorias Agenda e Comunicação na tela. O Salesforce ficou de fora (ver Comments).
- [x] Permissão por ferramenta: `private.integration_tool_rules`, `list_integration_tool_rules` (Participação ativa), `set_integration_tool_rule` (só Administrador); padrão leitura `sempre`, escrita `aprovacao`; pgTAP `permissao_por_ferramenta.sql` (30).
- [x] Combinada com a Permissão do Agente sem enfraquecê-la, num lugar só (`_shared/integracoes/regras.ts`) e aplicada em todo caminho do Acesso (`chamarFerramenta`): Ler nunca escreve; `bloqueada` vence tudo; `aprovacao` exige Aprovação mesmo com Executar; `sempre` executa com Executar e pede Aprovação com Propor.
- [x] Ferramenta genérica `usar_conector` dos Agentes: lista as ferramentas do servidor (nome, descrição, esquema, se escreve, o que acontece), executa a leitura permitida (resultado cortado, sem token) e, quando pede Aprovação, cria pelo `propose_agent_action` a Aprovação `{tipo:'ferramenta', integration_id, ferramenta, argumentos}` exata.
- [x] Executor das Aprovações de ferramenta: `tool_approval` → `claim_approved_action` (hash e regra de novo) → `chamarFerramenta` com `agenteId` e a Aprovação em execução → `finish_approved_action`; uma vez só.
- [x] A Aprovação pendente aparece como passo da própria Conversa, com Aprovar e Recusar só para o Administrador; depois de aprovar, a Fonte pede a execução à `integration-tools` (ferramenta) ou ao `crm-handoff` (envio ao CRM).
- [x] Tela do conector: em "Ver ferramentas", cada ferramenta com sempre permitir, pedir aprovação ou bloquear; só o Administrador muda; na Demonstração, exemplos.
- [ ] Enviar ao CRM pelo caminho genérico (fatia 4, descrita abaixo).

## Comments

- **Migration** `20261002110000_permissao_por_ferramenta.sql` (aditiva): a tabela e as RPCs das regras, `integration_tool_rules_for_use` e `tool_approval` (só `service_role`), e `propose_agent_action`/`claim_approved_action` redefinidas a partir do corpo de 20261001130000, mudando só a Aprovação de ferramenta: bloqueada recusa (`42501 the tool is blocked in this workspace`), só `sempre` com Executar nasce liberada, e reservar devolve `tool_blocked` ou `tool_rule_changed` quando a regra mudou depois. As outras Aprovações seguem iguais (pgTAP antigo verde).
- **Edge Functions:** `chamarFerramenta` lê as regras pelo banco (`regrasDasFerramentas`, opcional: um banco sem ela fica só com a ADR-0002, como antes) e não chama nada se as regras não puderem ser lidas. `usar_conector` fica em `FERRAMENTAS` (o `CATALOGO` antigo, de quatro, não muda) e só é oferecida quando o banco sabe ler as regras e propor a chamada. A `integration-tools` ganhou `executar_aprovacao` (JWT do Administrador; o executor confere de novo).
- **Frontend:** `paginas/aprovacao-do-passo.tsx` (a Aprovação no passo de ferramenta, nas duas Conversas); `composicao.ts` liga a leitura e a decisão das Aprovações quando as Conversas estão disponíveis, mantendo o módulo `aprovacoes` indisponível (a rota `/aprovacoes` continua dizendo indisponível). `conexoes.tsx`: as três opções por ferramenta; Fonte real por `list_integration_tool_rules`/`set_integration_tool_rule`, simulada em memória.
- **Bloqueado por testes antigos (parei aqui, como manda o briefing):**
  1. Acrescentar Slack, Google Calendar, Google Sheets, Calendly, Salesforce, Zoho CRM, Bitrix24 e TikTok Ads ao `private.integration_catalog` quebra `supabase/tests/catalogo_e_habilitacao_de_integracoes.sql` ("membro lista as 9 integrações do catálogo", conta exata) e `supabase/tests/acessos_as_integracoes.sql` (1–2: as listas exatas de "nao_habilitada" e "em_breve").
  2. O Pipedrive pelo servidor MCP (migration `20261002100000_pipedrive_pelo_mcp.sql` do branch `worktree-agent-a54f74a388c9810d2`) quebra `supabase/functions/_shared/integracoes/perfis.test.ts` (`SEED_DO_BANCO.pipedrive.kinds = ['api_key']`) e `supabase/functions/integration-connect/handler.test.ts` ("a Integração sem o caminho pedido…": `iniciar` no Pipedrive responde 400). Ajustar o perfil para passar seria tirar o MCP do Pipedrive; por isso nem o perfil nem a migration vieram. O Pipedrive continua pela chave de API, e os Agentes já usam as ferramentas REST dele pelo `usar_conector`.
  Os perfis dos apps novos já estão no código e o `integration-connect` já os conecta: falta só o banco listá-los. Com o Nan de acordo em atualizar aqueles quatro asserts (contagem 9 → 17; as listas; o `SEED_DO_BANCO` e o `iniciar` do Pipedrive), salvar o SQL abaixo como `supabase/migrations/20261002111000_catalogo_de_conectores.sql`, trazer o perfil MCP do Pipedrive daquele branch, acrescentar `'Agenda' | 'Comunicação'` em `CategoriaDeIntegracao` e em `CATEGORIAS` de `conexoes.tsx` e os ids novos em `IntegracaoId`:

  ```sql
  insert into private.integration_catalog (id, name, writes, category, description) values
    ('slack', 'Slack', true, 'Comunicação', 'Canais, mensagens e canvases do Slack.'),
    ('google-calendar', 'Google Calendar', true, 'Agenda', 'Agenda e eventos do Google Calendar.'),
    ('google-sheets', 'Google Sheets', true, 'Conhecimento', 'Planilhas do Google Sheets.'),
    ('calendly', 'Calendly', true, 'Agenda', 'Tipos de evento e agendamentos do Calendly.'),
    ('salesforce', 'Salesforce', true, 'CRM', 'Contas, contatos e oportunidades do Salesforce.'),
    ('zoho-crm', 'Zoho CRM', true, 'CRM', 'Contas, contatos e negócios do Zoho CRM.'),
    ('bitrix24', 'Bitrix24', true, 'CRM', 'CRM, tarefas e comunicação do Bitrix24.'),
    ('tiktok-ads', 'TikTok Ads', true, 'Mídia paga', 'Campanhas e públicos do TikTok Ads.')
  on conflict (id) do nothing;
  -- Salesforce e Zoho CRM ficam sem perfil ("Em breve"): o servidor é criado na conta de cada cliente.
  insert into private.integration_connection_profiles (integration_id, kinds, pins_portal) values
    ('slack', array['oauth_mcp'], false),
    ('google-calendar', array['oauth_mcp'], false),
    ('google-sheets', array['oauth_mcp'], false),
    ('calendly', array['oauth_mcp'], false),
    ('bitrix24', array['oauth_mcp'], false),
    ('tiktok-ads', array['oauth_mcp'], false)
  on conflict (integration_id) do nothing;
  ```
- **2026-10-02: o catálogo ampliado e o Pipedrive pelo MCP entraram** (o Nan autorizou atualizar os quatro asserts listados acima, só com os valores novos):
  - **Migration** `20261002111000_catalogo_de_conectores.sql` (aditiva): o SQL acima sem o Salesforce, mais o `update` que acrescenta `oauth_mcp` ao Pipedrive (o que era a `20261002100000` do branch antigo, que não foi trazida). `category` é texto livre, sem check; `list_workspace_integrations` ordena Agenda e Comunicação depois das quatro conhecidas, sem precisar ser redefinida.
  - **Pipedrive:** o perfil MCP em `perfis.ts` (servidor `https://mcp.pipedrive.ai/mcp` da pesquisa; registro dinâmico, com `PIPEDRIVE_MCP_CLIENT_ID`/`_SECRET` como app pré-registrado; identificação por `/v1/users/me` com o token no cabeçalho ou por `getAccountContext`). Testes novos `perfis-pipedrive-mcp.test.ts` e `integration-connect/handler-pipedrive-mcp.test.ts`. O escritor do Pipedrive no Envio ao CRM do branch antigo (`a10aed0`) não veio: nenhum código por app.
  - **Asserts antigos atualizados (só esses quatro):** `catalogo_e_habilitacao_de_integracoes.sql` (contagem 9 → 16); `acessos_as_integracoes.sql` 1–2 (não habilitadas: + bitrix24, calendly, google-calendar, google-sheets, slack, tiktok-ads; em breve: + zoho-crm); `perfis.test.ts` (`SEED_DO_BANCO.pipedrive.kinds = ['oauth_mcp', 'api_key']`); `integration-connect/handler.test.ts` (o 400 do `iniciar` sem o caminho usa o RD Station, só com chave).
  - **Frontend:** `'Agenda' | 'Comunicação'` em `CategoriaDeIntegracao` e em `CATEGORIAS` (uma categoria sem nenhuma Integração não aparece), os ids novos em `IntegracaoId` e os nomes em `logos.tsx` (sem logo próprio, como Pipedrive e RD Station). Na Demonstração, só a tela de Conexões mostra os conectores novos (`simulada-conexoes.ts`), sem o Slack, que lá já é Canal com a prévia das Aprovações (um segundo cartão "Slack" quebraria os testes da prévia), e o Zoho CRM em breve; o catálogo fixo dos Agentes e da automação (`catalogo-de-conexoes.ts`) não mudou. Testes novos: `conexoes-catalogo-ampliado.test.tsx` e `conexoes-pipedrive-mcp.test.tsx`.
  - **Salesforce fora, bloqueado por outro teste antigo:** pôr `salesforce` no catálogo quebra `supabase/tests/agentes_e_permissoes.sql` (teste 46, "a Permissão é só de uma Integração do catálogo", usa `{"salesforce":"ler"}` como Integração desconhecida; 51, 53, 58 e 102 caem em cascata). Esse assert não estava na autorização. Com o Nan de acordo em trocar ali `salesforce` por um id fora do catálogo (ex. `kommo`), numa migration nova da faixa:
    ```sql
    insert into private.integration_catalog (id, name, writes, category, description) values
      ('salesforce', 'Salesforce', true, 'CRM', 'Contas, contatos e oportunidades do Salesforce.')
    on conflict (id) do nothing;
    -- Sem perfil de conexão: "Em breve" (o servidor MCP é criado em cada org, com um External Client App).
    ```
    e então somar `'salesforce'` em `IntegracaoId`/`logos.tsx`, a contagem 16 → 17 e `salesforce` na lista "em_breve" de `acessos_as_integracoes.sql`. Na Demonstração o Salesforce já aparece como "Em breve" (`integracoesFuturas`).
- **Fatia 4 (Enviar ao CRM pelo caminho genérico), não feita para não deixar meio-caminho.** Desenho: o botão "Enviar ao CRM" do detalhe da Conta passa a abrir um pedido aos Agentes (`start_agent_run` numa Conversa da Conta) com o payload que `begin_crm_handoff` já monta (empresa, Contatos, nota) e o CRM escolhido; o Agente usa `usar_conector` com as ferramentas do próprio conector (no HubSpot MCP, criar a Company, os Contacts e a nota). Cada escrita segue a ADR-0022 (no padrão, uma Aprovação por chamada, decidida na Conversa). Para o cartão ir a No CRM só quando a escrita da empresa der certo, `finish_crm_handoff` precisa saber qual Aprovação ou Execução criou a empresa: uma tentativa em `private.crm_handoffs` aberta com o `run_id`, e o executor de ferramenta marca `enviado` quando a Aprovação cuja ferramenta é a de criar empresa (nome vindo do servidor, não de código) termina executada. O ponto aberto é justamente esse: sem código por app, como a Althius sabe que "aquela" chamada criou a empresa? Proposta: o Agente declara no `usar_conector` (`efeito: 'empresa_no_crm'`) e o banco liga a tentativa àquela Aprovação. O caminho REST por chave de API continua como está, com os testes dele.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar `supabase/migrations/20261002110000_permissao_por_ferramenta.sql` no projeto `ycbdilsmydvzezhlymty` conforme `docs/agents/migrations.md` (validar com rollback, rodar `scripts/pgtap-no-remoto.sh supabase/tests/permissao_por_ferramenta.sql` e também `aprovacoes_reais.sql` e `ferramentas_dos_agentes.sql`, aplicar e conferir o md5). Depende de 20261001130000 e 20261001210000 já aplicadas.
2. Publicar as funções (PowerShell, na raiz do repositório):
   `npx supabase functions deploy integration-tools agent-conversation crm-handoff integration-connect --project-ref ycbdilsmydvzezhlymty` e `npx supabase functions deploy integration-callback --no-verify-jwt --project-ref ycbdilsmydvzezhlymty`
   (o código compartilhado do Acesso mudou; nenhum segredo novo para este ticket). Com o Hermes (`AGENT_PROVIDER=hermes`), atualizar o código de `supabase/functions/_hermes-worker` na máquina dele e reiniciá-lo.
3. Publicar o frontend como de costume.
4. Conferência real: em Conexões, conectar o Notion, abrir "Ver ferramentas", deixar uma de escrita em "Pedir aprovação"; dar ao Rhetor a Permissão Executar no Notion; pedir na Conversa "Rhetor, crie no Notion uma página com a pauta da <Conta>"; ver o passo com a Aprovação, aprovar ali e conferir a página no Notion e a Aprovação "Aprovada · executada". Repetir com a ferramenta em "Bloquear" (o Agente diz que está bloqueada) e em "Sempre permitir" (a página sai sem Aprovação).
5. Aplicar `supabase/migrations/20261002111000_catalogo_de_conectores.sql` no projeto `ycbdilsmydvzezhlymty` (o agente principal aplica, conforme `docs/agents/migrations.md`: validar com rollback, `scripts/pgtap-no-remoto.sh supabase/tests/catalogo_de_conectores.sql`, aplicar e conferir o md5) e publicar de novo as funções do Acesso:
   `npx supabase functions deploy integration-connect --project-ref ycbdilsmydvzezhlymty` e `npx supabase functions deploy integration-callback --no-verify-jwt --project-ref ycbdilsmydvzezhlymty`.
   Os apps com cliente pré-registrado pedem um app de autorização e dois segredos cada (`npx supabase secrets set NOME=valor --project-ref ycbdilsmydvzezhlymty`, digitando o valor só no terminal). URL de retorno em todos: `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback`.
   - **Slack:** criar o app em https://api.slack.com/apps, com os escopos de usuário das ferramentas MCP (lista na pesquisa) e a URL de retorno; segredos `SLACK_MCP_CLIENT_ID` e `SLACK_MCP_CLIENT_SECRET`.
   - **Google Calendar:** no Google Cloud Console (APIs e serviços > Credenciais), um cliente OAuth "Aplicativo da Web" com a URL de retorno, a tela de consentimento com os escopos `calendar.calendarlist.readonly`, `calendar.events.freebusy`, `calendar.events.readonly` e `calendar.events`, e a API do Calendar MCP ativada; segredos `GOOGLE_CALENDAR_MCP_CLIENT_ID` e `GOOGLE_CALENDAR_MCP_CLIENT_SECRET`.
   - **Google Sheets:** o mesmo caminho, com os escopos `spreadsheets` e `drive.file`; segredos `GOOGLE_SHEETS_MCP_CLIENT_ID` e `GOOGLE_SHEETS_MCP_CLIENT_SECRET`.
   - **Meta Ads** (já no catálogo): se o servidor não aceitar registro dinâmico, criar o app em https://developers.facebook.com/apps (Facebook Login for Business, URL de retorno); segredos `META_ADS_MCP_CLIENT_ID` e `META_ADS_MCP_CLIENT_SECRET`.
   - **Apollo** (já no catálogo): se o registro dinâmico não for aceito, registrar o app OAuth de parceiro (Apollo Partnerships); segredos `APOLLO_MCP_CLIENT_ID` e `APOLLO_MCP_CLIENT_SECRET`.
   - **HubSpot** (já no catálogo): `HUBSPOT_MCP_CLIENT_ID` e `HUBSPOT_MCP_CLIENT_SECRET` do MCP Auth App (ticket 03).
   - **Pipedrive:** registro dinâmico; se o servidor recusar (sem `registration_endpoint` no metadado), criar o app OAuth no Developer Hub do Pipedrive com a URL de retorno; segredos `PIPEDRIVE_MCP_CLIENT_ID` e `PIPEDRIVE_MCP_CLIENT_SECRET` (ticket 14).
   - Calendly, Bitrix24 e TikTok Ads: registro dinâmico; os segredos `CALENDLY_MCP_*`, `BITRIX24_MCP_*` e `TIKTOK_ADS_MCP_*` só se o servidor recusar o registro. No Bitrix24, o administrador liga "Permitir conexão de IAs externas" em Configurações > Servidores MCP.
6. Conferir no metadado OAuth de cada servidor (`/.well-known/oauth-protected-resource` e `/.well-known/oauth-authorization-server`) os pontos marcados "não confirmado" nos perfis.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
