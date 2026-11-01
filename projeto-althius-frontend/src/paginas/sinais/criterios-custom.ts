// O nicho e os cargos escritos pelo usuário (Custom) em Abertura de vagas. Ficam nos critérios do Monitoramento:
// `nicho: 'custom'` com `nichoCustom`, e os cargos escritos na mesma lista `funcoes` das opções prontas. A busca usa os
// dois como foram escritos; o nicho Custom também filtra as vagas encontradas pela IA (signal-runner, adaptadores de vaga).
import { CAMPOS } from './catalogo'
import { CARGOS_POR_NICHO, nichoPorSlug } from './nichos'

export const NICHO_CUSTOM = 'custom'
/** O maior texto de um nicho ou cargo Custom. O signal-runner corta no mesmo limite. */
export const MAX_TEXTO_CUSTOM = 60
/** Quantos cargos Custom um Monitoramento aceita. O signal-runner usa o mesmo limite. */
export const MAX_CARGOS_CUSTOM = 10
/** Quantos setores escritos um Monitoramento aceita. O banco usa o mesmo limite. */
export const MAX_RECORTES_CUSTOM = 5

export interface RecorteDoMonitoramento {
  tipo: 'pronto' | 'custom'
  valor: string
  nome: string
}

/** Sem espaços nas pontas nem repetidos, até o limite. */
export function limparTextoCustom(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO_CUSTOM).trim()
}

function chave(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Lê recortes novos e antigos, limpa e remove repetidos mantendo a primeira grafia. */
export function recortesDoMonitoramento(criterios: Record<string, unknown>): RecorteDoMonitoramento[] {
  const nichos = Array.isArray(criterios.nichos)
    ? criterios.nichos
    : typeof criterios.nicho === 'string' && criterios.nicho !== 'custom' && criterios.nicho !== 'qualquer'
      ? [criterios.nicho]
      : []
  const custom = Array.isArray(criterios.nichosCustom)
    ? criterios.nichosCustom
    : criterios.nicho === 'custom' && typeof criterios.nichoCustom === 'string'
      ? [criterios.nichoCustom]
      : []
  const saida: RecorteDoMonitoramento[] = []
  const vistos = new Set<string>()
  for (const valor of nichos) {
    if (typeof valor !== 'string') continue
    const nicho = nichoPorSlug(valor)
    if (!nicho || vistos.has(`n:${valor}`)) continue
    vistos.add(`n:${valor}`)
    saida.push({ tipo: 'pronto', valor, nome: nicho.nome })
  }
  for (const valor of custom) {
    if (typeof valor !== 'string') continue
    const nome = limparTextoCustom(valor)
    const chaveNormalizada = chave(nome)
    if (!chaveNormalizada || vistos.has(`c:${chaveNormalizada}`) || saida.filter((r) => r.tipo === 'custom').length >= MAX_RECORTES_CUSTOM) continue
    vistos.add(`c:${chaveNormalizada}`)
    saida.push({ tipo: 'custom', valor: nome, nome })
  }
  return saida
}

/** Troca as chaves antigas pelas listas normalizadas ao editar e salvar pela tela nova. */
export function criteriosComRecortes(criterios: Record<string, unknown>, recortes: readonly RecorteDoMonitoramento[]): Record<string, unknown> {
  const { nicho: _nicho, nichoCustom: _nichoCustom, ...resto } = criterios
  const nichos = recortes.filter((r) => r.tipo === 'pronto').map((r) => r.valor)
  const nichosCustom = recortes.filter((r) => r.tipo === 'custom').map((r) => r.valor)
  return { ...resto, nichos, nichosCustom }
}

export function adicionarRecorteCustom(recortes: readonly RecorteDoMonitoramento[], entrada: string): { recortes: RecorteDoMonitoramento[]; erro?: string } {
  const nome = limparTextoCustom(entrada)
  if (entrada.replace(/\s+/g, ' ').trim().length > MAX_TEXTO_CUSTOM) {
    return { recortes: [...recortes], erro: `Cada setor tem até ${MAX_TEXTO_CUSTOM} caracteres.` }
  }
  const chaveNormalizada = chave(nome)
  if (!chaveNormalizada || recortes.some((r) => r.tipo === 'custom' && chave(r.valor) === chaveNormalizada)) return { recortes: [...recortes] }
  if (recortes.filter((r) => r.tipo === 'custom').length >= MAX_RECORTES_CUSTOM) {
    return { recortes: [...recortes], erro: `Até ${MAX_RECORTES_CUSTOM} setores escritos por Monitoramento.` }
  }
  return { recortes: [...recortes, { tipo: 'custom', valor: nome, nome }] }
}

/** Todas as sugestões de cargo: a lista geral e as de cada nicho. Um cargo fora delas foi escrito pelo usuário. */
const CARGOS_GERAIS = CAMPOS.vagas.flatMap((c) => (c.id === 'funcoes' && c.tipo === 'opcoes' ? c.opcoes : []))
const SUGESTOES = new Set([...CARGOS_GERAIS, ...Object.values(CARGOS_POR_NICHO).flat()].map(chave))

export function cargoSugerido(cargo: string): boolean {
  return SUGESTOES.has(chave(cargo))
}

/** Os cargos escritos pelo usuário entre os marcados: os que não estão nas opções que a tela mostra. */
export function cargosCustom(funcoes: readonly string[], opcoes: readonly string[]): string[] {
  const daTela = new Set(opcoes.map(chave))
  return funcoes.filter((f) => !daTela.has(chave(f)))
}

/** Ao trocar de nicho, os cargos sugeridos saem e os escritos pelo usuário ficam. */
export function manterCargosCustom(funcoes: readonly string[]): string[] {
  return funcoes.filter((f) => !cargoSugerido(f))
}

/**
 * Adiciona os cargos escritos (um ou vários, separados por vírgula). O que já está na lista não repete; o que é uma das
 * opções da tela só fica marcado. Devolve a lista nova e, quando algo ficou de fora, o motivo em palavras do produto.
 */
export function adicionarCargosCustom(
  funcoes: readonly string[],
  entrada: string,
  opcoes: readonly string[],
): { funcoes: string[]; erro?: string } {
  const novas = [...funcoes]
  let erro: string | undefined
  for (const parte of entrada.split(',')) {
    const cargo = parte.replace(/\s+/g, ' ').trim()
    if (!cargo) continue
    if (cargo.length > MAX_TEXTO_CUSTOM) {
      erro = `Cada cargo tem até ${MAX_TEXTO_CUSTOM} caracteres.`
      continue
    }
    if (novas.some((f) => chave(f) === chave(cargo))) continue
    const opcao = opcoes.find((o) => chave(o) === chave(cargo))
    if (opcao) {
      novas.push(opcao)
      continue
    }
    if (cargosCustom(novas, opcoes).length >= MAX_CARGOS_CUSTOM) {
      erro = `Até ${MAX_CARGOS_CUSTOM} cargos Custom por Monitoramento.`
      break
    }
    novas.push(cargo)
  }
  return { funcoes: novas, erro }
}
