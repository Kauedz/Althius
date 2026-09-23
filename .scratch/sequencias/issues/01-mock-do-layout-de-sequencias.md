# 01: Mock do layout de Sequências

**What to build:** um mock descartável do módulo Sequências, para aprovar o visual antes de levá-lo ao app. O mock usa a identidade do Manual da Marca: tokens, Oswald, raio 0 nos campos e os temas escuro e claro. Ele é **simples de criar** uma sequência — experiência leve, sem builder complexo tipo workflow.

O mock mostra as três superfícies espelhadas:

- **Lista "Sequências" no Workspace:** título, descrição curta, contagem, busca, filtro por status e linhas com Conta-alvo, status (Ativa / Pausada / Reunião / Esgotada), cobertura de Contatos e próximo step.
- **Bloco no detalhe da Conta-alvo:** status, cobertura e atalho para o documento; também o estado vazio ("Nenhuma sequência nesta Conta-alvo").
- **Documento da sequência** como **timeline simples** (intenção Apollo.io + Monaco: steps em ordem no tempo, sem copiar identidade visual deles): participantes (Contatos/Personas), regra de pause sempre visível, delays em dias úteis + janela de horários.

No editor de um step, o mock mostra composers por canal — **e-mail, LinkedIn, WhatsApp/SMS e ligação/tarefa** — com:

- variáveis de Conta e Persona inseríveis de forma óbvia;
- assunto/corpo (ou nota de tarefa) para mensagem persuasiva;
- anexo de **imagem/print** e **vídeo** na UI (sem envio real);
- escolha de Contato/Persona do step e delay/janela.

Conta com um único Contato continua válida no mock. Sem Unipile, sem CSV, sem branching rico. Se capturas de Apollo/Monaco forem colocadas em referências do scratch, o mock consulta a intenção, sem copiar marca, dados ou rótulos deles.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] O mock mostra a lista Workspace, o bloco no detalhe da Conta-alvo e o documento em timeline, todos coerentes entre si
- [x] O mock mostra composers de e-mail, LinkedIn, WhatsApp/SMS e ligação/tarefa com variáveis e anexo de imagem/vídeo na UI
- [x] Criar/editar uma sequência no mock parece simples (poucos cliques, sem builder de workflow)
- [x] Delays/janela e a regra de pause (qualquer resposta pausa a Conta inteira) estão visíveis
- [ ] O mock aparece nos dois temas e segue o Manual da Marca
- [x] O mock não entra no app nem nos testes: é descartável
- [ ] O fundador aprovou o visual, e os ajustes decididos foram registrados na spec

## Onde está o mock

`.scratch/sequencias/mock/index.html` — abrir direto no navegador (reaproveita tokens, fontes, logos e avatares do mock de Contas). Parâmetros de atalho: `?view=list|sequence|account`, `&seq=openai`, `&account=figma`, `&theme=claro`, `&empty=1` (lista vazia).

Referência visual pedida pelo fundador: sequência do Monaco/Apollo — timeline à esquerda (steps numerados, "Aguardar N dias úteis" com relógio, data projetada) e composer do step à direita com rótulos inline (Para, Assunto, Mensagem).

## Pontos para o fundador decidir na aprovação

- **Rótulos próximos da referência:** "Aguardar N dias úteis", "Hoje, 23 set." e "Para / Assunto / Mensagem" seguem de perto o Monaco/Apollo, a pedido do fundador. Isso tensiona o "sem copiar rótulos deles" acima.
- **Alvo por Persona:** o "Para:" do step escolhe um Contato participante e mostra a Persona dele. Ainda não existe alvo "por Persona" sem Contato definido.
- **Extras além do ticket:** foram incluídos para a demo, mas pertencem a tickets seguintes e podem sair:
  - Aprovação simulada;
  - "Simular resposta", "Retomar" e "Marcar reunião";
  - métricas de demonstração;
  - coluna Progresso;
  - subtipos do LinkedIn e modo automático/manual do e-mail.
- **Termos em inglês:** "step" e "pause" aparecem na UI, como na spec. É preciso confirmar se ficam assim.
