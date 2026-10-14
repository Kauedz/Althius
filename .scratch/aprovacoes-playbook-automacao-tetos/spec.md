# PR-12 — Aprovações, Playbook e guarda em dólar

## GATE
1. Regra única de edição do Playbook (e da Memória, que no Workspace operacional é o Playbook):
   Administrador grava direto e cria versão; Membro propõe uma revisão que vai para Aprovações; Agentes
   já propõem (agent_propose_playbook_revision). Banco: `public.propose_playbook_revision`.
2. Guarda em dólar: `workspace_signal_budget.monthly_cap_usd` segue `contract_tiers.internal_usd_guard` ao criar
   o contrato ou trocar a faixa (gatilho em `workspace_contracts`); a migração alinha os contratos que já existem.
   A Equipe (créditos ilimitados) fica sem guarda.
3. Aprovações: prazo ("vence em 6 h"), vencida com o motivo, filtros por tipo (Envio, Integração, Revisão do
   Playbook) e por Agente; decidir invalida Aprovações, Memória e Playbook juntos.
4. Testes: pgTAP (proposta do Membro, aprovação grava versão, guarda) e Vitest (prazo, filtros, proposta).

## Fora do escopo
Conectores, Hermes, segredos, rotas, navegação e layout.
