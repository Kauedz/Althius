# 03: Testes do app e prints do cartão do Lusha

**What to build:** `src/paginas/conexoes-lusha.test.tsx`, no formato de `conexoes-clay.test.tsx`, cobrindo:
- habilitar (Admin) e "Só um Administrador habilita." (Membro);
- os dois botões;
- a chave aceita, a recusada e a mal formada;
- OAuth: as voltas ok, recusada, expirada e indisponível;
- conectado, com as ferramentas todas "Escreve ou gasta";
- precisa reconectar;
- desconectar, com e sem o aviso de revogação.

Prints em `prints/03-*.jpg`, pelo mesmo dublê temporário do Clay.

**Blocked by:** 01, 02.

**Status:** ready-for-agent

## Pode mexer
- `projeto-althius-frontend/src/paginas/conexoes-lusha.test.tsx`, `.scratch/conector-lusha/issues/prints/`

## Não mexa
- Os testes existentes de Conexões.

## Comments
