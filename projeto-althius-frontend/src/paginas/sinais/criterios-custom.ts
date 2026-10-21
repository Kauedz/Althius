// O nicho e os cargos escritos pelo usuário (Custom) em Abertura de vagas. Ficam nos critérios do Monitoramento:
// `nicho: 'custom'` com `nichoCustom`, e os cargos escritos na mesma lista `funcoes` das opções prontas. A busca usa os
// dois como foram escritos; o nicho Custom também filtra as vagas encontradas pela IA (signal-runner, adaptadores de vaga).
import { CAMPOS } from './catalogo'
import { CARGOS_POR_NICHO } from './nichos'

export const NICHO_CUSTOM = 'custom'
/** O maior texto de um nicho ou cargo Custom. O signal-runner corta no mesmo limite. */
export const MAX_TEXTO_CUSTOM = 60
/** Quantos cargos Custom um Monitoramento aceita. O signal-runner usa o mesmo limite. */
export const MAX_CARGOS_CUSTOM = 10

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
