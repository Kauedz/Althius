# 03: Testes do app e prints do cartão do Apollo

**What to build:** `src/paginas/conexoes-apollo.test.tsx`, nos mesmos estados de `conector-lusha/03`, mais o aviso da chave mestra. Prints em `prints/03-*.jpg`.

**Blocked by:** 01, 02.

**Status:** ready-for-agent (feito; vira closed no merge)

## Pode mexer
- `projeto-althius-frontend/src/paginas/conexoes-apollo.test.tsx`, `.scratch/conector-apollo/issues/prints/`

## Comments

**19/10/2026 (agente).**
- `src/paginas/conexoes-apollo.test.tsx`, 10 casos: Admin e Membro; os dois caminhos; OAuth indo ao consentimento do Apollo; a chave mestra com o aviso; o aviso genérico substituído; ferramentas todas como gasto; reconectar; as voltas recusada, expirada e indisponível; desconectar com o aviso de revogação.
- Os dois casos do aviso falharam antes do `AVISO_DA_CHAVE`.
- Suíte de Conexões: 75/75. Um teste antigo do Notion ("a volta da autorização confirma…") falhou uma vez sob carga e passou nas 3 rodadas seguintes; é intermitente e não tem relação com esta mudança.
- `tsc -b` e oxlint limpos.
- Prints (dublê, 1400×1150): [não conectado](prints/03-nao-conectado.jpg), [diálogo da chave](prints/03-dialogo-chave.jpg), [conectado](prints/03-conectado.jpg), [ferramentas](prints/03-ferramentas.jpg), [precisa reconectar](prints/03-precisa-reconectar.jpg), [aviso de revogação](prints/03-aviso-revogacao.jpg) e [consentimento recusado](prints/03-volta-recusada.jpg). Os nomes das ferramentas são ilustrativos.
