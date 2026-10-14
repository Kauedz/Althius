# Catálogo único de Sinais e pedido à equipe Althius

**Origem:** plano de redesenho de 13/10/2026 (seções 2, 3 e 4), PR-A junto com o pedido à equipe (PR-P). A Althius é um Revenue OS de prospecção B2B2B. Não é um CRM. A palavra "ICP" continua no Playbook, na Memória e na Descoberta. O que sai da tela são as letras A–H.

## Problema

O catálogo da tela é o mock `catalogo.ts` (dezenas de cards, vários sem coleta) mais uma seção "Sinais por mercado" agrupada pelas letras A–H. O cliente vê "Em breve", "Em teste" e "Sem fonte", dois jeitos de criar Monitoramento ("Criar o primeiro" e "Novo monitoramento") e um construtor de Sinal personalizado. Não há um pedido para a equipe montar um Sinal, nem um teto padrão de US$ 20 por mês.

## O que muda

1. **Um catálogo visível** (`public.signal_catalog` + `public.signal_catalog_niches`). Cerca de 26 cards, todos no mesmo formato, mais o card final "Precisa de outro Sinal?". O registro técnico `private.signal_catalog` (tipo do coletor, origem, estado) continua: nada é apagado nem renomeado.
2. **Um só grid** em Sinais, com filtro por nicho (chip com o nome) e por família. Cada card: nome, uma frase, selos de nicho, "N ativos" e a seta. O clique abre `/sinais/tipos/:id` com o que detecta, a fonte em linguagem de usuário, o custo estimado, os Monitoramentos e um único botão "Criar Monitoramento".
3. **Arquivados.** A lista "Remover" do plano e o que estava "Em teste" / "Em breve" / "Sem fonte" somem da tela para todos, inclusive admin. Ficam no código em `ARCHIVED_SIGNALS` (`archived: true`), com motivo e como reativar, em `docs/sinais-arquivados.md`. Nenhum `delete` no banco.
4. **Abertura de vagas** une `vaga_linkedin`, `vaga_indeed`, `vaga_comex`, `vaga_logistica` e `vaga_engenharia_manutencao`. O filtro de cargo muda com o nicho. Os coletores continuam registrados; o Monitoramento grava o nicho e os cargos nos critérios.
5. **Letras A–H** saem da UI e das URLs. `/sinais/mercado/:slug` usa o slug do nicho e redireciona a letra antiga. O editor de cascata mostra o nome do nicho, ou "Nicho não encontrado".
6. **Painéis de mercado sem empresa** (volume por porto, CBS/IBS, impacto por CNAE) saem do catálogo e ficam em Mercado.
7. **Pedido à equipe.** Sai a rota `/sinais/tipos/personalizado/novo`. O card final abre um formulário. A migração `signal_requests`, a RPC `request_signal` e a Edge Function `signal-request-notify` (Resend, para `althius.relacionamento@gmail.com`) gravam e avisam. Sem cobrança. Um Sinal construído depois entra em `signal_catalog` com `workspace_id` preenchido e só aquele Workspace o vê.
8. **Teto padrão de US$ 20/mês** por Workspace, em `private.workspace_signal_budget`. Não liga a Automação (isso é outro PR).

## Decisão sobre `perfil-personalizado.tsx`

O plano cita esse arquivo como o formulário do Sinal personalizado. No código ele é o perfil firmográfico do público ("Público personalizado": UF, cidade, porte, CNAE). Removê-lo apagaria esse público. O construtor de Sinal personalizado vive no editor (`etapa === 'descrever'`) e na rota `/sinais/tipos/personalizado/novo`: esses saem. O perfil firmográfico fica.

## Fora de escopo

Ativar a Automação até o teto. Coletores novos (Google Ads, equipes, publicações). Sinal virando candidata. Aplicar migração, deploy ou segredo no projeto remoto.

## Passos do Nan

Aplicar as duas migrações e publicar `signal-request-notify` só depois do CI verde, com o comando do ticket. Incluir os user ids da equipe em `private.althius_staff` para que só eles mudem o status do pedido.
