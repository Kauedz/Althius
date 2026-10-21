// Abertura de vagas no mercado endereçável: em vez das Contas-alvo, o Monitoramento procura empresas que estão contratando
// os cargos escolhidos no nicho, no país e no estado. As que ainda não são Contas-alvo entram na Caixa de Descobertas para
// aceite manual. O país e o estado ficam nos critérios (`localizacao` e `estado`); o escopo, no público. O servidor confere
// os mesmos limites (20261114120000_vagas_no_mercado_enderecavel.sql) e cobra o preço fixo da rodada.
import type { Criterios } from './catalogo'
import type { Publico } from './dados-mock'

/** O preço fixo de uma rodada no mercado, em créditos. O banco usa o mesmo (`market_discovery_credits_per_run`). */
export const CREDITOS_POR_RODADA_NO_MERCADO = 4

export const PAISES_DO_MERCADO = ['Brasil', 'México', 'Colômbia', 'Argentina', 'Chile', 'Estados Unidos'] as const

export const ESTADOS_DO_BRASIL = [
  'Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás', 'Maranhão',
  'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí',
  'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo',
  'Sergipe', 'Tocantins',
] as const

export const PAIS_PADRAO = 'Brasil'

function sem<T extends object>(objeto: T, chave: string): T {
  return Object.fromEntries(Object.entries(objeto).filter(([k]) => k !== chave)) as T
}

export function noMercado(publico: Pick<Publico, 'escopo'> | undefined): boolean {
  return publico?.escopo === 'mercado'
}

/** O país escolhido no mercado: o primeiro da Localização que o mercado aceita. */
export function paisDoMercado(criterios: Criterios): string {
  const lista: unknown[] = Array.isArray(criterios.localizacao) ? criterios.localizacao : []
  return lista.find((p): p is string => typeof p === 'string' && (PAISES_DO_MERCADO as readonly string[]).includes(p)) ?? ''
}

export function estadoDoMercado(criterios: Criterios): string {
  return typeof criterios.estado === 'string' && (ESTADOS_DO_BRASIL as readonly string[]).includes(criterios.estado) ? criterios.estado : ''
}

/** Os critérios com o país escolhido: um país só; o estado sai quando o país não é o Brasil. */
export function comPais(criterios: Criterios, pais: string): Criterios {
  return pais === 'Brasil' ? { ...criterios, localizacao: [pais] } : { ...sem(criterios, 'estado'), localizacao: [pais] }
}

export function comEstado(criterios: Criterios, estado: string): Criterios {
  return estado ? { ...criterios, estado } : sem(criterios, 'estado')
}

/**
 * Trocar o escopo do público. No mercado, as Contas-alvo escolhidas saem e o país começa no padrão; voltar às Contas-alvo
 * tira o estado, que só o mercado usa.
 */
export function trocarEscopo(
  publico: Publico,
  criterios: Criterios,
  escopo: 'contas' | 'mercado',
): { publico: Publico; criterios: Criterios } {
  if (escopo === 'mercado') {
    return {
      publico: { ...publico, escopo: 'mercado', listas: [] },
      criterios: comPais(criterios, paisDoMercado(criterios) || PAIS_PADRAO),
    }
  }
  return { publico: sem(publico, 'escopo'), criterios: comEstado(criterios, '') }
}

/** O público do mercado em uma linha: "Mercado endereçável · Brasil · Rio de Janeiro". */
export function resumoDoMercado(criterios: Criterios): string {
  return ['Mercado endereçável', paisDoMercado(criterios), estadoDoMercado(criterios)].filter(Boolean).join(' · ')
}

export function custoDoMercado(): string {
  return `Cada rodada debita ${CREDITOS_POR_RODADA_NO_MERCADO} créditos, com qualquer número de empresas encontradas.`
}
