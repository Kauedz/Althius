# 01: ICP estruturado único

**Status:** ready-for-agent

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Migration só aditiva (sem `drop table`, `truncate`, `delete` de dados nem `drop column`), com pgTAP próprio; migration já aplicada nunca é editada, e função existente é redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo. Sem emoji, só ícones `lucide` que já existem; nada de letras de nicho A–H visíveis ao Cliente.

**Blocked by:** nenhum

**Decisões:** D5 (ICP estruturado único) da ADR-0033.

## O que construir

- Uma tabela nova em `private`, com RLS por Workspace, que guarda **um** registro de ICP estruturado por Workspace: setor, porte, geografia, papéis-alvo e o texto livre que hoje vive na seção `icp` do Playbook do Workspace. Versionada como as seções do Playbook (`private.playbook_section_versions`): cada edição cria uma versão nova, com autor e data.
- Uma função de leitura (`private...`, nome a definir no ticket) que devolve o registro vigente de um Workspace, e é o único lugar que os tickets seguintes (02 a 05) consultam. Nenhum outro módulo lê a seção `icp` do Playbook direto depois deste ticket — todos passam a ler esta função.
- **Semeadura:** na criação do Workspace, se existir um mini-ICP do onboarding (`MiniIcpEProduto`: `miniIcp`, `oQueVende`, `porQueCompram`) ou uma seção `icp` do Playbook já preenchida, o registro novo nasce com esses dados como primeira versão. Sem nenhuma das duas fontes, nasce vazio, sem Aprovação pendente (só existe quando alguém grava algo).
- A relação entre o registro novo e a seção `icp` do Playbook é desenho deste ticket: tanto faz se o registro novo *é* a seção `icp` com uma representação estruturada adicional, ou se é uma tabela própria que replica/deriva da seção `icp` — qualquer desenho vale, desde que haja só uma fonte de verdade que os tickets 02–05 leem, e que a seção `icp` do Playbook (tela existente) continue mostrando o mesmo conteúdo, sem duplicar edição em dois lugares.
- Este ticket só cria o dado e a leitura; não muda nenhuma tela nem nenhum outro módulo. A escrita por aprovação é o ticket 02.

## Pode mexer

- Migration nova (tabela, versão, semeadura, função de leitura) e pgTAP em `supabase/tests/`.
- `supabase/migrations/20260930090500_playbook_do_workspace.sql` e seguintes, só para redefinir (nunca editar o arquivo já aplicado) o que for necessário para a seção `icp` apontar para a nova fonte, se o desenho escolhido exigir.
- `projeto-althius-frontend/src/fonte/onboarding-tipos.ts` e o fluxo de criação de Workspace, só para ler o mini-ICP na semeadura (sem mudar a tela de onboarding).

## Não mexa

- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais (`integration-*`, `slack-*`): área do Renan.
- Arquivos do Kauê listados na spec (`send-chat-step*`, `sequence-runner`, `reply-proposal-*`, `unipile-*`, `detalhe-sequencia*`, `supabase-sequencias*`, `motivos-do-envio.ts`).
- O catálogo de Sinais, `signal-plan`, `discovered_accounts` e qualquer tela de Sinais: são os tickets 03, 04 e 05.
- As cascatas de Sinal e a letra de nicho A–H (`private.signal_cascades.icp`): não mudam, continuam uma classificação à parte.
- Migrations já aplicadas.
- O motor dos Agentes e o worker do Hermes.

## Critérios

- [ ] Um Workspace tem no máximo um registro de ICP estruturado vigente, versionado; ler duas vezes seguidas sem editar devolve a mesma versão.
- [ ] A semeadura usa o mini-ICP do onboarding quando ele existe, e não sobrescreve um ICP já editado manualmente.
- [ ] A seção `icp` do Playbook do Workspace continua funcionando exatamente como antes para quem só olha a tela de Playbook (sem edição ainda, que é o ticket 02).
- [ ] pgTAP: isolamento por Workspace; só Participação ativa lê; versões lidas por conjunto, sem depender da ordem de `created_at`; três `supabase db reset && supabase test db` verdes.
- [ ] Deno, Vitest, lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration e confere `md5(statements[1])` contra o `md5sum` do arquivo (`docs/agents/migrations.md`).

## Comments
