import type { ContaDescoberta } from './descobertas-tipos'

/** O motivo estruturado do descarte (feedback-que-ensina), além do texto livre. */
export type CodigoDoDescarte = 'setor' | 'porte' | 'regiao' | 'cliente_ou_concorrente' | 'sinal_fraco' | 'outro'

export const MOTIVOS_DO_DESCARTE: { codigo: CodigoDoDescarte; rotulo: string }[] = [
  { codigo: 'setor', rotulo: 'Setor fora do ICP' },
  { codigo: 'porte', rotulo: 'Porte errado' },
  { codigo: 'regiao', rotulo: 'Região fora' },
  { codigo: 'cliente_ou_concorrente', rotulo: 'Já é cliente ou concorrente' },
  { codigo: 'sinal_fraco', rotulo: 'Sinal fraco ou irrelevante' },
  { codigo: 'outro', rotulo: 'Outro' },
]

export type DimensaoAprendida = 'setor' | 'porte' | 'regiao' | 'tecnologia' | 'tipo_de_sinal'

/** Um ajuste que a Descoberta aprendeu com os aceites e descartes do Workspace. */
export interface AjusteAprendido {
  dimensao: DimensaoAprendida
  /** O valor normalizado (minúsculas), como o banco guarda. */
  valor: string
  /** Pontos somados ao Encaixe ICP (negativo tira peso). Não aparece na tela: só a frase. */
  ajuste: number
  decisoes: number
  atualizadoEm: string
}

const normal = (t?: string) => (t ?? '').trim().toLowerCase()

export function nomeDoValor(a: Pick<AjusteAprendido, 'dimensao' | 'valor'>): string {
  const v = a.dimensao === 'tipo_de_sinal' ? a.valor.replace(/_/g, ' ') : a.valor
  return a.dimensao === 'regiao' ? v.toUpperCase() : v.charAt(0).toUpperCase() + v.slice(1)
}

/** A frase de um ajuste, em linguagem de cliente. */
export function fraseDoAjuste(a: AjusteAprendido): string {
  const nome = nomeDoValor(a)
  if (a.ajuste < 0) return `Menos peso para ${nome} porque você descartou ${a.decisoes} parecidas`
  return a.dimensao === 'tipo_de_sinal'
    ? `Mais peso para ${nome} porque você aceitou ${a.decisoes} com esse Sinal`
    : `Mais peso para ${nome} porque você aceitou ${a.decisoes} parecidas`
}

/** Os ajustes que valem para uma candidata, do maior efeito ao menor. */
export function ajustesDaCandidata(c: ContaDescoberta, ajustes: AjusteAprendido[]): AjusteAprendido[] {
  const pares = new Set<string>([
    `setor:${normal(c.setor)}`,
    `porte:${normal(c.tamanho)}`,
    `regiao:${normal(c.uf)}`,
    ...c.motivosDeSinal.map((s) => `tipo_de_sinal:${normal(s.tipo)}`),
  ])
  return ajustes.filter((a) => pares.has(`${a.dimensao}:${a.valor}`)).sort((x, y) => Math.abs(y.ajuste) - Math.abs(x.ajuste))
}
