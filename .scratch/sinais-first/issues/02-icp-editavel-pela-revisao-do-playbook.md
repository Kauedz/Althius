# 02: ICP editável pela Revisão da Memória do Workspace

**Status:** ready-for-human

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Migration só aditiva, com pgTAP próprio; migration já aplicada nunca é editada, função existente redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo.

**Blocked by:** 01 (ICP estruturado único)

**Decisões:** D5 (editar o ICP passa pela Revisão da Memória do Workspace) da ADR-0033; [ADR-0002](../../../docs/adr/0002-permissoes-ler-propor-executar.md) (propor/aprovar) e [ADR-0010](../../../docs/adr/0010-revisao-da-memoria-como-aprovacao-de-administrador.md).

## O que construir

- Uma pessoa (Administrador) ou o composer (via classificação do ticket 07, quando detectar um pedido de mudança de ICP) pode **propor** uma mudança no ICP estruturado único (ticket 01). A proposta vira uma Aprovação que só um Administrador ativo decide — a mesma trilha que já existe para o Scopus (ICP de hoje) e o Ethos (Personas), reaproveitada, não duplicada.
- Aprovada, a proposta substitui o vigente de uma vez (cria a versão nova do ticket 01). Recusada ou pendente, nada muda. Como não existe mais um Agente Scopus propondo, a proposta nasce de um participante (direto, Administrador) ou do composer (quando o ticket 07 estiver no ar); este ticket cobre os dois jeitos de propor, mas o composer só vai de fato chamar este caminho depois do ticket 07.
- Um Administrador pode editar o ICP direto, sem passar por proposta/Aprovação — assim como hoje edita outras seções do Playbook. "Direto" aqui quer dizer: a ação de um Administrador grava a versão nova sem fila de Aprovação; só a proposta de um participante sem papel de Administrador, ou do composer em nome de qualquer pessoa, exige Aprovação.

## Pode mexer

- Migration nova (proposta, Aprovação, decisão) e pgTAP em `supabase/tests/`.
- A RPC de leitura do ticket 01 e o fluxo de Revisão da Memória do Workspace já existente (o que hoje decide Scopus/Ethos), estendido para o ICP estruturado único.
- `projeto-althius-frontend/src/paginas/` (tela de Playbook/ICP) e `src/fonte/`, com testes, só para a edição e a fila de Aprovação deste ICP.

## Não mexa

- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.
- Arquivos do Kauê listados na spec.
- O composer de `/` em si (tickets 07/08): este ticket só prepara o caminho de proposta; a chamada a partir do composer é desenho do ticket 07.
- Migrations já aplicadas.
- O motor dos Agentes e o worker do Hermes.

## Critérios

- [x] Uma proposta de mudança do ICP só um Administrador ativo aprova ou recusa.
- [x] Aprovada, a versão vigente do ICP (ticket 01) muda de uma vez; recusada ou pendente, nada muda.
- [x] Um Administrador pode editar o ICP direto, sem passar pela fila de Aprovação.
- [x] pgTAP: só Administrador decide; Membro propõe mas não decide; isolamento por Workspace; três `supabase db reset && supabase test db` verdes. Os testes pgTAP deste ticket passaram no job Banco do CI, que recria o banco do zero, aplica todas as migrations em ordem e roda a suíte pgTAP completa: verde no PR #304, no run 40580668372 (d73ba30) e no run 40598223846 (6e2dea6), três recriações completas. As migrations estão aplicadas em produção (203). Os `db reset` locais não rodaram por falta de Docker no ambiente.
- [x] Deno, Vitest, lint e build verdes; CI verde nos três jobs. (CI do PR #304 verde nos três jobs, head 9488b8e; CI da main verde nos três jobs (Frontend, Edge Functions, Banco) no run 40580668372 (d73ba30, merge do PR #304) e no run 40598223846 (6e2dea6, merge do PR #306))

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration e confere o md5 do arquivo.

## Comments

- 2026-10-27 — A implementação já existente cobre este ticket: a revisão de participante passa por `propose_playbook_revision`, só Administrador ativo decide por `decide_approval`, e a aprovação grava a versão do Playbook dentro da mesma transação; o gatilho do ticket 01 sincroniza a nova versão em `workspace_icp_versions`. Administrador grava direto por `save_playbook_section`, sem criar Aprovação. A cobertura pgTAP existente verifica proposta, papel, isolamento entre Workspaces, aprovação/recusa, edição direta e o getter do ICP estruturado (`aprovacoes_playbook_e_guarda.sql`, `revisao_do_playbook_por_aprovacao.sql`, `icp_estruturado_unico.sql`). Nenhuma alteração de produto foi necessária e não há migration nova nem Edge Function a publicar. Lint passou com warnings existentes; `npx tsc -b --noEmit`, `npm run build`, `deno check supabase/functions/*/index.ts` e `deno test supabase/functions` passaram (1873 aprovados, 39 ignorados). O Vitest completo não iniciou testes por incompatibilidade do runtime Node/undici (`webidl.util.markAsUncloneable is not a function`). pgTAP local e os três resets não foram executados; CI continua pendente. Sem aplicação ou deploy a fazer neste ticket.
