# 01: Data do Diário Oficial

**What to build:** A publicação do Diário Oficial traz a data `dd/mm/aaaa`. O passo lê esse formato primeiro e, se não for esse, uma data ISO. Data impossível (31/02, mês 13) não vira publicação. A frase exata do termo continua obrigatória: a amostra real de 13/10/2026 não contém "licença de instalação" seguida e não vira Sinal. Um item igual com a frase no resumo vira, com `quando` em 13/10/2026 ao meio-dia UTC. A amostra fica em `supabase/functions/_shared/cascata-de-sinais/__fixtures__/dou_brasildados.json`.

**GATE:** nenhum bloqueio. Não editar `src/**/sinais/**`, a RPC de Sinais de mercado, `proposta_recusada` nem `catalogo.ts`. Sem deploy. Sem aplicar migração. Sem segredo.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Pode mexer

- O leitor de data compartilhado (`passos/data-dou.ts`) e os passos do Diário Oficial que o usam (`icp-c.ts`, `icp-e-licencas.ts`).
- O teste `passos/dou.test.ts` e a fixture.
- Este ticket.

## Não mexa

- A frase exata do termo (não soltar para ocorrências soltas).
- A janela em horas que já existe (`dentroDoPeriodo`).
- Catálogo e telas de Sinais.
- Migrações já escritas, segredos, Auth, deploy e o projeto remoto.

## Critérios

- [x] Cada item da amostra real tem `data` `13/10/2026` e vira `2026-10-13T12:00:00.000Z`, dentro de uma janela de 3 dias a partir de 13/10/2026 18:00 UTC.
- [x] A amostra crua normaliza para lista vazia. O clone com a frase no resumo vira uma publicação, com a URL original.
- [x] ISO continua válida. `31/02/2026` e `13/13/2026` não passam.

## Passos do Nan

Nenhuma migração neste ticket. O código entra no mesmo deploy do ticket 04: `signal-cascade` e `signal-runner`, sem `--no-verify-jwt`. Não marcar cascata como disponível.

## Comments

- A amostra anexada (`dou_brasildados.json`, 10 itens, actor `brasildados~dou-monitor`, entrada `{q:["licença de instalação"], s:"DO1"}`) não tem a frase contígua. O teste documenta isso de propósito.
