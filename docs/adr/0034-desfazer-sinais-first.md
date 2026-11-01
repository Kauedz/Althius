# ADR-0034 — Desfazer o Sinais first: os quatro Agentes voltam, o ICP volta a ser o do Playbook

Status: Aceita. Decidida pelo dono do produto em 31/10/2026. Substitui a [ADR-0033](0033-sinais-first.md) por inteiro.

## Contexto

A [ADR-0033](0033-sinais-first.md) (26/10/2026) tirou as quatro Especialidades (Scopus, Ethos, Rhetor, Oraculum) da
interface, fez o composer de `/` criar Sinais, transformou o catálogo em Modelos com Plano-semente e criou um ICP
estruturado único por Workspace (`private.workspace_icp_versions`). Por cima dela vieram a Fase 3 (o "agente único",
que passou a ocupar a `/` com `chat-do-agente.tsx`), a Fase 4 e a Fase 7 (o agente único lê e salva o ICP
estruturado, compara com o CRM), a Trilha C 5b (pedido de Sinal vira Modelo) e a Trilha C 6a/6b (Aderência das
empresas achadas por Sinal, calculada contra o ICP estruturado).

O dono do produto decidiu não seguir com essa direção. Ao mesmo tempo, o que veio depois e não depende dela (a
cadência, PRs #344–#348; Gerar Sequência em qualquer Conta-alvo, #317; a busca pelo ICP da Fase 1a; o extrato por
Sinal; telefone a 5 créditos; o Sinal de mercado da Trilha C 5a) está funcionando e não pode voltar atrás.

## Decisão

1. **Os quatro Agentes voltam ao produto.** Barra lateral "Especialistas", grade em `/`, @menção, "Novo agente" e as
   páginas de cada Agente graváveis de novo. A [ADR-0004](0004-coordenacao-sem-quinto-agente.md) (Coordenação divide
   o pedido entre os 4, sem quinto agente) e a [ADR-0005](0005-agentes-criados-a-partir-de-especialidades.md) voltam
   a valer por inteiro.
2. **A `/` volta a ser a página dos 4 Agentes com o composer da Coordenação.** O agente único sai da tela inicial e
   do produto: a rota, o provedor e a Edge Function `agente` são retirados; as tabelas `private.agente_*` ficam sem
   uso, sem apagar linha. Com ele saem as ferramentas que só existiam nele (ler/salvar ICP, ler o site para o ICP,
   ICP do CRM, as ferramentas da Fase 7d).
3. **O composer não cria Sinal.** Sai a classificação de intenção e o atalho para `/sinais/novo`. Criar Sinal volta a
   ser só por `/sinais/novo` e pelo catálogo.
4. **O catálogo volta a ser o catálogo, sem Modelos.** Sem Plano-semente, sem "Para o seu nicho" pelo ICP, sem
   "Usar o Modelo" e sem renomear Sinal pela interface. A prateleira de nicho volta a vir dos Segmentos do ICP da
   Memória (`nichoDoWorkspace`), como antes do #304.
5. **O Rhetor volta a ser quem escreve Sequência.** As RPCs de propor e sugerir modelo de Sequência voltam a exigir
   `specialty = 'rhetor'`, as ferramentas de Sequência voltam a ser só do Rhetor, e Gerar Sequência leva o pedido
   direto à Conversa do Rhetor. O que o #317 trouxe e não é sobre Especialidade (Sequência em Conta sem Sinal) fica.
6. **O ICP volta a ser o do Playbook.** A fonte de ICP de toda função é a seção `icp` do Playbook do Workspace
   (`get_playbook_section('icp')`) mais o mini-ICP do onboarding (`day0_companies`). O ICP estruturado único sai:
   gatilhos, sincronização, semeadura, ranqueamento e Aderência por ele. O mini-ICP do onboarding (o que vende, para
   quem, por que compram) continua sendo perguntado e salvo.
7. **Tudo para a frente, sem `git revert`.** As migrations já estão aplicadas no remoto: cada passo é uma migration
   nova ou código novo. Nenhuma linha de dado é apagada sem pedido explícito do dono do produto (AGENTS.md).

## Consequências

- A cadência não muda: `sequence-runner`, `sequence-step-sends`, as Propostas de resposta e o histórico de recusa não
  dependem do agente único, do ICP estruturado nem da retirada do Rhetor. O teste
  `_hermes-worker/cadencia-ponta-a-ponta.test.ts` já usa um Agente Rhetor.
- Os tickets 13, 14 e 15 de `.scratch/sinais-first/`, que nunca chegaram à `main`, viram `wontfix`. A semeadura dos 4 Agentes
  nunca parou e as personas do Hermes nunca saíram, então não há o que restaurar ali.
- As colunas `signal_monitors.created_via`, `signal_requests.model_id`, a tabela `signal_model_versions` e a função
  `rename_signal_monitor` ficam no banco: o #322 (Sinal de mercado) passou a gravar `created_via` e o Plano por elas.
  Só a interface para de usá-las.
- A tabela `private.workspace_icp_versions` e as tabelas `private.agente_*` ficam no banco, sem uso. Apagá-las é
  decisão à parte.
- Os `fit_score`/`fit_level` das empresas achadas por Sinal (`origin = 'sinal'`) foram reescritos três vezes contra o
  ICP estruturado; o valor de antes não volta. A recomendação é deixá-los em `sem_dado`, como antes do #304.
