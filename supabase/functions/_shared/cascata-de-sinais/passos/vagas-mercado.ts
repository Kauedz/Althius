// Os passos da descoberta no mercado endereçável (vagas-mercado-enderecavel): o Monitoramento de Abertura de vagas no modo
// mercado procura empresas que estão contratando os cargos dele no nicho, sem Conta-alvo.
//   1. a busca (linkedin_vagas_mercado): os cargos do Monitoramento e o nicho (Custom ou pronto) como palavras-chave, no
//      país e no estado escolhidos; a leitura do resultado é a mesma das outras cascatas de vaga;
//   2. a confirmação (confirmar_vaga_mercado): cada vaga passa pelos cargos, senioridade, palavras e período do
//      Monitoramento (não por termos fixos de nicho), pelo estado e pelo filtro do nicho (`vagasDoNicho`: o modelo dos
//      Sinais quando ligado, senão palavra-chave); uma empresa por linha, sem vaga repetida;
//   3. o enriquecimento (linkedin_empresa_mercado): site e LinkedIn das empresas que não são Conta e ainda não têm site, até
//      o limite de itens do passo;
//   4. o casamento (casar_com_contas, o de sempre, com `semSiteViraCandidata`): Conta vira Sinal da Conta; o resto vai ao
//      banco, que cria a candidata da Caixa de Descobertas (aceite manual).
import { contemAlgum, mesmaEmpresa, paisesDaLocalizacao } from '../../../signal-runner/adaptadores/comum.ts'
import type { ContextoDoAdaptador } from '../../../signal-runner/handler.ts'
import { termosDaBusca } from '../../../signal-runner/adaptadores/vaga-linkedin.ts'
import { buscasDasFuncoes, cargoDaVaga, recortesDoMonitoramento, type Vaga, vagaAtende, vagasDoNicho } from '../../../signal-runner/adaptadores/vagas.ts'
import type { ContextoDoPasso, ImplDoPasso, Item } from '../tipos.ts'
import {
  type Candidata,
  candidataDoItem,
  chaveDaEmpresa,
  itemDeCandidata,
  janelaDoPasso,
  paginaLimpa,
  texto,
  vagaDoItem,
  type VagaNormalizada,
} from './comum.ts'
import { linkedinEmpresa } from './empresa-linkedin.ts'
import { linkedinVagas } from './vagas.ts'

/** A cascata que o Monitoramento no modo mercado roda (o `signal_type` dela no banco). */
export const CASCATA_DO_MERCADO = 'vaga_mercado'
/** O preço fixo da rodada no mercado, em créditos: o mesmo de `private.market_discovery_credits_per_run()`. */
export const CREDITOS_POR_RODADA_NO_MERCADO = 4

const MAX_BUSCAS = 4
const VAGAS_POR_EMPRESA = 3

/** Os estados do Brasil e a sigla de cada um, para a busca e para conferir o local da vaga. */
const ESTADOS: Readonly<Record<string, string>> = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM', 'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF',
  'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG', 'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE', 'Piauí': 'PI',
  'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR',
  'Santa Catarina': 'SC', 'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO',
}

/** Os nomes dos recortes do Monitoramento; critérios antigos são normalizados no adaptador compartilhado. */
export function nichoDoMonitoramento(criterios: Record<string, unknown>): string[] {
  return recortesDoMonitoramento(criterios).map((recorte) => recorte.nome)
}

/** O estado escolhido, quando é um estado do Brasil e o Brasil está na Localização. */
export function estadoDoMonitoramento(criterios: Record<string, unknown>): string {
  const estado = texto(criterios.estado).trim()
  if (!ESTADOS[estado]) return ''
  return paisesDaLocalizacao(criterios).some((p) => p.codigo === 'BR') ? estado : ''
}

/** Se o local da vaga é do estado: pelo nome ou pela sigla. Sem local, a busca já filtrou e a vaga fica. */
export function vagaDoEstado(local: string, estado: string): boolean {
  if (!estado || !local.trim()) return true
  const sigla = ESTADOS[estado]
  if (contemAlgum(local, [estado])) return true
  return new RegExp(`(^|[^A-Za-z])${sigla}([^A-Za-z]|$)`).test(local)
}

/** Combina recortes e cargos em buscas balanceadas; limita as buscas e escolhe recortes por ordem estável. */
export function termosDoMercado(criterios: Record<string, unknown>, maximo = MAX_BUSCAS): string[] {
  const funcoes = buscasDasFuncoes(criterios)
  if (!funcoes.length) return []
  const nichos = nichoDoMonitoramento(criterios)
  if (!nichos.length) return termosDaBusca('', funcoes, maximo).map((t) => t.trim())
  const buscasPorNicho = nichos.map((nicho) => termosDaBusca(nicho, funcoes, maximo).map((termo) => termo.trim()))
  return Array.from({ length: Math.min(maximo, buscasPorNicho.reduce((soma, termos) => soma + termos.length, 0)) }, (_, indice) => {
    const nicho = indice % buscasPorNicho.length
    const busca = Math.floor(indice / buscasPorNicho.length)
    return buscasPorNicho[nicho][busca]
  })
}

export const linkedinVagasMercado: ImplDoPasso = {
  montarEntrada(_entrada, ctx, actorId) {
    const paises = paisesDaLocalizacao(ctx.criterios)
    const estado = estadoDoMonitoramento(ctx.criterios)
    const porPais = Math.max(1, Math.floor(MAX_BUSCAS / paises.length))
    const termos = termosDoMercado(ctx.criterios, porPais)
    if (!termos.length) return { pular: 'Sem cargo para buscar as vagas.' }
    const dias = janelaDoPasso(ctx)
    const maximo = ctx.def.maxItems ?? 100
    const local = (codigo: string, nome: string) => (estado && codigo === 'BR' ? `${estado}, ${nome}` : nome)
    if (actorId.startsWith('valig~')) {
      return {
        input: {
          keywords: termos[0],
          location: local(paises[0].codigo, paises[0].nomeEmIngles),
          datePosted: dias <= 1 ? 'r86400' : dias <= 7 ? 'r604800' : 'r2592000',
          limit: maximo,
        },
        maxItems: maximo,
      }
    }
    const urls = paises.flatMap((pais) =>
      termos.map((termo) =>
        `https://www.linkedin.com/jobs/search/?${new URLSearchParams({
          keywords: termo,
          location: local(pais.codigo, pais.nomeEmIngles),
          f_TPR: `r${dias * 86_400}`,
        })}`
      )
    ).slice(0, MAX_BUSCAS)
    return { input: { urls, scrapeCompany: false, limitPerSource: Math.ceil(maximo / urls.length) }, maxItems: maximo }
  },

  normalizar: (brutos, entrada, ctx, actorId) => linkedinVagas.normalizar!(brutos, entrada, ctx, actorId),
}

function comoVaga(v: VagaNormalizada): Vaga {
  return { titulo: v.titulo, local: v.local, descricao: v.descricao, nivel: v.nivel, link: v.link, publicadaEm: v.publicadaEm }
}

/** O contexto que o filtro do nicho dos adaptadores espera: o modelo dos Sinais e o custo dele. */
function contextoDoNicho(ctx: ContextoDoPasso): ContextoDoAdaptador {
  return {
    ...(ctx.llm ? { llm: ctx.llm } : {}),
    custo: { adicionar: (usd: number) => ctx.custo.adicionar(usd) },
  } as unknown as ContextoDoAdaptador
}

export const confirmarVagaMercado: ImplDoPasso = {
  async executar(entrada, ctx) {
    const estado = estadoDoMonitoramento(ctx.criterios)
    const lidas = entrada.flatMap((item) => {
      const v = vagaDoItem(item)
      if (!v) return []
      const vaga = comoVaga(v.vaga)
      if (!vagaAtende(vaga, ctx.criterios, ctx.agora) || !vagaDoEstado(vaga.local, estado)) return []
      return [{ ...v, comparada: vaga }]
    })
    // O modelo avalia a lista inteira num pedido; os critérios antigos são lidos pela mesma normalização.
    const recortes = recortesDoMonitoramento(ctx.criterios)
    const doNicho = recortes.length
      ? new Set(await vagasDoNicho(lidas.map((l) => l.comparada), {
        ...ctx.criterios,
        nichos: recortes.filter((r) => r.tipo === 'pronto').map((r) => r.valor),
        nichosCustom: recortes.filter((r) => r.tipo === 'custom').map((r) => r.valor),
      }, contextoDoNicho(ctx)))
      : null
    const porEmpresa = new Map<string, Candidata>()
    const vistas = new Set<string>()
    for (const l of lidas) {
      if (doNicho && !doNicho.has(l.comparada)) continue
      const chave = chaveDaEmpresa(l.empresa)
      // A mesma vaga (empresa e cargo) que veio de duas buscas conta uma vez: é a chave do acontecimento.
      const daVaga = `${chave}|${cargoDaVaga(l.vaga.titulo)}`
      if (vistas.has(daVaga)) continue
      vistas.add(daVaga)
      const atual = porEmpresa.get(chave)
      if (!atual) {
        porEmpresa.set(chave, { chave, empresa: l.empresa, vagas: [l.vaga] })
        continue
      }
      atual.empresa = {
        ...atual.empresa,
        linkedinUrl: atual.empresa.linkedinUrl || l.empresa.linkedinUrl,
        site: atual.empresa.site || l.empresa.site,
      }
      atual.vagas.push(l.vaga)
    }
    return [...porEmpresa.values()].map((c) => {
      c.vagas.sort((a, b) => Date.parse(b.publicadaEm ?? '1970-01-01') - Date.parse(a.publicadaEm ?? '1970-01-01'))
      return itemDeCandidata({ ...c, vagas: c.vagas.slice(0, VAGAS_POR_EMPRESA) })
    }) as Item[]
  },
}

/** A empresa que não é Conta e ainda não tem site: só essa vale o enriquecimento. */
function semSiteForaDasContas(entrada: Item[], ctx: ContextoDoPasso): Candidata[] {
  return entrada.flatMap((i) => {
    const c = candidataDoItem(i)
    if (!c || c.empresa.site) return []
    return ctx.contas.some((conta) => mesmaEmpresa(conta, c.empresa)) ? [] : [c]
  })
}

export const linkedinEmpresaMercado: ImplDoPasso = {
  itensCobrados: (entrada, ctx) => Math.min(semSiteForaDasContas(entrada, ctx).length, ctx.def.maxItems ?? 25),

  montarEntrada(entrada, ctx) {
    const alvo = semSiteForaDasContas(entrada, ctx).slice(0, ctx.def.maxItems ?? 25)
    if (!alvo.length) return { pular: 'Nenhuma empresa nova precisava do site.' }
    const companies = [...new Set(alvo.map((c) => paginaLimpa(c.empresa.linkedinUrl)).filter(Boolean))]
    const searches = alvo.filter((c) => !paginaLimpa(c.empresa.linkedinUrl)).map((c) => c.empresa.nome)
    return { input: { ...(companies.length ? { companies } : {}), ...(searches.length ? { searches } : {}) }, maxItems: alvo.length }
  },

  // A mesma leitura do passo de sempre: completa o site, a página e o tamanho de quem o actor devolveu.
  normalizar: (brutos, entrada, ctx, actorId) => linkedinEmpresa.normalizar!(brutos, entrada, ctx, actorId),
}

export const passosDoMercado = {
  linkedin_vagas_mercado: linkedinVagasMercado,
  confirmar_vaga_mercado: confirmarVagaMercado,
  linkedin_empresa_mercado: linkedinEmpresaMercado,
}
