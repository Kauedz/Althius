import { CAMPOS, ROTULO_DA_ORIGEM, TIPO_PERSONALIZADO, formularioDoTipo, tipoPorId } from './catalogo'
import { formatarDataDoModulo } from '@/fonte/formatar-data'
import { NOME_DO_PUBLICO_RECOMENDADO } from '@/fonte/regras-memoria'
import type { RodadaDoMonitoramento } from '@/fonte/sinais-tipos'
import { LISTAS, type EstadoDoMonitoramento, type Monitoramento, type Publico } from './dados-mock'
import { resumoDoPerfil } from './perfil'
import { recortesDoMonitoramento } from './criterios-custom'

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

/** A última rodada concluída de um Monitoramento do Workspace operacional: quando, quantas Contas e o que encontrou. */
export function resumoDaRodada(rodada: RodadaDoMonitoramento, hoje: Date): string {
  const { contasAvaliadas: contas, sinaisNovos: novos, sinaisReencontrados: reencontrados } = rodada
  return [
    `Última rodada: ${formatarDataDoModulo(rodada.data, hoje)}`,
    `${contas} ${contas === 1 ? 'Conta avaliada' : 'Contas avaliadas'}`,
    `${novos} ${novos === 1 ? 'Sinal novo' : 'Sinais novos'}`,
    ...(reencontrados > 0 ? [`${reencontrados} ${reencontrados === 1 ? 'reencontrado' : 'reencontrados'}`] : []),
  ].join(' · ')
}

/** O público de um Monitoramento do Workspace operacional: quantas Contas-alvo ele varre. */
export function resumoDasContas(quantidade: number): string {
  if (quantidade === 0) return 'Nenhuma Conta-alvo'
  return `${quantidade} ${quantidade === 1 ? 'Conta-alvo' : 'Contas-alvo'}`
}

export interface CriterioFormatado {
  rotulo: string
  texto: string
  /** Um número só se entende com o rótulo (ex.: "Há pelo menos 45 dias"). */
  numerico: boolean
}

/** Cada critério preenchido de um Monitoramento pronto, como rótulo e texto. */
export function criteriosFormatados(monitoramento: Pick<Monitoramento, 'tipoId' | 'criterios'>): CriterioFormatado[] {
  const tipo = tipoPorId(monitoramento.tipoId)
  const formulario = tipo && formularioDoTipo(tipo)
  if (!formulario) return []
  return [...nichoFormatado(monitoramento), ...CAMPOS[formulario].flatMap((campo) => {
    const valor = monitoramento.criterios[campo.id]
    const texto = Array.isArray(valor) ? valor.join(', ') : valor
    if (!texto) return []
    const numerico = campo.tipo === 'numero'
    return [{ rotulo: campo.rotulo, texto: numerico ? `${texto} ${campo.sufixo}` : texto, numerico }]
  })]
}

/** Os recortes de Abertura de vagas, pelos nomes legíveis e compatíveis com critérios antigos. */
function nichoFormatado({ tipoId, criterios }: Pick<Monitoramento, 'tipoId' | 'criterios'>): CriterioFormatado[] {
  if (tipoId !== 'abertura-de-vagas') return []
  const nomes = recortesDoMonitoramento(criterios).map((recorte) => recorte.nome)
  return nomes.length ? [{ rotulo: 'Nichos', texto: nomes.join(', '), numerico: false }] : []
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
