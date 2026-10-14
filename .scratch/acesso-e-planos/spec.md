# Spec: Acesso e planos (contrato externo, faixa única, Workspace visitante)

**Status:** ready-for-human (código neste PR; migrações, deploy e a chave do Turnstile ficam com o Kauê)

**Frente:** créditos e planos. Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md).
Decisão de créditos: [ADR-0019](../../docs/adr/0019-creditos-e-cobranca-por-usuario.md). Primeiro de três PRs
(`acesso-e-planos`, `creditos-moeda-unica`, `sinal-candidata-e-descoberta`); os dois seguintes só começam depois que
este for mesclado.

## Problema

O modelo de negócio é serviço mais SaaS por contrato externo, em plano único por faixa, cobrado fora da plataforma. Hoje
qualquer pessoa cria conta, ganha um Workspace pessoal, pode criar Workspaces da empresa e gastar crédito sem contrato. O
Workspace operacional só pode existir depois do contrato, e só a Althius o cria.

## Solução

1. **Entrada fechada.** O login com Google continua aberto, mas não cria Workspace. Quem entra sem Participação num
   Workspace contratado cai no **Workspace visitante**: a Demonstração que já existe, só leitura, com o banner fixo
   "Você está vendo uma demonstração". Não existe cadastro aberto por e-mail e senha; quem é convidado cria a conta pelo
   link do convite. `bootstrap_personal_workspace` só grava o aceite dos Termos. `create_company_workspace` sai de
   `authenticated` e o botão some.
2. **Fale com a equipe Althius.** Qualquer ação paga do visitante abre um modal com nome, empresa, telefone e mensagem. O
   pedido vai para `private.access_requests` (RPC com limite de envios por usuário) e a Edge Function
   `access-request-notify` manda o e-mail para a equipe, com o mesmo padrão e o mesmo `resendMail` do pedido de Sinal.
3. **Guarda no servidor.** `private.contract_tiers` (Essencial, Profissional, Escala) e `private.workspace_contracts`
   (status ativo, suspenso ou encerrado; `billing_mode` `contrato` ou `saas`). `reserve_credits` e as funções de ação
   paga exigem contrato ativo ou `unlimited_credits`. A rodada de Agente sempre reserva: `credits_enforced` passa a valer
   sempre.
4. **Stripe dormente.** `billing_mode = 'saas'` mantém `stripe-billing`, `stripe-webhook` e o caminho antigo de
   `workspace_access`. Nenhum Workspace usa esse modo. Com `contrato`, `workspace_access` libera pelo contrato e a tela
   esconde checkout e portal.
5. **Provisionamento só pelo staff.** `public.staff_provision_workspace(p_name, p_admin_email, p_tier_id,
   p_initial_credits)`: Workspace da empresa, contrato, créditos do mês (`grant_credits('plano')`), limite mensal em
   créditos, Teto interno da faixa e convite do administrador, numa transação. Sem tela de super admin.
6. **Limite de usuários.** `invite_to_workspace` recusa quando participantes ativos mais convites pendentes chegam a
   `max_users`: "Seu plano permite até N usuários. Fale com a equipe Althius para ampliar."
7. **Plano (Configurações).** "Contrato ativo", faixa, saldo, limite mensal e uso do mês.
8. **Equipe Althius** ganha contrato ativo e segue ilimitada e sem Teto. Workspaces de teste não ganham contrato.
9. **Turnstile** ligado no login (senha, código e Google), no cadastro por convite e no reenvio. Só a documentação das
   chaves; nenhum valor no repositório.

## Decisões

- O Workspace visitante é o ambiente de Demonstração já existente (fontes simuladas), montado com armazenamento em
  memória: nada fica salvo nem vai ao servidor. As ações pagas e as que gravam num Workspace real são interceptadas por
  um invólucro das fontes e abrem o modal.
- "Workspace contratado" = o Workspace da Participação tem contrato `ativo` (qualquer `billing_mode`). A lista vem da
  RPC `list_my_contracted_workspaces`. Quem tem ao menos um entra nele; os pessoais e os de teste continuam no seletor,
  sem apagar nada, mas as ações pagas deles são recusadas pelo servidor.
- A recusa por falta de contrato usa a mesma mensagem e o mesmo SQLSTATE do saldo (`insufficient credits`, `P0001`), com
  `hint = 'contract'` e `detail = 'active contract required'`. Assim todo `begin_*` que já traduz a recusa em
  `no_credits` continua traduzindo, sem redefinir dez funções.
- `private.credits_enforced` passa a devolver sempre verdadeiro. A coluna `workspace_billing.credits_enforced` e
  `set_credits_enforced` ficam dormentes (não se apaga nada).
- `bootstrap_personal_workspace` mantém a assinatura e o retorno (`public.workspaces`): devolve o Workspace pessoal que já
  existe, ou uma linha vazia. Não cria Workspace.
- A Equipe Althius usa a faixa Escala e `unlimited_credits`: o limite de usuários não vale para Workspace ilimitado.
- O limite mensal em créditos mora em `workspace_contracts.monthly_credit_limit` (nulo = créditos da faixa). O PR de
  Créditos o liga ao teto da Automação.
- `staff_provision_workspace` exige `private.is_althius_staff(auth.uid())`. No SQL Editor não há `auth.uid()`: o Kauê
  chama com as claims do usuário staff (exemplo no PR). O convite do administrador é gravado pelo banco; o link vai no
  retorno, porque o staff não é Administrador do Workspace novo e a Edge Function de e-mail exige Administrador.

## Fora de escopo

- Tela de super admin. Conectores e integrações. Aplicar migração, deploy e segredos. Apagar qualquer dado.
- Contrato para os Workspaces de teste.
- Preço por Sinal, renovação mensal e limite único (PR `creditos-moeda-unica`).

## Testes

- pgTAP novo `acesso_e_planos.sql`: sem contrato a reserva recusa; com contrato e `unlimited_credits` passa; a rodada de
  Agente sempre reserva; limite de usuários; staff provisiona e não staff é recusado; pedidos de acesso com limite;
  `bootstrap` não cria Workspace; `create_company_workspace` revogado; `workspace_access` pelo contrato; a Equipe tem
  contrato. Testes antigos que dependiam de reserva sem contrato ganham contrato na preparação.
- Deno: `access-request-notify` da requisição à resposta.
- Vitest: banner, modal, Plano, entrada sem cadastro aberto, Turnstile no Google.
