// Os passos do ICP G (corretoras de benefícios): a implementação do que o banco registra nas cascatas deste ICP (`signal_cascade_steps.handler`).
// Cada handler daqui tem um teste ao lado e um passo registrado na migração do ICP. Todos levam o prefixo `g_`: o ICP F tem uma
// cascata de filial parecida em outro arquivo e as duas NÃO compartilham código.
//
//   cruzando_faixa_de_headcount  g_contas_para_headcount -> g_headcount_linkedin (actor) -> g_cruzou_faixa_de_funcionarios
//   nova_filial_icp_g            g_contas_para_filiais   -> g_mapa_de_filiais (actor)    -> g_nova_filial
//
// As duas são mensais e de fotografia: o 1º passo escolhe as Contas (sem fotografia primeiro, depois as mais antigas, e nunca as
// fotografadas há pouco: não paga duas vezes pelo mesmo mês); o actor consulta; o último passo compara com a fotografia anterior,
// emite o Sinal e grava a nova. A 1ª rodada só grava a base. LGPD: só a contagem de funcionários, a faixa e as ordens das filiais
// (parte do CNPJ da empresa) são guardadas; nada de dado de saúde, de pessoa, de sócio, de descrição ou de contato.
import { LIMITES, objetos, primeiroTexto, recortar } from '../../../signal-runner/adaptadores/comum.ts'
import type { ContextoDoPasso, ContaDoWorkspace, ImplDoPasso, Item, RegistroDePassos } from '../tipos.ts'
import { cnpjLimpo, nomeDaEmpresa, objeto, paginaDoLinkedin, paginaLimpa, texto } from './comum.ts'

const DIA_EM_MS = 86_400_000
/** O que cabe numa fotografia (o banco aceita 20.000 caracteres): acima disso a rede é grande demais para acompanhar. */
const MAX_ORDENS_NA_FOTOGRAFIA = 2500
const FAIXAS_PADRAO = [50, 100, 200]

/** Um número do pedido ou do modelo de entrada do passo (o pedido vale mais). */
function numero(ctx: ContextoDoPasso, chave: string, padrao: number): number {
  const v = Number(ctx.criterios[chave] ?? ctx.def.inputTemplate[chave])
  return Number.isFinite(v) && v >= 0 ? v : padrao
}

const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

type Fotografia = { takenAt: string; data: Record<string, unknown> }

/** As Contas elegíveis desta rodada: sem fotografia primeiro (na ordem em que vieram), depois as mais antigas; as fotografadas há menos de `intervaloMinimoDias` ficam de fora. */
async function escolherContas<T extends { conta: ContaDoWorkspace }>(
  candidatas: T[],
  ctx: ContextoDoPasso,
  padraoDoIntervalo: number,
): Promise<(T & { foto?: Fotografia })[]> {
  const intervalo = numero(ctx, 'intervaloMinimoDias', padraoDoIntervalo) * DIA_EM_MS
  const limite = ctx.def.maxItems ?? 50
  const fotos = candidatas.length ? await ctx.snapshots.ler(candidatas.map((c) => c.conta.id)) : new Map<string, Fotografia>()
  return candidatas
    .map((c) => ({ ...c, foto: fotos.get(c.conta.id) }))
    .filter((c) => !c.foto || ctx.agora - Date.parse(c.foto.takenAt) >= intervalo)
    .sort((a, b) => (a.foto ? Date.parse(a.foto.takenAt) : -Infinity) - (b.foto ? Date.parse(b.foto.takenAt) : -Infinity))
    .slice(0, limite)
}

// ---------------------------------------------------------------------------------------------------------------------
// Cruzando faixa de headcount.

/** Os limiares do pedido ou do modelo de entrada, em ordem crescente e sem repetição; sem nenhum válido, 50/100/200. */
function faixasDoPasso(ctx: ContextoDoPasso): number[] {
  const bruto = ctx.criterios.faixas ?? ctx.def.inputTemplate.faixas
  const itens: unknown[] = Array.isArray(bruto) ? bruto : typeof bruto === 'string' ? bruto.split(',') : []
  const validos = itens.map((v) => Number(typeof v === 'string' ? v.trim() : v)).filter((n) => Number.isInteger(n) && n > 0)
  const unicos = [...new Set(validos)].sort((a, b) => a - b)
  return unicos.length ? unicos : FAIXAS_PADRAO
}

const faixaDe = (funcionarios: number, faixas: number[]) => faixas.filter((f) => f <= funcionarios).at(-1) ?? 0

function anteriorDeHeadcount(foto: Fotografia | undefined): { funcionarios: number; takenAt: string } | undefined {
  const n = foto?.data.funcionarios
  return foto && typeof n === 'number' && Number.isFinite(n) ? { funcionarios: n, takenAt: foto.takenAt } : undefined
}

const contasParaHeadcount: ImplDoPasso = {
  async executar(_entrada, ctx) {
    const candidatas = ctx.contas.flatMap((conta) => {
      const url = paginaLimpa(texto(conta.linkedinUrl))
      return url ? [{ conta, url }] : []
    })
    const escolhidas = await escolherContas(candidatas, ctx, 20)
    return escolhidas.map(({ conta, url, foto }): Item => ({
      tipo: 'conta_para_headcount', contaId: conta.id, contaNome: conta.name, url, anterior: anteriorDeHeadcount(foto),
    }))
  },
}

function urlsDeHeadcount(entrada: Item[], ctx: ContextoDoPasso): string[] {
  const urls = entrada.filter((i) => i.tipo === 'conta_para_headcount').map((i) => texto(i.url)).filter(Boolean)
  return [...new Set(urls)].slice(0, ctx.def.maxItems ?? 100)
}

const headcountLinkedin: ImplDoPasso = {
  itensCobrados: (entrada, ctx) => urlsDeHeadcount(entrada, ctx).length,

  montarEntrada(entrada, ctx) {
    const urls = urlsDeHeadcount(entrada, ctx)
    if (!urls.length) return { pular: 'Nenhuma Conta com a página da empresa no LinkedIn.' }
    return { input: { companies: urls }, maxItems: urls.length }
  },

  // Do resultado, só a página e a contagem de funcionários: o resto (descrição, contato, endereços) nunca passa daqui.
  normalizar(brutos, entrada) {
    const contagens = new Map<string, number>()
    for (const b of objetos(brutos)) {
      const n = b.employeeCount
      if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) continue
      for (const pagina of [paginaDoLinkedin(primeiroTexto(b, 'linkedinUrl')), primeiroTexto(b, 'universalName').toLowerCase()]) {
        if (pagina) contagens.set(pagina, n)
      }
    }
    return entrada.flatMap((i): Item[] => {
      if (i.tipo !== 'conta_para_headcount') return []
      const funcionarios = contagens.get(paginaDoLinkedin(texto(i.url)))
      return funcionarios === undefined
        ? []
        : [{ tipo: 'headcount', contaId: i.contaId, contaNome: i.contaNome, funcionarios, anterior: i.anterior }]
    })
  },
}

const cruzouFaixaDeFuncionarios: ImplDoPasso = {
  async executar(entrada, ctx) {
    const faixas = faixasDoPasso(ctx)
    const hoje = new Date(ctx.agora).toISOString()
    const sinais: Item[] = []
    const fotografias: { chave: string; data: Record<string, unknown>; takenAt: string }[] = []
    for (const i of entrada) {
      if (i.tipo !== 'headcount' || typeof i.funcionarios !== 'number') continue
      const contaId = texto(i.contaId)
      const agora = i.funcionarios
      fotografias.push({ chave: contaId, data: { funcionarios: agora, faixa: faixaDe(agora, faixas) }, takenAt: hoje })
      const antes = objeto(i.anterior)
      if (typeof antes.funcionarios !== 'number') continue // 1ª rodada: só a base
      // Cruzou: estava abaixo do limiar e agora está nele ou acima. Vários de uma vez (90 -> 230): o mais alto.
      const cruzada = faixas.filter((f) => antes.funcionarios as number < f && agora >= f).at(-1)
      if (cruzada === undefined) continue
      sinais.push({
        contaId,
        contaNome: texto(i.contaNome),
        eventKey: recortar(`${nomeDaEmpresa(i.contaNome)}|headcount|${cruzada}`, LIMITES.chave),
        phrase: recortar(`Passou de ${cruzada} funcionários: ${agora} na página da empresa no LinkedIn (eram ${antes.funcionarios})`, LIMITES.frase),
        firedAt: hoje,
        source: 'LinkedIn (página da empresa)',
        evidence: recortar(
          `Funcionários na página da empresa no LinkedIn: ${antes.funcionarios} em ${dataBr(texto(antes.takenAt))} e ${agora} em ${dataBr(hoje)}; cruzou a faixa de ${cruzada}. É a contagem que a própria página informa, não um número oficial.`,
          LIMITES.evidencia,
        ),
      })
    }
    if (fotografias.length) await ctx.snapshots.gravar(fotografias)
    return sinais
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// Nova filial.

interface FilialDoMapa {
  cnpj: string
  uf: string
  situacao: string
  dataInicio: string
}

const ordemDaFilial = (cnpj: string) => cnpj.slice(8, 12)

const cnpjFormatado = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`

function anteriorDeFiliais(foto: Fotografia | undefined): { total: number; ordens: string[]; takenAt: string } | undefined {
  const ordens = foto?.data.ordens
  if (!foto || !Array.isArray(ordens)) return undefined
  const lista = ordens.filter((o): o is string => typeof o === 'string')
  return { total: typeof foto.data.total === 'number' ? foto.data.total : lista.length, ordens: lista, takenAt: foto.takenAt }
}

const contasParaFiliais: ImplDoPasso = {
  async executar(_entrada, ctx) {
    const candidatas = ctx.contas.flatMap((conta) => {
      const cnpj = cnpjLimpo(conta.cnpj)
      return cnpj ? [{ conta, raiz: cnpj.slice(0, 8) }] : []
    })
    const escolhidas = await escolherContas(candidatas, ctx, 25)
    return escolhidas.map(({ conta, raiz, foto }): Item => ({
      tipo: 'conta_para_filiais', contaId: conta.id, contaNome: conta.name, raiz, anterior: anteriorDeFiliais(foto),
    }))
  },
}

function raizesDeFiliais(entrada: Item[], ctx: ContextoDoPasso): string[] {
  const raizes = entrada.filter((i) => i.tipo === 'conta_para_filiais').map((i) => texto(i.raiz)).filter(Boolean)
  return [...new Set(raizes)].slice(0, ctx.def.maxItems ?? 40)
}

const mapaDeFiliais: ImplDoPasso = {
  itensCobrados: (entrada, ctx) => raizesDeFiliais(entrada, ctx).length,

  montarEntrada(entrada, ctx) {
    const raizes = raizesDeFiliais(entrada, ctx)
    if (!raizes.length) return { pular: 'Nenhuma Conta com CNPJ cadastrado.' }
    return { input: { cnpjs: raizes, maxResults: raizes.length }, maxItems: raizes.length }
  },

  // Do mapa, só o CNPJ (de empresa), a UF, a situação e a data de início de cada filial: sócios e o resto nunca passam daqui.
  // A raiz que o actor não entregou (fonte indisponível) não vira "zero filiais": a Conta fica sem item.
  normalizar(brutos, entrada) {
    const mapas = new Map<string, FilialDoMapa[]>()
    for (const b of objetos(brutos)) {
      if (b.recordType !== 'BRANCH_MAP') continue
      const raiz = texto(b.raiz).toUpperCase()
      if (!raiz) continue
      const filiais = objetos(Array.isArray(b.filiais) ? b.filiais : []).flatMap((f): FilialDoMapa[] => {
        const cnpj = cnpjLimpo(f.cnpj)
        return cnpj && cnpj.startsWith(raiz)
          ? [{ cnpj, uf: texto(f.uf).toUpperCase(), situacao: texto(f.situacao).toUpperCase(), dataInicio: texto(f.dataInicio) }]
          : []
      })
      mapas.set(raiz, filiais)
    }
    return entrada.flatMap((i): Item[] => {
      const filiais = i.tipo === 'conta_para_filiais' ? mapas.get(texto(i.raiz)) : undefined
      return filiais
        ? [{ tipo: 'mapa_de_filiais', contaId: i.contaId, contaNome: i.contaNome, raiz: i.raiz, anterior: i.anterior, filiais }]
        : []
    })
  },
}

const novaFilial: ImplDoPasso = {
  async executar(entrada, ctx) {
    const janela = numero(ctx, 'janelaDias', 180) * DIA_EM_MS
    const maxPorConta = Math.max(1, Math.floor(numero(ctx, 'maxPorConta', 10)))
    const hoje = new Date(ctx.agora).toISOString()
    const sinais: Item[] = []
    const fotografias: { chave: string; data: Record<string, unknown>; takenAt: string }[] = []
    for (const i of entrada) {
      if (i.tipo !== 'mapa_de_filiais' || !Array.isArray(i.filiais)) continue
      const filiais = (i.filiais as unknown[]).map((f) => objeto(f) as unknown as FilialDoMapa)
      const contaId = texto(i.contaId)
      const antes = objeto(i.anterior) as { total?: number; ordens?: string[]; takenAt?: string }
      const conhecidas = new Set(Array.isArray(antes.ordens) ? antes.ordens : [])
      const ordens = [...new Set([...conhecidas, ...filiais.map((f) => ordemDaFilial(f.cnpj))])].sort()
      // Rede grande demais para a fotografia: não acompanha (uma lista cortada geraria Sinal falso a cada rodada).
      if (ordens.length > MAX_ORDENS_NA_FOTOGRAFIA) continue
      fotografias.push({ chave: contaId, data: { total: filiais.length, ordens }, takenAt: hoje })
      if (!Array.isArray(antes.ordens)) continue // 1ª rodada: só a base

      const novas = filiais
        .filter((f) => {
          const inicio = Date.parse(f.dataInicio)
          return !conhecidas.has(ordemDaFilial(f.cnpj)) && f.situacao === 'ATIVA' && Number.isFinite(inicio) && inicio >= ctx.agora - janela
        })
        .sort((a, b) => Date.parse(b.dataInicio) - Date.parse(a.dataInicio))
      for (const f of novas.slice(0, maxPorConta)) {
        const inicio = Math.min(Date.parse(`${f.dataInicio.slice(0, 10)}T12:00:00.000Z`), ctx.agora)
        const rotulo = cnpjFormatado(f.cnpj)
        sinais.push({
          contaId,
          contaNome: texto(i.contaNome),
          eventKey: recortar(`${nomeDaEmpresa(i.contaNome)}|filial|${f.cnpj}`, LIMITES.chave),
          phrase: recortar(`Abriu nova filial${f.uf ? ` em ${f.uf}` : ''} (CNPJ ${rotulo})`, LIMITES.frase),
          firedAt: new Date(inicio).toISOString(),
          source: 'Receita Federal (CNPJ aberto)',
          evidence: recortar(
            `Nova filial ativa no cadastro de CNPJ da Receita Federal: ${rotulo}${f.uf ? `, ${f.uf}` : ''}, início em ${dataBr(f.dataInicio)}. ` +
              `A empresa tinha ${plural(antes.total ?? conhecidas.size, 'filial', 'filiais')} na fotografia anterior e agora tem ${plural(filiais.length, 'filial', 'filiais')}. ` +
              `Nesta rodada: ${plural(novas.length, 'filial nova', 'filiais novas')}.`,
            LIMITES.evidencia,
          ),
        })
      }
    }
    if (fotografias.length) await ctx.snapshots.gravar(fotografias)
    return sinais
  },
}

export function passosDoIcp_g(_fetchFn: typeof fetch = fetch): RegistroDePassos {
  return {
    passos: {
      g_contas_para_headcount: contasParaHeadcount,
      g_headcount_linkedin: headcountLinkedin,
      g_cruzou_faixa_de_funcionarios: cruzouFaixaDeFuncionarios,
      g_contas_para_filiais: contasParaFiliais,
      g_mapa_de_filiais: mapaDeFiliais,
      g_nova_filial: novaFilial,
    },
    fontes: {},
  }
}
