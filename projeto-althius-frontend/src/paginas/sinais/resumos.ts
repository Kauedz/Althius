import { CAMPOS, ROTULO_DA_ORIGEM, TIPO_PERSONALIZADO, formularioDoTipo, tipoPorId } from './catalogo'
import { NOME_DO_PUBLICO_RECOMENDADO } from '@/fonte/regras-memoria'
import { LISTAS, type EstadoDoMonitoramento, type Monitoramento, type Publico } from './dados-mock'
import { resumoDoPerfil } from './perfil'

// Textos de resumo de um Monitoramento, compartilhados pela página do tipo e pela revisão.

export function resumoDoPublico(publico: Publico): string {
  const listas = publico.listas.map((id) => LISTAS.find((l) => l.id === id)?.nome).filter(Boolean)
  const descoberta = publico.usaRecomendado
    ? `descoberta pelo ${NOME_DO_PUBLICO_RECOMENDADO}`
    : `descoberta por perfil personalizado: ${resumoDoPerfil(publico.perfil ?? {})}`
  const textoListas = listas.length > 0 ? `Listas ${listas.join(', ')}` : 'Nenhuma lista'
  if (publico.modo === 'listas') return textoListas
  if (publico.modo === 'descoberta') return descoberta.charAt(0).toUpperCase() + descoberta.slice(1)
  return `${textoListas} + ${descoberta}`
}

export interface CriterioFormatado {
  rotulo: string
  texto: string
  /** Um número só se entende com o rótulo (ex.: "Há pelo menos 45 dias"). */
  numerico: boolean
}

/** Cada critério preenchido de um Monitoramento pronto, como rótulo e texto. */
export function criteriosFormatados(monitoramento: Monitoramento): CriterioFormatado[] {
  const tipo = tipoPorId(monitoramento.tipoId)
  const formulario = tipo && formularioDoTipo(tipo)
  if (!formulario) return []
  return CAMPOS[formulario].flatMap((campo) => {
    const valor = monitoramento.criterios[campo.id]
    const texto = Array.isArray(valor) ? valor.join(', ') : valor
    if (!texto) return []
    const numerico = campo.tipo === 'numero'
    return [{ rotulo: campo.rotulo, texto: numerico ? `${texto} ${campo.sufixo}` : texto, numerico }]
  })
}

export function resumoDosCriterios(monitoramento: Monitoramento): string {
  if (monitoramento.tipoId === TIPO_PERSONALIZADO.id) {
    if (!monitoramento.criteriosLivres?.length) return 'A Althius está preparando os critérios a partir da descrição.'
    const origem = monitoramento.origem ? `${ROTULO_DA_ORIGEM[monitoramento.origem]} · ` : ''
    return origem + monitoramento.criteriosLivres.join(' · ')
  }
  return criteriosFormatados(monitoramento)
    .map(({ rotulo, texto, numerico }) => (numerico ? `${rotulo} ${texto}` : texto))
    .join(' · ')
}

/** A ação principal de cada estado, na lista de Monitoramentos. */
export const ACAO_DO_ESTADO: Record<EstadoDoMonitoramento, string> = {
  rascunho: 'Continuar',
  'em-preparacao': 'Acompanhar',
  ativo: 'Editar',
  pausado: 'Editar',
}
