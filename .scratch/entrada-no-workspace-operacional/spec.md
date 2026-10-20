# Entrada no Workspace operacional: login real e onboarding uma vez só

Status: ready-for-agent (tickets 01 e 02); o 03 está em needs-info

Origem: [AUDITORIA-TOTAL-2026-10-17.md](../AUDITORIA-TOTAL-2026-10-17.md), vertical A. Fila: [FILA-EXECUCAO-2026-10-17.md](../FILA-EXECUCAO-2026-10-17.md).
Leia antes: [ADR-0025](../../docs/adr/0025-workspace-so-por-contrato-e-visitante-na-demonstracao.md), [spec de autenticação](../autenticacao-google-email/spec.md), [spec de onboarding](../onboarding-pos-login/spec.md).

## Problem Statement

O Cliente abre app.althius.com.br e cai no banner "Modo Protótipo (Completo)" da Demonstração, que o manda para
`/onboarding` a cada navegador limpo. Para chegar ao login ele precisa achar o botão "Acessar tela de login Supabase".
Na tela `/entrar` o texto fala do Google, mas o botão não aparece. E quem entra no Workspace operacional não tem
onboarding nenhum: o módulo está indisponível, então o Day0 não fica guardado nem é oferecido uma vez.

## Solution

- Em produção, quem chega sem escolha salva vê a tela de entrada, não a Demonstração. A Demonstração continua a um
  clique ("Ver a Demonstração") e é o que o visitante sem Contrato vê depois de entrar (ADR-0025), com o banner
  "Você está vendo uma demonstração". O banner "Modo Protótipo (Completo)" fica só no ambiente de desenvolvimento.
- A tela de entrada só fala do Google quando o botão do Google existe.
- No Workspace operacional, o Day0 é feito uma vez só e fica guardado no backend: recarregar ou entrar de outro
  navegador não pede de novo.

## User Stories

1. Como Cliente com Contrato, quero que app.althius.com.br abra na tela de entrada, para entrar no meu Workspace sem passar pela Demonstração.
2. Como Cliente, quero não ver "Modo Protótipo (Completo)", para não achar que o produto é um protótipo.
3. Como visitante sem Contrato, quero ver a Demonstração depois de entrar, com o banner "Você está vendo uma demonstração", como diz o ADR-0025.
4. Como pessoa curiosa, quero um link "Ver a Demonstração" na tela de entrada, para conhecer a Althius sem conta.
5. Como Cliente que já abriu a Demonstração antes, quero que a escolha antiga do protótipo não me prenda na Demonstração em produção.
6. Como Cliente, quero que a tela de entrada só cite o Google quando eu puder entrar com o Google, para a tela não mentir.
7. Como Administrador do Workspace da empresa, quero fazer o Day0 uma vez e não ser mandado de novo para `/onboarding`.
8. Como Membro convidado, quero pular as perguntas da empresa, que o Administrador já respondeu.
9. Como participante, quero que recarregar a página no meio do onboarding retome de onde parei.
10. Como Renan, quero que o Google, o SMTP e o Turnstile de produção estejam configurados, para o login real funcionar de ponta a ponta.

## Implementation Decisions

- A escolha do ambiente continua na raiz do app. Em build de produção, a falta de escolha salva leva ao Workspace operacional (tela de entrada); `?demo=true` e o link da tela de entrada levam à Demonstração. A chave salva muda de nome para que o `true` antigo do protótipo não valha mais (o valor antigo é ignorado uma vez e apagado).
- O banner do protótipo depende de o build ser de desenvolvimento; em produção some.
- O texto sobre o Google na tela de entrada e no cadastro é condicionado ao mesmo serviço que decide o botão (sem Client ID, sem texto).
- O onboarding operacional usa a regra que já existe (`precisaDoOnboarding`) com uma Fonte real. A divisão dos dados (Conta de usuário × Workspace) segue a proposta do crm-real-e-stack/24 depois das respostas do Renan.
- Não se cria Workspace no onboarding (ADR-0025).

## Testing Decisions

- Testar pelo comportamento da raiz: navegador sem nada salvo, com o valor antigo salvo, com `?demo=true`, em build de produção e de desenvolvimento (prior art: `raiz.test.tsx`).
- Tela de entrada com e sem o serviço do Google (prior art: testes de `auth/`).
- Onboarding operacional: pgTAP da tabela e RPC; Vitest da Casca com a Fonte real falsa (prior art: `entrada-na-casca` e testes do onboarding da Demonstração).

## Out of Scope

- Cadastro aberto por e-mail e senha (ADR-0025 fechou).
- Leitura real do site da empresa no Day0 (fica indisponível e editável).
- Configurar Google Cloud, SMTP e Turnstile: é o [autenticacao-google-email/10](../autenticacao-google-email/issues/10-configurar-ambiente-e-verificar.md), do Nan e do Renan.

## Further Notes

Tickets existentes reaproveitados: [autenticacao-google-email/10](../autenticacao-google-email/issues/10-configurar-ambiente-e-verificar.md) (ambiente de produção), [autenticacao-google-email/09](../autenticacao-google-email/issues/09-entrar-por-convite.md) (convite), [crm-real-e-stack/24](../crm-real-e-stack/issues/24-onboarding-no-workspace-operacional.md) (onboarding operacional completo; o ticket 03 daqui é a primeira fatia dele).
