/// <reference types="node" />
// Só para os testes de paridade: acha, nas migrations, a ÚLTIMA definição de uma função do banco. As constantes de limite foram
// redefinidas por migrations novas (`create or replace function`), e a migration que as criou não é editada; o teste confere o
// que vale hoje, não o arquivo em que elas nasceram.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const MIGRATIONS = path.resolve(import.meta.dirname, '../../../supabase/migrations')

/** O corpo da última definição de `esquema.funcao`, do `create` ao `$$;` final. Falha se nenhuma migration a define. */
export function ultimaDefinicaoNoBanco(funcao: string): string {
  const inicio = new RegExp(`create (or replace )?function ${funcao.replace('.', '\\.')}\\(`)
  let achado: string | null = null
  for (const nome of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join(MIGRATIONS, nome), 'utf8')
    // Uma migration pode definir a função mais de uma vez; vale a última dentro do arquivo.
    const todos = [...sql.matchAll(new RegExp(inicio.source, 'g'))]
    if (todos.length === 0) continue
    const posicao = todos[todos.length - 1].index
    achado = sql.slice(posicao, sql.indexOf('\n$$;', posicao))
  }
  if (achado === null) throw new Error(`nenhuma migration define ${funcao}`)
  return achado
}
