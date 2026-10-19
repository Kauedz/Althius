# 02: Testes do app e prints do cartão do Meta Ads

**What to build:** `src/paginas/conexoes-meta-ads.test.tsx` cobrindo:
- habilitar e Membro;
- só "Conectar no Meta Ads", sem chave de API;
- "Precisa configurar";
- conectado e ferramentas, todas "Escreve ou gasta";
- precisa reconectar;
- voltas ok, recusada, expirada e indisponível;
- desconectar sem aviso, porque não há revogação.

Prints em `prints/02-*.jpg`.

**Blocked by:** 01.

**Status:** ready-for-agent (feito; vira closed no merge)

## Pode mexer
- `projeto-althius-frontend/src/paginas/conexoes-meta-ads.test.tsx`, `.scratch/conector-meta-ads/issues/prints/`

## Comments

**19/10/2026 (agente).**
- `src/paginas/conexoes-meta-ads.test.tsx`, 12 casos: Admin e Membro; só o Facebook Login; "Precisa configurar" sem o App ID, que fica na tela com a mensagem; conectado; ferramentas, todas como gasto; reconectar; voltas; desconectar sem aviso (`nao_suportado`).
- `tsc -b` limpo.
- Prints: [não conectado](prints/02-nao-conectado.jpg), [precisa configurar](prints/02-precisa-configurar.jpg), [conectado](prints/02-conectado.jpg), [ferramentas](prints/02-ferramentas.jpg), [precisa reconectar](prints/02-precisa-reconectar.jpg) e [depois de desconectar](prints/02-depois-de-desconectar.jpg).
