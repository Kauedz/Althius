// A execução real de um actor do enriquecimento (enriquecimento-em-cascata 01), para o Nan rodar no computador dele.
// Roda o actor de um fim do registro (`private.discovery_actors`) com o mesmo código da Edge Function
// `account-enrichment` (a mesma entrada e a mesma leitura), pela conta do Apify da Althius, e mostra o que interessa para
// passar o actor a "available": o id da execução, o custo em dólar que o Apify informa, os campos que o resultado trouxe
// (só os nomes e os tipos, nenhum valor) e o que o adaptador tira dele (só contagens). Os itens brutos ficam em
// `validacao-enriquecimento/` (fora do Git: têm dado pessoal) para o Nan olhar, e nunca são enviados a lugar nenhum.
// Nada é gravado no Supabase e nenhum crédito do Workspace é usado.
//
// Uso (PowerShell, na raiz do repositório):
//   $env:APIFY_TOKEN = "<token do Apify da Althius, nunca no chat>"
//   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-enriquecimento-real.ts cnpj_receita `
//     --cnpj 07526557000100
//   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-enriquecimento-real.ts buscar_pessoas `
//     --nome "Empresa" --linkedin https://www.linkedin.com/company/empresa --cargo Diretor --limite 5
//   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-enriquecimento-real.ts revelar_contato `
//     --perfil https://www.linkedin.com/in/pessoa
//
// Opções: --cargo (repetível; filtra o cargo em buscar_pessoas), --limite <n> (pessoas pedidas; menos pessoas, menos custo).
import { parseArgs } from 'jsr:@std/cli@1/parse-args'
import { tokensDoApify } from '../supabase/functions/_shared/apify-ambiente.ts'
import { ApifyProvedorDeContatos } from '../supabase/functions/_shared/provedor-de-contatos.ts'
import { consultarApifyReceita, validarCnpj } from '../supabase/functions/account-enrichment/handler.ts'
import { clienteDoApify } from '../supabase/functions/signal-scan/apify.ts'
import type { Apify } from '../supabase/functions/signal-scan/handler.ts'

const FINS = ['cnpj_receita', 'buscar_pessoas', 'revelar_contato'] as const
type Fim = typeof FINS[number]

function sair(mensagem: string): never {
  console.error(`\n${mensagem}\n`)
  Deno.exit(1)
}

/** Os caminhos de campo do resultado, com o tipo e em quantos itens aparecem: nada dos valores. */
function camposVistos(itens: unknown[]): Map<string, { tipos: Set<string>; itens: number }> {
  const campos = new Map<string, { tipos: Set<string>; itens: number }>()
  const visitar = (valor: unknown, caminho: string, vistos: Set<string>, nivel: number) => {
    const tipo = Array.isArray(valor) ? 'lista' : valor === null ? 'nulo' : typeof valor
    if (caminho) {
      const campo = campos.get(caminho) ?? { tipos: new Set(), itens: 0 }
      campo.tipos.add(tipo)
      if (!vistos.has(caminho)) (campo.itens++, vistos.add(caminho))
      campos.set(caminho, campo)
    }
    if (nivel >= 3) return
    if (Array.isArray(valor)) valor.slice(0, 3).forEach((v) => visitar(v, `${caminho}[]`, vistos, nivel + 1))
    else if (valor && typeof valor === 'object') {
      for (const [k, v] of Object.entries(valor)) visitar(v, caminho ? `${caminho}.${k}` : k, vistos, nivel + 1)
    }
  }
  for (const item of itens) visitar(item, '', new Set(), 0)
  return campos
}

/** O que o Apify fez em cada execução que o adaptador pediu: a entrada, o id, os itens ou o erro. */
interface ExecucaoVista {
  actorId: string
  entrada: unknown
  runId: string | null
  itens: unknown[] | null
  erro: string | null
}

/** O cliente do Apify da Edge Function, anotando cada execução. O adaptador não muda: ele vê o mesmo Apify. */
function apifyQueAnota(apify: Apify, execucoes: ExecucaoVista[]): Apify {
  return {
    async run(args) {
      try {
        const exec = await apify.run(args)
        execucoes.push({ actorId: args.actorId, entrada: args.input, runId: exec.runId, itens: exec.items, erro: null })
        return exec
      } catch (e) {
        const runId = e && typeof e === 'object' && 'runId' in e && typeof e.runId === 'string' ? e.runId : null
        const erro = e instanceof Error ? e.message : String(e)
        execucoes.push({ actorId: args.actorId, entrada: args.input, runId, itens: null, erro })
        throw e
      }
    },
    custoDaExecucao: apify.custoDaExecucao ? (runId) => apify.custoDaExecucao!(runId) : undefined,
  }
}

const args = parseArgs(Deno.args, {
  string: ['cnpj', 'nome', 'linkedin', 'cargo', 'limite', 'perfil'],
  collect: ['cargo'],
})
const fim = String(args._[0] ?? '') as Fim
if (!FINS.includes(fim)) sair(`Diga o fim do actor: ${FINS.join(', ')}.`)

let tokens: string[]
try {
  tokens = tokensDoApify((nome) => Deno.env.get(nome))
} catch {
  sair('Falta a variável APIFY_TOKEN (o token da conta do Apify da Althius).')
}
// O mesmo prazo da Edge Function `account-enrichment`: se o actor não termina nele, lá também não termina.
const apify = clienteDoApify({ tokens, timeoutMs: 45_000, runTimeoutSeconds: 40, log: () => {} })
const execucoes: ExecucaoVista[] = []
const anotado = apifyQueAnota(apify, execucoes)
const resumo: string[] = []

console.log(`\nFim: ${fim} · rodando no Apify (até 45 segundos)...`)

if (fim === 'cnpj_receita') {
  const cnpj = validarCnpj(String(args.cnpj ?? ''))
  if (!cnpj) sair('Diga um CNPJ válido: --cnpj 07526557000100.')
  const dados = await consultarApifyReceita(cnpj, anotado)
  resumo.push(`A Receita devolveu a empresa: ${dados ? 'sim' : 'não'}`)
  if (dados) {
    resumo.push(`  razão social: ${dados.razaoSocial ? 'sim' : 'não'} · situação: ${dados.situacaoCadastral ? 'sim' : 'não'}`)
    resumo.push(`  CNAE principal: ${dados.cnaePrincipal.codigo ? 'sim' : 'não'} · CNAEs secundários: ${dados.cnaesSecundarios.length}`)
    resumo.push(`  sócios: ${dados.socios.length} · telefones: ${dados.telefones.length} · e-mail: ${dados.email ? 'sim' : 'não'}`)
  }
}

if (fim === 'buscar_pessoas') {
  if (!args.nome) sair('Diga o nome da empresa do teste: --nome "Empresa".')
  const limite = args.limite ? Number(args.limite) : 5
  try {
    const pessoas = await new ApifyProvedorDeContatos({ apify: anotado }).buscarPessoas({
      nome: args.nome,
      linkedinUrl: args.linkedin,
      cargos: (args.cargo ?? []) as string[],
      limite,
    })
    const porPersona = new Map<string, number>()
    for (const p of pessoas) porPersona.set(p.persona ?? 'Outro', (porPersona.get(p.persona ?? 'Outro') ?? 0) + 1)
    resumo.push(`Pessoas que o adaptador tira: ${pessoas.length}`)
    resumo.push(`  com cargo: ${pessoas.filter((p) => p.cargo).length} · com LinkedIn: ${pessoas.filter((p) => p.linkedinUrl).length}`)
    resumo.push(`  por Persona: ${[...porPersona].map(([persona, n]) => `${persona} ${n}`).join(', ') || 'nenhuma'}`)
  } catch (e) {
    resumo.push(`A busca falhou: ${e instanceof Error ? e.message : String(e)}`)
  }
}

if (fim === 'revelar_contato') {
  if (!args.perfil) sair('Diga o perfil do LinkedIn do teste: --perfil https://www.linkedin.com/in/pessoa.')
  try {
    const dado = await new ApifyProvedorDeContatos({ apify: anotado }).revelarContato(
      { nome: 'pessoa do teste', linkedinUrl: args.perfil },
      'email',
    )
    resumo.push(`E-mail que o adaptador tira: ${dado ? 'achou' : 'não achou'}`)
  } catch (e) {
    resumo.push(`A busca do e-mail falhou: ${e instanceof Error ? e.message : String(e)}`)
  }
}

if (execucoes.length === 0) sair('O adaptador não chamou o Apify: confira os argumentos.')

await Deno.mkdir('validacao-enriquecimento', { recursive: true })
const arquivo = `validacao-enriquecimento/${fim}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
await Deno.writeTextFile(arquivo, JSON.stringify({ fim, execucoes }, null, 2))

for (const exec of execucoes) {
  const custo = exec.runId && apify.custoDaExecucao ? await apify.custoDaExecucao(exec.runId).catch(() => null) : null
  console.log(`\nActor ${exec.actorId}`)
  console.log('Entrada do actor:')
  console.log(JSON.stringify(exec.entrada, null, 2))
  console.log(`Execução ${exec.runId ?? '(sem id)'} · custo ${custo === null ? '(o Apify não informou)' : `US$ ${custo}`}`)
  if (exec.erro) {
    console.log(`Erro: ${exec.erro}`)
    continue
  }
  const itens = exec.itens ?? []
  console.log(`${itens.length} itens · itens brutos em ${arquivo} (não vão para o Git)`)
  console.log('Campos que o resultado trouxe (caminho: tipos, em quantos itens):')
  for (const [caminho, c] of [...camposVistos(itens)].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${caminho}: ${[...c.tipos].join('|')} (${c.itens})`)
  }
}

console.log(`\n${resumo.join('\n')}`)
console.log(`
Cole de volta na conversa o id da execução, o custo, os campos e as contagens; nunca o arquivo de itens nem o token.
`)
