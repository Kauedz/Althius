// Avalia a geração do Contexto da empresa com o modelo de verdade (contexto-da-empresa, tickets 02 e 08).
// Roda os seis casos fictícios de `supabase/functions/company-context-generation/__fixtures__/sites.ts` pelo mesmo
// caminho da Edge Function (leitura do site → prompt → conferência da saída), mostra os três textos e o que a rubrica
// automática achou. O resultado é revisado por uma pessoa, que registra a decisão no ticket 08.
//
// Uso (as chaves vêm do ambiente; nunca escreva a chave no comando):
//   OPENAI_API_KEY=... OPENAI_MODEL=... deno run --allow-env --allow-net scripts/avaliar-contexto-da-empresa.ts [id-do-caso]
import { escolherLlmDosSinais } from '../supabase/functions/_shared/cascata-de-sinais/index.ts'
import { gerar } from '../supabase/functions/company-context-generation/handler.ts'
import { CASOS, conferirRubrica, fetchDoCaso } from '../supabase/functions/company-context-generation/__fixtures__/sites.ts'

const llm = escolherLlmDosSinais({
  env: (nome) => (nome === 'SIGNALS_LLM_PROVIDER' ? 'openai' : Deno.env.get(nome)),
  admin: { rpc: () => Promise.resolve({ data: null, error: { message: 'sem banco na avaliação' } }) },
  log: (campos) => console.error(JSON.stringify(campos)),
})
if (!llm) {
  console.error('Defina OPENAI_API_KEY e OPENAI_MODEL no ambiente.')
  Deno.exit(2)
}

const filtro = Deno.args[0]
let reprovados = 0
for (const caso of CASOS.filter((c) => !filtro || c.id === filtro)) {
  const resultado = await gerar({ site: caso.dominio, workspaceId: '00000000-0000-4000-8000-000000000000', llm, fetchFn: fetchDoCaso(caso) })
  const problemas = conferirRubrica(caso, resultado)
  if (problemas.length) reprovados++
  console.log(`\n=== ${caso.id} (${caso.tipo}) — ${problemas.length ? 'REVISAR' : 'rubrica automática ok'}`)
  console.log(`páginas: ${resultado.fontes.join(', ') || '(nenhuma)'} · falha: ${resultado.falha ?? '-'} · custo US$ ${resultado.custoUsd.toFixed(4)}`)
  for (const problema of problemas) console.log(`  ! ${problema}`)
  if (resultado.textos) {
    console.log(`\n--- Empresa\n${resultado.textos.empresa}\n\n--- Perfil de cliente ideal\n${resultado.textos.icp}\n\n--- Personas\n${resultado.textos.personas}`)
  }
}
console.log(`\n${reprovados} caso(s) para revisar. Registre a revisão humana no ticket 08.`)
