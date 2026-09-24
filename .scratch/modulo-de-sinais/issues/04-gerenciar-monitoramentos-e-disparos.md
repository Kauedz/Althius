# 04: Gerenciar vários Monitoramentos e simular disparos

**What to build:** configurar vários Monitoramentos independentes do mesmo tipo, escolher seu público, revisar e controlar seu estado, acompanhando os sinais simulados produzidos nas Contas-alvo.

**Blocked by:** 02 — Derivar Quente dos sinais, separado da Aderência; 03 — Configurar o primeiro Monitoramento de vagas.

**Status:** closed

- [x] Criar dois ou mais Monitoramentos do mesmo tipo com nomes, públicos e critérios distintos; listar na página do tipo e editar um sem alterar os demais.
- [x] Permitir acompanhar listas, descobrir empresas por perfil ou combinar ambos. Oferecer público recomendado simulado sempre que houver escolha de público, nos três modos.
- [x] Salvar Rascunho, revisar público e critérios antes da ativação, pausar e retomar independentemente. Refletir estados visíveis e contar somente Monitoramentos Ativos no card correspondente.
- [x] Usar exemplos de descoberta associados a Contas-alvo simuladas de origem recomendada, sempre com Fit. Exemplos importados podem ter qualquer Aderência ou ainda não terem avaliação.
- [x] Produzir disparos por cenários simulados controláveis, apenas para Monitoramentos Ativos, alimentando o armazenamento compartilhado e as projeções de Contas e Contatos. Não introduzir coleta externa ou agendamento real.
- [x] Pausar impede novos disparos simulados desse Monitoramento e preserva sinais existentes, datas e validade. Retomar não renova sinais já encontrados nem duplica acontecimentos compartilhados entre Monitoramentos.
- [x] Exibir evidências como simuladas, sem afirmar coleta real concluída ou transformar hipótese de necessidade em certeza de compra.
- [x] Testar criação e edição independentes, revisão/ativação, pausa/retomada, contagem de ativos, os três públicos e consistência dos disparos na Conta-alvo pelo aplicativo renderizado com fontes injetadas e data fixa.
- [x] Verificar erros recuperáveis nas operações sem perda das configurações já salvas. Executar testes pertinentes, build e lint, e revisar visualmente a densidade dos Monitoramentos conforme a aprovação do ticket 01.

## Comments

### Implementação concluída

- **FonteDeSinais simulada e Disparos (`simulada-sinais.ts` / `sinais-tipos.ts`):**
  - Implementada a operação `simularDisparo(parametros)` com validação estrita de que apenas Monitoramentos com `estado === 'ativo'` produzem disparos.
  - Suporte a `acontecimentoId`: quando um acontecimento já existente é reencontrado (pelo mesmo ou por outro monitoramento), preserva a data original de disparo e validade, registrando `reencontrado` sem duplicar na conta.
  - Sincronização direta e bidirecional com a `FonteDeContas`: novos disparos alimentam `adicionarSinal(...)` mantendo as projeções de Quente e total de sinais válidos, preservando a aderência de cada conta (recomendadas sempre Fit; importadas com Fit, Não-fit ou não avaliadas).
  - Tratamento de erro simulado e observabilidade pub/sub via `notificar()`.
- **Interface e Fluxos (`editor.tsx`, `pagina-do-tipo.tsx`, `conta-com-sinais.tsx`, `pagina-sinais.tsx`):**
  - Múltiplos monitoramentos independentes do mesmo tipo: edição de um não altera nomes, públicos nem critérios dos outros.
  - 3 modos de público suportados (`listas`, `descoberta`, `ambos`), com recomendação de público simulada ofertada em todos.
  - Rascunhos e revisão prévia com modal de ativação preservando todas as entradas em caso de erro recuperável.
  - Pausa e retomada independentes, refletindo imediatamente na contagem de ativos e bloqueando disparos para monitoramentos pausados.
  - Evidências claramente rotuladas como simuladas sem falsa promessa de coleta externa.
- **Qualidade e Testes:**
  - Suite dedicada `gerenciar-monitoramentos-disparos.test.tsx` com 7 testes ponta a ponta cobrindo todos os requisitos.
  - 242 testes passando em 21 arquivos de teste da aplicação.
  - `npm run lint` com 0 erros.
  - `npm run build` concluído com sucesso.

