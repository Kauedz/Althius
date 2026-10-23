// A explicação que o Plano mostra à pessoa, em pt-BR e em palavras do produto: o que será acompanhado e com quais
// critérios. Serve ao planejador por regra e à IA quando a explicação dela não presta. Nunca cita fornecedor, ferramenta
// nem custo.
import { FRASE_DO_TIPO, LIMITES_DO_PLANO, ROTULO_DO_TIPO } from '../_shared/plano-do-sinal/index.ts'
import type { Criterios } from '../_shared/plano-do-sinal/index.ts'

function lista(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor : valor ? [valor] : []).join(', ')
}

export function explicacaoDoPlano(tipo: string, criterios: Criterios, totalDeContas: number): string {
  const rotulo = ROTULO_DO_TIPO[tipo] ?? 'Sinal'
  const contas = totalDeContas === 1 ? 'na Conta escolhida' : `nas ${totalDeContas} Contas escolhidas`
  const partes = [`Vamos acompanhar “${rotulo}” ${contas}: ${FRASE_DO_TIPO[tipo] ?? 'o que você descreveu'}.`]
  const cargos = lista(criterios.funcoes ?? criterios.cargos)
  if (cargos) partes.push(`Cargos: ${cargos}.`)
  if (typeof criterios.senioridade === 'string' && criterios.senioridade !== 'Qualquer') {
    partes.push(`Senioridade: ${criterios.senioridade.toLowerCase()}.`)
  }
  if (criterios.movimento) partes.push(`Movimento: ${lista(criterios.movimento).toLowerCase()}.`)
  if (typeof criterios.palavras === 'string' && criterios.palavras) partes.push(`Palavras: ${criterios.palavras}.`)
  if (typeof criterios.periodo === 'string') partes.push(`Período: ${criterios.periodo.toLowerCase()}.`)
  partes.push('Revise e ajuste antes de salvar.')
  return partes.join(' ').slice(0, LIMITES_DO_PLANO.explicacaoMax)
}
