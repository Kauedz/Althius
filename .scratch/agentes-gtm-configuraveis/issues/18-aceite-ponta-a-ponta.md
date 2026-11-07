# 18: Aceite ponta a ponta com o Hermes real e regressão visual

**What to build:** Provar o fluxo completo da spec com o Hermes de verdade e mostrar que o layout não mudou.

**Blocked by:** 09, 11, 12, 15, 16, 17.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, Testing Decisions.

## Critérios de aceite

- [ ] Com Hermes real e contas de validação, num só percurso registrado: abrir um site, pesquisar informação atual, combinar Contexto da empresa e arquivo, criar Agente pela Conversa, salvar instrução, copiar Modelo compartilhado, executar ação sujeita a Aprovação e configurar e pausar uma Rotina.
- [ ] Cada passo tem evidência de ferramenta e de persistência; resposta dizendo que o Agente pode agir não conta.
- [ ] Repetir um pedido após reconexão não duplica criação nem efeito externo; recusa, expiração ou revogação de acesso impedem o efeito; site indisponível gera limitação específica.
- [ ] O inventário do ticket 02 está atualizado com o que ficou disponível de ponta a ponta.
- [ ] Medições registradas: tempo até o primeiro progresso e até a conclusão, recusas indevidas, interrupções desnecessárias e custo por tarefa.
- [ ] Comparação visual antes e depois das superfícies de Agentes (grade, página do Agente, Conversa com ferramentas, Rotinas, Novo agente) a 1400×900 e 360px mostra o layout preservado.
- [ ] O interruptor do modo antigo de ferramentas (ticket 10), se existir, é retirado ou fica documentado.

## Pode mexer

Testes de aceite, prints, inventário, retirada do interruptor.

## Não mexa

Funcionalidades (correções viram tickets novos).

## Passos do Nan

- Disponibilizar as contas de validação de Integração usadas na Aprovação (o agente diz quais; nunca pede senha no chat).

## Validação

Evidências e prints em `issues/prints/18-*.jpg`, linkados nos Comments.
