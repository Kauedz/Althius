# Menções com vários Agentes na mesma Conversa (PR-11)

## Causa raiz

O worker do Hermes roda na VPS com `HERMES_UMA_CHAMADA=true` (o modo de uma chamada só). Nesse modo, a Conversa na
página de um Agente grava uma fala só, do anfitrião; o @mencionado vira só uma frase no prompt e nunca fala (Execução
`17d046e5…`, 13/10: `mentions` com um Agente, um evento `texto` só, nenhuma rodada).

## Decisão

1. **Por Agente de verdade:** a Execução com Menção (`mentions` não vazio) ou da página de um Agente (`kind = 'agente'`)
   vai sempre para `processarPorAgente` (`conversarNaPagina` / `coordenarPedido`), mesmo com `HERMES_UMA_CHAMADA=true`.
   O modo de uma chamada só vale para o pedido da Coordenação sem Menção.
2. **Fallback de uma chamada:** se `processar` (uma chamada) receber `kind = 'agente'` com Menções, pede o mesmo JSON de
   etapas da Coordenação e grava uma fala por Agente (`registro.texto(agenteId, ...)`), cada uma cobrada como rodada.
3. **Agente chama Agente:** o Agente que responde pode escrever "@Nome" de outro; o worker reconhece pela mesma regra do
   app (`reconhecerMencoes`, portada para `_shared/mencoes.ts`) e põe o mencionado na rodada seguinte, até
   `MAX_RODADAS_DO_PEDIDO` (3) e no máximo 4 participantes na Conversa (`MAX_PARTICIPANTES_DA_CONVERSA`).
4. **Cobrança por fala:** cada fala abre e fecha a rodada pelo `cobrandoOsCreditos` (1 crédito; 3 no provedor
   Anthropic, pela regra que o banco já tem em `begin_agent_round`).
5. **Tela:** cada fala já sai com o nome e o ícone do Agente; o indicador passa a dizer quem está na vez: "Rhetor está
   respondendo" (o anfitrião, depois cada mencionado que ainda não falou).

## Operação (fora do PR)

Depois do merge: publicar o worker na VPS (`/opt/althius-hermes`) e decidir com o Kauê se `HERMES_UMA_CHAMADA` sai do
ambiente. O PR não muda o ambiente; com a correção, a variável só afeta a Coordenação sem Menção.

## Fora

Migração (nenhuma é necessária), conectores, segredos, deploy, ambiente da VPS, merge, estrutura do app.
