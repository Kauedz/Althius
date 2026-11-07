# 11: Limites revistos, entregas longas e arquivos inteiros

**What to build:** O Agente conclui tarefas longas e de várias etapas: entregas grandes não são cortadas sem aviso e podem ser vistas inteiras, e os arquivos do usuário chegam completos ao Agente.

**Blocked by:** 10.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, user stories 14, 22, 23; seção "Onde a integração limita o Hermes hoje", item 4.

## Critérios de aceite

- [ ] Cada limite fixo listado na spec (chamadas de ferramenta por pedido, tempo por ferramenta, tamanho do resultado, chamadas ao Hermes por Agente, tempo por chamada e por Execução, Contas-alvo no prompt, tamanho de anexos e de textos de contexto, tamanho da fila de prompts, Execuções simultâneas) foi ampliado ou tem justificativa registrada (custo, segurança, isolamento) nos Comments deste ticket.
- [ ] Resultado de ferramenta ou entrega cortada avisa o corte e o conteúdo inteiro fica consultável pelo usuário na interface existente.
- [ ] O limite de saída configurado chega de fato ao Hermes.
- [ ] Arquivos enviados pelo usuário chegam ao Agente completos, ou com aviso do que ficou de fora; imagens são tratadas conforme o inventário do ticket 02.
- [ ] Cancelamento, retomada e registro de custo continuam funcionando.
- [ ] Medições de tempo até o primeiro progresso e até a conclusão em três tarefas representativas registradas nos Comments (sem meta numérica).

## Pode mexer

Worker, orquestração, camada de ferramentas, persistência de entregas (aditiva), apresentação de entrega longa nas superfícies existentes.

## Não mexa

Layout, regras de Créditos e Teto.

## Passos do Nan

- Aplicar migration no remoto, se houver, seguindo `docs/agents/migrations.md`.

## Validação

Testes do worker: resultado maior que o limite antigo avisa e fica inteiro; tarefa com mais etapas que o limite antigo conclui; arquivo grande chega completo. Conferência visual de uma entrega longa a 1400×900 com prints em `issues/prints/`.
