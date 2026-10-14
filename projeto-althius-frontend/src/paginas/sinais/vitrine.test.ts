import { describe, expect, it } from 'vitest'
import type { PedidoDeSinal } from '@/fonte/sinais-tipos'
import { CATALOGO_VISIVEL, cardPorId } from './catalogo-visivel'
import { nichoPorSlug } from './nichos'
import {
  custoEmCreditos,
  eLancamento,
  eventoDoAviso,
  exclusivosEmProducao,
  frequenciaDoCard,
  montarPrateleiras,
  nichoDoWorkspace,
  resultadoDoCard,
  sinalDaSemana,
  ultimasDetectadas,
} from './vitrine'

const HOJE = new Date(2026, 9, 14, 12)
const card = (id: string) => cardPorId(id)!

function pedido(evento: string, status: PedidoDeSinal['status']): PedidoDeSinal {
  return {
    id: `p-${evento}`,
    evento,
    empresasOuNicho: 'Comex e importação',
    urgencia: 'este_mes',
    contato: { nome: 'Ana', email: 'ana@exemplo.com' },
    status,
    criadoEm: '2026-10-10T12:00:00Z',
  }
}

describe('vitrine de Sinais', () => {
  it('lê o nicho nos Segmentos do ICP, e nenhum quando o texto não aponta um', () => {
    expect(nichoDoWorkspace('Importadoras e tradings de comércio exterior')?.slug).toBe('comex-e-importacao')
    expect(nichoDoWorkspace('Cooperativas agrícolas do Centro-Oeste')?.slug).toBe('agro-b2b')
    expect(nichoDoWorkspace('Serviços financeiros, varejo e telecomunicações.')).toBeUndefined()
    expect(nichoDoWorkspace('')).toBeUndefined()
  })

  it('o card sem coletor só aparece em Lançamentos', () => {
    const prateleiras = montarPrateleiras({ cards: CATALOGO_VISIVEL, exclusivos: [], monitoramentos: [] })
    expect(prateleiras.lancamentos.map((c) => c.id)).toEqual(['anuncios-google', 'publicacoes-da-empresa'])
    expect(eLancamento('anuncios-google')).toBe(true)
    expect(eLancamento('anuncios-meta')).toBe(false)
    const fora = [
      ...prateleiras.paraOSeuNicho,
      ...prateleiras.maisAtivados,
      ...prateleiras.novos,
      ...prateleiras.movimentoDeEquipe,
      ...prateleiras.midiaEAnuncios,
    ]
    expect(fora.some((c) => eLancamento(c.id))).toBe(false)
  })

  it('Para o seu nicho põe primeiro os cards do nicho; Mais ativados ordena pelos Monitoramentos ativos', () => {
    const prateleiras = montarPrateleiras({
      cards: CATALOGO_VISIVEL,
      exclusivos: [],
      nicho: nichoPorSlug('agro-b2b'),
      monitoramentos: [
        { tipoId: 'nova-lideranca', estado: 'ativo' },
        { tipoId: 'abertura-de-vagas', estado: 'ativo' },
        { tipoId: 'vagas-no-indeed', estado: 'ativo' },
        { tipoId: 'promocoes', estado: 'pausado' },
      ],
    })
    expect(prateleiras.paraOSeuNicho[0].nichos).not.toHaveLength(8)
    expect(prateleiras.paraOSeuNicho.map((c) => c.id)).toContain('nova-cooperativa')
    expect(prateleiras.paraOSeuNicho.map((c) => c.id)).not.toContain('entrada-de-socio')
    expect(prateleiras.maisAtivados.map((c) => c.id)).toEqual(['abertura-de-vagas', 'nova-lideranca'])
    expect(prateleiras.movimentoDeEquipe.every((c) => ['vagas-e-equipes', 'movimentacao-profissional'].includes(c.familiaId))).toBe(true)
    expect(prateleiras.midiaEAnuncios.map((c) => c.id)).toContain('anuncios-meta')
  })

  it('o Sinal da semana é o de mais disparos em sete dias, senão o do último disparo, senão um card do nicho que muda por semana', () => {
    const sinais = [
      { tipoId: 'nova-lideranca', data: '2026-10-13', contaId: 'a' },
      { tipoId: 'abertura-de-vagas', data: '2026-10-12', contaId: 'b' },
      { tipoId: 'vagas-no-indeed', data: '2026-10-11', contaId: 'c' },
      { tipoId: 'nova-lideranca', data: '2026-09-01', contaId: 'd' },
    ]
    expect(sinalDaSemana({ cards: CATALOGO_VISIVEL, sinais, hoje: HOJE })?.id).toBe('abertura-de-vagas')
    const antigos = [{ tipoId: 'promocoes', data: '2026-09-20', contaId: 'a' }, { tipoId: 'nova-lideranca', data: '2026-09-01', contaId: 'b' }]
    expect(sinalDaSemana({ cards: CATALOGO_VISIVEL, sinais: antigos, hoje: HOJE })?.id).toBe('promocoes')

    const doNicho = sinalDaSemana({ cards: CATALOGO_VISIVEL, sinais: [], hoje: HOJE, nicho: nichoPorSlug('energia-e-mercado-livre') })
    expect(doNicho?.nichos).toContain('energia-e-mercado-livre')
    expect(eLancamento(doNicho!.id)).toBe(false)
    const semanaQueVem = new Date(HOJE.getTime() + 7 * 86_400_000)
    expect(sinalDaSemana({ cards: CATALOGO_VISIVEL, sinais: [], hoje: semanaQueVem })?.id).not.toBe(
      sinalDaSemana({ cards: CATALOGO_VISIVEL, sinais: [], hoje: HOJE })?.id,
    )
  })

  it('a prévia mostra uma linha por empresa, do disparo mais recente, sem data futura', () => {
    const sinais = [
      { id: '1', tipoId: 'abertura-de-vagas', data: '2026-10-01', contaId: 'a' },
      { id: '2', tipoId: 'vagas-no-indeed', data: '2026-10-10', contaId: 'a' },
      { id: '3', tipoId: 'abertura-de-vagas', data: '2026-10-05', contaId: 'b' },
      { id: '4', tipoId: 'abertura-de-vagas', data: '2026-11-01', contaId: 'c' },
      { id: '5', tipoId: 'nova-lideranca', data: '2026-10-12', contaId: 'd' },
    ]
    expect(ultimasDetectadas(card('abertura-de-vagas'), sinais, HOJE).map((s) => s.id)).toEqual(['2', '3'])
  })

  it('a ficha do Sinal: frequência, custo em créditos e resultado', () => {
    expect(custoEmCreditos(card('abertura-de-vagas'))).toBe('1 crédito por Conta varrida')
    expect(custoEmCreditos(card('sem-resposta'))).toBe('Não gasta crédito')
    expect(frequenciaDoCard(card('entrada-de-socio'))).toMatch(/atualizada uma vez por mês/)
    expect(frequenciaDoCard(card('nova-lideranca'))).toBe('Varredura diária de cada Conta do público')
    expect(frequenciaDoCard(card('sem-resposta'))).toMatch(/Interações/)
    expect(resultadoDoCard(card('nova-lideranca'), false)).toEqual([
      'Conta Quente por 30 dias, nas suas Contas-alvo',
      'Candidata na Descoberta, quando a empresa ainda não é Conta-alvo',
    ])
    // No operacional a descoberta por perfil não roda: o resultado é só a Conta Quente.
    expect(resultadoDoCard(card('nova-lideranca'), true)).toEqual(['Conta Quente por 30 dias, nas suas Contas-alvo'])
    expect(resultadoDoCard(card('anuncios-meta'), false)).toHaveLength(1)
  })

  it('os exclusivos em produção deixam de fora o Avise-me e os pedidos encerrados', () => {
    const pedidos = [
      pedido('Hospitais com ala nova', 'novo'),
      pedido('Portos com fila', 'em_construcao'),
      pedido('Usinas novas', 'em_analise'),
      pedido('Escolas', 'disponivel'),
      pedido('Bancos', 'recusado'),
      pedido(eventoDoAviso(card('anuncios-google')), 'novo'),
    ]
    expect(exclusivosEmProducao(pedidos).map(({ pedido, situacao }) => [pedido.evento, situacao])).toEqual([
      ['Hospitais com ala nova', 'Pedido recebido'],
      ['Portos com fila', 'Em produção pela equipe Althius'],
      ['Usinas novas', 'Em produção pela equipe Althius'],
    ])
  })
})
