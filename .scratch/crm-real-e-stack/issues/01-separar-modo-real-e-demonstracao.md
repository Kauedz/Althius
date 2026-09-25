# 01: Separar modo real e Demonstração

**What to build:** ao entrar no Althius, o usuário consegue identificar se está usando um Workspace operacional ou a Demonstração. Um Workspace real nunca recebe dados, resultados ou ações roteirizadas.

**Blocked by:** None (can start immediately).

**Status:** closed

- [x] O modo Demonstração mantém selo, fonte e estado isolados dos Workspaces reais.
- [x] Uma sessão autenticada real não injeta Contas, Contatos, Sinais, Conversas ou Aprovações de demonstração.
- [x] Ações cujo domínio ainda não foi conectado exibem estado indisponível claro e não simulam sucesso.
- [x] Os adapters são selecionados pela sessão e Workspace no ponto de composição da aplicação; telas existentes continuam consumindo seus contratos.
- [x] Mudança entre ambientes não compartilha cache, subscriptions, uploads ou estado local de Workspace.

## Implementação

- **Ponto de composição:** `src/fonte/composicao.ts` cria um `Ambiente` (`src/fonte/ambiente.ts`): o modo, as cinco fontes e os módulos ainda indisponíveis. `criarAmbienteDeDemonstracao` liga as fontes simuladas; `criarAmbienteDoWorkspace` recebe a Conta de usuário da sessão e a Participação escolhida. O `App` só recebe o `Ambiente` e não tem mais fontes simuladas por padrão. A escolha entre Demonstração e acesso real saiu de `main.tsx` para `src/raiz.tsx`.
- **Workspace operacional:** Sequências continua no adapter Supabase. Agentes/Conversas, Contas/Contatos, Sinais, Aprovações, Conexões, Configurações (exceto Ajuda, que é só conteúdo), onboarding e anexos usam as fontes de `src/fonte/indisponivel.ts`: listas vazias, sem fixture, e ações recusadas com `ErroDeModuloIndisponivel`. Cada rota desses módulos mostra "… ainda não está(ão) disponível(is) neste Workspace" (`src/components/modulo-indisponivel.tsx`); `/onboarding` volta para o início. Um ticket que conectar um módulo troca a fonte dele em `criarAmbienteDoWorkspace` e o tira de `indisponiveis`.
- **Identificação:** o selo da navegação é "Demonstração" só na Demonstração e "Operacional" no Workspace real; a barra do modo real diz "Workspace operacional". O grupo "Especialistas" some quando o Workspace não tem Agentes. No detalhe da Sequência, fora da Demonstração, a prévia e o cabeçalho deixaram de assinar com a remetente de exemplo (Marina Costa · Databricks), a prévia não inventa o e-mail do destinatário e o rodapé do passo diz só "Ainda não enviado", sem o selo "Demonstração". A lista vazia não sugere criar pela Conversa: criar uma Sequência depende das Contas-alvo reais. As ações de demonstração da Sequência passaram a seguir o modo do ambiente, e `FonteDeSequencias.modo` deixou de existir.
- **Isolamento entre ambientes:** cada ambiente e cada Workspace/sessão remonta o app com fontes novas; a inscrição Realtime do Workspace anterior é removida. A barra do modo real ganhou "Trocar de Workspace" (com mais de uma Participação) e "Abrir Demonstração". A posição de rolagem das listas passou de um `Map` global para um contexto por instância do `App`. O `SinaisDoMockupProvider` não semeia mais Monitoramentos de exemplo: eles vêm só da fonte da Demonstração. No Workspace real, anexar arquivo fica indisponível e o adapter de Sequências recusa documento com anexos, para um endereço `blob:` local não ir para o backend.
- **Testes:** `src/raiz.test.tsx` dirige a raiz como usuário, com o cliente Supabase dublado na fronteira (`src/test/supabase-falso.ts`); `src/fonte/supabase-sequencias.test.ts` cobre a recusa de anexos no contrato da fonte; `voltar-para-a-lista.test.tsx` cobre a rolagem entre montagens do app.

## Comments

- A mudança é só de frontend: nenhuma migration ou função foi alterada nem implantada. O fluxo real foi validado com o cliente Supabase dublado; o login por link contra o projeto remoto não foi exercitado nesta execução, por falta de credenciais de teste.
- O nome do Workspace ainda não existe no backend; o seletor mostra "Workspace" até o ticket 02 criar o cadastro do Workspace.
- Em aberto, fora deste ticket: o editor da Sequência aplica a edição do passo antes da resposta do backend e não mostra quando ela falha (inclusive `ErroDeModuloIndisponivel`). Hoje só um documento que já tenha anexos gravados chega a essa recusa, e nenhum fluxo do app grava um. O tratamento de erro do editor fica para o trabalho de estados reais de Sequências (história 59).
- Plano ficou indisponível no Workspace operacional, e não identificado como demonstração, porque mostrar o uso de exemplo seria inventar números do Workspace. O ticket 08 decide como o Plano demonstrativo aparece ali.
- Conteúdo de exemplo do detalhe da Sequência (remetente, endereço composto, métricas) continua na tela, escolhido pelo modo do ambiente. Quando as Contas remetentes forem reais (canais-03), a remetente deve vir da fonte.

