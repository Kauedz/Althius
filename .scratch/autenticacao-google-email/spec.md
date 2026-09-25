# Autenticação com Google e link por e-mail

Status: ready-for-agent

## Objetivo

Facilitar cadastro e entrada na Althius, com experiência responsiva e retorno previsível ao aplicativo. Este documento registra requisitos confirmados e a direção técnica, sem representar implementação concluída.

## Decisões confirmadas em 2026-09-25

- **Provedor de identidade: Supabase Auth** ([ADR-0012](../../docs/adr/0012-supabase-auth-como-identidade.md)). Clerk foi considerado e descartado. A identidade, a sessão e as permissões (`auth.uid()`, RLS, RPCs e Edge Functions) continuam na mesma base já usada por Sequências e Canais.
- Google como entrada principal e link por e-mail como alternativa para Yahoo, Hotmail e e-mails corporativos, sem exigir conta Google.
- O link por e-mail só funciona no mesmo navegador/dispositivo que iniciou o acesso (fluxo PKCE). O mesmo e-mail traz também um código, digitado no navegador onde a pessoa deseja entrar, para quem consulta o e-mail em outro dispositivo.
- A tela de login é da Althius: logo e identidade visual próprios, sem páginas intermediárias de terceiros além da tela de escolha de conta do Google, e sem elementos cortados no celular.
- Google, link e código do mesmo e-mail verificado acessam a mesma Conta de usuário e seus Workspaces. Não criar identidades ou Workspaces duplicados ao alternar métodos.
- Toda nova Conta de usuário tem um Workspace pessoal criado automaticamente, inicialmente com o nome da pessoa (ex.: "Renan Zanato"), inclusive quando o cadastro ocorre por convite para uma empresa ([ADR-0011](../../docs/adr/0011-workspace-pessoal-independente-da-empresa.md)).
- **O Workspace pessoal é criado primeiro e é onde o criador sem convite faz o onboarding.** O Workspace da empresa é criado depois, por escolha explícita, e não faz parte do cadastro nem do Day0.
- O Workspace pessoal e o Workspace da empresa são distintos. Remover a Participação na empresa encerra o acesso a seus dados e mantém o acesso ao Workspace pessoal. Não copia dados da empresa nem cria um novo Workspace por causa da remoção.
- O Workspace pessoal pode receber colegas por convite e ser usado em projetos próprios de CRM, com plano próprio. Não limitar sua colaboração por ser pessoal nem acrescentar personalizações específicas nesta entrega.
- Após verificar o e-mail corporativo, sugerir o Workspace da empresa associado ao mesmo domínio ("Quer entrar na [empresa]?"). Domínio não concede acesso sozinho: a entrada continua dependendo de convite válido e aceite pela identidade correspondente. Não consultar dados internos da empresa para mostrar a sugestão.
- Contratar plano no pessoal é capacidade do modelo de produto; preços, limites e cobrança não estão definidos nem entram no escopo da autenticação.

## Fluxo consolidado

1. A pessoa autentica com Google ou com e-mail (link ou código). Métodos com o mesmo e-mail verificado acessam a mesma Conta de usuário.
2. Garantir a existência do Workspace pessoal, com nome inicial da pessoa e Participação de Administrador, sem duplicação. O Google fornece o nome; o cadastro exclusivamente por e-mail pede o nome antes de concluir, sem inventá-lo a partir do endereço.
3. Com convite válido, apresentar o aceite para o Workspace correspondente e preservar esse destino durante o login. O Workspace pessoal continua disponível no seletor.
4. Sem convite, a pessoa entra no Workspace pessoal e faz o onboarding de criador nele. O nome da empresa informado no Day0 não renomeia o pessoal nem cria outro Workspace.
5. A qualquer momento depois, a pessoa pode criar um Workspace da empresa por uma ação explícita. Se houver empresa correspondente ao domínio corporativo, mostrar a sugestão sem ingressar automaticamente; sem convite válido, informar que um Administrador precisa convidá-la.
6. Após remoção do Workspace da empresa em uso, encerrar seu acesso e retornar ao pessoal. Não transferir dados, plano ou responsabilidades entre espaços.

### Workspace de entrada após o login

Destino do convite válido → último Workspace usado com Participação ativa → Workspace pessoal. Nunca abrir um Workspace sem Participação ativa.

### Critérios para a sugestão por domínio

- Usar e-mail verificado e associação de domínio à empresa validada pelo backend. Digitar um site ou domínio no onboarding não prova controle do domínio nem autoriza descobrir ou acessar outro Workspace.
- Não usar domínios públicos de e-mail, como Gmail, Yahoo e Hotmail, para sugerir que usuários pertencem à mesma empresa.
- A sugestão é dispensável: a pessoa pode continuar no pessoal ou criar seu próprio Workspace da empresa. Nenhuma sugestão altera Participações ou gera aceite implícito.
- Não introduzir ingresso automático por domínio nesta entrega.
- Como um Workspace da empresa passa a ter um domínio validado ainda não está definido.

## Regras existentes a preservar

- Cadastro verificado cria Workspace pessoal e Participação de Administrador uma única vez por Conta de usuário; callback, login ou troca de método não duplica esses registros.
- Convidado entra no Workspace da empresa do convite válido, sem criar outro Workspace da empresa. Seu Workspace pessoal também existe.
- Remover Participação na empresa preserva a Conta de usuário, seu Workspace pessoal e outros vínculos, conforme a spec de Configurações.
- O titular do Workspace pessoal não pode ser removido nem rebaixado nele. Compartilhar o pessoal não transfere sua titularidade.
- Workspaces pessoais e da empresa mantêm isolamento de dados e plano por Workspace.
- Retomar onboarding incompleto e preservar convite/destino autorizado durante a autenticação.

## Direção técnica

- **Tela própria de login** numa rota da Althius: "Continuar com Google", campo de e-mail e campo de código. Nenhum componente chama o SDK de autenticação diretamente fora do módulo de auth.
- **Google:** credenciais próprias no Google Cloud. A tela de escolha de conta do Google pode exibir o domínio técnico `*.supabase.co` no fluxo por redirecionamento. Para mostrar a Althius, usar o botão oficial do Google na página (login por ID token) ou um domínio personalizado do Supabase (complemento pago); escolher na implementação.
- **E-mail:** `signInWithOtp` com um modelo de e-mail que contém link e código. O cadastro público exige trocar o `shouldCreateUser: false` atual. Produção exige SMTP próprio (ex.: Resend), porque o envio padrão do Supabase é limitado e serve apenas a testes. O mesmo provedor atende os e-mails de convite do CRM-03.
- **Vinculação de métodos:** confiar na vinculação automática de identidades do Supabase por e-mail verificado. Validar o cenário "entrou com e-mail, depois com Google" antes de liberar.
- **Bootstrap:** RPC idempotente que garante Conta de usuário, Workspace pessoal e Participação de Administrador na mesma transação. Hoje não há tabela `workspaces` nas migrations; ela nasce no CRM-02.
- **Redirect URLs:** registrar as origens do app no Supabase Auth por ambiente, preservando convite e destino no retorno.
- Validar login Google e e-mail, cancelamento, link expirado, link aberto em outro navegador, código, retorno, atualização de página e layout em desktop/celular. São verificações futuras, ainda não executadas.

## Pré-requisitos que dependem do responsável pelo produto

- Projeto no Google Cloud com tela de consentimento, domínio verificado, página inicial e política de privacidade publicadas.
- Verificação de marca do Google para exibir nome e logo da Althius: automática pode levar minutos; revisão manual normalmente leva 2–3 dias úteis, sem prazo garantido. Login básico usa só `openid`, `email` e `profile` e não implica acesso a Gmail ou Drive.
- Conta no provedor de SMTP e domínio de envio configurado.

## Tickets

A implementação fica na fila do CRM Real (`.scratch/crm-real-e-stack/issues/`), que é dona do modelo de Workspace e Participação:

- **CRM-02:** login (Google, link e código) e Workspace pessoal.
- **CRM-03:** convites, SMTP e proteção do Titular.
- **CRM-22:** criar Workspace da empresa.
- **CRM-23:** sugestão por domínio (`needs-info`: como validar o domínio).
- **CRM-24:** onboarding no Workspace operacional (`needs-triage`).

## Em aberto

- Perfil em Configurações (CRM-08): sem senha neste fluxo, a troca de senha demonstrativa não deve aparecer como funcional no Workspace operacional.

## Fontes

Consultadas em 2026-09-25:

- [Google: estados e requisitos de OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- [Google: verificação de marca](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)

A conferir na implementação:

- [Supabase: login com Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase: login sem senha por e-mail](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase: vinculação de identidades](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase: SMTP próprio](https://supabase.com/docs/guides/auth/auth-smtp)
