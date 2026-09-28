# Cadastro e login com Google, senha ou código

Status: ready-for-agent

Decisões confirmadas em 2026-09-25. Direção de identidade no [ADR-0012](../../docs/adr/0012-supabase-auth-como-identidade.md); Workspace pessoal no [ADR-0011](../../docs/adr/0011-workspace-pessoal-independente-da-empresa.md); hospedagem do Supabase no [ADR-0013](../../docs/adr/0013-supabase-auto-hospedado-em-vps.md).

## Problem Statement

Hoje não existe cadastro público na Althius. A única entrada do Workspace operacional é um link por e-mail que só funciona para quem já foi provisionado manualmente; quem chega pela primeira vez vê "Nenhum Workspace ativo" e precisa pedir a um Administrador. Não há como entrar com Google, nem com senha, nem recuperar o acesso. Quem é convidado para um Workspace da empresa também não tem um caminho claro: pode se cadastrar com o e-mail errado e não encontrar a empresa. A tela atual é um cartão genérico, sem a identidade da Althius, e não foi pensada para o celular.

## Solution

A Althius ganha telas próprias de cadastro e de login, com a identidade visual da marca, que funcionam no desktop e no celular:

- **Criar conta** com Google (um clique, inclusive pelo One Tap) ou com nome, e-mail e senha. Quem usa e-mail confirma o endereço com um código de 6 dígitos antes de entrar.
- **Entrar** com Google, com e-mail e senha, ou com um código enviado por e-mail.
- **Recuperar o acesso** pelo "Esqueci a senha", com código ou link.

No primeiro acesso, a Conta de usuário já tem seu Workspace pessoal, com o nome da pessoa e ela como Administrador, e cai nele para fazer o onboarding. Quem veio por convite entra com o e-mail do convite travado e é levado ao Workspace da empresa. Todos os métodos com o mesmo e-mail verificado chegam à mesma Conta de usuário, sem duplicar Workspaces.

A tela nunca revela quais e-mails têm conta, recusa senhas fracas ou vazadas e se protege contra bots sem atrapalhar quem é humano.

## User Stories

### Cadastro

1. Como visitante, quero criar minha conta com Google em um clique, para começar a usar a Althius sem inventar outra senha.
2. Como visitante com sessão Google no navegador, quero que o One Tap me ofereça criar a conta ao abrir `/cadastro`, para não precisar procurar o botão.
3. Como visitante, quero que a escolha de conta do Google mostre "Althius", e não um domínio técnico estranho, para confiar que estou no lugar certo.
4. Como visitante sem conta Google (Yahoo, Hotmail, e-mail corporativo), quero criar a conta com nome, e-mail e senha, para não depender do Google.
5. Como visitante, quero que o cadastro me peça só nome, e-mail e senha, para terminar rápido e deixar dados da empresa para depois.
6. Como visitante, quero ver um medidor de força enquanto digito a senha, para saber se ela é boa antes de enviar.
7. Como visitante, quero mostrar e ocultar a senha, para conferir o que digitei sem precisar de um campo de confirmação.
8. Como visitante, quero que meu gerenciador de senhas sugira e salve a senha no cadastro, para não precisar memorizá-la.
9. Como visitante, quero ser avisado se a senha escolhida já apareceu em vazamentos, para não usar uma senha que invasores já conhecem.
10. Como visitante, quero que a Althius não me obrigue a misturar maiúsculas, números e símbolos, para escolher uma frase longa e fácil de lembrar.
11. Como visitante, quero digitar o código de 6 dígitos na mesma tela depois de "Criar conta", para confirmar meu e-mail sem trocar de aba.
12. Como visitante que abriu o e-mail no mesmo navegador, quero clicar no link em vez de digitar o código, para confirmar mais rápido.
13. Como visitante que lê o e-mail no celular e se cadastrou no computador, quero digitar o código no computador, para não depender de abrir o link no mesmo navegador.
14. Como visitante, quero pedir um novo código se o primeiro não chegar, para não ficar travado.
15. Como visitante que errou o e-mail, quero corrigi-lo sem recomeçar o cadastro inteiro, para não perder o que já preenchi.
16. Como visitante, quero saber, por um texto abaixo do botão, que ao continuar concordo com os Termos de Uso e a Política de Privacidade, com links para lê-los.
17. Como visitante que tenta se cadastrar com um e-mail que já tem conta, quero receber um e-mail explicando como entrar, para recuperar o acesso sem que a tela exponha meu cadastro a terceiros.
18. Como visitante que atualizou a página no meio da verificação, quero voltar à etapa do código, para não precisar me cadastrar de novo.

### Primeiro acesso e Workspace pessoal

19. Como nova Conta de usuário, quero ter meu Workspace pessoal criado automaticamente com meu nome, para começar a trabalhar sem configurar nada.
20. Como Titular do Workspace pessoal, quero ser Administrador nele desde o primeiro acesso, para configurar tudo sozinho.
21. Como nova Conta de usuário sem convite, quero cair direto no meu Workspace pessoal e no onboarding de criador, para configurar minha empresa ou projeto.
22. Como nova Conta de usuário, quero ver estados claros de carregamento, falha e nova tentativa enquanto meu Workspace é preparado, para não achar que o app travou.
23. Como Conta de usuário, quero que repetir o login, atualizar a página ou voltar do Google não crie outro Workspace pessoal, para não ter espaços duplicados.
24. Como Conta de usuário com e-mail corporativo, quero que o cadastro não me coloque em nenhum Workspace da empresa só por causa do domínio, para que meu acesso dependa de convite.

### Login

25. Como Conta de usuário, quero entrar com Google em um clique, para acessar rápido.
26. Como Conta de usuário, quero entrar com e-mail e senha, para usar meu gerenciador de senhas.
27. Como Conta de usuário, quero entrar com um código enviado por e-mail quando não lembro a senha e não quero trocá-la agora, para acessar sem redefinir nada.
28. Como Conta de usuário que digitou a senha errada, quero ver só "E-mail ou senha incorretos", sabendo que a tela não revela a outras pessoas se meu e-mail existe.
29. Como Conta de usuário que cancelou a escolha de conta do Google, quero voltar à tela sem mensagem de erro, para escolher outro método.
30. Como Conta de usuário com Participações ativas, quero entrar no último Workspace que usei, para continuar de onde parei.
31. Como Conta de usuário que foi removida do último Workspace usado, quero cair no meu Workspace pessoal, para nunca abrir um Workspace sem Participação ativa.
32. Como Conta de usuário em `/entrar`, quero um link para criar conta, e em `/cadastro` um link para entrar, para corrigir quando cheguei na tela errada.

### Mesmo e-mail, métodos diferentes

33. Como Conta de usuário que se cadastrou com senha, quero entrar depois com Google usando o mesmo e-mail e encontrar minha conta e meus Workspaces, para não ter duas contas.
34. Como Conta de usuário que se cadastrou com Google, quero definir uma senha depois, para não ficar presa ao Google se sair da empresa que administra meu Google Workspace.
35. Como Conta de usuário, quero que código, senha e Google do mesmo e-mail verificado me levem sempre à mesma Conta de usuário, para ver sempre os mesmos Workspaces.

### Esqueci a senha

36. Como Conta de usuário que esqueceu a senha, quero pedir a redefinição pelo e-mail, para recuperar o acesso sozinha.
37. Como Conta de usuário, quero redefinir a senha digitando um código ou clicando num link, para funcionar em qualquer dispositivo.
38. Como Conta de usuário, quero que a nova senha siga as mesmas regras do cadastro, incluindo o bloqueio de senhas vazadas, para não trocar uma senha ruim por outra.
39. Como Conta de usuário que trocou a senha por suspeita de invasão, quero que as outras sessões sejam encerradas, para expulsar quem estiver usando minha conta.
40. Como visitante que pede redefinição para um e-mail sem conta, quero ver a mesma resposta genérica, sabendo que a tela não confirma quais e-mails existem.

### Convite

41. Como pessoa convidada para um Workspace da empresa, quero abrir o convite e ver o e-mail do convite já preenchido e travado, para não me cadastrar com o e-mail errado.
42. Como pessoa convidada, quero ver o aviso "Este convite é para fulano@empresa.com", para entender por que não posso trocar o e-mail.
43. Como pessoa convidada que escolheu no Google uma conta com outro e-mail, quero uma explicação e a opção de escolher outra conta, para não aceitar o convite com a identidade errada.
44. Como pessoa convidada, quero que o destino do convite seja preservado durante o cadastro, a verificação e o retorno do Google, para cair no Workspace da empresa ao terminar.
45. Como pessoa convidada, quero ter também meu Workspace pessoal, para continuar com um espaço meu se um dia perder a Participação na empresa.

### Segurança e confiança

46. Como Conta de usuário, quero que um bot não consiga criar contas em massa nem testar senhas na minha conta, sem que eu precise resolver um desafio visual.
47. Como Administrador de um Workspace da empresa, quero que ninguém consiga cadastrar o e-mail de um colega sem acesso à caixa de entrada dele, para evitar que alguém ocupe a conta de outra pessoa antes dela.
48. Como responsável pelo produto, quero guardar a versão e a data dos Termos aceitos por cada Conta de usuário, para comprovar o consentimento se for preciso.

### Layout e acessibilidade

49. Como visitante no desktop, quero ver o formulário ao lado da proposta de valor da Althius, para entender o produto enquanto me cadastro.
50. Como visitante no celular, quero ver o formulário em uma coluna só, sem nada cortado nem rolagem lateral, a partir de 360px de largura.
51. Como visitante que usa teclado ou leitor de tela, quero conseguir completar cadastro, verificação e login sem mouse, com rótulos e mensagens de erro anunciados.
52. Como Conta de usuário já autenticada, quero não ver o One Tap dentro do app, para não ser interrompida.

### Demonstração

53. Como visitante curioso, quero continuar podendo abrir a Demonstração sem login a partir da tela de entrada, para conhecer a Althius antes de me cadastrar.

## Implementation Decisions

### Métodos e fluxos

- **Provedor de identidade:** Supabase Auth ([ADR-0012](../../docs/adr/0012-supabase-auth-como-identidade.md)). Identidade, sessão e permissões continuam em `auth.uid()`, RLS, RPCs e Edge Functions.
- **Google:** botão oficial do Google Identity Services na página, com login por ID token no Supabase (`signInWithIdToken` com nonce), para que a escolha de conta mostre a Althius em vez de `*.supabase.co`. One Tap (via FedCM) só em `/entrar` e `/cadastro`. O mesmo Client ID Web do Google Cloud é registrado no provedor Google do Supabase. Escopos: só `openid`, `email` e `profile`.
- **E-mail e senha:** cadastro por `signUp` com "Confirm email" ligado; o e-mail de confirmação traz código de 6 dígitos e link. O código é confirmado por `verifyOtp`. Login por `signInWithPassword`.
- **Código:** "Entrar com código" usa `signInWithOtp` com `shouldCreateUser: false` (o cadastro acontece só em `/cadastro`). O e-mail traz código e link; o link só funciona no mesmo navegador (PKCE).
- **Esqueci a senha:** `resetPasswordForEmail` com modelo que traz código e link; nova senha por `updateUser`; depois, `signOut` com escopo das outras sessões.
- **Verificação obrigatória:** sem e-mail verificado não há sessão, Workspace pessoal nem Participação. Isso é o que permite a vinculação automática com o Google e impede ocupar o e-mail de outra pessoa.
- **Sem enumeração de e-mails:** cadastro com e-mail existente e redefinição para e-mail inexistente respondem na tela igual ao caso normal. O e-mail enviado explica a situação (conta existente: entrar com Google, senha ou definir senha). Erro de login é sempre "E-mail ou senha incorretos".
- **Vinculação de métodos:** confiar na vinculação automática de identidades do Supabase por e-mail verificado. Uma Conta de usuário só com Google define senha pelo "Esqueci a senha" (e, no CRM-08, em Perfil).

### Política de senha

- Padrão NIST SP 800-63B: mínimo de 8 caracteres, sem regras de composição nem troca periódica. Medidor de força, mostrar/ocultar e `autocomplete` correto (`new-password`, `current-password`, `one-time-code`).
- **Senhas vazadas, em duas fases** ([ADR-0013](../../docs/adr/0013-supabase-auto-hospedado-em-vps.md)):
  - **Supabase Free (agora):** a tela consulta a API Pwned Passwords do HaveIBeenPwned por k-anonimato (só os 5 primeiros caracteres do hash SHA-1 saem do navegador), no cadastro, na redefinição e na troca de senha. É uma barreira de interface: contornável por quem chama a API do Supabase diretamente. Se a consulta falhar, não bloquear.
  - **Supabase auto-hospedado (com os primeiros clientes):** ligar `GOTRUE_PASSWORD_HIBP_ENABLED`; o servidor recusa com `weak_password` e a tela mostra a mesma mensagem. A consulta feita pela tela pode então ser removida.

### Proteção contra abuso

- CAPTCHA invisível Cloudflare Turnstile, habilitado no Supabase Auth, em cadastro, login com senha, envio de código e redefinição. O token acompanha cada chamada.
- Limites de taxa do Supabase ajustados para produção; "Reenviar código" com intervalo mínimo visível na tela.

### Telas e rotas

- Rotas `/cadastro`, `/entrar` e `/esqueci-a-senha`, com a mesma identidade visual e link cruzado entre cadastro e entrada. A etapa do código é um estado de `/cadastro` (e de "Entrar com código"), que sobrevive a atualizar a página.
- Desktop: tela dividida (formulário de um lado, marca e proposta de valor do outro). Celular: coluna única a partir de 360px.
- Ordem: "Continuar com Google" no topo, separador "ou", campos de e-mail. Em `/entrar`: senha, "Entrar com código" e "Esqueci a senha".
- Aceite passivo abaixo do botão principal, com links para Termos de Uso e Política de Privacidade; vale também para o Google.
- O acesso à Demonstração continua disponível a partir de `/entrar`.

### Convite

- O link de convite, sem sessão, abre a tela do convite (`/convite/<token>`): de qual Workspace é, com qual papel e para qual e-mail, com "Criar conta com este e-mail" (`/cadastro`) e "Já tenho conta: entrar" (`/entrar`), sem revelar se a conta existe. Nas duas, o e-mail do convite vem preenchido e travado. Um convite aceito, expirado, revogado ou desconhecido é explicado na própria tela. O destino do convite é preservado entre as rotas, durante a verificação e no retorno do Google.
- No Google, o convite só é aceito se o e-mail da conta escolhida for o do convite; caso contrário, a tela explica a divergência e não cria Participação.

### Módulo de autenticação

- O contexto de autenticação existente cresce para oferecer: cadastrar com senha, confirmar código, reenviar código, entrar com senha, entrar com código, entrar com Google (ID token), pedir redefinição, definir nova senha e sair. Nenhum componente chama o SDK de autenticação diretamente fora desse módulo.
- **Serviços do navegador como uma peça substituível:** o Google Identity Services, o Turnstile e a consulta ao Pwned Passwords entram no módulo por uma única dependência injetada (junto do cliente Supabase), para que os testes troquem os três por versões falsas.
- A entrada do aplicativo passa a rotear visitantes sem sessão para `/entrar` ou `/cadastro` (conforme a URL) e o link de um convite para a tela do convite, que leva a um dos dois, em vez da tela de link atual, e remove a mensagem "Nenhum Workspace ativo" do caminho normal: toda Conta de usuário verificada tem ao menos o Workspace pessoal.

### Banco (Supabase)

- **Bootstrap idempotente:** uma RPC chamada após a primeira sessão verificada garante, na mesma transação, Workspace pessoal (nome inicial da pessoa, Titular = a Conta de usuário) e Participação de Administrador. Chamá-la de novo não cria nada. Recusa quando o e-mail não está verificado.
- **Tabela de Workspaces:** hoje só existe `workspace_memberships`; a tabela de Workspaces nasce aqui, com tipo (pessoal ou da empresa) e referência ao Titular para o pessoal.
- **Aceite dos Termos:** versão e data dos Termos de Uso e da Política de Privacidade guardadas por Conta de usuário, gravadas pelo mesmo bootstrap.
- **Nome:** vem do Google (`full_name`) ou do campo do cadastro (metadados do usuário); nunca deduzido do endereço de e-mail.

### Entrada no Workspace

- Ordem: destino do convite válido → último Workspace usado com Participação ativa → Workspace pessoal. Nunca abrir um Workspace sem Participação ativa.
- Sem convite, a pessoa faz o onboarding de criador no Workspace pessoal; o nome da empresa informado no Day0 não renomeia o pessoal nem cria outro Workspace.

### Regras existentes a preservar

- O Titular do Workspace pessoal não pode ser removido nem rebaixado nele; compartilhar o pessoal não transfere a titularidade.
- Remover Participação na empresa preserva a Conta de usuário, seu Workspace pessoal e outros vínculos, sem copiar dados.
- Workspaces pessoais e da empresa mantêm isolamento de dados e plano.
- A Sugestão de Workspace por domínio usa só e-mail verificado e domínio validado pelo backend, ignora domínios públicos (Gmail, Yahoo, Hotmail) e nunca concede Participação sozinha.

### Pré-requisitos do responsável pelo produto

- Projeto no Google Cloud com tela de consentimento, Client ID Web, domínio verificado, página inicial e Termos de Uso e Política de Privacidade publicados. Verificação de marca: minutos (automática) a 2–3 dias úteis (manual), sem prazo garantido.
- Provedor de SMTP (ex.: Resend) com domínio de envio configurado; o envio padrão do Supabase serve só a testes. O mesmo provedor atende os convites do CRM-03.
- Conta Cloudflare com site Turnstile e chave secreta configurada no Supabase Auth.
- URLs de redirecionamento de cada ambiente registradas no Supabase Auth.

## Testing Decisions

- **O que é um bom teste aqui:** descreve o que a pessoa faz e o que ela vê (preenche, clica, lê a mensagem, cai no Workspace), nunca qual função do SDK foi chamada nem o estado interno de um componente. Os nomes dos testes usam o vocabulário do CONTEXT.md (Conta de usuário, Workspace pessoal, Participação, Titular).
- **Ponto de teste principal: a raiz do aplicativo com o Supabase falso.** Os testes renderizam a raiz com o cliente Supabase em memória que o projeto já usa e percorrem `/cadastro`, `/entrar` e `/esqueci-a-senha` como uma pessoa. O Supabase falso passa a simular `signUp`, `verifyOtp`, `resend`, `signInWithPassword`, `signInWithOtp`, `signInWithIdToken`, `resetPasswordForEmail`, `updateUser` e `signOut` por escopo, com usuários, identidades e e-mail verificado em memória, e continua falhando alto para qualquer uso não simulado. Cenários obrigatórios:
  - cadastro com senha → código → Workspace pessoal aberto;
  - cadastro com e-mail existente mostra a mesma resposta do cadastro novo;
  - senha curta e senha vazada recusadas; falha da consulta de vazadas não bloqueia;
  - login com senha errada mostra o erro genérico;
  - "Entrar com código" e "Esqueci a senha" completos, com outras sessões encerradas;
  - Google (botão) cria ou encontra a mesma Conta de usuário; cancelamento volta sem erro;
  - senha → Google e Google → definir senha chegam à mesma Conta de usuário;
  - convite com e-mail travado; Google com outro e-mail não aceita o convite;
  - atualizar a página na etapa do código mantém a etapa;
  - ordem do Workspace de entrada (convite → último usado → pessoal);
  - a Demonstração continua acessível sem login.
- **Serviços do navegador na mesma camada:** Google Identity Services, Turnstile e Pwned Passwords são substituídos por versões falsas pela dependência injetada, sem virar pontos de teste separados.
- **Banco em SQL (pgTAP):** o bootstrap é testado direto no banco, no mesmo estilo dos testes existentes em `supabase/tests` (usuários inseridos em `auth.users`, claims do JWT simuladas). Cenários: cria Workspace pessoal e Participação de Administrador uma vez; segunda chamada não duplica; recusa e-mail não verificado; grava versão e data dos Termos; o Titular não pode ser removido nem rebaixado; outra Conta de usuário não enxerga o Workspace pessoal alheio.
- **Prior art:** testes de raiz em `raiz.test.tsx` e `App.test.tsx` com o Supabase falso; testes pgTAP em `supabase/tests/responsabilidade_exclusiva.sql`.
- **Fora dos testes automatizados (lista manual antes de liberar):** Google e One Tap reais com o Client ID, verificação de marca, entrega de e-mails pelo SMTP, link aberto em outro navegador, Turnstile real, layout em desktop e celular (360px), teclado e leitor de tela.

## Out of Scope

- MFA (autenticador TOTP): o Supabase suporta; decidir depois se é opcional em Perfil ou obrigatório para Administradores.
- Trocar ou definir senha em Perfil (CRM-08).
- Envio e gestão de convites, SMTP em produção e proteção do Titular na tela de participantes (CRM-03).
- Criar Workspace da empresa por ação explícita (CRM-22).
- Sugestão de Workspace por domínio (CRM-23), que depende de um mecanismo de domínio validado ainda não definido.
- Onboarding no Workspace operacional (CRM-24).
- Domínio personalizado do Supabase.
- Migração para o Supabase auto-hospedado ([ADR-0013](../../docs/adr/0013-supabase-auto-hospedado-em-vps.md)); esta spec só prevê o que muda no bloqueio de senhas vazadas.
- Preços, limites e cobrança do Plano do Workspace.

## Further Notes

- Implementação nos tickets [01 a 10](./issues/) desta pasta, que substituem o CRM-02 da fila do CRM Real (fechado). O CRM Real continua dono do modelo de Workspace e Participação; os convites vêm do CRM-03.
- O ADR-0003 (protótipo só desktop) vale para a Demonstração; estas telas do Workspace operacional precisam funcionar no celular.
- Fontes consultadas em 2026-09-25: [Google: requisitos de OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) e [verificação de marca](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification). A conferir na implementação: [Supabase: login com Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [senhas](https://supabase.com/docs/guides/auth/passwords), [login sem senha](https://supabase.com/docs/guides/auth/auth-email-passwordless), [vinculação de identidades](https://supabase.com/docs/guides/auth/auth-identity-linking), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html) e [Pwned Passwords](https://haveibeenpwned.com/API/v3#PwnedPasswords).
