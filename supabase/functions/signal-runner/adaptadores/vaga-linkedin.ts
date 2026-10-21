// Vaga aberta no LinkedIn (sinais-reais 03): curious_coder/linkedin-jobs-scraper. A entrada são buscas públicas de vagas
// com o nome da Conta e cada função escolhida, no país e no período do Monitoramento; o actor não filtra pela Conta sem
// o número interno da empresa no LinkedIn, então a vaga só vira Sinal quando a empresa da vaga é a Conta (página do
// LinkedIn, site ou nome). Campos lidos: os do README e do esquema de entrada do actor (build 1.7.17); a execução real
// que os confirma é passo do Nan.
import type { AdaptadorDeSinal } from '../handler.ts'
import { dataIso, diasDoPeriodo, mesmaEmpresa, objetos, paisesDaLocalizacao, primeiroTexto, semRepetidos } from './comum.ts'
import type { ContaParaVarrer } from '../handler.ts'
import { buscasDasFuncoes, sinalDaVaga, type Vaga, vagaAtende, vagaDoNichoPelaRegra, vagasDoNicho, nichoCustom } from './vagas.ts'

const MAX_ITENS = 50
// O LinkedIn aceita até algumas buscas por execução sem estourar o tempo da função (60 s por Conta).
const MAX_BUSCAS = 4

function linkDaVaga(item: Record<string, unknown>): string {
  const id = primeiroTexto(item, 'id')
  if (/^\d+$/.test(id)) return `https://www.linkedin.com/jobs/view/${id}`
  return primeiroTexto(item, 'link').split('?')[0]
}

export const vagaLinkedin: AdaptadorDeSinal = {
  signalType: 'vaga_linkedin',

  entrada(conta, criterios) {
    const segundos = diasDoPeriodo(criterios) * 24 * 60 * 60
    const paises = paisesDaLocalizacao(criterios)
    const termos = termosDaBusca(conta.name, buscasDasFuncoes(criterios), Math.max(1, Math.floor(MAX_BUSCAS / paises.length)))
    const urls: string[] = []
    for (const pais of paises) {
      for (const termo of termos) {
        const busca = new URLSearchParams({ keywords: termo, location: pais.nomeEmIngles, f_TPR: `r${segundos}` })
        urls.push(`https://www.linkedin.com/jobs/search/?${busca}`)
      }
    }
    const escolhidas = urls.slice(0, MAX_BUSCAS)
    return {
      input: { urls: escolhidas, scrapeCompany: false, limitPerSource: Math.ceil(MAX_ITENS / escolhidas.length) },
      maxItems: MAX_ITENS,
    }
  },

  sinais(itens, conta, criterios, agora) {
    const nicho = nichoCustom(criterios)
    const vagas = vagasDaConta(itens, conta, criterios, agora).filter((v) => !nicho || vagaDoNichoPelaRegra(v, nicho))
    return semRepetidos(vagas.map((v) => sinalDaVaga(v, conta, FONTE, agora)))
  },

  async sinaisComContexto(itens, conta, criterios, agora, ctx) {
    const vagas = await vagasDoNicho(vagasDaConta(itens, conta, criterios, agora), criterios, ctx)
    return semRepetidos(vagas.map((v) => sinalDaVaga(v, conta, FONTE, agora)))
  },
}

const FONTE = 'LinkedIn Vagas'

/**
 * Uma busca por função; quando há mais funções que buscas possíveis (cargos Custom), elas se juntam com OR na mesma
 * busca, para nenhuma ficar de fora.
 */
export function termosDaBusca(empresa: string, funcoes: string[], maximo: number): string[] {
  if (!funcoes.length) return [empresa]
  if (funcoes.length <= maximo) return funcoes.map((f) => `${empresa} ${f}`)
  const grupos: string[][] = Array.from({ length: maximo }, () => [])
  funcoes.forEach((f, i) => grupos[i % maximo].push(f))
  return grupos.map((g) => (g.length === 1 ? `${empresa} ${g[0]}` : `${empresa} (${g.join(' OR ')})`))
}

/** As vagas da Conta que passam por função, senioridade, palavras e período. */
function vagasDaConta(itens: unknown[], conta: ContaParaVarrer, criterios: Record<string, unknown>, agora: number): Vaga[] {
  return objetos(itens).flatMap((item) => {
    const empresa = {
      nome: primeiroTexto(item, 'companyName'),
      linkedinUrl: primeiroTexto(item, 'companyLinkedinUrl'),
      site: primeiroTexto(item, 'companyWebsite'),
    }
    const titulo = primeiroTexto(item, 'title')
    if (!titulo || !mesmaEmpresa(conta, empresa)) return []
    const vaga: Vaga = {
      titulo,
      local: primeiroTexto(item, 'location'),
      descricao: primeiroTexto(item, 'descriptionText'),
      nivel: primeiroTexto(item, 'seniorityLevel'),
      link: linkDaVaga(item),
      publicadaEm: dataIso(item.postedAtTimestamp) ?? dataIso(item.postedAt),
    }
    return vagaAtende(vaga, criterios, agora) ? [vaga] : []
  })
}
