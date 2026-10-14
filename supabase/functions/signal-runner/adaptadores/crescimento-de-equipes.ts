// Equipe crescendo (PR-8, equipes-e-publicacoes): harvestapi/linkedin-company, o actor de página de empresa do LinkedIn
// que as cascatas já usam. A entrada é a página da Conta; do resultado sai só `employeeCount`, a contagem que a própria
// página informa (nunca dado de pessoa). Cada varredura grava a foto do dia em `private.account_headcount_snapshots` e
// compara com a foto mais antiga dos últimos 90 dias: dispara com 10% ou mais e 5 pessoas ou mais, ou com crescimento
// menor quando a Conta teve 3 ou mais vagas abertas no mesmo período (Sinais de vaga: elas reforçam). Sem foto anterior,
// a primeira rodada só grava a base. Campos lidos: os do README do actor (build 0.0.44, API pública do Apify em
// 14/10/2026) e os que a cascata do ICP de benefícios já lê (`employeeCount`, `linkedinUrl`, `universalName`).
import type { AdaptadorDeSinal, ContaParaVarrer, ContextoDoAdaptador, SinalDoAdaptador } from '../handler.ts'
import { exigirPaginaDoLinkedin, objetos, paginaDoLinkedin, primeiroTexto, sinal } from './comum.ts'

const DIA_EM_MS = 24 * 60 * 60 * 1000
export const JANELA_EM_DIAS = 90
export const CRESCIMENTO_MINIMO = 0.1
export const PESSOAS_A_MAIS_MINIMO = 5
export const VAGAS_QUE_REFORCAM = 3
const FONTE = 'LinkedIn (página da empresa)'

const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** A contagem de funcionários da página da Conta no resultado, ou nada. */
export function headcountDaConta(itens: unknown[], conta: ContaParaVarrer): number | null {
  const pagina = paginaDoLinkedin(conta.linkedinUrl)
  for (const item of objetos(itens)) {
    const n = item.employeeCount
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) continue
    const doItem = [paginaDoLinkedin(primeiroTexto(item, 'linkedinUrl')), primeiroTexto(item, 'universalName').toLowerCase()]
    // Uma página só na entrada: o item sem página reconhecível ainda é dela.
    if (!doItem.some(Boolean) || doItem.includes(pagina)) return n
  }
  return null
}

export interface Crescimento {
  antes: number
  agora: number
  dias: number
  vagas: number
}

/** A regra do PR-8: 10% e +5 pessoas, ou crescimento menor com 3 ou mais vagas abertas no período. */
export function equipeCrescendo({ antes, agora, vagas }: Crescimento): boolean {
  const amais = agora - antes
  if (amais <= 0 || antes <= 0) return false
  if (amais / antes >= CRESCIMENTO_MINIMO && amais >= PESSOAS_A_MAIS_MINIMO) return true
  return vagas >= VAGAS_QUE_REFORCAM
}

export function fraseDoCrescimento({ antes, agora, dias, vagas }: Crescimento): string {
  const comVagas = vagas > 0 ? `, com ${vagas} ${vagas === 1 ? 'vaga aberta' : 'vagas abertas'}` : ''
  return `Equipe passou de ${antes} para ${agora} pessoas em ${dias} dias${comVagas}`
}

export const crescimentoDeEquipes: AdaptadorDeSinal = {
  signalType: 'crescimento_de_equipes',

  entrada(conta) {
    return { input: { companies: [exigirPaginaDoLinkedin(conta)] }, maxItems: 1 }
  },

  // Sem o contexto (fotos e vagas), não há com o que comparar.
  sinais() {
    return []
  },

  async sinaisComContexto(itens, conta, _criterios, agoraMs, ctx: ContextoDoAdaptador): Promise<SinalDoAdaptador[]> {
    const agora = headcountDaConta(itens, conta)
    if (agora === null) return []
    const hoje = dia(agoraMs)
    const desde = dia(agoraMs - JANELA_EM_DIAS * DIA_EM_MS)
    const base = await ctx.headcount.base(conta.id, desde, hoje)
    await ctx.headcount.gravar(conta.id, { takenOn: hoje, headcount: agora }, FONTE)
    if (!base) return []
    const dias = Math.max(Math.round((Date.parse(hoje) - Date.parse(base.takenOn)) / DIA_EM_MS), 1)
    const vagas = await ctx.vagasAbertas(conta.id, new Date(agoraMs - JANELA_EM_DIAS * DIA_EM_MS).toISOString())
    const c: Crescimento = { antes: base.headcount, agora, dias, vagas }
    if (!equipeCrescendo(c)) return []
    const pct = Math.round(((agora - base.headcount) / base.headcount) * 1000) / 10
    return [sinal({
      eventKey: `crescimento_de_equipes|${paginaDoLinkedin(conta.linkedinUrl)}|${hoje.slice(0, 7)}`,
      phrase: fraseDoCrescimento(c),
      firedAt: new Date(agoraMs).toISOString(),
      source: FONTE,
      evidence: [
        `Funcionários na página da empresa no LinkedIn: ${base.headcount} em ${base.takenOn.split('-').reverse().join('/')}`,
        `e ${agora} em ${hoje.split('-').reverse().join('/')} (${pct.toLocaleString('pt-BR')}%, ${agora - base.headcount} pessoas a mais).`,
        vagas > 0 ? `${vagas} ${vagas === 1 ? 'vaga aberta vista' : 'vagas abertas vistas'} no mesmo período.` : '',
        'É a contagem que a própria página informa, não um número oficial.',
      ].filter(Boolean).join(' '),
    })]
  },
}
