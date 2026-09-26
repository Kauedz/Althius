# Althius · protótipo da aba de Agentes

Protótipo navegável, só front-end, com dados simulados. A especificação está em [`.scratch/pagina-de-agentes/spec.md`](../.scratch/pagina-de-agentes/spec.md) (a primeira versão foi a issue #1). O vocabulário do domínio está no `CONTEXT.md` da raiz, e as decisões, em `docs/adr/`.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # testes de comportamento (Vitest + Testing Library)
npm run build    # typecheck + build de produção
```

## Como está organizado

- `src/fonte/`: a **fonte de dados dos agentes**, a única fronteira entre as telas e os agentes. `tipos.ts` define a interface; `simulada.ts` é a implementação da demo, com os dados em `dados-demo.ts` e os roteiros da Conversa e da Coordenação em `roteiros.ts`. Um back-end real entra implementando a mesma interface (ADR 0003).
- `src/raiz.tsx` e `src/fonte/composicao.ts`: o **ponto de composição**. A raiz escolhe entre a Demonstração e o Workspace operacional; a composição monta o `Ambiente` (`ambiente.ts`) com as fontes de cada um.
- `src/paginas/`: grade de Agentes, criação de Agente, página do agente (7 seções), Conversa coordenada, Conexões e Aprovações.
- `src/conversa/`: estado das Conversas (diretas e coordenadas), o composer e o autocompletar de @menção.
- `src/index.css`: tokens do Manual da Marca v2.0 (tema escuro padrão e tema claro).

## Acesso real a Sequências

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em `.env.local` (veja `.env.example`). Com as duas variáveis presentes, o protótipo continua abrindo na Demonstração e oferece o acesso ao Workspace operacional, que exige uma sessão Supabase Auth e uma participação ativa em `workspace_memberships`; sem configuração, só existe a Demonstração. O cliente usa somente a chave publicável. Nunca configure uma chave `service_role` no frontend.

**Continuar com Google:** configure `VITE_GOOGLE_CLIENT_ID` com o Client ID Web do Google Cloud (veja `.env.example`). Sem ele, `/entrar` e `/cadastro` não mostram o Google e seguem com e-mail. O login é por ID token (`signInWithIdToken` com nonce), com o botão oficial do Google Identity Services e o One Tap via FedCM, só nas telas de acesso; escopos apenas `openid`, `email` e `profile`. Registre o mesmo Client ID no provedor Google do Supabase Auth e as origens do app como "Authorized JavaScript origins" no Google Cloud. O Client Secret nunca vai para o frontend.

O CAPTCHA invisível (Cloudflare Turnstile) protege cadastro, login com senha, envio de código, reenvio e redefinição de senha: cada chamada ao Supabase Auth leva um token novo em `options.captchaToken`. Configure a site key pública em `VITE_TURNSTILE_SITE_KEY`; sem ela, nenhum token é pedido e o acesso funciona sem CAPTCHA. A chave secreta do Turnstile fica só no Supabase Auth (Authentication > Attack Protection > CAPTCHA, provider Turnstile); com o CAPTCHA ligado lá, o frontend precisa da site key, senão o Auth recusa essas chamadas.

A escolha das fontes fica num só lugar, `src/fonte/composicao.ts`: a Demonstração recebe as fontes simuladas; o Workspace operacional, os adapters reais do Workspace escolhido. Hoje só Sequências é real; os outros módulos entram com as fontes de `src/fonte/indisponivel.ts`, que não trazem dado de demonstração e recusam as ações, e as telas deles mostram que ainda estão indisponíveis. Ao conectar um módulo, troque a fonte dele em `criarAmbienteDoWorkspace` e tire-o de `indisponiveis`.

O acesso é por link de e-mail para contas já existentes; o formulário não cria usuários nem associa Workspaces. Convide os usuários pelo Supabase Auth e provisione suas participações por operação administrativa confiável. As RPCs do banco verificam a identidade do token, a participação ativa e o Vendedor responsável.

Na configuração de Auth do projeto, inclua a URL local do Vite e as origens de produção na lista de redirecionamentos permitidos, com `/**` no fim (ex.: `http://localhost:5173/**`): o link de acesso volta ao endereço que a pessoa tentou abrir, e sem o curinga o Supabase descarta esse caminho e abre a Site URL. Para cada pessoa, crie/convida-se a identidade no Supabase Auth e insira a participação correspondente em `workspace_memberships` usando uma operação administrativa; o formulário público nunca grava nessa tabela.

Para fazer tudo isso num projeto, rode `scripts/wizard-teste-real.sh` na raiz do repositório (no Windows, pelo Git Bash). Ele guia a chave publicável, as Redirect URLs, o SMTP próprio (opcional), as cinco identidades do teste real e o SQL das participações, e grava os valores em `.env.local`. As chaves `TESTE_*` ficam só na sua máquina: sem o prefixo `VITE_`, não chegam ao navegador.

Depois do wizard, `npm run teste:real` confere as regras do ticket 01 contra o projeto: entra por senha com as cinco personas e passa pela mesma API do app. Ele grava Sequências reais em Contas-alvo `teste-real-*`, que o fluxo público não apaga.

O `teste:real` lê as variáveis do ambiente ou do `.env.local`, e o ambiente vale mais. As sessões do Claude Code na nuvem não têm o seu `.env.local`, então precisam das mesmas variáveis no ambiente de nuvem. Para levá-las até lá, ou só para trocar as senhas das personas, rode `scripts/wizard-senhas-das-personas.sh`. Ele faz três coisas:

1. gera senhas novas e copia o SQL que as troca no Supabase Auth;
2. copia o bloco de variáveis para colar no ambiente de nuvem;
3. confere tudo com o `teste:real`.

## Canais pessoais pela Unipile

`scripts/wizard-unipile.sh`, na raiz do repositório, configura a conta Unipile que conecta E-mail, WhatsApp e LinkedIn (canais-03): guia a chave de API, registra o Webhook Endpoint da Unipile v2 direto por API (capturando o segredo de assinatura que a própria Unipile gera) e coloca os 3 segredos nas Edge Functions do Supabase. Nenhum segredo é gravado em disco. Depois, `npm run unipile:testar -- email` conecta um canal de verdade de ponta a ponta.

O plano prevê trocar de conta Unipile mais de uma vez (teste grátis, depois uma conta paga, depois a conta oficial da empresa); rode o wizard de novo a cada troca — só os segredos mudam. Contatos, Contas-alvo, Sequências e Interações nunca dependem de qual conta Unipile está ativa no momento.

Os ícones são Lucide provisórios e o logo é uma reconstrução provisória: os dois serão trocados pelos arquivos oficiais.
