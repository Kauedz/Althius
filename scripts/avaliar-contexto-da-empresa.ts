// Avalia a geração do Contexto da empresa com o modelo de verdade (contexto-da-empresa, tickets 02 e 08).
// Roda os seis casos fictícios de `supabase/functions/company-context-generation/__fixtures__/sites.ts` pelo mesmo
// caminho das Edge Functions: leitura do site → os três textos → preparação da busca do Mercado (o ICP gerado vira
// filtros). Aplica as duas rubricas automáticas (textos e filtros), mostra tudo e, com `--saida`, grava um relatório em
// Markdown para a revisão de uma pessoa, que registra a decisão em `.scratch/contexto-da-empresa/validacao.md`.
//
// Uso (as chaves vêm do ambiente; nunca escreva a chave no comando):
//   OPENAI_API_KEY=... OPENAI_MODEL=... deno run --allow-env --allow-net --allow-write=.scratch \
//     scripts/avaliar-contexto-da-empresa.ts [id-do-caso] [--saida=.scratch/contexto-da-empresa/avaliacao.md]
// Sai com 1 quando algum caso tem falha grave e 0 quando só há pontos a revisar.
import { escolherLlmDosSinais } from '../supabase/functions/_shared/cascata-de-sinais/index.ts'
import { prepararBusca } from '../supabase/functions/account-discovery/preparacao.ts'
import { gerar, VERSAO_DO_PROMPT } from '../supabase/functions/company-context-generation/handler.ts'
import { CASOS, conferirFiltros, conferirRubrica, ehGrave, fetchDoCaso } from '../supabase/functions/company-context-generation/__fixtures__/sites.ts'

const WORKSPACE = '00000000-0000-4000-8000-000000000000'

const llm = escolherLlmDosSinais({
  env: (nome) => (nome === 'SIGNALS_LLM_PROVIDER' ? 'openai' : Deno.env.get(nome)),
  admin: { rpc: () => Promise.resolve({ data: null, error: { message: 'sem banco na avaliação' } }) },
  log: (campos) => console.error(JSON.stringify(campos)),
})
if (!llm) {
  console.error('Defina OPENAI_API_KEY e OPENAI_MODEL no ambiente.')
  Deno.exit(2)
}

const saida = Deno.args.find((a) => a.startsWith('--saida='))?.slice('--saida='.length)
const filtro = Deno.args.find((a) => !a.startsWith('--'))
const relatorio: string[] = [
  `# Avaliação do Contexto da empresa com o modelo de verdade`,
  '',
  `Rodada em ${new Date().toISOString()} · modelo ${Deno.env.get('OPENAI_MODEL')} · prompt ${VERSAO_DO_PROMPT}.`,
  'Revisão humana: para cada caso, marque compreensão da oferta, companhias plausíveis, personas coerentes, fatos vs.',
  'inferências, ausência de invenção e correspondência texto/filtros em `.scratch/contexto-da-empresa/validacao.md`.',
]
let graves = 0
let aRevisar = 0
let custo = 0

for (const caso of CASOS.filter((c) => !filtro || c.id === filtro)) {
  const resultado = await gerar({ site: caso.dominio, workspaceId: WORKSPACE, llm, fetchFn: fetchDoCaso(caso) })
  custo += resultado.custoUsd
  const problemas = conferirRubrica(caso, resultado)
  let preparacao: Awaited<ReturnType<typeof prepararBusca>> | null = null
  if (resultado.textos) {
    preparacao = await prepararBusca({ contexto: { versao: 1, icp: resultado.textos.icp }, llm, workspaceId: WORKSPACE })
    problemas.push(...conferirFiltros(caso, resultado.textos.icp, preparacao))
  }
  const grave = problemas.some(ehGrave)
  if (grave) graves++
  else if (problemas.length) aRevisar++

  const situacao = grave ? 'FALHA GRAVE' : problemas.length ? 'REVISAR' : 'rubrica automática ok'
  const bloco = [
    '',
    `## ${caso.id} (${caso.tipo}) — ${situacao}`,
    '',
    `Páginas lidas: ${resultado.fontes.join(', ') || '(nenhuma)'} · falha: ${resultado.falha ?? '-'} · custo US$ ${resultado.custoUsd.toFixed(4)}`,
    ...problemas.map((p) => `- ! ${p}`),
  ]
  if (resultado.textos) {
    bloco.push(
      '',
      '### Empresa',
      '',
      resultado.textos.empresa,
      '',
      '### Perfil de cliente ideal',
      '',
      resultado.textos.icp,
      '',
      '### Personas',
      '',
      resultado.textos.personas,
    )
  }
  if (preparacao?.estado === 'pronta') {
    bloco.push('', '### Filtros do Mercado', '')
    for (const perfil of preparacao.perfis) {
      bloco.push(`- **${perfil.nome}**`)
      for (const a of perfil.aplicados) bloco.push(`  - aplicado ${a.conceito}: ${a.valor} ← "${a.trecho}"`)
      for (const p of perfil.pendentes) bloco.push(`  - pendente ${p.conceito} (${p.motivo}): ${p.valor} ← "${p.trecho}"`)
    }
  } else if (preparacao) {
    bloco.push('', `### Filtros do Mercado: ${preparacao.estado}`)
  }
  console.log(bloco.join('\n'))
  relatorio.push(...bloco)
}

const resumo = `\n${graves} caso(s) com falha grave, ${aRevisar} para revisar. Custo total US$ ${custo.toFixed(4)}.`
console.log(resumo)
relatorio.push('', resumo.trim())
if (saida) {
  await Deno.writeTextFile(saida, `${relatorio.join('\n')}\n`)
  console.log(`Relatório gravado em ${saida}. Registre a revisão humana em .scratch/contexto-da-empresa/validacao.md.`)
}
Deno.exit(graves ? 1 : 0)
