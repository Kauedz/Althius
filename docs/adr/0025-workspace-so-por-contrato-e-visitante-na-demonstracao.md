# O Workspace operacional só existe depois do contrato, e quem entra sem ele vê a Demonstração

O modelo de negócio da Althius é **serviço mais SaaS por contrato externo**, em **plano único por faixa**, cobrado fora da
plataforma. Por isso o Workspace operacional só existe depois do contrato, e só a Althius o cria
(`staff_provision_workspace`, por SQL, a pedido do Kauê; não há tela de super admin). Isso substitui, para clientes novos,
o Workspace pessoal criado no primeiro acesso e o "Criar Workspace da empresa" de [ADR-0011](./0011-workspace-pessoal-independente-da-empresa.md),
e a assinatura por assento pelo Stripe de [ADR-0019](./0019-creditos-e-cobranca-por-usuario.md), que continua no código,
dormente.

- **Faixas** (`private.contract_tiers`, só por migração): Essencial (2 usuários, 3.000 créditos por mês), Profissional
  (3 usuários, 4.500) e Escala (5 usuários, 6.000). Cada uma carrega a guarda interna em dólar (US$ 140, 195 e 280),
  que vira o Teto de Sinais do Workspace e nunca aparece para o cliente.
- **Contrato** (`private.workspace_contracts`): `ativo`, `suspenso` ou `encerrado`, com `billing_mode`. `contrato` é
  cobrado fora da plataforma; `saas` mantém `stripe-billing`, `stripe-webhook` e o caminho antigo de `workspace_access`,
  e nenhum Workspace o usa hoje.
- **Guarda no servidor**: toda ação paga (`reserve_credits` e as funções que reservam crédito) exige contrato ativo ou
  `unlimited_credits` (a Equipe Althius). A rodada de Agente sempre reserva; `credits_enforced` deixou de ser consultado.
- **Entrada**: o login com Google segue aberto, mas não cria Workspace; não há cadastro aberto por e-mail e senha (quem é
  convidado cria a conta pelo link do convite). Quem não participa de nenhum Workspace contratado cai no **Workspace
  visitante**: a Demonstração que já existe, só leitura, com o banner "Você está vendo uma demonstração". Toda ação paga
  abre "Fale com a equipe Althius", que grava o pedido (`private.access_requests`, com limite por usuário) e avisa a equipe.
- Os Workspaces pessoais e de teste que já existem continuam, sem apagar nada, mas sem contrato recusam as ações pagas.

## Considered Options

- Manter o cadastro aberto com teste grátis: descartado; o serviço de implementação vem antes do uso, e a Althius não
  banca o custo de quem ainda não contratou.
- Um Workspace visitante no banco, com linhas de exemplo: descartado; a Demonstração simulada já existe, não toca o
  banco e não corre risco de misturar dado de exemplo com dado real.
- Recusar a falta de contrato com um erro novo: descartado; a recusa reaproveita `insufficient credits` (com
  `hint = 'contract'`), que todo `begin_*` já traduz em `no_credits`, em vez de redefinir dez funções.
