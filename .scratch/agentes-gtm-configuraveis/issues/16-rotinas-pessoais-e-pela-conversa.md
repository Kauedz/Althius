# 16: Rotinas pessoais e pela Conversa

**What to build:** O usuário pede "toda segunda às 8h, faça X" e o Agente cria uma Rotina dele, que o usuário consulta, edita, pausa e retoma pelos controles existentes; a Rotina só roda sozinha com autorização e Teto.

**Blocked by:** 07, 10.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, user stories 35–37.

## Critérios de aceite

- [ ] O dono de um Agente cria, edita, pausa, retoma e apaga Rotinas do próprio Agente sem ser Administrador.
- [ ] Existe uma ferramenta de criar Rotina pela Conversa, com agenda explícita; o Agente só confirma depois de gravada.
- [ ] Definir uma função ou instrução não cria Rotina.
- [ ] A execução automática continua exigindo autorização e Teto; sem Teto, a Rotina fica criada e indica a pendência.
- [ ] Repetir o pedido após reconexão não cria duas Rotinas.
- [ ] Rotinas de outro dono não podem ser alteradas.

## Pode mexer

Funções de Rotina (aditivas), ferramenta nova, seção de Rotinas (textos e estados), Fonte de Agentes.

## Não mexa

Relógio de Rotinas além do necessário para respeitar o dono, regras de Teto e Créditos, layout.

## Passos do Nan

- Aplicar a migration no remoto seguindo `docs/agents/migrations.md`.

## Validação

pgTAP: dono gerencia as próprias Rotinas; sem Teto não roda sozinha; repetição não duplica. Testes do worker: pedido de Rotina cria e a definição de função não cria. Testes da raiz do app: pausar e retomar.
