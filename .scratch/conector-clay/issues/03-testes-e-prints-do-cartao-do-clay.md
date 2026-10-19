# 03: Testes do app e prints do cartão do Clay

**What to build:** cobertura do cartão do Clay no Workspace operacional, no formato de `conexoes-notion.test.tsx`: não habilitada (Admin e Membro), habilitar, sem Acesso (só "Conectar no Clay", sem chave de API e sem Sincronização), conectado, ferramentas (todas marcadas como gasto), precisa reconectar, voltas ok, recusada, expirada e indisponível, desconectar e desconectar com aviso de revogação. Prints em `prints/03-*.jpg`.

**Blocked by:** 01, 02.

**Status:** ready-for-agent (feito; vira closed no merge do PR. A conta real fica no 04)

- [x] `src/paginas/conexoes-clay.test.tsx` verde (11 casos). Os dois de desconectar falharam antes da mudança na Fonte e na tela.
- [x] Prints numa janela alta de 1400×1150, linkados aqui.

## Pode mexer
- `projeto-althius-frontend/src/paginas/conexoes-clay.test.tsx`, `src/test/conexoes-no-banco.ts`, `.scratch/conector-clay/issues/prints/`

## Não mexa
- Os testes existentes do Notion e do HubSpot.

## Comments

**19/10/2026 (agente).** Prints feitos com o dublê do Supabase (`criarSupabaseFalso`), servido por uma página temporária fora do PR e capturado pelo Chrome headless a 1400×1150. A janela é alta porque o cartão do Clay fica abaixo da dobra a 1400×900. O Clay aparece "disponível" no dublê, como ficará depois do ticket 04; no remoto ele continua oculto.

[não habilitada (Admin)](prints/03-nao-habilitada.jpg), [não habilitada (Membro)](prints/03-nao-habilitada-membro.jpg), [não conectado](prints/03-nao-conectado.jpg), [conectado](prints/03-conectado.jpg), [ferramentas, todas "Escreve ou gasta" com "Pedir aprovação"](prints/03-ferramentas.jpg), [precisa reconectar](prints/03-precisa-reconectar.jpg), [volta ok](prints/03-volta-ok.jpg), [consentimento recusado](prints/03-volta-recusada.jpg), [tentativa vencida](prints/03-volta-expirada.jpg), [Clay indisponível](prints/03-volta-indisponivel.jpg), [depois de desconectar](prints/03-depois-de-desconectar.jpg) e [aviso quando o Clay não confirma a revogação](prints/03-aviso-revogacao.jpg).

Os nomes das ferramentas do print (`find-and-enrich-company`, `find-and-enrich-person`) são ilustrativos. A documentação do Clay não lista as ferramentas; a lista real vem do `tools/list` no ticket 04.
