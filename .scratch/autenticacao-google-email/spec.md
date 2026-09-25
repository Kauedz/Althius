# Cadastro e login com Google, senha ou código

Status: ready-for-agent

## Objetivo

Facilitar cadastro e entrada na Althius, com experiência responsiva, segura e com retorno previsível ao aplicativo. Este documento registra requisitos confirmados e a direção técnica, sem representar implementação concluída.

## Decisões confirmadas em 2026-09-25

- **Provedor de identidade: Supabase Auth** ([ADR-0012](../../docs/adr/0012-supabase-auth-como-identidade.md)). Clerk foi considerado e descartado. A identidade, a sessão e as permissões (`auth.uid()`, RLS, RPCs e Edge Functions) continuam na mesma base já usada por Sequências e Canais.
- **Métodos de acesso:** Google como entrada principal; e-mail e senha como método principal para e-mail (Yahoo, Hotmail e e-mails corporativos, sem exigir conta Google); código de 6 dígitos + link por e-mail como alternativa ("Entrar com código").
- O link por e-mail só funciona no mesmo navegador/dispositivo que iniciou o acesso (fluxo PKCE). O mesmo e-mail traz também o código, digitado no navegador onde a pessoa deseja entrar, para quem consulta o e-mail em outro dispositivo.
- A tela de login é da Althius: logo e identidade visual próprios, sem páginas intermediárias de terceiros além da escolha de conta do Google, e sem elementos cortados no celular.
- Google, senha e código do mesmo e-mail verificado acessam a mesma Conta de usuário e seus Workspaces. Não criar identidades ou Workspaces duplicados ao alternar métodos.
- Toda nova Conta de usuário tem um Workspace pessoal criado automaticamente, inicialmente com o nome da pessoa (ex.: "Renan Zanato"), inclusive quando o cadastro ocorre por convite para uma empresa ([ADR-0011](../../docs/adr/0011-workspace-pessoal-independente-da-empresa.md)).
- **O Workspace pessoal é criado primeiro e é onde o criador sem convite faz o onboarding.** O Workspace da empresa é criado depois, por escolha explícita, e não faz parte do cadastro nem do Day0.
- O Workspace pessoal e o Workspace da empresa são distintos. Remover a Participação na empresa encerra o acesso a seus dados e mantém o acesso ao Workspace pessoal. Não copia dados da empresa nem cria um novo Workspace por causa da remoção.
- O Workspace pessoal pode receber colegas por convite e ser usado em projetos próprios de CRM, com plano próprio. Não limitar sua colaboração por ser pessoal nem acrescentar personalizações específicas nesta entrega.
- Após verificar o e-mail corporativo, sugerir o Workspace da empresa associado ao mesmo domínio ("Quer entrar na [empresa]?"). Domínio não concede acesso sozinho: a entrada continua dependendo de convite válido e aceite pela identidade correspondente. Não consultar dados internos da empresa para mostrar a sugestão.
- Contratar plano no pessoal é capacidade do modelo de produto; preços, limites e cobrança não estão definidos nem entram no escopo da autenticação.

## Telas

### Rotas

- `/cadastro` e `/entrar`, com a mesma identidade visual e link cruzado ("Já tem conta? Entrar" / "Ainda não tem conta? Criar conta").
- `/esqueci-a-senha` para pedir a redefinição e definir a nova senha.
- Convite e destino autorizado são preservados entre as rotas e no retorno do Google.

### Layout

- Desktop: tela dividida, com o formulário de um lado e a marca e a proposta de valor da Althius do outro.
- Celular: coluna única a partir de 360px de largura, sem elementos cortados nem rolagem horizontal.
- Ordem no formulário: "Continuar com Google" no topo, separador "ou", depois os campos de e-mail.

### `/cadastro`

- Campos: nome, e-mail e senha. Empresa, cargo e demais dados ficam no onboarding (Day0).
- O Google fornece o nome. O cadastro por e-mail pede o nome e não o deduz do endereço.
- Abaixo do botão principal: "Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade", com links. Guardar data e versão dos documentos aceitos na Conta de usuário. Vale também para quem se cadastra pelo Google.
- Depois de "Criar conta", a mesma tela pede o código de 6 dígitos enviado por e-mail (o e-mail traz também o link). Oferecer "Reenviar código", com intervalo mínimo entre envios, e "Corrigir e-mail".
- **O e-mail precisa ser verificado antes do primeiro acesso.** Sem verificação não há sessão, Workspace pessoal nem Participação.

### `/entrar`

- "Continuar com Google", e-mail e senha, e o link "Entrar com código" (envia código + link para o e-mail e pede o código na mesma tela).
- Link "Esqueci a senha".
- Erro de login sempre genérico: "E-mail ou senha incorretos". Não informar se o e-mail existe nem qual método ele usa.

### Google

- Botão oficial do Google na página (Google Identity Services) com login por ID token (`signInWithIdToken`), para que a escolha de conta mostre a Althius em vez do domínio técnico `*.supabase.co`.
- One Tap (via FedCM) em `/entrar` e `/cadastro` quando o navegador já tem sessão Google. Não exibir One Tap dentro do aplicativo.
- Cancelar a escolha de conta do Google volta à mesma tela, sem mensagem de erro.

### Convite

- Quem chega por convite cai em `/cadastro` (ou `/entrar`, se já tiver conta) com o e-mail do convite preenchido e travado, e o aviso "Este convite é para fulano@empresa.com".
- No Google, o convite só é aceito se a conta escolhida tiver o mesmo e-mail. Caso contrário, explicar a divergência e oferecer escolher outra conta, sem criar Participação.

## Regras de senha e acesso

- **Política (NIST SP 800-63B):** mínimo de 8 caracteres, sem regras de composição obrigatórias nem troca periódica. Bloquear senhas vazadas na própria tela, consultando a API gratuita Pwned Passwords do HaveIBeenPwned por k-anonimato (só os 5 primeiros caracteres do hash SHA-1 saem do navegador), no cadastro, na redefinição e na troca de senha. O plano Pro do Supabase, que faria esse bloqueio no servidor, não será contratado; por isso a verificação é uma barreira de interface, contornável por quem chama a API do Supabase diretamente. Se a consulta falhar, não bloquear o cadastro. Medidor de força e botão de mostrar/ocultar. Campos com `autocomplete` correto (`new-password`, `current-password`, `one-time-code`) para gerenciadores de senha.
- **Cadastro com e-mail já existente:** a tela responde da mesma forma que um cadastro novo ("Enviamos um código para seu e-mail"). O e-mail enviado explica que a conta já existe e como entrar (Google, senha ou "definir senha"). A tela nunca revela quais e-mails estão cadastrados.
- **Definir senha depois:** quem entrou só com Google pode definir uma senha pelo "Esqueci a senha" ou em Perfil (CRM-08), sem perder a identidade Google.
- **Esqueci a senha:** envia código de 6 dígitos + link no mesmo e-mail, pede a nova senha seguindo a mesma política e, após a troca, encerra as outras sessões ativas da Conta de usuário. A resposta ao pedido é genérica, como no cadastro.
- **Proteção contra abuso:** CAPTCHA invisível (Cloudflare Turnstile, integrado ao Supabase Auth) em cadastro, login com senha, envio de código e "Esqueci a senha", junto com os limites de taxa do Supabase ajustados para produção.

## Fluxo consolidado

1. A pessoa autentica com Google, com e-mail e senha, ou com código. No cadastro por e-mail, verifica o endereço com o código antes de entrar. Métodos com o mesmo e-mail verificado acessam a mesma Conta de usuário.
2. Garantir a existência do Workspace pessoal, com nome inicial da pessoa e Participação de Administrador, sem duplicação.
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

- **Módulo de auth:** nenhum componente chama o SDK de autenticação diretamente fora de `src/auth/`.
- **Google:** credenciais próprias no Google Cloud (Client ID Web), Google Identity Services na página e `signInWithIdToken` com nonce. O mesmo Client ID é registrado no provedor Google do Supabase.
- **E-mail e senha:** `signUp` com "Confirm email" ligado e modelo de e-mail com código + link; `verifyOtp` para o código; `signInWithPassword` para o login.
- **Código:** `signInWithOtp` com `shouldCreateUser: false` em `/entrar` (o cadastro acontece por `/cadastro`). Modelo de e-mail com link e código.
- **Esqueci a senha:** `resetPasswordForEmail` com modelo contendo código + link, `updateUser({ password })` e `signOut({ scope: 'others' })` após a troca.
- **SMTP:** produção exige SMTP próprio (ex.: Resend), porque o envio padrão do Supabase é limitado e serve apenas a testes. O mesmo provedor atende os e-mails de convite do CRM-03.
- **CAPTCHA:** Turnstile habilitado no Supabase Auth. O token acompanha as chamadas de cadastro, login com senha, envio de código e redefinição.
- **Vinculação de métodos:** confiar na vinculação automática de identidades do Supabase por e-mail verificado. Validar "cadastrou com senha, depois entrou com Google" e "entrou com Google, depois definiu senha" antes de liberar.
- **Termos:** guardar versão e data do aceite dos Termos de Uso e da Política de Privacidade na Conta de usuário, no mesmo bootstrap.
- **Bootstrap:** RPC idempotente que garante Conta de usuário, Workspace pessoal e Participação de Administrador na mesma transação, só para e-mail verificado. Hoje não há tabela `workspaces` nas migrations; ela nasce no CRM-02.
- **Redirect URLs:** registrar as origens do app no Supabase Auth por ambiente, preservando convite e destino no retorno.

### Verificações antes de liberar

Ainda não executadas:

- Cadastro com Google (botão e One Tap), com senha e verificação por código, e com link aberto no mesmo navegador.
- Login com senha, com código, com Google; cancelamento da escolha de conta do Google.
- Cadastro com e-mail já existente (resposta idêntica ao cadastro novo) e login com senha errada (erro genérico).
- Senha curta e senha vazada rejeitadas; medidor e mostrar/ocultar.
- Esqueci a senha por código e por link; outras sessões encerradas após a troca.
- Link expirado, link aberto em outro navegador, código errado, reenvio de código.
- Vinculação: senha → Google e Google → definir senha, sempre na mesma Conta de usuário e sem Workspace duplicado.
- Convite: e-mail travado; Google com conta de outro e-mail não aceita o convite.
- CAPTCHA presente e invisível no fluxo normal; limites de taxa.
- Atualização de página durante a verificação; retorno ao destino do convite.
- Layout em desktop e celular (360px), teclado e leitores de tela.

## Pré-requisitos que dependem do responsável pelo produto

- Projeto no Google Cloud com tela de consentimento, Client ID Web, domínio verificado, página inicial e **Termos de Uso e Política de Privacidade publicados**.
- Verificação de marca do Google para exibir nome e logo da Althius: automática pode levar minutos; revisão manual normalmente leva 2–3 dias úteis, sem prazo garantido. Login básico usa só `openid`, `email` e `profile` e não implica acesso a Gmail ou Drive.
- Conta no provedor de SMTP e domínio de envio configurado.
- Conta Cloudflare com site Turnstile e chave secreta configurada no Supabase Auth.

## Tickets

A implementação fica na fila do CRM Real (`.scratch/crm-real-e-stack/issues/`), que é dona do modelo de Workspace e Participação:

- **CRM-02:** cadastro e login (Google, senha e código), verificação de e-mail, esqueci a senha e Workspace pessoal.
- **CRM-03:** convites, SMTP e proteção do Titular.
- **CRM-08:** perfil, incluindo trocar ou definir senha.
- **CRM-22:** criar Workspace da empresa.
- **CRM-23:** sugestão por domínio (`needs-info`: como validar o domínio).
- **CRM-24:** onboarding no Workspace operacional (`needs-triage`).

## Em aberto

- **MFA (autenticador TOTP):** fora desta entrega. O Supabase já suporta; decidir depois se será opcional em Perfil ou obrigatório para Administradores.

## Fontes

Consultadas em 2026-09-25:

- [Google: estados e requisitos de OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- [Google: verificação de marca](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)

A conferir na implementação:

- [Supabase: login com Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase: login com senha](https://supabase.com/docs/guides/auth/passwords)
- [Supabase: login sem senha por e-mail](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase: vinculação de identidades](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase: SMTP próprio](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase: CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)
- [NIST SP 800-63B: autenticadores memorizados](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [HaveIBeenPwned: API Pwned Passwords (k-anonimato)](https://haveibeenpwned.com/API/v3#PwnedPasswords)
