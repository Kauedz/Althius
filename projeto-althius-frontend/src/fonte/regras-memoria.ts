// Regras da Memória do Workspace: o que cada módulo lê do documento vigente. Todos derivam do mesmo
// documento, então aprovar uma revisão atualiza de uma vez tudo que depende dele, sem cópias por tela.
import type { AgenteId, DocumentoDaMemoria, EspecialidadeId, SecaoDoDocumento } from './tipos'

/** Cada documento da Memória do Workspace e o Agente que o revisa. */
export const DOCUMENTOS_DA_MEMORIA: Record<
  DocumentoDaMemoria,
  { nome: string; comArtigo: string; titulo: string; agenteId: AgenteId; agente: string; especialidade: EspecialidadeId }
> = {
  icp: {
    nome: 'ICP',
    comArtigo: 'do ICP',
    titulo: 'Revisar o ICP do Workspace',
    agenteId: 'scopus',
    agente: 'Scopus',
    especialidade: 'scopus',
  },
}

export const ERRO_SO_ADMINISTRADOR_DECIDE_REVISAO = 'Somente Administradores aprovam ou recusam revisões do ICP e das Personas.'
export const ERRO_REVISAO_JA_DECIDIDA = 'Essa proposta já foi decidida.'

/** Aplica as mudanças de uma proposta: a seção de mesmo título é substituída; um título novo entra no fim. */
export function aplicarMudancas(secoes: SecaoDoDocumento[], mudancas: SecaoDoDocumento[]): SecaoDoDocumento[] {
  const resultado = secoes.map((secao) => mudancas.find((m) => m.titulo === secao.titulo) ?? secao)
  const novas = mudancas.filter((m) => !secoes.some((s) => s.titulo === m.titulo))
  return [...resultado, ...novas]
}

/** As seções que a proposta muda em relação ao documento de antes. */
export function secoesAlteradas(antes: SecaoDoDocumento[], proposto: SecaoDoDocumento[]): SecaoDoDocumento[] {
  return proposto.filter((secao) => antes.find((s) => s.titulo === secao.titulo)?.texto !== secao.texto)
}

const textoDe = (secoes: SecaoDoDocumento[], titulo: string) =>
  (secoes.find((s) => s.titulo === titulo)?.texto ?? '').replace(/\.$/, '')

/** O público recomendado dos Monitoramentos de Sinais: uma referência ao ICP vigente, não uma cópia dele. */
export const NOME_DO_PUBLICO_RECOMENDADO = 'ICP do Workspace'

/** O público recomendado dos Monitoramentos de Sinais, lido do ICP vigente. */
export function publicoRecomendado(icp: SecaoDoDocumento[]) {
  return {
    nome: NOME_DO_PUBLICO_RECOMENDADO,
    resumo: ['Porte', 'Maturidade de dados', 'Regiões'].map((titulo) => textoDe(icp, titulo)).filter(Boolean).join(' · '),
  }
}

/** O que a Habilidade "Pontuar aderência ao ICP" dos Agentes do Scopus usa do ICP vigente. */
export function criteriosDaAderencia(icp: SecaoDoDocumento[]): string {
  return ['Segmentos', 'Porte', 'Regiões'].map((titulo) => textoDe(icp, titulo)).filter(Boolean).join(' · ')
}

/** Uma configuração de outro módulo que lê o documento vigente: nunca guarda uma cópia. */
export interface Dependente {
  modulo: string
  nome: string
  resumo: string
}

/** Tudo que depende do ICP, com o que cada configuração passa a usar a partir destas seções. */
export function dependentesDoIcp(icp: SecaoDoDocumento[]): Dependente[] {
  return [
    { modulo: 'Sinais', nome: 'Público recomendado dos Monitoramentos', resumo: publicoRecomendado(icp).resumo },
    { modulo: 'Scopus', nome: 'Habilidade “Pontuar aderência ao ICP”', resumo: criteriosDaAderencia(icp) },
    { modulo: 'Agentes', nome: 'Contexto do Workspace na Memória dos Agentes', resumo: `Segmentos: ${textoDe(icp, 'Segmentos')}` },
  ]
}
