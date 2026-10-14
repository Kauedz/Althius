// A vitrine de Sinais: o que cada prateleira mostra, o Sinal da semana e o que a página do Sinal diz de fonte,
// frequência, custo e resultado. Só escolhe e descreve; a única leitura é a dos pedidos (o Avise-me). Não muda o catálogo.

import capa1 from '@/assets/vitrine/capa-1.webp'
import capa2 from '@/assets/vitrine/capa-2.webp'
import capa3 from '@/assets/vitrine/capa-3.webp'
import capa4 from '@/assets/vitrine/capa-4.webp'
import {
  BriefcaseBusiness,
  Building2,
  History,
  Landmark,
  Megaphone,
  Newspaper,
  RadioTower,
  Scale,
  Ship,
  Star,
  UserRoundPlus,
  Wheat,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useDados, useDadosDeSinais, useFonteDeSinais } from '@/fonte/contexto'
import type { CardSobPedido, Monitoramento, PedidoDeSinal, SinalEncontrado } from '@/fonte/sinais-tipos'
import { DIA_EM_MS, VALIDADE_EM_DIAS, foiDisparado, parseDataDisparo } from '@/fonte/regras-sinais'
import { FAMILIAS } from './catalogo'
import { CATALOGO_VISIVEL, nomesDosNichos, valeParaTodosOsNichos, type CardDoCatalogo } from './catalogo-visivel'
import { NICHOS, type Nicho } from './nichos'

/** A vitrine segue o tema (claro ou escuro) e ocupa a área da página inteira, sob a barra de topo. */
export const ZONA_DA_VITRINE =
  'bg-al-bg text-al-ink -mx-4 -mt-6 -mb-16 flex min-h-[calc(100vh-4rem)] min-w-0 flex-col gap-6 px-4 py-6 md:-mx-10 md:px-10 md:py-8'

const CAPAS = [capa1, capa2, capa3, capa4]
const POSICOES = ['center', 'left top', 'right center', 'center bottom', 'left center', 'right top']

function semente(texto: string): number {
  let valor = 0
  for (const letra of texto) valor = (valor * 31 + letra.charCodeAt(0)) >>> 0
  return valor
}

/** A capa de um card: uma das quatro imagens da marca, num enquadramento que muda com o id. */
export function capaDoCard(id: string): { imagem: string; posicao: string } {
  const valor = semente(id)
  return { imagem: CAPAS[valor % CAPAS.length], posicao: POSICOES[Math.floor(valor / CAPAS.length) % POSICOES.length] }
}

/** Cards do catálogo que ainda não têm coletor: vão para Lançamentos, com Avise-me, e não abrem Monitoramento. */
const LANCAMENTOS = new Set(CATALOGO_VISIVEL.filter((card) => card.coletores.length === 0).map((card) => card.id))

export function eLancamento(id: string): boolean {
  return LANCAMENTOS.has(id)
}

/** Os cards que entraram no catálogo com as cascatas de 13/10/2026. */
const NOVOS = new Set([
  'nova-cooperativa',
  'entrada-de-socio',
  'mudanca-de-porte-ou-regime',
  'financiamento-bndes-finep',
  'nova-mercadoria-importada',
  'mudanca-regulatoria-e-licenca',
  'processos-e-recuperacao',
  'meta-esg-publicada',
  'grupo-a-e-cnae-eletrointensivo',
  'calendario-e-plano-safra',
  'proposta-recusada',
])

const FAMILIAS_DE_EQUIPE = ['vagas-e-equipes', 'movimentacao-profissional']
const FAMILIAS_DE_MIDIA = ['anuncios', 'presenca-publica', 'reputacao-e-concorrencia']

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Palavras que, nos Segmentos do ICP, apontam cada nicho. */
const PISTAS_DO_NICHO: Record<string, readonly string[]> = {
  'comex-e-importacao': ['comex', 'comercio exterior', 'importa', 'exporta', 'aduan', 'trading'],
  'contabilidade-e-tributario': ['contab', 'tribut', 'fiscal'],
  'juridico-empresarial': ['juridic', 'advoca', 'direito'],
  'energia-e-mercado-livre': ['energia', 'mercado livre', 'eletric'],
  'industria-fornecedores-b2b': ['industria', 'fabrica', 'manufatura', 'fornecedor'],
  'logistica-e-transporte': ['logistic', 'transporte', 'frete', 'armazen'],
  'corretoras-de-beneficios': ['corretora', 'beneficio', 'plano de saude', 'seguro'],
  'agro-b2b': ['agro', 'agricol', 'cooperativa', 'rural', 'safra'],
}

/** O nicho que os Segmentos do ICP do Workspace descrevem, ou nenhum quando o texto não aponta um. */
export function nichoDoWorkspace(segmentos: string): Nicho | undefined {
  const texto = normalizar(segmentos)
  if (!texto.trim()) return undefined
  let melhor: { nicho: Nicho; pistas: number } | undefined
  for (const nicho of NICHOS) {
    const pistas = (PISTAS_DO_NICHO[nicho.slug] ?? []).filter((pista) => texto.includes(pista)).length
    if (pistas > 0 && (!melhor || pistas > melhor.pistas)) melhor = { nicho, pistas }
  }
  return melhor?.nicho
}

export function ativosDoCard(card: CardDoCatalogo, monitoramentos: readonly Pick<Monitoramento, 'tipoId' | 'estado'>[]): number {
  return monitoramentos.filter((m) => m.estado === 'ativo' && card.contados.includes(m.tipoId)).length
}

function doCard(card: CardDoCatalogo, sinal: Pick<SinalEncontrado, 'tipoId'>): boolean {
  return sinal.tipoId === card.id || card.contados.includes(sinal.tipoId)
}

export interface Prateleiras {
  paraOSeuNicho: CardDoCatalogo[]
  maisAtivados: CardDoCatalogo[]
  novos: CardDoCatalogo[]
  movimentoDeEquipe: CardDoCatalogo[]
  midiaEAnuncios: CardDoCatalogo[]
  lancamentos: CardDoCatalogo[]
}

/**
 * As prateleiras da vitrine. Os cards do catálogo global sem coletor só aparecem em Lançamentos. Os cards feitos sob
 * pedido (`exclusivos`) entram em Novos e na prateleira deles, montada à parte.
 */
export function montarPrateleiras({
  cards,
  exclusivos,
  monitoramentos,
  nicho,
}: {
  cards: readonly CardDoCatalogo[]
  exclusivos: readonly CardDoCatalogo[]
  monitoramentos: readonly Pick<Monitoramento, 'tipoId' | 'estado'>[]
  nicho?: Nicho
}): Prateleiras {
  const disponiveis = cards.filter((card) => !eLancamento(card.id))
  const ativos = new Map(disponiveis.map((card) => [card.id, ativosDoCard(card, monitoramentos)]))
  return {
    paraOSeuNicho: nicho
      ? disponiveis.filter((card) => card.nichos.includes(nicho.slug) && !valeParaTodosOsNichos(card))
          .concat(disponiveis.filter((card) => valeParaTodosOsNichos(card)))
      : disponiveis.filter((card) => valeParaTodosOsNichos(card)),
    maisAtivados: disponiveis
      .filter((card) => (ativos.get(card.id) ?? 0) > 0)
      .toSorted((a, b) => (ativos.get(b.id) ?? 0) - (ativos.get(a.id) ?? 0)),
    novos: [...exclusivos, ...disponiveis.filter((card) => NOVOS.has(card.id))],
    movimentoDeEquipe: disponiveis.filter((card) => FAMILIAS_DE_EQUIPE.includes(card.familiaId)),
    midiaEAnuncios: disponiveis.filter((card) => FAMILIAS_DE_MIDIA.includes(card.familiaId)),
    lancamentos: cards.filter((card) => eLancamento(card.id)),
  }
}

/**
 * O Sinal da semana: o card com mais disparos nos últimos sete dias do Workspace; sem disparo na semana, o do disparo
 * mais recente. Sem disparo nenhum, um card do nicho (ou de todos) que muda a cada semana.
 */
export function sinalDaSemana({
  cards,
  sinais,
  hoje,
  nicho,
}: {
  cards: readonly CardDoCatalogo[]
  sinais: readonly Pick<SinalEncontrado, 'tipoId' | 'data'>[]
  hoje: Date
  nicho?: Nicho
}): CardDoCatalogo | undefined {
  const disponiveis = cards.filter((card) => !eLancamento(card.id))
  const desde = hoje.getTime() - 7 * DIA_EM_MS
  const recentes = sinais.filter((sinal) => foiDisparado(sinal.data, hoje) && parseDataDisparo(sinal.data).getTime() >= desde)
  let melhor: { card: CardDoCatalogo; disparos: number } | undefined
  for (const card of disponiveis) {
    const disparos = recentes.filter((sinal) => doCard(card, sinal)).length
    if (disparos > 0 && (!melhor || disparos > melhor.disparos)) melhor = { card, disparos }
  }
  if (melhor) return melhor.card
  const ultimo = sinais
    .filter((sinal) => foiDisparado(sinal.data, hoje))
    .toSorted((a, b) => parseDataDisparo(b.data).getTime() - parseDataDisparo(a.data).getTime())
    .find((sinal) => disponiveis.some((card) => doCard(card, sinal)))
  if (ultimo) return disponiveis.find((card) => doCard(card, ultimo))
  const doNicho = nicho ? disponiveis.filter((card) => card.nichos.includes(nicho.slug)) : []
  const candidatos = doNicho.length > 0 ? doNicho : disponiveis
  if (candidatos.length === 0) return undefined
  const semana = Math.floor(hoje.getTime() / (7 * DIA_EM_MS))
  return candidatos[semana % candidatos.length]
}

/** As últimas empresas que o card detectou no Workspace: uma linha por Conta, do disparo mais recente ao mais antigo. */
export function ultimasDetectadas<S extends Pick<SinalEncontrado, 'tipoId' | 'data' | 'contaId'>>(
  card: CardDoCatalogo,
  sinais: readonly S[],
  hoje: Date,
  limite = 5,
): S[] {
  const vistas = new Set<string>()
  return sinais
    .filter((sinal) => doCard(card, sinal) && foiDisparado(sinal.data, hoje))
    .toSorted((a, b) => parseDataDisparo(b.data).getTime() - parseDataDisparo(a.data).getTime())
    .filter((sinal) => {
      if (vistas.has(sinal.contaId)) return false
      vistas.add(sinal.contaId)
      return true
    })
    .slice(0, limite)
}

function interno(card: CardDoCatalogo): boolean {
  return FAMILIAS.find((familia) => familia.id === card.familiaId)?.origem === 'interno'
}

/** De quanto em quanto tempo o Monitoramento olha a fonte. O Monitoramento roda uma vez por dia. */
export function frequenciaDoCard(card: CardDoCatalogo): string {
  if (interno(card)) return 'Uma avaliação por dia, pelas Interações do Workspace'
  if (/CNPJ|comércio exterior/.test(card.fonte)) return 'Varredura diária; a base pública é atualizada uma vez por mês'
  return 'Varredura diária de cada Conta do público'
}

/** O custo em créditos, como o editor do Monitoramento cobra. */
export function custoEmCreditos(card: CardDoCatalogo): string {
  return interno(card) ? 'Não gasta crédito' : '1 crédito por Conta varrida'
}

/**
 * O que o Sinal produz. Uma Conta-alvo fica Quente; a empresa que ainda não é Conta-alvo vira Candidata na Descoberta,
 * só onde a descoberta por perfil roda (a Demonstração, nas famílias que a aceitam).
 */
export function resultadoDoCard(card: CardDoCatalogo, operacional: boolean): string[] {
  const resultado = [`Conta Quente por ${VALIDADE_EM_DIAS} dias, nas suas Contas-alvo`]
  const familia = FAMILIAS.find((item) => item.id === card.familiaId)
  if (!operacional && familia?.descoberta) resultado.push('Candidata na Descoberta, quando a empresa ainda não é Conta-alvo')
  return resultado
}

/** O pedido de aviso de um lançamento vai pela mesma fila de pedidos à equipe, com este começo no evento. */
const PREFIXO_DO_AVISO = 'Avise-me quando lançar: '

export function eventoDoAviso(card: Pick<CardDoCatalogo, 'nome'>): string {
  return `${PREFIXO_DO_AVISO}${card.nome}`
}

export function ePedidoDeAviso(pedido: Pick<PedidoDeSinal, 'evento'>): boolean {
  return pedido.evento.startsWith(PREFIXO_DO_AVISO)
}

export type SituacaoDoExclusivo = 'Pedido recebido' | 'Em produção pela equipe Althius'

/** Os pedidos à equipe que ainda viram Sinal exclusivo, com a situação que a vitrine mostra. */
export function exclusivosEmProducao(pedidos: readonly PedidoDeSinal[]): { pedido: PedidoDeSinal; situacao: SituacaoDoExclusivo }[] {
  return pedidos
    .filter((pedido) => !ePedidoDeAviso(pedido))
    .flatMap((pedido): { pedido: PedidoDeSinal; situacao: SituacaoDoExclusivo }[] => {
      if (pedido.status === 'novo') return [{ pedido, situacao: 'Pedido recebido' }]
      if (pedido.status === 'em_analise' || pedido.status === 'em_construcao') {
        return [{ pedido, situacao: 'Em produção pela equipe Althius' }]
      }
      return []
    })
}

const ICONE_DA_FAMILIA: Record<string, LucideIcon> = {
  'vagas-e-equipes': BriefcaseBusiness,
  'movimentacao-profissional': UserRoundPlus,
  anuncios: Megaphone,
  'presenca-publica': Newspaper,
  'reputacao-e-concorrencia': Star,
  'expansao-e-registros': Building2,
  'capital-e-financas': Landmark,
  'comercio-exterior': Ship,
  regulacao: Scale,
  energia: Zap,
  agro: Wheat,
  'historico-comercial': History,
}

export function iconeDaFamilia(familiaId: string): LucideIcon {
  return ICONE_DA_FAMILIA[familiaId] ?? RadioTower
}

/** Um card feito sob pedido, no formato do catálogo. */
export function cardDoExtra(extra: CardSobPedido): CardDoCatalogo {
  const familia = FAMILIAS.find((item) => item.id === extra.familiaId)
  return {
    id: extra.id,
    nome: extra.nome,
    frase: extra.frase,
    familiaId: extra.familiaId,
    formulario: familia?.formulario ?? 'expansao',
    nichos: extra.nichos,
    fonte: extra.fonte,
    custoRotulo: extra.custoRotulo,
    custoUsd: null,
    coletores: extra.coletores,
    contados: [extra.id],
  }
}

/** Os pedidos de Sinal: a lista do Workspace e o Avise-me dos lançamentos, que vai pela mesma fila da equipe. */
export function usePedidosDaVitrine() {
  const fonte = useFonteDeSinais()
  const { dados: pedidos, recarregar } = useDadosDeSinais((f) => f.pedidosDeSinal(), [])
  const workspace = useDados((f) => f.workspace(), [])
  const lista: PedidoDeSinal[] = pedidos ?? []

  async function avisar(card: CardDoCatalogo) {
    const usuario = workspace?.usuario
    if (!usuario?.nome || !usuario.email) throw new Error('Não foi possível identificar o seu contato.')
    await fonte.pedirSinal({
      evento: eventoDoAviso(card),
      empresasOuNicho: valeParaTodosOsNichos(card) ? 'Todos os nichos' : nomesDosNichos(card.nichos).join(', '),
      urgencia: 'sem_pressa',
      contato: { nome: usuario.nome, email: usuario.email },
    })
    recarregar()
  }

  return {
    pedidos: lista,
    avisar,
    avisado: (card: CardDoCatalogo) => lista.some((pedido) => pedido.evento === eventoDoAviso(card)),
  }
}
