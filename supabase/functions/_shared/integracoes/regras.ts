// A regra de cada ferramenta de um conector no Workspace (ADR-0022) somada à Permissão do Agente na Integração
// (ADR-0002), num lugar só. Quem usa: o Acesso (`chamarFerramenta`), que nunca chama o que a decisão recusa, e a
// ferramenta `usar_conector` dos Agentes, que propõe a Aprovação quando a decisão pede uma.
import type { Permissao } from './tipos.ts'

/** A regra do Administrador para uma ferramenta: sempre permitir, pedir Aprovação ou bloquear. */
export type RegraDaFerramenta = 'sempre' | 'aprovacao' | 'bloqueada'

/** As regras definidas numa Integração do Workspace, pelo nome da ferramenta. A ferramenta sem regra segue o padrão. */
export type RegrasDaIntegracao = Readonly<Record<string, RegraDaFerramenta>>

export type DecisaoDaChamada =
  | { tipo: 'executa' }
  | { tipo: 'pede_aprovacao' }
  | { tipo: 'negada'; motivo: 'bloqueada' | 'sem_permissao' | 'so_ler' }

const REGRAS: readonly string[] = ['sempre', 'aprovacao', 'bloqueada']

/** A regra que vale para a ferramenta: a definida, ou o padrão (leitura sempre, escrita ou gasto pede Aprovação). */
export function regraVigente(regras: RegrasDaIntegracao, ferramenta: { nome: string; escreve: boolean }): RegraDaFerramenta {
  const definida = Object.hasOwn(regras, ferramenta.nome) ? regras[ferramenta.nome] : undefined
  if (definida && REGRAS.includes(definida)) return definida
  return ferramenta.escreve ? 'aprovacao' : 'sempre'
}

/**
 * O que acontece quando um Agente chama a ferramenta: Ler nunca escreve (nem propõe); `bloqueada` vence tudo; `aprovacao`
 * exige uma Aprovação mesmo com Executar; `sempre` executa com Executar e pede Aprovação para a escrita com Propor.
 */
export function decidirChamada(a: { permissao: Permissao | null; escreve: boolean; regra: RegraDaFerramenta }): DecisaoDaChamada {
  if (a.regra === 'bloqueada') return { tipo: 'negada', motivo: 'bloqueada' }
  if (!a.permissao) return { tipo: 'negada', motivo: 'sem_permissao' }
  if (a.permissao === 'ler') {
    return !a.escreve && a.regra === 'sempre' ? { tipo: 'executa' } : { tipo: 'negada', motivo: 'so_ler' }
  }
  if (a.regra === 'aprovacao') return { tipo: 'pede_aprovacao' }
  if (!a.escreve || a.permissao === 'executar') return { tipo: 'executa' }
  return { tipo: 'pede_aprovacao' }
}
