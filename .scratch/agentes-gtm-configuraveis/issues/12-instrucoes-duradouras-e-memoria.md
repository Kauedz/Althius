# 12: Instruções duradouras pela Conversa e Memória na Execução

**What to build:** O usuário ensina o Agente pela Conversa ("a partir de agora, faça X") e isso vira instrução salva, que ele vê e corrige depois; instruções e Memória do Agente passam a valer em toda Execução dele.

**Blocked by:** 07, 10.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, user stories 9–13; seção "Onde a integração limita o Hermes hoje", item 5.

## Critérios de aceite

- [ ] Um pedido de orientação duradoura na Conversa grava a instrução no Agente e mostra o resultado da atualização ao usuário.
- [ ] Uma ideia discutida sem pedido de mudança não altera nada.
- [ ] O usuário consulta e corrige as instruções salvas pelos controles existentes de Personalização.
- [ ] Em toda Execução, o Hermes recebe as instruções salvas e a Memória daquele Agente; nunca as de outro Agente, de outro dono ou de outro Workspace.
- [ ] Texto de páginas, arquivos e resultados de ferramentas não altera instruções nem Memória por conta própria.
- [ ] Pedido para mudar o Contexto da empresa na Conversa não grava nele; o Agente explica que só o Administrador muda, nas Configurações.
- [ ] Repetir o pedido após reconexão não duplica a instrução.

## Pode mexer

Ferramenta nova de instrução do Agente, montagem das instruções no worker, funções de Personalização e Memória (aditivas), seção de configuração do Agente (textos e estados).

## Não mexa

Contexto da empresa, Memória do Workspace e suas regras administrativas, layout.

## Passos do Nan

- Aplicar migration no remoto, se houver, seguindo `docs/agents/migrations.md`.

## Validação

Testes do worker: instrução pedida na Conversa é gravada; Memória e instruções chegam à chamada do Hermes; Agente de outro usuário não as recebe. pgTAP: só o dono altera instruções do próprio Agente. Testes da raiz do app: instrução salva aparece e pode ser corrigida.
