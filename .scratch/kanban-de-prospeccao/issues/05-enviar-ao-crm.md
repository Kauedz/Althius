# 05: Enviar ao CRM

**What to build:** "Enviar ao CRM" leva a empresa, os Contatos e uma nota com os Sinais e a abordagem para o CRM conectado (HubSpot primeiro), sob a Permissão do Agente ou do usuário (Propor pede Aprovação); o cartão vai para No CRM.

**Blocked by:** 01: Estágio de prospecção; `conexoes-funcionais` 03 (Acesso ao HubSpot); CRM-15 (Aprovações).

**Status:** ready-for-human (falta o teste real com uma conta de CRM; o envio por um Agente ficou pronto na Etapa 5b, mas com Propor o Administrador ainda não tem a fila para decidir, ver CRM-15)

## Pode mexer

- A escrita no CRM pela Integração (primeira escrita no HubSpot: rever o ADR-0016, que hoje só lê).

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Com Propor, nada sai sem Aprovação. (Etapa 5b: o Agente propõe com `propor_envio_ao_crm`, a Aprovação guarda o conteúdo exato e o executor só envia depois de `claim_approved_action` reservá-la; `chamarFerramenta` só libera a escrita de quem tem Propor enquanto a Aprovação dele está em execução.)
- [x] Com Executar, a Aprovação nasce liberada e o executor envia na hora, pelo Acesso de quem pediu ao Agente (que precisa ser o Vendedor responsável).
- [ ] O Administrador decide a Aprovação de envio no Workspace operacional (a fila real segue desligada, CRM-15).
- [x] Depois do envio, a Althius não escreve de novo sem pedido (índice único em `private.crm_handoffs`; `begin_crm_handoff` recusa com 23505).
- [x] Só o Vendedor responsável, com Participação ativa, envia; outro Workspace não alcança a Conta; Integração que não é CRM é recusada (pgTAP `envio_ao_crm.sql`).
- [x] O envio usa o Acesso do PRÓPRIO participante (chave de API); pelo OAuth/MCP responde 409 pedindo a chave, sem inventar ferramenta MCP.
- [x] Erro parcial grava `falhou` com o que já foi criado; a nova tentativa não cria de novo (progresso gravado a cada objeto).
- [x] Enviado: o cartão vai para No CRM, com quem enviou e o evento `enviada_ao_crm` no histórico.
- [x] Botão no detalhe da Conta-alvo para o Vendedor responsável, com escolha do CRM conectado e confirmação do que vai.
- [ ] Botão também no cartão do Kanban (ficou só no detalhe da Conta).
- [ ] Teste real com uma conta de teste do HubSpot, do Pipedrive e do RD Station CRM.

## Comments

- Migration `20261001200000_envio_ao_crm.sql`: `private.crm_handoffs` (uma tentativa por linha, `enviando|enviado|falhou`, `crm_refs`, `approval_id` para a próxima fatia), `begin_crm_handoff`, `save_crm_handoff_progress`, `finish_crm_handoff` (só `service_role`) e `list_crm_handoffs` (participante ativo). A nota vai em português: CNPJ e segmento, os Sinais ainda válidos com a data e a abordagem (estado da Sequência e títulos dos passos enviados; nunca corpo nem assunto).
- Uma tentativa parada em `enviando` há mais de 10 minutos sem progresso é encerrada como falha na próxima tentativa, e o que ela registrou passa adiante.
- Edge Function `crm-handoff` (handler injetável + `banco.ts` + `index.ts`, `verify_jwt = true`). Escritores em `supabase/functions/_shared/envio-ao-crm.ts`: HubSpot (Company, Contacts associados à Company com o tipo 279, nota com 190/202; Contact que já existe pelo e-mail não é duplicado), Pipedrive (organization, persons com `org_id`, nota com `org_id`), RD Station CRM (empresa e contatos; a nota fica como pendência por falta de endpoint confirmado de anotação em empresa).
- Decisão: a ação do Vendedor responsável não passa por Aprovação (ADR-0002: ele já decide). Para isso, `chamarFerramenta` ganhou `decisaoDaPessoa`, que só o servidor marca depois de o banco conferir; o navegador continua sem chamar escrita por `integration-tools`.
- Ferramentas novas nos perfis REST: HubSpot `create_note` e `associations` no `create_contact`; Pipedrive `add_organization`; RD Station CRM `create_organization` e `create_contact`. Pontos não confirmados estão em `naoConfirmado` de cada perfil.
- Frontend: `enviarAoCrm`/`envioAoCrm` na Fonte de Contas real (a simulada não tem, e o botão some na Demonstração); componente `paginas/enviar-ao-crm.tsx` no detalhe da Conta.

- **Etapa 5b (2026-10-01).** Migration `20261001210000_ferramentas_dos_agentes.sql`: `agent_propose_crm_handoff`, `crm_handoff_approval`, `begin_approved_crm_handoff` (liga a tentativa em `private.crm_handoffs.approval_id`) e `approval_in_execution`. Executor `_shared/executor-de-aprovacoes.ts`, reaproveitando `escreverNoCrm`; ação `executar_aprovacao` no `crm-handoff`. Na Conversa, o passo diz "Rhetor propôs enviar a Acme ao HubSpot — aguardando Aprovação", com o link "Ver a Aprovação".

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration `supabase/migrations/20261001200000_envio_ao_crm.sql` no projeto `ycbdilsmydvzezhlymty` conforme `docs/agents/migrations.md` (validar com rollback, rodar o pgTAP `supabase/tests/envio_ao_crm.sql` pelo `scripts/pgtap-no-remoto.sh`, aplicar e conferir o md5).
2. Publicar a função (PowerShell, na raiz do repositório):
   `npx supabase functions deploy crm-handoff --project-ref ycbdilsmydvzezhlymty`
   Nenhum segredo novo: ela usa `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `APP_ORIGIN`.
3. HubSpot: na conta de teste, criar um Private App (Settings > Integrations > Private Apps) com os escopos de escrita `crm.objects.companies.write` e `crm.objects.contacts.write` (mais os de leitura `crm.objects.companies.read` e `crm.objects.contacts.read`). As notas usam esses escopos; conferir se o HubSpot pede outro.
4. No app, em Conexões, conectar o HubSpot **pela chave de API** (colar o token do Private App no próprio campo; nunca no chat). Pela autorização (MCP), o envio responde pedindo a chave.
5. Conferência real: numa Conta-alvo sob sua responsabilidade, com um Contato e um Sinal, clicar "Enviar ao CRM", confirmar, e ver no HubSpot a Company, o Contact associado e a nota; na Althius, o cartão em No CRM. Repetir com Pipedrive e RD Station CRM se houver contas de teste. Pontos a conferir (não confirmados pela documentação): o tipo de associação 279 (Contact → Company), os envelopes `organization`/`contact` e o campo do id (`_id` ou `id`) do RD Station CRM.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

### Etapa 5b (envio por um Agente)

6. Aplicar `supabase/migrations/20261001210000_ferramentas_dos_agentes.sql` no projeto `ycbdilsmydvzezhlymty` conforme `docs/agents/migrations.md`, depois da 20261001200000.
7. Publicar: `npx supabase functions deploy agent-conversation crm-handoff --project-ref ycbdilsmydvzezhlymty` (e `npx supabase functions deploy integration-tools integration-connect integration-callback --project-ref ycbdilsmydvzezhlymty`, pelo código compartilhado do Acesso). Com o Hermes, atualizar e reiniciar o worker.
8. Conferência: com o Rhetor em Executar no HubSpot, pedir na Conversa que ele leve uma Conta-alvo sua ao HubSpot e ver a Company no HubSpot e o cartão em No CRM.
