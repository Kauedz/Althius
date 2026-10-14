// A forma comum das cascatas por ICP (B a H): uma empresa com os fatos que a trouxeram (CNPJ novo, filial nova, financiamento,
// notícia de expansão...). Cada passo de busca entrega `EmpresaComFatos`; o passo `casar_fatos_com_contas` cruza com as
// Contas-alvo do Workspace (CNPJ primeiro, depois página do LinkedIn, site ou nome) e entrega os Sinais confirmados, com o
// CNPJ da Conta para o passo da Receita. Só dado da empresa: nunca nome de pessoa.
import { LIMITES, mesmaEmpresa, nomeDaEmpresa, recortar } from '../../../signal-runner/adaptadores/comum.ts'
import type { ContaDoWorkspace, ImplDoPasso, Item } from '../tipos.ts'
import { chaveDaEmpresa, cnpjLimpo, objeto, texto } from './comum.ts'

/** Um acontecimento da empresa que pode virar Sinal. */
export interface Fato {
  /** Distingue este acontecimento dos outros da mesma empresa (a data do evento, o contrato, o mês...). */
  chave: string
  frase: string
  /** ISO 8601 do acontecimento (não da busca). */
  quando: string
  fonte: string
  evidencia: string
}

export interface EmpresaDoFato {
  nome: string
  cnpj?: string
  linkedinUrl?: string
  site?: string
  cnae?: string
  uf?: string
  municipio?: string
  porte?: string
}

export interface EmpresaComFatos {
  empresa: EmpresaDoFato
  fatos: Fato[]
}

export function itemDeEmpresaComFatos(e: EmpresaComFatos): Item {
  return { tipo: 'empresa_com_fatos', empresa: e.empresa, fatos: e.fatos }
}

export function empresaComFatosDoItem(item: Item): EmpresaComFatos | null {
  if (item.tipo !== 'empresa_com_fatos' || !Array.isArray(item.fatos)) return null
  const e = objeto(item.empresa)
  const nome = texto(e.nome)
  if (!nome) return null
  const fatos = (item.fatos as unknown[]).flatMap((f): Fato[] => {
    const o = objeto(f)
    return texto(o.chave) && texto(o.frase) && !Number.isNaN(Date.parse(texto(o.quando)))
      ? [{ chave: texto(o.chave), frase: texto(o.frase), quando: texto(o.quando), fonte: texto(o.fonte), evidencia: texto(o.evidencia) }]
      : []
  })
  return {
    empresa: {
      nome,
      ...(cnpjLimpo(e.cnpj) ? { cnpj: cnpjLimpo(e.cnpj) } : {}),
      ...(texto(e.linkedinUrl) ? { linkedinUrl: texto(e.linkedinUrl) } : {}),
      ...(texto(e.site) ? { site: texto(e.site) } : {}),
      ...(texto(e.cnae) ? { cnae: texto(e.cnae) } : {}),
      ...(texto(e.uf) ? { uf: texto(e.uf) } : {}),
      ...(texto(e.municipio) ? { municipio: texto(e.municipio) } : {}),
      ...(texto(e.porte) ? { porte: texto(e.porte) } : {}),
    },
    fatos,
  }
}

/** A Conta que é a empresa: o CNPJ decide quando as duas pontas o têm; senão, página do LinkedIn, site ou nome. */
export function contaDaEmpresa(contas: ContaDoWorkspace[], e: EmpresaDoFato): ContaDoWorkspace | undefined {
  const cnpj = cnpjLimpo(e.cnpj)
  if (cnpj) {
    const porCnpj = contas.find((c) => cnpjLimpo(c.cnpj) === cnpj)
    if (porCnpj) return porCnpj
  }
  return contas.find((c) => !cnpjLimpo(c.cnpj) || !cnpj ? mesmaEmpresa(c, { nome: e.nome, linkedinUrl: e.linkedinUrl, site: e.site }) : false)
}

/** O Sinal de um fato da empresa para a Conta (a chave é a empresa e o fato, com os limites do banco). */
export function sinalDoFato(conta: ContaDoWorkspace, e: EmpresaDoFato, f: Fato): Item {
  return {
    contaId: conta.id,
    contaNome: conta.name,
    eventKey: recortar(`${nomeDaEmpresa(conta.name) || nomeDaEmpresa(e.nome)}|${f.chave}`, LIMITES.chave),
    phrase: recortar(f.frase, LIMITES.frase),
    firedAt: f.quando,
    source: recortar(f.fonte, LIMITES.fonte),
    evidence: recortar(f.evidencia, LIMITES.evidencia),
    // Só para o passo da Receita: o CNPJ da Conta. Não vai para o Sinal.
    cnpjDaConta: cnpjLimpo(conta.cnpj) || cnpjLimpo(e.cnpj),
  }
}

export { chaveDaEmpresa }

const CPF_NO_NOME = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/

/**
 * Até 5 empresas achadas que não são Conta, para a validação. Junta com o que um passo anterior já guardou
 * (não apaga). Nome com CPF fica de fora. O motor grava isto na execução quando a rodada é de validação.
 */
export function lembrarAmostra(ctx: { memoria: Map<string, unknown> }, itens: { cnpj?: string | null; nome?: string | null }[]): void {
  const atual = ctx.memoria.get('semContaAmostra')
  const amostra: { cnpj: string | null; nome: string }[] = Array.isArray(atual)
    ? atual.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const o = item as { cnpj?: unknown; nome?: unknown }
      const nome = typeof o.nome === 'string' ? o.nome.trim() : ''
      const cnpj = typeof o.cnpj === 'string' && /^\d{14}$/.test(o.cnpj) ? o.cnpj : null
      return nome ? [{ cnpj, nome }] : []
    })
    : []
  const vistos = new Set(amostra.map((a) => a.cnpj || a.nome))
  for (const item of itens) {
    if (amostra.length >= 5) break
    const nome = (item.nome ?? '').trim()
    if (!nome || nome.length > 200 || CPF_NO_NOME.test(nome)) continue
    const cnpj = item.cnpj && /^\d{14}$/.test(item.cnpj) ? item.cnpj : null
    const chave = cnpj || nome
    if (vistos.has(chave)) continue
    vistos.add(chave)
    amostra.push({ cnpj, nome })
  }
  ctx.memoria.set('semContaAmostra', amostra)
}

/** `casar_fatos_com_contas`: cada fato de uma empresa que é Conta do Workspace vira Sinal da Conta; o resto só é contado. */
export const casarFatosComContas: ImplDoPasso = {
  executar(entrada, ctx) {
    const sinais = new Map<string, Item>()
    const semConta: string[] = []
    const fora: { cnpj: string | null; nome: string }[] = []
    for (const item of entrada) {
      const ef = empresaComFatosDoItem(item)
      if (!ef) continue
      const conta = contaDaEmpresa(ctx.contas, ef.empresa)
      if (!conta) {
        semConta.push(ef.empresa.nome)
        fora.push({ cnpj: cnpjLimpo(ef.empresa.cnpj) || null, nome: ef.empresa.nome })
        continue
      }
      for (const fato of ef.fatos) {
        const s = sinalDoFato(conta, ef.empresa, fato)
        if (!sinais.has(String(s.eventKey))) sinais.set(String(s.eventKey), s)
      }
    }
    ctx.memoria.set('semConta', semConta.length)
    ctx.memoria.set('semContaNomes', semConta.slice(0, 10))
    lembrarAmostra(ctx, fora)
    return [...sinais.values()]
  },
}
