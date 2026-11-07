# 13: Criar Agente pela Conversa

**What to build:** O usuário pede a um Agente "crie um Agente que…" e recebe um Agente novo, gravado e pronto para conversar, criado pela mesma operação da tela.

**Blocked by:** 08, 10.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, user stories 6–8, 28, 41.

## Critérios de aceite

- [ ] Existe uma ferramenta de criação de Agente que usa a operação única do ticket 08, com as mesmas regras de quem pode criar.
- [ ] O Agente distingue explorar uma configuração de pedir a criação: discutir uma ideia não cria Agente.
- [ ] Só responde que criou depois que o Agente está gravado, e mostra como abri-lo.
- [ ] Repetir o pedido após reconexão ou recarregar a página não cria dois Agentes.
- [ ] O Agente criado não herda autorizações, Memória nem acessos do Agente que o criou.
- [ ] Falha na criação é apresentada com o motivo real (falta de permissão, nome em uso, indisponibilidade).

## Pode mexer

Ferramenta nova, regras do prompt sobre intenção de criar, testes.

## Não mexa

Operação de criação (ticket 08), Modelos de Agente (ticket 14).

## Validação

Testes do worker: pedido de criação chama a ferramenta e o Agente aparece gravado; conversa exploratória não cria; repetição não duplica. Aceite com Hermes real registrado nos Comments.
