# 07: Conversar pelo WhatsApp (um Workspace, leitura)

**What to build:** Edge `canal-whatsapp-events`; reserva do `wamid`; PARAR/VOLTAR/AJUDA sem IA; número desconhecido com recusa curta e teto diário; `start_channel_run`; entrega por `canal-delivery`. Primeiras ferramentas de leitura: Créditos, Contas-alvo, Sinais, "quem respondeu". Veja a [spec](../spec.md) e o [ADR-0027](../../../docs/adr/0027-canal-whatsapp-com-controle-total.md).

**Blocked by:** 02 a 06.

**Status:** ready-for-human

- [x] Recusas sem Execução e sem Crédito
- [x] "ainda estou trabalhando"
- [x] Conversa no app com origem WhatsApp e composer desabilitado
- [x] pgTAP e Deno

## Comentário (2026-10-24)

Implementados o webhook WhatsApp simulado com reserva idempotente, reconhecimento do telefone, seleção persistida de Workspace, comandos PARAR/VOLTAR/AJUDA, recusa de número desconhecido, abertura coordenada, entrega e leitura da Conversa no app. A migration `20261122130700_conversar_pelo_whatsapp.sql` acrescenta a persistência e os RPCs do canal; não foi aplicada remotamente. Os quatro critérios acima foram conferidos por testes/código. `npm run lint` e `npx tsc -b` passaram; os testes Vitest focados passaram (13/13), e o pgTAP completo passou. Na suíte Vitest completa houve 1 falha em `src/conversa/gaveta-de-historico.test.tsx` (estado de carregamento ao procurar uma linha do Slack); 220 arquivos e 1.951 testes passaram, 4 foram ignorados. Deno completo passou antes das últimas alterações e os testes/checks Deno focados passaram depois delas.

Revisão do diff: sem violação de padrão documentado. Permanecem fora desta entrega a ligação explícita das ferramentas Créditos e “quem respondeu” ao catálogo do Agente e o mecanismo de avisos `channel_notices`; validar esses itens antes de considerar toda a solução da spec concluída.
