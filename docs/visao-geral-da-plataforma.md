# Visão geral da plataforma Althius

Guia para qualquer pessoa ou IA que for mexer na Althius. Leia antes de abrir uma spec ou um ticket. O vocabulário é
o do [`CONTEXT.md`](../CONTEXT.md); as decisões difíceis de reverter estão em [`docs/adr/`](./adr/). Este guia junta
as decisões da sabatina de 29/09/2026 com o Nan e aponta qual spec cobre cada parte.

## 1. O que é

A Althius é um **Revenue OS de GTM**: um lugar só onde a empresa encontra quem comprar, entende por que agora e
aborda, com Agentes fazendo o trabalho pesado. **Não é um CRM.** O CRM do cliente (HubSpot, RD Station, Pipedrive...)
continua sendo o principal; a Althius conversa com ele por pontes (Integrações).

O coração é um funil:

```
TAM: todas as Contas-alvo do Workspace (ex.: 1.000 empresas)
  → Sinais de compra: Contas Quentes (ex.: 200 dando sinal agora)       ← o diferencial
    → Aderência: Fit com o ICP (ex.: 80)
      → Comitê de compra: os 3 perfis certos em cada Conta (Decisor, Influenciador, Campeão)
        → Abordagem: cadência multicanal escrita a partir do playbook
          → Resposta e reunião marcada
            → Enviar ao CRM (ponte), onde o Closer continua
```

As Contas sem Sinal não são descartadas: ficam em Descoberta e voltam a ser varridas (reativação de Sinais). Outras
motions para elas (GEO/SEO, inbound, PLG, públicos de anúncio) são fase 2.

## 2. As camadas

| Camada | O que é | Spec |
| --- | --- | --- |
| Dados | Contas-alvo, Contatos (até 3 e-mails e 3 telefones), CSV, arquivar e apagar | `.scratch/crm-real-e-stack/` |
| Playbook do Workspace | O playbook do setup, estruturado: ICP, TAM/SAM/SOM, Personas, dores, processo de compra, objeções, cadência, scripts, templates, SLA | `.scratch/playbook-do-workspace/` |
| Sinais | Externos (Apify), internos (histórico comercial) e originados; Monitoramentos; reativação; catálogo de lançamento | `.scratch/modulo-de-sinais/` (telas) e `.scratch/sinais-reais/` (backend real) |
| Enriquecimento | Coleta do comitê de compra e revelação de LinkedIn, e-mail e telefone em cascata | `.scratch/enriquecimento-em-cascata/` |
| Kanban de prospecção | Estágios fixos de cada Conta, movidos por eventos e pelos Agentes; Enviar ao CRM | `.scratch/kanban-de-prospeccao/` |
| Agentes | Scopus, Ethos, Rhetor e Oraculum conversando entre si; Coordenação sem nome | `.scratch/agentes-em-conversa/` e `.scratch/motor-hermes/` |
| Execução | Sequências por e-mail, WhatsApp e LinkedIn pelas contas de cada vendedor | `.scratch/canais-cadencia-backend/` |
| Conexões | Canais e Integrações pelo servidor MCP oficial de cada app; Ler, Propor, Executar | `.scratch/conexoes-funcionais/` |
| Créditos e planos | Setup, cobrança por usuário, créditos, tetos e interruptores | `.scratch/creditos-e-planos/` |
| Acesso e planos | Contrato por faixa, Workspace só depois do contrato, visitante na Demonstração, "Fale com a equipe Althius" | `.scratch/acesso-e-planos/` |
| Fase 2 | Vendas e Oportunidades, transcrições, GEO/SEO, inbound, PLG | `.scratch/fase-2-revenue/` |

## 3. Regras que valem em todo lugar

- **O Hermes é o motor e é invisível.** Para o usuário, quem responde é a Althius. A Coordenação não tem nome
  ([ADR-0004](./adr/0004-coordenacao-sem-quinto-agente.md), [ADR-0018](./adr/0018-motor-dos-agentes-na-edge-function.md)).
  O contrato com o banco (`start_agent_run`, `claim_agent_run`, `append_agent_run_event`, `finish_agent_run`) é o
  encaixe de qualquer motor; a tela só lê o banco.
- **Nunca fingir.** Nenhum Agente escreve "fui acionado" no lugar do trabalho. Sem informação, pergunta. Falha é falha,
  nunca resposta inventada.
- **Permissões por Agente e por Integração:** Ler, Propor (pede Aprovação) ou Executar (automático)
  ([ADR-0002](./adr/0002-permissoes-ler-propor-executar.md)). O mesmo interruptor "confirmar ou automático" vale para
  as ações que gastam crédito, num lugar só das Configurações.
- **Créditos** ([ADR-0019](./adr/0019-creditos-e-cobranca-por-usuario.md)): gastam varredura de Sinais, enriquecimento
  (só quando acha) e Execuções de Agentes. Nada automático roda sem um teto aprovado. Paga o Workspace onde a ação
  acontece. A inteligência (Sinais, coleta, enriquecimento novo) é da Althius; o Apollo, o Lusha e o Clay do cliente
  só trazem o que ele já tem.
- **O CRM manda depois do envio** ([ADR-0020](./adr/0020-kanban-de-prospeccao-e-envio-ao-crm.md)). O kanban é só da
  prospecção; o que foi enviado ao CRM passa a ser lido de lá.
- **LGPD:** nada de dado pessoal na inteligência coletiva sem consentimento e anonimização; aviso de gravação em toda
  transcrição; apagar um Contato apaga os canais dele.
- **Acesso por contrato** ([ADR-0025](./adr/0025-workspace-so-por-contrato-e-visitante-na-demonstracao.md)): o Workspace
  operacional só existe depois do contrato, e só a Althius o cria. Toda ação paga exige contrato ativo (ou créditos
  ilimitados, a Equipe). Quem entra sem Workspace contratado vê a Demonstração, só leitura.
- **Isolamento:** tudo pertence a um Workspace; nenhuma função devolve dado de outro Workspace; RLS explícito em toda
  tabela nova; testes de permissão em pgTAP.

## 4. Como trabalhar num ticket sem quebrar o resto

1. Leia `AGENTS.md`, este guia, a spec do ticket e o `CONTEXT.md`. Para banco, `docs/agents/migrations.md`.
2. **Respeite o "Pode mexer / Não mexa" do ticket.** Se precisar tocar num arquivo ou numa função que não está listada,
   pare e pergunte ao Nan. As funções do banco que várias frentes usam só são redefinidas a partir da definição mais
   recente da `main` (procure a última migration que a define), nunca de uma antiga.
3. **Migrations:** só aditivas, timestamp UTC maior que a última da `main`, uma por ticket, pgTAP próprio e nenhum
   teste antigo alterado.
4. **Frontend:** as telas só consomem as Fontes (`projeto-althius-frontend/src/fonte/`); a Demonstração continua
   simulada e nada dela aparece no Workspace operacional. Sem prettier: formate à mão no estilo existente.
5. **Passos do Nan.** Todo ticket com uma seção "Passos do Nan" exige ação humana (db push, deploy, segredo, conta
   externa, conferência visual com credenciais). A IA que executa o ticket **tem de avisar o Nan exatamente o que fazer**,
   com os comandos prontos para o PowerShell, ou gerar um wizard (`/wizard`) quando forem muitos passos. Nunca pule um
   passo manual, nunca peça chave ou senha no chat, e nunca rode no remoto o que é do Nan.
6. Antes do PR: lint, `tsc -b`, vitest, `deno test`, `deno check` e o pgTAP do zero, todos verdes. PR em português com
   o que muda, os passos do Nan, as decisões a confirmar e os testes.

## 5. Ordem sugerida entre as specs

1. `playbook-do-workspace` (base de tudo: o que os Agentes sabem da empresa)
2. `agentes-em-conversa` (Agentes de verdade, cada um com a sua vez)
3. `creditos-e-planos` (antes de qualquer automático gastar dinheiro)
4. `sinais-reais` e `enriquecimento-em-cascata` (em paralelo, cada uma com o seu dono)
5. `kanban-de-prospeccao`
6. `conexoes-funcionais` (HubSpot primeiro, depois o catálogo ampliado)
7. `fase-2-revenue` (só depois do primeiro cliente rodando)
