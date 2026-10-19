# 02: reautorizacao de 30 dias e cartao

**What to build:** O cartão do TikTok em "Precisa reconectar" explica "o TikTok pede uma nova autorização a cada 30 dias". `conexoes-tiktok-ads.test.tsx` nos estados de sempre e prints.

**Blocked by:** 01

**Status:** ready-for-agent (feito; vira closed no merge)

## Comments

**19/10/2026 (agente).**
- `AVISO_DE_RECONEXAO` em `conexoes.tsx`: no TikTok Ads, "Precisa reconectar" vem com "O TikTok pede uma nova autorização a cada 30 dias.".
- `src/paginas/conexoes-tiktok-ads.test.tsx`, 12 casos, entre eles: o aviso só aparece no TikTok e só em "Precisa reconectar"; as ferramentas, todas como gasto; as voltas; desconectar com e sem aviso. O caso dos 30 dias falhou antes do aviso.
- Suíte de Conexões: 100/100. `tsc -b` limpo.
- Prints: [não conectado](prints/02-nao-conectado.jpg), [conectado](prints/02-conectado.jpg), [ferramentas](prints/02-ferramentas.jpg) e [precisa reconectar com o aviso](prints/02-precisa-reconectar.jpg).
