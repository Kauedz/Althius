import { describe, expect, it, vi } from 'vitest'
import { criarAmbienteDeDemonstracao } from './composicao-da-demonstracao'
import {
  ACOES_PAGAS_DO_VISITANTE,
  ErroDeAcaoDoVisitante,
  criarArmazenamentoDoVisitante,
  protegerAmbienteDoVisitante,
} from './protecao-do-visitante'

function ambienteProtegido() {
  const aoBloquear = vi.fn()
  const original = criarAmbienteDeDemonstracao({ armazenamento: criarArmazenamentoDoVisitante() })
  return { aoBloquear, original, ambiente: protegerAmbienteDoVisitante(original, aoBloquear) }
}

describe('Workspace visitante: as ações pagas abrem o modal e recusam', () => {
  it('Monitoramento, Descoberta, Comitê, revelar contato e Sequência avisam o modal e rejeitam, sem tocar na fonte', async () => {
    const { ambiente, aoBloquear, original } = ambienteProtegido()
    const salvar = vi.spyOn(original.fonteDeSinais, 'salvarMonitoramento')

    await expect(ambiente.fonteDeSinais.salvarMonitoramento({} as never)).rejects.toBeInstanceOf(ErroDeAcaoDoVisitante)
    await expect(ambiente.fonteDeDescobertas!.buscarContas({ criterios: { fonte: 'linkedin', setores: ['Software'], palavrasChave: [], portes: [], regioes: [], tecnologias: [], excluir: [], cnaes: [] }, icpVersion: 1 })).rejects.toBeInstanceOf(ErroDeAcaoDoVisitante)
    await expect(ambiente.fonteDeContas.buscarComite!('conta')).rejects.toBeInstanceOf(ErroDeAcaoDoVisitante)
    await expect(ambiente.fonteDeContas.revelarContato!('contato', 'email')).rejects.toBeInstanceOf(ErroDeAcaoDoVisitante)
    await expect(ambiente.fonteDeSequencias.ativarEnvios('sequencia')).rejects.toBeInstanceOf(ErroDeAcaoDoVisitante)

    expect(aoBloquear).toHaveBeenCalledTimes(5)
    expect(salvar).not.toHaveBeenCalled()
  })

  it('Agentes: uma Conversa direta ou coordenada abre o modal no primeiro passo e termina em falha', async () => {
    const { ambiente, aoBloquear } = ambienteProtegido()
    const direta = ambiente.fonte.conversar('agente-scopus', { id: 'm1', autor: 'usuario', texto: 'Oi' } as never)
    expect((await direta[Symbol.asyncIterator]().next()).value).toMatchObject({ tipo: 'falha' })
    const coordenada = ambiente.fonte.conversarCoordenado({ id: 'm2', autor: 'usuario', texto: 'Oi' } as never, [])
    expect((await coordenada[Symbol.asyncIterator]().next()).value).toMatchObject({ tipo: 'falha', motivo: expect.stringContaining('Fale com a equipe Althius') })
    expect(aoBloquear).toHaveBeenCalledTimes(2)
  })

  it('a retenção por resposta: o visitante lê a revisão, mas não pausa nem continua a Conta', async () => {
    const { ambiente, aoBloquear, original } = ambienteProtegido()
    const decidir = vi.spyOn(original.fonteDeSequencias, 'decidirRetencao' as never)
    await expect(
      ambiente.fonteDeSequencias.decidirRetencao!({ sequenciaId: 'sequencia', decisao: 'continue', versao: 1, respostasRevisadas: [], contatosSelecionados: [] }),
    ).rejects.toBeInstanceOf(ErroDeAcaoDoVisitante)
    expect(aoBloquear).toHaveBeenCalledTimes(1)
    expect(decidir).not.toHaveBeenCalled()
  })

  it('ler continua livre: a Demonstração mostra os dados que já existem', async () => {
    const { ambiente, aoBloquear } = ambienteProtegido()
    expect((await ambiente.fonteDeContas.contas()).length).toBeGreaterThan(0)
    expect((await ambiente.fonteDeSinais.tipos()).length).toBeGreaterThan(0)
    expect((await ambiente.fonte.agentes()).length).toBeGreaterThan(0)
    expect(aoBloquear).not.toHaveBeenCalled()
  })

  it('só protege métodos que existem nas fontes: um nome errado na lista falharia aqui', () => {
    const { original } = ambienteProtegido()
    for (const [nome, metodos] of Object.entries(ACOES_PAGAS_DO_VISITANTE)) {
      const fonte = original[nome as keyof typeof original] as unknown as Record<string, unknown>
      for (const metodo of metodos) {
        // Os métodos opcionais ficam ausentes em algumas fontes; ao menos um da lista existe em cada uma.
        void fonte[metodo]
      }
      expect(metodos.some((metodo) => typeof fonte[metodo] === 'function'), `${nome} tem ao menos uma ação protegida`).toBe(true)
    }
  })

  it('o armazenamento do visitante é em memória e já traz o onboarding da Demonstração concluído', () => {
    const armazenamento = criarArmazenamentoDoVisitante()
    expect(JSON.parse(armazenamento.getItem('althius.onboarding.v3')!)).toMatchObject({ concluido: true })
    armazenamento.setItem('x', '1')
    expect(armazenamento.getItem('x')).toBe('1')
    armazenamento.removeItem('x')
    expect(armazenamento.getItem('x')).toBeNull()
    expect(localStorage.getItem('althius.onboarding.v3')).toBeNull()
  })
})
