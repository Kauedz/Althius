#!/usr/bin/env bash
# Adapta um teste pgTAP de supabase/tests para rodar no projeto remoto pelo execute_sql do MCP do Supabase.
# Cada asserção vai para uma tabela temporária; o fim devolve falhas, total e o detalhe das que falharam,
# e desfaz tudo com rollback.
# Uso: scripts/pgtap-no-remoto.sh supabase/tests/<arquivo>.sql > /caminho/do/rascunho/<arquivo>.sql
set -euo pipefail

arquivo=${1:?informe o arquivo de teste}

# O teste termina com "select * from finish();" e "rollback;"; essas duas linhas dão lugar ao resumo.
if [ "$(tail -n 2 "$arquivo" | tr -d '[:space:]')" != "select*fromfinish();rollback;" ]; then
  echo "o teste precisa terminar com 'select * from finish();' e 'rollback;'" >&2
  exit 1
fi
if ! grep -qx 'set local search_path = extensions, public;' "$arquivo"; then
  echo "o teste precisa ter a linha 'set local search_path = extensions, public;'" >&2
  exit 1
fi

asseccoes='is|isnt|ok|pass|fail|matches|imatches|cmp_ok|throws_ok|throws_like|lives_ok|results_eq|set_eq|bag_eq'
head -n -2 "$arquivo" \
  | sed -E "s/^select ($asseccoes)\(/insert into _tap(linha) select \1(/" \
  | sed -E '0,/^set local search_path = extensions, public;$/s//set local search_path = extensions, public;\ncreate temp table _tap(ordem serial, linha text);\ngrant all on _tap to public;\ngrant all on sequence _tap_ordem_seq to public;/'
cat <<'SQL'
reset role;
select num_failed() as falhas, (select count(*) from _tap) as total,
  (select string_agg(linha, ' || ' order by ordem) from _tap where linha like 'not ok%') as detalhe;
rollback;
SQL
