# PR-9 — Histórico de Conversas por Agente e sugestões a partir dos dados

## GATE
- Migração `20261023100000_historico_e_sugestoes_dos_agentes.sql`, aditiva e idempotente, versão posterior a 20261022100000.
- Nada de SQL destrutivo; RLS ligada e acesso revogado na tabela nova; funções `security definer` com `search_path = ''`.
- A Conversa continua só de quem a começou (ADR-0008); toda leitura confere membro ativo do Workspace.
- Sugestões por regra, sem modelo; sem dados, frases genéricas. Na Demonstração, as frases fixas de `especialidades.ts`.
- Sem mudar rotas, barra lateral nem layout; texto em pt-BR; sem "CRM"; sem letras de nicho; só ícones lucide-react.
- Testes: pgTAP (`historico_e_sugestoes_dos_agentes.sql`) e Vitest.

## Banco
- `private.agent_conversations.archived_at timestamptz` (nulo = ativa).
- `public.list_agent_conversations_of_agent(p_workspace_id, p_agent_id, p_limit default 30, p_before default null)`:
  Conversas de quem pede, do Agente (`p_agent_id` nulo = Coordenação), sem as arquivadas, da mais recente à mais
  antiga, paginadas por `updated_at < p_before`. Título = nome dado ou os 60 primeiros caracteres do primeiro pedido.
- `public.archive_agent_conversation(p_conversation_id)`: só o dono.
- `private.agent_prompt_suggestion_cache (workspace_id, agent_id, user_id)`: `suggestions jsonb`, `computed_at`, `expires_at` (6 h).
- `public.agent_prompt_suggestions(p_workspace_id, p_agent_id) returns jsonb` (`[{id, texto}]`, 3 a 4): usa o cache se
  não venceu e nenhum Sinal chegou depois; senão recalcula pela Especialidade com Contas quentes e seus Sinais,
  Candidatas novas da Descoberta, ICP/Personas do Playbook, Aprovações pendentes e Sequências pausadas.

## Frontend
- Aba Conversa do Agente: painel recolhível de histórico com "Nova conversa", grupos Hoje / Últimos 7 dias / Mais
  antigas, busca, renomear e arquivar; `?conversa=<id>` abre a Conversa.
- A mesma lista substitui as 8 últimas em `conversas-salvas.tsx` (Coordenação).
- Sugestões da aba Conversa vêm de `agent_prompt_suggestions` no Workspace operacional.
