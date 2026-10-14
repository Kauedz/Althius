// A execução real de um Sinal do lançamento (sinais-reais 03 a 06), para o Nan rodar no computador dele: monta a entrada
// do actor com o adaptador do tipo, roda o actor pelo `signal-scan` publicado (a conta do Apify da Althius, com o
// `APIFY_TOKEN` guardado no Supabase; o actor pode estar "em teste"), e mostra o que interessa para passar o actor a
// "disponível": os campos que o resultado trouxe (só os nomes e os tipos, nenhum valor), os Sinais que o adaptador tira
// dele e o id da execução, para conferir o custo. Os itens brutos ficam em `validacao-sinais/` (fora do Git: têm dado
// pessoal) para o Nan olhar, e nunca são enviados a lugar nenhum além do próprio Supabase.
//
// Uso (PowerShell, na raiz do repositório):
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<chave service_role do painel, nunca no chat>"
//   $env:ALTHIUS_WORKSPACE_ID = "<id do Workspace do teste>"
//   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-sinais-reais.ts vaga_linkedin `
//     --nome "Empresa" --dominio empresa.com.br --linkedin https://www.linkedin.com/company/empresa
//
// Opções: --contato <perfil do LinkedIn> (repetível; para mudanca_de_emprego), --criterios '<JSON>' (troca os critérios
// padrão do card), --max-itens <n> (menos itens, menos custo), --url <https://<ref>.supabase.co>.
// Atalhos sem JSON para trocar um critério do padrão: --pais "Estados Unidos" (a Localização) e --periodo "Últimos 30 dias".
import { parseArgs } from 'jsr:@std/cli@1/parse-args'
import { ADAPTADORES } from '../supabase/functions/signal-runner/adaptadores.ts'
import { descartesDeMovimentacao } from '../supabase/functions/signal-runner/adaptadores/anuncio-de-movimentacao.ts'
import { type ContaParaVarrer, SemDadoParaVarrer } from '../supabase/functions/signal-runner/handler.ts'

// O actor de cada Sinal, como no registro (`private.signal_actors`).
const ACTOR_DO_SINAL: Record<string, string> = {
  vaga_linkedin: 'curious_coder~linkedin-jobs-scraper',
  vaga_indeed: 'valig~indeed-jobs-scraper',
  mudanca_de_emprego: 'harvestapi~linkedin-profile-scraper',
  nova_lideranca: 'harvestapi~linkedin-profile-search',
  entradas_e_saidas: 'harvestapi~linkedin-company-employees',
  anuncio_de_movimentacao: 'harvestapi~linkedin-post-search',
  anuncio_linkedin: 'silva95gustavo~linkedin-ad-library-scraper',
  anuncio_meta: 'curious_coder~facebook-ads-library-scraper',
  anuncio_google: 'solidcode~ads-transparency-scraper',
  crescimento_de_equipes: 'harvestapi~linkedin-company',
  publicacao_da_empresa: 'harvestapi~linkedin-company-posts',
  avaliacoes_google_maps: 'compass~google-maps-reviews-scraper',
}

// Critérios de um Monitoramento novo de cada card, com o período mais largo (mais chance de achar algo no teste).
const LARGO = { localizacao: ['Brasil'], periodo: 'Últimos 90 dias' }
const CRITERIOS_PADRAO: Record<string, Record<string, unknown>> = {
  vaga_linkedin: { ...LARGO, funcoes: [], senioridade: 'Qualquer', palavras: '' },
  vaga_indeed: { ...LARGO, funcoes: [], senioridade: 'Qualquer', palavras: '' },
  mudanca_de_emprego: { ...LARGO, cargos: [], movimento: ['Chegada', 'Promoção', 'Mudança de empresa'], pessoas: 'Contatos das Contas-alvo' },
  nova_lideranca: { ...LARGO, cargos: [], movimento: ['Chegada', 'Promoção'], pessoas: 'Qualquer pessoa no cargo' },
  entradas_e_saidas: { ...LARGO, cargos: [], movimento: ['Chegada'], pessoas: 'Qualquer pessoa no cargo' },
  anuncio_de_movimentacao: { ...LARGO, cargos: [], movimento: ['Chegada', 'Promoção'], pessoas: 'Qualquer pessoa no cargo' },
  anuncio_linkedin: { ...LARGO, palavras: '' },
  anuncio_meta: { ...LARGO, palavras: '' },
  anuncio_google: { ...LARGO, palavras: '' },
  crescimento_de_equipes: { ...LARGO },
  publicacao_da_empresa: { ...LARGO },
  avaliacoes_google_maps: { periodo: 'Últimos 90 dias', nota: 'Até 3 estrelas', palavras: '' },
}

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

const args = parseArgs(Deno.args, {
  string: ['nome', 'dominio', 'linkedin', 'contato', 'criterios', 'max-itens', 'url', 'pais', 'periodo'],
  collect: ['contato'],
})
const tipo = String(args._[0] ?? '')
const adaptador = ADAPTADORES[tipo]
if (!adaptador) sair(`Diga o Sinal: ${Object.keys(ADAPTADORES).join(', ')}.`)
if (!args.nome) sair('Diga o nome da Conta do teste: --nome "Empresa".')
const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const workspaceId = Deno.env.get('ALTHIUS_WORKSPACE_ID')
if (!chave) sair('Falta a variável SUPABASE_SERVICE_ROLE_KEY (a chave service_role do painel do Supabase).')
if (!workspaceId) sair('Falta a variável ALTHIUS_WORKSPACE_ID (o id do Workspace, para o relatório de custos).')
const url = args.url ?? Deno.env.get('SUPABASE_URL') ?? 'https://ycbdilsmydvzezhlymty.supabase.co'

const conta: ContaParaVarrer = {
  id: 'conta-do-teste',
  name: args.nome,
  domain: args.dominio ?? null,
  linkedinUrl: args.linkedin ?? null,
  contatos: ((args.contato ?? []) as string[]).map((linkedinUrl, i) => ({ id: `contato-${i + 1}`, linkedinUrl })),
}
const criterios: Record<string, unknown> = {
  ...(args.criterios ? JSON.parse(args.criterios) as Record<string, unknown> : CRITERIOS_PADRAO[tipo]),
  ...(args.pais ? { localizacao: [args.pais] } : {}),
  ...(args.periodo ? { periodo: args.periodo } : {}),
}
const agora = Date.now()

let entrada: ReturnType<typeof adaptador.entrada>
try {
  entrada = adaptador.entrada(conta, criterios, agora)
} catch (e) {
  if (e instanceof SemDadoParaVarrer) sair(`A Conta do teste não tem o que este Sinal precisa: ${e.message}.`)
  throw e
}
const maxItems = args['max-itens'] ? Math.min(Number(args['max-itens']), entrada.maxItems) : entrada.maxItems

console.log(`\nSinal: ${tipo} · actor ${ACTOR_DO_SINAL[tipo]} · até ${maxItems} itens`)
console.log('Entrada do actor:')
console.log(JSON.stringify(entrada.input, null, 2))
console.log('\nRodando no Apify pelo signal-scan (até 2 minutos)...')

const resposta = await fetch(`${url}/functions/v1/signal-scan`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ workspaceId, actorId: ACTOR_DO_SINAL[tipo], input: entrada.input, maxItems, allowTesting: true }),
})
const corpo = await resposta.json().catch(() => ({})) as { runId?: string; actorVersion?: string; items?: unknown[]; error?: string; code?: string }
if (!resposta.ok) sair(`O signal-scan recusou (HTTP ${resposta.status}): ${corpo.error ?? ''} ${corpo.code ?? ''}`.trim())
const itens = corpo.items ?? []

await Deno.mkdir('validacao-sinais', { recursive: true })
const arquivo = `validacao-sinais/${tipo}-${new Date(agora).toISOString().replace(/[:.]/g, '-')}.json`
await Deno.writeTextFile(arquivo, JSON.stringify({ tipo, entrada: entrada.input, runId: corpo.runId, itens }, null, 2))

console.log(`\nExecução ${corpo.runId ?? '(sem id)'} · ${itens.length} itens · itens brutos em ${arquivo} (não vão para o Git)`)
console.log('\nCampos que o resultado trouxe (caminho: tipos, em quantos itens):')
for (const [caminho, c] of [...camposVistos(itens)].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${caminho}: ${[...c.tipos].join('|')} (${c.itens})`)
}

if (tipo === 'anuncio_de_movimentacao') {
  console.log('\nOnde cada post parou (só contagem):')
  for (const [etapa, n] of Object.entries(descartesDeMovimentacao(itens, conta, criterios, agora))) console.log(`  ${etapa}: ${n}`)
}

const sinais = adaptador.sinais(itens, conta, criterios, agora)
console.log(`\nSinais que o adaptador tira deste resultado: ${sinais.length}`)
for (const s of sinais) console.log(`  - ${s.firedAt.slice(0, 10)} · ${s.phrase}\n    chave: ${s.eventKey}`)
console.log(`
Para conferir o custo, no SQL Editor do Supabase:
  select cost_usd, input_units, created_at from private.action_costs where source_ref = '${corpo.runId ?? ''}';
Cole de volta na conversa só os campos e a quantidade de Sinais; nunca o arquivo de itens nem a chave.
`)
