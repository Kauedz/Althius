# Revisão da Memória do Workspace como Aprovação sem Integração, decidida só por Administradores

O ICP e as Personas da Memória do Workspace mudam só por proposta do Scopus ou do Ethos. A proposta entra na mesma fila de Aprovações das ações em Integrações, porque já é o lugar em que o Workspace decide o que os Agentes propõem. Ela é outra categoria de Aprovação: não passa por Integração nem por Permissão (ADR 0002), e só um Administrador ativo a decide, validado na operação e não só na tela. Nas demais categorias, qualquer participante continua decidindo. No contrato, `Aprovacao` é uma união de `AprovacaoDeAcao` (com `integracaoId`) e `AprovacaoDeRevisao` (com `revisao`); a regra de quem decide cada categoria fica num lugar só (`podeDecidir`). Decidida, a revisão guarda só o registro: o pedido, quem pediu e quem decidiu. O conteúdo aprovado vira o documento vigente, e o substituído deixa de existir, para a fila não virar um histórico de documentos.

## Considered Options

- Uma fila de revisões própria em Configurações: descartada, porque criaria dois lugares para decidir o que os Agentes propõem e duplicaria avisos e contagem de pendências.
- Qualquer participante decide, como nas ações: descartado, porque o ICP e as Personas mudam o trabalho de todo o Workspace de uma vez.
- Guardar o conteúdo proposto e o anterior nas revisões decididas: descartado, porque viraria uma comparação histórica navegável, que a spec exclui.

## Atualização: no Workspace operacional, as ações também são do Administrador (CRM-15)

Decisão do Nan (2026-10-01): no Workspace operacional, só um Administrador ativo decide também as Aprovações de ação, e não mais qualquer participante. O banco confere o papel ao decidir (`decide_approval`) e de novo antes de executar (`claim_approved_action`). Na tela, a fila `/aprovacoes` e o cartão da Aprovação no passo da Conversa mostram Aprovar e Recusar só ao Administrador; um Membro vê a Aprovação e o aviso de que só um Administrador a decide. Como a Conversa é de quem a começou, a Aprovação pedida na Conversa de um Membro é decidida pelo Administrador na fila. Na Demonstração, as ações continuam como antes, decididas por qualquer participante. A regra continua num lugar só: `podeDecidir` recebe também o ambiente e, sem ele, aplica a do Workspace operacional. O que mudou em relação ao texto acima: "nas demais categorias, qualquer participante continua decidindo" passa a valer só na Demonstração.
