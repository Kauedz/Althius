# 01: ICP estruturado único

**Status:** ready-for-human

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Migration só aditiva (sem `drop table`, `truncate`, `delete` de dados nem `drop column`), com pgTAP próprio; migration já aplicada nunca é editada, e função existente é redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo. Sem emoji, só ícones `lucide` que já existem; nada de letras de nicho A–H visíveis ao Cliente.

**Blocked by:** nenhum

**Decisões:** D5 (ICP estruturado único) da ADR-0033; Decisão do Renan (26/10/2026), no fim deste ticket, que resolve o bloqueio da sessão de 26/10 (Mini-ICP sem fonte operacional).

## O que construir

- Uma tabela nova em `private`, com RLS por Workspace, que guarda **um** registro de ICP estruturado por Workspace: setor, porte, geografia, papéis-alvo e o texto livre que hoje vive na seção `icp` do Playbook do Workspace. Versionada como as seções do Playbook (`private.playbook_section_versions`): cada edição cria uma versão nova, com autor e data.
- Uma função de leitura (`private...`, nome a definir no ticket) que devolve o registro vigente de um Workspace, e é o único lugar que os tickets seguintes (02 a 05) consultam. Nenhum outro módulo lê a seção `icp` do Playbook direto depois deste ticket — todos passam a ler esta função.
- **Mini-ICP perguntado no onboarding e salvo (Decisão do Renan, 26/10/2026):** os três campos de `MiniIcpEProduto` (`oQueVende`, `miniIcp`, `porQueCompram`), que o item "produto" do checklist do onboarding já mostra (`src/paginas/onboarding/checklist.tsx`), passam a ser gravados no Workspace operacional. Hoje `criarFonteDeOnboardingSupabase` (`src/fonte/supabase-onboarding.ts`) devolve os três vazios e herda `salvarProduto` indisponível; depois deste ticket, `salvarProduto` grava por RPC (ação nova de `public.save_my_day0` ou RPC irmã, `security definer`, sem receber identidade do cliente, redefinida a partir da última definição na `main`), e a leitura do onboarding (`get_my_day0` ou irmã) devolve os valores salvos, de modo que reabrir `/onboarding` retoma o que foi digitado. Os campos pertencem ao Workspace em que o Day0 foi feito, como `public.day0_companies` já faz com empresa e domínio; grava só quem já pode gravar empresa e domínio hoje (Administrador original), o convidado não altera. Cada campo é texto livre com limite de tamanho (padrão recomendado: 2000 caracteres, numa constante fácil de trocar).
- **Semeadura:** (a) Gravar o mini-ICP no onboarding cria a primeira versão do ICP estruturado daquele Workspace quando ainda não há versão; se já existe uma versão (edição manual ou vinda da seção `icp`), não sobrescreve. (b) Na criação de um Workspace da empresa (`public.create_company_workspace`, sem mudar a assinatura já aplicada; redefinir a partir da última definição na `main`, `20261016140000_entrada_fechada.sql`), o ICP estruturado do Workspace novo nasce com o mini-ICP que o criador salvou no Day0 do seu Workspace pessoal, como cópia (sem vínculo depois). Se o banco não identificar o Workspace pessoal do criador de forma inequívoca, registre isso no handoff e semeie só pelo caminho (a), sem inventar origem. (c) Sem mini-ICP salvo, usa a seção `icp` do Playbook já preenchida. (d) Sem nenhuma fonte, nasce vazio, sem Aprovação pendente (só existe quando alguém grava algo).
- A relação entre o registro novo e a seção `icp` do Playbook é desenho deste ticket: tanto faz se o registro novo *é* a seção `icp` com uma representação estruturada adicional, ou se é uma tabela própria que replica/deriva da seção `icp` — qualquer desenho vale, desde que haja só uma fonte de verdade que os tickets 02–05 leem, e que a seção `icp` do Playbook (tela existente) continue mostrando o mesmo conteúdo, sem duplicar edição em dois lugares.
- Fora a gravação e a retomada dos três campos do onboarding (que já aparecem na tela), este ticket só cria o dado e a leitura; não muda outra tela nem outro módulo. A escrita por aprovação é o ticket 02.

## Pode mexer

- Migration nova (tabela, versão, semeadura, função de leitura) e pgTAP em `supabase/tests/`.
- `supabase/migrations/20260930090500_playbook_do_workspace.sql` e seguintes, só para redefinir (nunca editar o arquivo já aplicado) o que for necessário para a seção `icp` apontar para a nova fonte, se o desenho escolhido exigir.
- `projeto-althius-frontend/src/fonte/onboarding-tipos.ts`, `src/fonte/supabase-onboarding.ts` (ligar `salvarProduto` e devolver os três campos salvos) e, só se for preciso para gravar e retomar esses três campos no operacional, `src/paginas/onboarding/checklist.tsx`, com testes. Não acrescente outras perguntas nem mude a ordem do Day0.
- Migration nova que redefine `public.save_my_day0`/`public.get_my_day0` (ou cria RPC irmã) para os três campos, e que redefine `public.create_company_workspace` para semear o ICP estruturado. Sempre a partir da última definição na `main`, mantendo grants e revokes.

## Não mexa

- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais (`integration-*`, `slack-*`): área do Renan.
- Arquivos do Kauê listados na spec (`send-chat-step*`, `sequence-runner`, `reply-proposal-*`, `unipile-*`, `detalhe-sequencia*`, `supabase-sequencias*`, `motivos-do-envio.ts`).
- O catálogo de Sinais, `signal-plan`, `discovered_accounts` e qualquer tela de Sinais: são os tickets 03, 04 e 05.
- As cascatas de Sinal e a letra de nicho A–H (`private.signal_cascades.icp`): não mudam, continuam uma classificação à parte.
- Migrations já aplicadas.
- O motor dos Agentes e o worker do Hermes.
- O CRM-24 ([`crm-real-e-stack/issues/24`](../../crm-real-e-stack/issues/24-onboarding-no-workspace-operacional.md)): papel, HDYHAU, empresa, domínio, logo, Personas, progresso do checklist, ramo do convidado e sugestão do nome do Workspace continuam como estão na `main`. Não feche nem mude o status do CRM-24.

## Critérios

- [x] Um Workspace tem no máximo um registro de ICP estruturado vigente, versionado; ler duas vezes seguidas sem editar devolve a mesma versão.
- [x] No Workspace operacional, preencher "O que você vende", "Mini-ICP" e "Por que compram" no onboarding grava os três campos; reabrir ou atualizar `/onboarding` mostra os valores salvos (Vitest da fonte Supabase com cliente simulado e da tela; pgTAP da RPC).
- [x] Gravar o mini-ICP cria a primeira versão do ICP estruturado do Workspace quando não há versão; com uma versão já existente (editada ou vinda da seção `icp`), não sobrescreve (pgTAP).
- [x] Criar o Workspace da empresa depois de o criador salvar o mini-ICP no Day0 semeia o ICP estruturado do Workspace novo com esses três campos; sem mini-ICP, usa a seção `icp` preenchida; sem nenhuma fonte, nasce vazio e sem Aprovação pendente (pgTAP). Se o caminho (b) não for possível (Workspace pessoal não identificável), o handoff diz por quê e o critério vale só para (a), (c) e (d).
- [x] Convidado ou não Administrador não grava o mini-ICP (erro `42501`), e outro Workspace não lê os campos (pgTAP).
- [x] Papel, HDYHAU, empresa, domínio, logo, Personas e progresso do checklist não mudam de comportamento (testes existentes do onboarding verdes; nada do CRM-24 é decidido aqui).
- [x] A seção `icp` do Playbook do Workspace continua funcionando exatamente como antes para quem só olha a tela de Playbook (sem edição ainda, que é o ticket 02).
- [x] pgTAP: isolamento por Workspace; só Participação ativa lê; versões lidas por conjunto, sem depender da ordem de `created_at`; a suíte local completa recriou o banco, aplicou as migrations em ordem e passou todos os arquivos pgTAP.
- [ ] Deno, Vitest, lint e build verdes; CI verde nos três jobs. Vitest (1999 testes), lint e `tsc -b` passaram localmente; nenhuma Edge Function foi alterada. CI nos três jobs: pendente verificação humana.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration e confere `md5(statements[1])` contra o `md5sum` do arquivo (`docs/agents/migrations.md`).

## Decisão do Renan (26/10/2026)

Decidido pelo Renan em 26/10/2026, 21:29 BRT: os campos do Mini-ICP/produto (`MiniIcpEProduto`: o que a empresa vende, para quem etc.) passam a ser PERGUNTADOS NO ONBOARDING, salvos e levados até a criação do Workspace.

Antes, o bloqueio dizia: "Mini-ICP não é persistido nem chega à criação do Workspace; definir a fonte operacional dos campos MiniIcpEProduto ou autorizar semear só a partir da seção icp existente." Com a decisão, o ticket deixa de estar bloqueado: a fonte operacional é o onboarding (Day0 do Workspace operacional), e a seção `icp` do Playbook fica só como fonte de reserva da semeadura. "O que construir", "Pode mexer", "Não mexa" e "Critérios" acima já refletem a decisão.

### Relação com o CRM-24

O CRM-24 (onboarding no Workspace operacional) espera a decisão do Renan sobre as quatro perguntas dos Comments de 2026-10-07. Este ticket encosta nele só num ponto: grava os três campos de ICP/produto (`oQueVende`, `miniIcp`, `porQueCompram`) que o checklist do onboarding já pergunta, no Workspace em que o Day0 foi feito. Ele implementa só essas perguntas de ICP/produto e não decide o CRM-24: não define a divisão entre Conta de usuário e Workspace dos outros dados (pergunta 1), não muda o checklist do convidado (pergunta 2), não diz se o mini-ICP é a base do checklist além de semear o ICP estruturado (pergunta 3, que a ADR-0033 D5 e esta decisão já respondem só para a frente Sinais first) e não mexe na sugestão do nome da empresa (pergunta 4). Se a decisão do CRM-24 mudar onde esses três campos vivem, a migração é dele.

## Comments

- 2026-10-25 — Implementada a tabela privada versionada `workspace_icp_versions`, com leitura autenticada por Workspace e semeadura a partir do Day0 ou da seção `icp` de reserva. A fonte Supabase agora grava e retoma os três campos do Mini-ICP; `create_company_workspace` copia os dados do Workspace pessoal identificado. Testes: pgTAP específico 22/22 e suíte completa; Vitest completo 1999 passaram e 4 ignorados; lint e `tsc -b` passaram. Migration não aplicada no remoto. CI ainda pendente de verificação humana.
