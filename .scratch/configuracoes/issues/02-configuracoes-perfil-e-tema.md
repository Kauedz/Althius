# 02: Configurações, perfil e tema persistentes

**What to build:** Integrar a área de Configurações aprovada ao aplicativo e permitir editar perfil e tema, refletindo as alterações na identidade exibida e preservando-as ao recarregar.

**Blocked by:** 01: Mockup de Configurações e aprovação visual

**Status:** ready-for-agent

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

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
- [~] Verificar pelo aplicativo completo navegação, salvar/cancelar, avatar, validação e persistência após remontagem; inspecionar ambos os temas e executar os checks aplicáveis. (a inspeção visual em navegador não foi feita nesta entrega — ver Comments.)

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

- Testes novos: `src/paginas/configuracoes/configuracoes.test.tsx` (10 testes — navegação, mesma fonte no formulário e no menu, salvar/cancelar/validação, foto, persistência entre remontagens, tema sincronizado com a Casca).
- Teste de tema em `App.test.tsx` atualizado: o comportamento mudou de "não persiste" para "persiste e sincroniza após remontar".
- Suíte completa do frontend: `vitest run` — 234 testes, 20 arquivos, todos passando (rodado com `--maxWorkers=4`; sob concorrência máxima da caixa de execução, o runner ficou instável em arquivos que não têm relação com este ticket — sinal de contenção de recursos do ambiente, não de regressão).
- `tsc --noEmit` (typecheck do projeto): sem erros.
- `npm run build`: build de produção concluído sem erros (aviso pré-existente de chunk grande, não relacionado a esta entrega).
- `oxlint`: sem erros novos (só os avisos `only-export-components`/`purity` já existentes em outros arquivos do projeto).
- **Não realizado:** inspeção visual em navegador (claro/escuro) — este ambiente não tinha um navegador headless disponível para capturas, ao contrário do que foi feito no ticket 01. As telas novas reutilizam só componentes e classes utilitárias (`campo`, `rotulo`, `selo`, `text-al-erro`, `text-al-sucesso`, `AvatarDePessoa`, `Pagina`, `AbasSublinhadas`, `Button`) já usados e comprovados em ambos os temas no restante do aplicativo, sem CSS novo. Recomendo uma conferência visual manual (`npm run dev`, alternar tema) antes de considerar este item 100% fechado.

