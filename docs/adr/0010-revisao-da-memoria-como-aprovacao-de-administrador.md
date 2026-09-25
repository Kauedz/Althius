# Revisão da Memória do Workspace como Aprovação sem Integração, decidida só por Administradores

O ICP e as Personas da Memória do Workspace mudam só por proposta do Scopus ou do Ethos. A proposta entra na mesma fila de Aprovações das ações em Integrações, porque já é o lugar em que o Workspace decide o que os Agentes propõem. Ela é outra categoria de Aprovação: não passa por Integração nem por Permissão (ADR 0002), e só um Administrador ativo a decide, validado na operação e não só na tela. Nas demais categorias, qualquer participante continua decidindo. No contrato, `Aprovacao` é uma união de `AprovacaoDeAcao` (com `integracaoId`) e `AprovacaoDeRevisao` (com `revisao`); a regra de quem decide cada categoria fica num lugar só (`podeDecidir`). Decidida, a revisão guarda só o registro: o pedido, quem pediu e quem decidiu. O conteúdo aprovado vira o documento vigente, e o substituído deixa de existir, para a fila não virar um histórico de documentos.

## Considered Options

- Uma fila de revisões própria em Configurações: descartada, porque criaria dois lugares para decidir o que os Agentes propõem e duplicaria avisos e contagem de pendências.
- Qualquer participante decide, como nas ações: descartado, porque o ICP e as Personas mudam o trabalho de todo o Workspace de uma vez.
- Guardar o conteúdo proposto e o anterior nas revisões decididas: descartado, porque viraria uma comparação histórica navegável, que a spec exclui.
