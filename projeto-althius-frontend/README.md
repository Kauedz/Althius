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
- `src/paginas/`: grade de Agentes, criação de Agente, página do agente (7 seções), Conversa coordenada, Conexões e Aprovações.
- `src/conversa/`: estado das Conversas (diretas e coordenadas), o composer e o autocompletar de @menção.
- `src/index.css`: tokens do Manual da Marca v2.0 (tema escuro padrão e tema claro).

## Acesso real a Sequências

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em `.env.local` (veja `.env.example`). Com as duas variáveis presentes, o aplicativo exige uma sessão Supabase Auth e uma participação ativa em `workspace_memberships`; sem configuração continua disponível a demonstração existente. O cliente usa somente a chave publicável. Nunca configure uma chave `service_role` no frontend.

O acesso é por link de e-mail para contas já existentes; o formulário não cria usuários nem associa Workspaces. Convide os usuários pelo Supabase Auth e provisione suas participações por operação administrativa confiável. As RPCs do banco verificam a identidade do token, a participação ativa e o Vendedor responsável.

Na configuração de Auth do projeto, inclua a URL local do Vite (`http://localhost:5173`) e as origens de produção na lista de redirecionamentos permitidos. Para cada pessoa, crie/convida-se a identidade no Supabase Auth e insira a participação correspondente em `workspace_memberships` usando uma operação administrativa; o formulário público nunca grava nessa tabela.

Os ícones são Lucide provisórios e o logo é uma reconstrução provisória: os dois serão trocados pelos arquivos oficiais.
