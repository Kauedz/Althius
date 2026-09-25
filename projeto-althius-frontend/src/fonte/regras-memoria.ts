// Regras da Memória do Workspace: o que cada módulo lê do documento vigente. Todos derivam do mesmo
// documento, então aprovar uma revisão atualiza de uma vez tudo que depende dele, sem cópias por tela.
import type { AgenteId, DocumentoDaMemoria, EspecialidadeId, SecaoDoDocumento } from './tipos'

/** Cada documento da Memória do Workspace, com o Agente que o revisa e as formas do nome nas frases. */
export const DOCUMENTOS_DA_MEMORIA: Record<
  DocumentoDaMemoria,
  {
    nome: string
    /** O nome com o artigo que concorda com ele ("o ICP", "as Personas"). */
    oNome: string
    comArtigo: string
    /** O ICP é masculino singular; as Personas, feminino plural: o que as frases usam para concordar. */
    femininoPlural: boolean
    titulo: string
    agenteId: AgenteId
    agente: string
    especialidade: EspecialidadeId
    exemploDePedido: string
  }
> = {
  icp: {
    nome: 'ICP',
    oNome: 'o ICP',
    comArtigo: 'do ICP',
    femininoPlural: false,
    titulo: 'Revisar o ICP do Workspace',
    agenteId: 'scopus',
    agente: 'Scopus',
    especialidade: 'scopus',
    exemploDePedido: 'Ex.: estamos fechando com empresas menores na Colômbia e no Chile.',
  },
  personas: {
    nome: 'Personas',
    oNome: 'as Personas',
    comArtigo: 'das Personas',
    femininoPlural: true,
    titulo: 'Revisar as Personas do Workspace',
    agenteId: 'ethos',
    agente: 'Ethos',
    especialidade: 'ethos',
    exemploDePedido: 'Ex.: governança de dados aparece em quase todas as objeções.',
  },
}

/** Se o valor identifica um documento da Memória do Workspace ("icp" ou "personas"). */
export const ehDocumentoDaMemoria = (valor: unknown): valor is DocumentoDaMemoria =>
  typeof valor === 'string' && valor in DOCUMENTOS_DA_MEMORIA

/**
 * As frases de um documento: `concordar('muda', 'mudam')` escolhe a forma do ICP (masculino singular) ou a das
 * Personas (feminino plural). `oVigente` é "o ICP vigente" ou "as Personas vigentes"; as demais são as formas que
 * várias telas repetem.
 */
export function frasesDo(documento: DocumentoDaMemoria) {
  const { oNome, femininoPlural } = DOCUMENTOS_DA_MEMORIA[documento]
  const concordar = (singular: string, noPlural: string) => (femininoPlural ? noPlural : singular)
  return {
    concordar,
    oVigente: `${oNome} ${concordar('vigente', 'vigentes')}`,
    foiSubstituido: concordar('foi substituído', 'foram substituídas'),
    naoMudou: concordar('não mudou', 'não mudaram'),
    dele: concordar('dele', 'delas'),
  }
}

/** A frase com a primeira letra maiúscula, para começar uma sentença (ex.: "O ICP vigente…"). */
export const maiuscula = (frase: string) => frase.charAt(0).toUpperCase() + frase.slice(1)

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

/** Os nomes das Personas definidas, na ordem do documento. */
export const nomesDasPersonas = (personas: SecaoDoDocumento[]) => personas.map((persona) => persona.titulo).join(', ')

/** O que a Habilidade "Sequência por persona" dos Agentes do Rhetor usa das Personas vigentes. */
export function variacoesPorPersona(personas: SecaoDoDocumento[]): string {
  return `Uma variação para cada uma das ${personas.length} Personas: ${nomesDasPersonas(personas)}`
}

const CONTEXTO_DOS_AGENTES = 'Contexto do Workspace na Memória dos Agentes'

/** Tudo que depende do documento, com o que cada configuração passa a usar a partir destas seções. */
export function dependentesDe(documento: DocumentoDaMemoria, secoes: SecaoDoDocumento[]): Dependente[] {
  if (documento === 'icp') {
    return [
      { modulo: 'Sinais', nome: 'Público recomendado dos Monitoramentos', resumo: publicoRecomendado(secoes).resumo },
      { modulo: 'Scopus', nome: 'Habilidade “Pontuar aderência ao ICP”', resumo: criteriosDaAderencia(secoes) },
      { modulo: 'Agentes', nome: CONTEXTO_DOS_AGENTES, resumo: `Segmentos: ${textoDe(secoes, 'Segmentos')}` },
    ]
  }
  return [
    {
      modulo: 'Contas e Contatos',
      nome: 'Classificação de Contatos por Persona',
      resumo: `${secoes.length} Personas: ${nomesDasPersonas(secoes)}`,
    },
    { modulo: 'Rhetor', nome: 'Habilidade “Sequência por persona”', resumo: variacoesPorPersona(secoes) },
    { modulo: 'Agentes', nome: CONTEXTO_DOS_AGENTES, resumo: `A definição de cada uma das ${secoes.length} Personas` },
  ]
}
