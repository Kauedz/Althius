# 02: Configurações, perfil e tema persistentes

**What to build:** Integrar a área de Configurações aprovada ao aplicativo e permitir editar perfil e tema, refletindo as alterações na identidade exibida e preservando-as ao recarregar.

**Blocked by:** 01: Mockup de Configurações e aprovação visual

**Status:** closed

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

> **Próxima IA: comece por "Pendências para fechar o ticket", no fim deste arquivo.** O código já está pronto; não reimplemente.

**User Stories:** 1–5, 7–9.

## Acceptance criteria

- [x] Iniciar somente após o mockup do ticket 01 ter sido explicitamente aprovado; seguir os ajustes registrados.
- [x] Disponibilizar Configurações na navegação do Workspace e acesso a Meu perfil pelo menu pessoal, seguindo a estrutura aprovada.
- [x] Usar a mesma fonte para nome, e-mail e foto no formulário e no menu pessoal, com iniciais quando não houver imagem.
- [x] Permitir adicionar, trocar e remover foto; validar arquivo de imagem, nome não vazio e formato do e-mail.
- [x] Salvar exibe resultado acessível; cancelar preserva os valores vigentes; erros não alteram dados já salvos.
- [x] Persistir dados demonstrativos não secretos e preferência de tema no navegador, associados à Conta de usuário.
- [x] Reutilizar o tema claro/escuro existente, aplicá-lo ao aplicativo e preservar a escolha após recarga.
- [x] Preparar as seções para integração incremental sem alegar que funcionalidades de tickets posteriores estão prontas.
- [x] Manter isolamento entre dados pessoais e dados de Workspace e permitir inicializar estado demonstrativo limpo nos testes.
- [x] Verificar pelo aplicativo completo navegação, salvar/cancelar, avatar, validação e persistência após remontagem; inspecionar ambos os temas e executar os checks aplicáveis. (inspeção visual em navegador feita em 2026-09-26, ver Comments.)

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.


## Comments

### 2026-09-24: implementação

Integrado ao aplicativo, fora do mockup descartável (`src/mockups/configuracoes/`, que continua só como referência visual e será removido quando a Memória do Workspace, Pessoas e acesso, Plano e Ajuda tiverem sua própria implementação funcional).

**Fonte de dados:**
- `Workspace.usuario` ganhou `email` e `foto?` (`fonte/tipos.ts`); novo tipo `Perfil` e operação `salvarPerfil(perfil)` na `FonteDeAgentes`, validando nome não vazio e formato do e-mail no próprio contrato da operação (não só na tela).
- `criarFonteSimulada` aceita `armazenamento` opcional (mesmo padrão de `criarFonteDeOnboardingSimulada`): com ele, o perfil pessoal (nome/e-mail/foto) persiste sob a chave `althius:perfil`, associada à Conta de usuário e separada dos dados do Workspace. Sem armazenamento (padrão nos testes), vale só na instância — isolamento limpo entre cenários. `main.tsx` liga `window.localStorage`.
- `useTema()` (`tema.ts`) passou a persistir em `althius:tema` e a sincronizar entre instâncias (Casca e a nova seção Preferências) por um pub/sub em módulo que só lê o navegador sob demanda, sem cache entre testes.

**Telas:**
- Item "Configurações" na navegação do Workspace (`casca.tsx`) e "Meu perfil" no menu pessoal, ambos levando a `/configuracoes/perfil`. Avatar da Casca (`AvatarDePessoa`, novo em `components/marca.tsx`, reaproveitado no formulário) mostra a foto ou as iniciais do nome, a mesma fonte usada no formulário.
- `paginas/configuracoes/`: `PaginaConfiguracoes` replica a estrutura de seções aprovada no mockup (Meu perfil, Preferências, Workspace, Memória do Workspace, Plano, Ajuda e informações). Só Meu perfil e Preferências (tema) têm implementação funcional; as demais mostram um aviso explícito de que a seção ainda não foi implementada, para não alegar que tickets futuros já estão prontos.
- Meu perfil: nome, e-mail, foto (adicionar/trocar/remover, validando tipo de arquivo), salvar/cancelar com mensagem acessível (`role="status"`/`role="alert"`), erros que não alteram os dados salvos.
- Preferências: tema claro/escuro pelo mecanismo existente, com o rótulo "grava no navegador e volta na abertura seguinte"; notificações do navegador ficam para o ticket 07.

**Fora do escopo desta entrega** (fica para os tickets seguintes, como a spec já prevê): alteração de senha (03), Workspace/Pessoas e acesso (04), Memória do Workspace/ICP/Personas (05-06), notificações (07), Plano (08), Ajuda/feedback/termos (09).

### 2026-09-24: verificação

- Testes novos: `src/paginas/configuracoes/configuracoes.test.tsx` (11 testes — navegação, mesma fonte no formulário e no menu, salvar/cancelar/validação, foto, persistência entre remontagens, tema sincronizado com a Casca, seleção explícita do tema).
- Validação feita no **snapshot isolado do commit** (extraído com `git archive`, sem o trabalho não commitado de outras sessões que estava no working tree): typecheck completo não-incremental, suíte completa (234 testes), testes afetados após o ajuste da revisão (80 testes), lint e build — todos sem erros.
- Revisão de código (`/code-review`): corrigido o `SeletorDeTema`, que ignorava a opção clicada e só alternava (agora `useTema().escolher(tema)`). Ficam como sugestão de refatoração futura, sem bug: `AvatarDePessoa` repete o padrão de `AvatarDoContato`; `ArmazenamentoDoPerfil` tem o mesmo formato de `ArmazenamentoDeOnboarding` (valeria um tipo compartilhado); `renderizarApp` já tem 6 parâmetros posicionais (valeria um objeto de opções).
- Teste de tema em `App.test.tsx` atualizado: o comportamento mudou de "não persiste" para "persiste e sincroniza após remontar".
- Suíte completa do frontend: `vitest run` — 234 testes, 20 arquivos, todos passando (rodado com `--maxWorkers=4`; sob concorrência máxima da caixa de execução, o runner ficou instável em arquivos que não têm relação com este ticket — sinal de contenção de recursos do ambiente, não de regressão).
- `tsc --noEmit` (typecheck do projeto): sem erros.
- `npm run build`: build de produção concluído sem erros (aviso pré-existente de chunk grande, não relacionado a esta entrega).
- `oxlint`: sem erros novos (só os avisos `only-export-components`/`purity` já existentes em outros arquivos do projeto).
- **Não realizado:** inspeção visual em navegador (claro/escuro) — este ambiente não tinha um navegador headless disponível para capturas, ao contrário do que foi feito no ticket 01. As telas novas reutilizam só componentes e classes utilitárias (`campo`, `rotulo`, `selo`, `text-al-erro`, `text-al-sucesso`, `AvatarDePessoa`, `Pagina`, `AbasSublinhadas`, `Button`) já usados e comprovados em ambos os temas no restante do aplicativo, sem CSS novo. Recomendo uma conferência visual manual (`npm run dev`, alternar tema) antes de considerar este item 100% fechado.

### 2026-09-26: conferência visual

Na Demonstração, com o onboarding concluído, pelo Chromium headless a 1400×900, nos temas escuro e claro. Tudo passou:

- `/configuracoes/perfil`:
  - avatar com iniciais;
  - erros de nome vazio, e-mail inválido e arquivo que não é imagem;
  - "Perfil salvo" com a foto, que também aparece no avatar da barra lateral;
  - foco visível (contorno de 2 px) ao navegar com Tab.
- Menu pessoal com "Meu perfil" e o tema, e "Configurações" ativo na barra lateral (`aria-current="page"`).
- `/configuracoes/preferencias`: a opção marcada fica legível nos dois temas.
- Seções: hoje nenhuma mostra "ainda não foi implementada", porque todas já têm implementação.
- Depois de recarregar, o tema e o perfil salvo continuam.

Prints:
- [erros, escuro](prints/02-perfil-erros-escuro.jpg)
- [salvo com foto, claro](prints/02-perfil-salvo-com-foto-claro.jpg)
- [menu pessoal, claro](prints/02-menu-pessoal-claro.jpg)
- [preferências, escuro](prints/02-preferencias-escuro.jpg)
- [preferências, claro](prints/02-preferencias-claro.jpg)

Observações que não bloqueiam:
- No claro, o SALVAR desabilitado depois de salvar tem contraste baixo; um botão desabilitado fica fora do critério de contraste.
- Em 360 px, a Casca inteira rola na horizontal, porque a barra lateral tem largura fixa. Este ticket pede conferência no desktop.

## Pendências para fechar o ticket

Registradas em 2026-09-24 para a próxima IA. O código está pronto e commitado (`79b346f`, mais os tipos/rotas em `b6c7cb1`). **Não reimplemente**; só faça o que está abaixo.

### 1. Inspeção visual em claro e escuro (feita em 2026-09-26, ver Comments)

1. Em `projeto-althius-frontend`, rode `npm run dev` e abra o endereço que o Vite mostrar.
2. Confira em **ambos os temas** (alterne pelo menu pessoal ou por Configurações → Preferências), no desktop:
   - `/configuracoes/perfil`: avatar com iniciais; adicionar/trocar/remover foto; mensagens de erro de nome vazio, e-mail inválido e arquivo que não é imagem; mensagem de "Perfil salvo"; foco visível nos campos e botões.
   - `/configuracoes/preferencias`: seletor Escuro/Claro com a opção marcada legível.
   - Uma seção ainda não implementada (ex.: `/configuracoes/plano`): aviso "ainda não foi implementada" legível.
   - Barra lateral: item "Configurações" ativo; menu pessoal com "Meu perfil"; avatar com a foto depois de salvar.
3. Recarregue a página: o tema escolhido e o perfil salvo devem continuar.
4. Se estiver tudo certo: marque o critério como `[x]`, troque o `Status:` para `closed` e registre a conferência num comentário datado. Se achar defeito visual, corrija, rode `configuracoes.test.tsx` e `App.test.tsx`, e registre.

Precisa de navegador. Se o ambiente não tiver um (headless ou o navegador integrado), peça a conferência ao usuário em vez de marcar o item como feito.

### 2. Refatorações sugeridas pela revisão (opcional, não bloqueia o fechamento)

- `AvatarDePessoa` (`components/marca.tsx`) repete o padrão de `AvatarDoContato` (`paginas/contas.tsx`): unificar.
- `ArmazenamentoDoPerfil` (`fonte/simulada.ts`) tem o mesmo formato de `ArmazenamentoDeOnboarding` (`fonte/simulada-onboarding.ts`): criar um tipo compartilhado.
- `renderizarApp` (`test/renderizar.tsx`) já tem 6 parâmetros posicionais: trocar por um objeto de opções.

### Aviso sobre o working tree (não é tarefa deste ticket)

Nesta pasta trabalham várias sessões ao mesmo tempo, sem worktree isolado. Em 2026-09-24 havia código **não commitado** de outras sessões nos mesmos arquivos deste ticket (`fonte/simulada.ts`, `fonte/roteiros.ts`, `fonte/dados-demo.ts`, `components/casca.tsx`, `App.test.tsx`):

- Estado do Agente (trabalhando/detectou) durante a Conversa e a Coordenação, links "Ver Conversa" na Atividade e `respostaDireta(texto)` em `roteiros.ts`. **Não há ticket dono identificado**: pergunte ao usuário antes de commitar.
- Logo do Workspace na barra lateral a partir do onboarding: pertence ao ticket 01 de `.scratch/onboarding-pos-login/` (anotado lá).

Ao commitar qualquer coisa, **não use `git add` no arquivo inteiro** quando ele misturar trabalho de tickets diferentes. Monte só as suas mudanças no índice e valide o snapshot commitado isolado (`git archive` do commit), não o working tree. Neste ticket, um commit de arquivo inteiro levou código alheio e deixou o commit sem compilar sozinho.

