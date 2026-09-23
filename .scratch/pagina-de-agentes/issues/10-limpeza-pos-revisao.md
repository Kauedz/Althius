# 10: Limpeza pós-revisão

**What to build:** três limpezas de código que a revisão da branch (tickets 01–08) apontou, sem mudar comportamento. Os testes existentes devem continuar passando sem alteração de asserções.

1. **Um só cartão de Aprovação.** `AprovacaoNaConversa` (`paginas/conversa-coordenada.tsx`) e `CartaoDeAprovacao` (`paginas/secoes/conversa.tsx`) repetem a mesma busca da Aprovação, o mesmo rótulo (`'Aprovação pendente'` ou `ROTULO_DA_DECISAO[...]`), a ação, o impacto e `DecisaoDeAprovacao`. Extrair um componente comum e usá-lo nos dois lugares. A busca de Agentes por id (`Object.fromEntries(agentes.map(...))`), também repetida nesses dois arquivos, vai junto se couber.
2. **`agenteId` que guarda uma Especialidade.** Em `fonte/roteiros.ts`, o campo `agenteId` de `PassoDeRoteiro` guarda um `EspecialidadeId` (ex.: `respostaGenerica` escreve `agenteId: especialidadeId`). Renomear o campo para refletir o que ele guarda, ou separar os tipos, de modo que o nome não contradiga o tipo.
3. **"fio" vira Conversa.** "fio" não é termo do glossário: é a própria Conversa coordenada. Renomear no código (ex.: `pedidosDoFio` → `pedidosDaConversa`, `conversarCoordenado(pedido, fio)` → `conversarCoordenado(pedido, conversa)`) e no README (`src/conversa/`: "estado das Conversas e do fio da Coordenação"). Os tickets e comentários antigos ficam como estão.

**Blocked by:** nenhum

**Status:** ready-for-agent

- [ ] Existe um só componente para mostrar uma Aprovação dentro de uma Conversa, usado na Conversa direta e na coordenada
- [ ] Nenhum campo chamado `agenteId` guarda um `EspecialidadeId`
- [ ] Nenhum identificador nem texto do código usa "fio"
- [ ] `npm test` e `npm run build` passam

## Comments

**Origem (23/09/2026):** achados de padrões da revisão de `0941f6c...HEAD`. "fio" e "etapa" ficam fora do CONTEXT.md; "etapa" continua como termo de implementação.
