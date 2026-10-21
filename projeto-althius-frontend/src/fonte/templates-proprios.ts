// Templates próprios (ticket 08): estrutura do criador, sem Contato, destino, histórico ou autorização.
// Salvar só aceita a prévia já parametrizada. A sugestão só devolve um template que o leitor pode ler.

import type { LiberacaoDoPasso } from './sequencias-tipos'
import type { PassoDeTemplate, SugestaoDeTemplate } from './templates-althius'

export interface LiteralDeTemplate {
  nome?: string
  email?: string
  empresa?: string
  cargo?: string
}

export interface EntradaDeTemplateProprio {
  nome: string
  resumo: string
  passos: unknown[]
  literais?: LiteralDeTemplate[]
}

export interface PreviaDeTemplateProprio {
  nome: string
  resumo: string
  passos: PassoDeTemplate[]
}

export interface TemplateProprio extends PreviaDeTemplateProprio {
  id: string
  donoId?: string
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g
const TELEFONE = /(?:\+\d{1,3}[\s.-]*)?(?:\(\d{2}\)[\s.-]*)?\d[\d\s().-]{7,}\d/g
const TETOS = new Set(['teto_atingido', 'sem_teto', 'sem_espaco'])
const CANAIS = new Set(['email', 'linkedin', 'whatsapp'])
const LIBERACOES = new Set<LiberacaoDoPasso>(['ativacao', 'predecessor', 'manual'])

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function substituicoes(literais: LiteralDeTemplate[]): { texto: string; variavel: string }[] {
  const pares: { texto: string; variavel: string }[] = []
  for (const item of literais) {
    const nome = item.nome?.trim() ?? ''
    if (nome.length >= 3) pares.push({ texto: nome, variavel: '{{nome}}' })
    const primeiro = nome.split(/\s+/)[0] ?? ''
    if (primeiro.length >= 3 && primeiro !== nome) pares.push({ texto: primeiro, variavel: '{{primeiro_nome}}' })
    if ((item.empresa?.trim().length ?? 0) >= 3) pares.push({ texto: item.empresa!.trim(), variavel: '{{empresa}}' })
    if ((item.cargo?.trim().length ?? 0) >= 3) pares.push({ texto: item.cargo!.trim(), variavel: '{{cargo}}' })
    if ((item.email?.trim().length ?? 0) >= 3) pares.push({ texto: item.email!.trim(), variavel: '{{email}}' })
  }
  return pares.sort((a, b) => b.texto.length - a.texto.length)
}

/** Troca e-mail, telefone, UUID e literais conhecidos. Não inventa dado que não estava no texto. */
export function parametrizarTexto(texto: string, literais: LiteralDeTemplate[] = []): string {
  let saida = texto.replace(EMAIL, '{{email}}').replace(UUID, '')
  saida = saida.replace(TELEFONE, (trecho) => {
    const digitos = trecho.replace(/\D/g, '')
    return digitos.length >= 8 && digitos.length <= 15 ? '' : trecho
  })
  for (const par of substituicoes(literais)) {
    saida = saida.replace(new RegExp(escapar(par.texto), 'gi'), par.variavel)
  }
  return saida.replace(/[ \t]{2,}/g, ' ').replace(/\s+\./g, ' .').trim()
}

function idEstrutural(id: string, ordem: number, mapa: Map<string, string>): string {
  if (UUID.test(id)) {
    UUID.lastIndex = 0
    const novo = `passo-${ordem}`
    mapa.set(id, novo)
    return novo
  }
  UUID.lastIndex = 0
  mapa.set(id, id)
  return id
}

export function previaParametrizada(entrada: EntradaDeTemplateProprio): PreviaDeTemplateProprio {
  const literais = entrada.literais ?? []
  const mapa = new Map<string, string>()
  const brutos = entrada.passos.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const passo = item as Record<string, unknown>
    const canal = typeof passo.canal === 'string' ? passo.canal : ''
    const titulo = typeof passo.titulo === 'string' ? passo.titulo.trim() : ''
    if (!CANAIS.has(canal) || !titulo) return []
    const ordem = typeof passo.ordem === 'number' && Number.isInteger(passo.ordem) ? passo.ordem : 0
    const idBruto = typeof passo.id === 'string' && passo.id.trim() ? passo.id.trim() : `passo-${ordem}`
    return [{ passo, canal, titulo, ordem, idBruto }]
  })
  const comId = brutos.map((item) => ({ ...item, id: idEstrutural(item.idBruto, item.ordem, mapa) }))
  const passos: PassoDeTemplate[] = comId.map((item) => {
    const liberacao = typeof item.passo.liberacao === 'string' ? item.passo.liberacao : ''
    const predecessor = typeof item.passo.predecessorId === 'string' ? item.passo.predecessorId : ''
    const assunto = typeof item.passo.assunto === 'string' ? parametrizarTexto(item.passo.assunto, literais) : ''
    const corpo = typeof item.passo.corpo === 'string' ? parametrizarTexto(item.passo.corpo, literais) : ''
    const objetivo = typeof item.passo.objetivo === 'string' ? parametrizarTexto(item.passo.objetivo, literais) : ''
    const delay = typeof item.passo.delayDiasUteis === 'number' ? item.passo.delayDiasUteis : 0
    const seguro: PassoDeTemplate = {
      id: item.id,
      ordem: item.ordem,
      canal: item.canal as PassoDeTemplate['canal'],
      delayDiasUteis: delay,
      titulo: parametrizarTexto(item.titulo, literais),
    }
    if (assunto) seguro.assunto = assunto
    if (corpo) seguro.corpo = corpo
    if (objetivo) seguro.objetivo = objetivo
    if (LIBERACOES.has(liberacao as LiberacaoDoPasso)) seguro.liberacao = liberacao as LiberacaoDoPasso
    if (predecessor && mapa.has(predecessor)) seguro.predecessorId = mapa.get(predecessor)
    return seguro
  })
  if (passos.length === 0 || passos.length > 8) {
    throw new Error('template requires safe preview')
  }
  return {
    nome: parametrizarTexto(entrada.nome, literais).slice(0, 80),
    resumo: parametrizarTexto(entrada.resumo, literais).slice(0, 300),
    passos,
  }
}

/** O salvamento só aceita o que a prévia já deixou seguro. Texto cru, com ID ou destino, não passa. */
export function templateProntoParaSalvar(entrada: EntradaDeTemplateProprio | PreviaDeTemplateProprio): boolean {
  try {
    const previa = previaParametrizada(entrada)
    const comparado = {
      nome: 'nome' in entrada ? entrada.nome : '',
      resumo: 'resumo' in entrada ? entrada.resumo : '',
      passos: entrada.passos,
    }
    return JSON.stringify(previa) === JSON.stringify(comparado)
  } catch {
    return false
  }
}

/**
 * Escolhe só um template cujo dono é o leitor. Sem Sinal, não escolhe.
 * Não devolve template de outra pessoa nem alega eficácia.
 */
export function sugerirTemplateProprio(entrada: {
  templates: readonly TemplateProprio[]
  leitorId: string
  conta: string
  sinal: { frase: string } | null
  teto?: string
}): SugestaoDeTemplate {
  if (entrada.teto && TETOS.has(entrada.teto)) {
    return { templateId: null, justificativa: '', motivo: 'teto' }
  }
  const frase = entrada.sinal?.frase.trim() ?? ''
  if (!frase) return { templateId: null, justificativa: '', motivo: 'sem_contexto' }
  const template = entrada.templates.find((item) => item.donoId === entrada.leitorId)
  if (!template) return { templateId: null, justificativa: '', motivo: 'indisponivel' }
  return {
    templateId: template.id,
    motivo: 'ok',
    justificativa:
      `A Conta ${entrada.conta.trim()} tem o Sinal “${frase}”. ` +
      `O seu template ${template.nome} é uma estrutura sua, sem destinatário e sem autorização. ` +
      'Não há medida de resultado deste template.',
  }
}
