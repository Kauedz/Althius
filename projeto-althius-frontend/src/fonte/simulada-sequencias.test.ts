import { describe, expect, it, vi } from 'vitest'
import { criarFonteDeSequenciasSimulada } from './simulada-sequencias'

describe('FonteDeSequenciasSimulada', () => {
  const hojeFixo = new Date(2026, 8, 23, 12, 0, 0)

  it('hoje() devolve a data de referência configurada', () => {
    const fonte = criarFonteDeSequenciasSimulada({ hoje: hojeFixo })
    expect(fonte.hoje()).toEqual(hojeFixo)
  })

  it('lista as sequências da demo com dados iniciais completos', async () => {
    const fonte = criarFonteDeSequenciasSimulada({ hoje: hojeFixo })
    const lista = await fonte.sequencias()

    expect(lista.length).toBe(7)
    const contas = lista.map((s) => s.contaId)
    expect(contas).toContain('openai')
    expect(contas).toContain('anthropic')
    expect(contas).toContain('stripe')
    expect(contas).toContain('nubank')
    expect(contas).toContain('snowflake')
    expect(contas).toContain('cloudflare')
    expect(contas).toContain('gitlab')

    const openai = lista.find((s) => s.contaId === 'openai')
    expect(openai).toBeDefined()
    expect(openai?.status).toBe('ativa')
    expect(openai?.totalParticipantes).toBe(3)
    expect(openai?.steps.length).toBe(6)
    expect(openai?.regraDePause).toContain('Qualquer resposta nesta Conta-alvo')
  })

  it('sequencia(id) devolve a sequência por id ou rejeita se não existir', async () => {
    const fonte = criarFonteDeSequenciasSimulada({ hoje: hojeFixo })
    const seq = await fonte.sequencia('sequencia-openai')
    expect(seq.contaId).toBe('openai')

    await expect(fonte.sequencia('inexistente')).rejects.toThrow('não encontrada')
  })

  it('sequenciaPorConta(contaId) devolve a sequência ou null se não houver', async () => {
    const fonte = criarFonteDeSequenciasSimulada({ hoje: hojeFixo })
    const seqOpenAI = await fonte.sequenciaPorConta('openai')
    expect(seqOpenAI?.id).toBe('sequencia-openai')

    const seqInexistente = await fonte.sequenciaPorConta('conta-sem-sequencia')
    expect(seqInexistente).toBeNull()
  })

  it('criarSequencia cria nova sequência para uma Conta-alvo e rejeita se já existir', async () => {
    const fonte = criarFonteDeSequenciasSimulada({ hoje: hojeFixo })

    const nova = await fonte.criarSequencia({
      contaId: 'figma',
      participantesIds: ['contato-figma-1'],
    })

    expect(nova.id).toBe('sequencia-figma')
    expect(nova.contaId).toBe('figma')
    expect(nova.status).toBe('ativa')
    expect(nova.totalParticipantes).toBe(1)
    expect(nova.regraDePause).toContain('Qualquer resposta nesta Conta-alvo')

    // Tentar criar outra sequência para a mesma Conta-alvo deve falhar
    await expect(
      fonte.criarSequencia({
        contaId: 'figma',
        participantesIds: ['contato-figma-2'],
      }),
    ).rejects.toThrow('já possui uma sequência')
  })

  it('atualizarDocumento atualiza participantes, steps e regra de pause, notificando observadores', async () => {
    const fonte = criarFonteDeSequenciasSimulada({ hoje: hojeFixo })
    const ouvinte = vi.fn()
    const cancelar = fonte.observar(ouvinte)

    const atualizada = await fonte.atualizarDocumento('sequencia-openai', {
      regraDePause: 'Regra customizada de pause',
      participantesIds: ['contato-openai-1'],
    })

    expect(atualizada.regraDePause).toBe('Regra customizada de pause')
    expect(atualizada.participantesIds).toEqual(['contato-openai-1'])
    expect(atualizada.totalParticipantes).toBe(1)
    expect(atualizada.atualizadaEm).toBeDefined()
    expect(ouvinte).toHaveBeenCalled()

    cancelar()
  })

  it('salva e reabre liberação/predecessor; rejeita ciclo; legado serial continua válido', async () => {
    const fonte = criarFonteDeSequenciasSimulada({ hoje: hojeFixo })
    const atual = await fonte.sequencia('sequencia-openai')
    const [a, b, ...resto] = atual.steps

    const comDeps = await fonte.atualizarDocumento('sequencia-openai', {
      steps: [
        { ...a, liberacao: 'ativacao' },
        { ...b, liberacao: 'predecessor', predecessorId: a.id, contatoId: 'contato-openai-2' },
        ...resto,
      ],
    })
    expect(comDeps.steps[1].predecessorId).toBe(a.id)
    expect(comDeps.steps[1].contatoId).toBe('contato-openai-2')

    const reaberta = await fonte.sequencia('sequencia-openai')
    expect(reaberta.steps[1].liberacao).toBe('predecessor')
    expect(reaberta.steps[1].predecessorId).toBe(a.id)

    await expect(
      fonte.atualizarDocumento('sequencia-openai', {
        steps: [
          { ...a, liberacao: 'predecessor', predecessorId: b.id },
          { ...b, liberacao: 'predecessor', predecessorId: a.id },
        ],
      }),
    ).rejects.toThrow(/ciclo/i)

    // Legado sem liberacao continua aceito
    await expect(
      fonte.atualizarDocumento('sequencia-openai', {
        steps: atual.steps.map(({ liberacao: _l, predecessorId: _p, ...s }) => s),
      }),
    ).resolves.toBeTruthy()
  })

  it('confirmarParticipantes atualiza os participantes da sequência', async () => {
    const fonte = criarFonteDeSequenciasSimulada({ hoje: hojeFixo })
    const seq = await fonte.confirmarParticipantes('sequencia-openai', [
      'contato-openai-1',
      'contato-openai-2',
    ])

    expect(seq.participantesIds).toEqual(['contato-openai-1', 'contato-openai-2'])
    expect(seq.totalParticipantes).toBe(2)
  })

  it('metricasDeDemo devolve resumo de cobertura, steps e status', async () => {
    const fonte = criarFonteDeSequenciasSimulada({ hoje: hojeFixo })
    const metricasStripe = await fonte.metricasDeDemo('sequencia-stripe')

    expect(metricasStripe).toBeDefined()
    expect(metricasStripe?.status).toBe('reuniao')
    expect(metricasStripe?.reunioes).toBe(1)
    expect(metricasStripe?.coberturaContatos).toBe(2)
    expect(metricasStripe?.totalSteps).toBe(5)

    const metricasInexistente = await fonte.metricasDeDemo('inexistente')
    expect(metricasInexistente).toBeNull()
  })

  it('definirFalha faz operações lançarem erro e notifica ouvintes', async () => {
    const fonte = criarFonteDeSequenciasSimulada({ hoje: hojeFixo })
    const ouvinte = vi.fn()
    fonte.observar(ouvinte)

    fonte.definirFalha(true)
    expect(ouvinte).toHaveBeenCalledTimes(1)

    await expect(fonte.sequencias()).rejects.toThrow('Falha ao carregar dados de sequências')

    fonte.definirFalha(false)
    expect(ouvinte).toHaveBeenCalledTimes(2)
    const lista = await fonte.sequencias()
    expect(lista.length).toBe(7)
  })

  it('definirVazia limpa a lista de sequências e pode restaurar os dados iniciais', async () => {
    const fonte = criarFonteDeSequenciasSimulada({ hoje: hojeFixo })
    const ouvinte = vi.fn()
    fonte.observar(ouvinte)

    fonte.definirVazia(true)
    expect(ouvinte).toHaveBeenCalledTimes(1)
    expect(await fonte.sequencias()).toEqual([])

    fonte.definirVazia(false)
    expect(ouvinte).toHaveBeenCalledTimes(2)
    const restaurada = await fonte.sequencias()
    expect(restaurada.length).toBe(7)
  })

  it('inicialização com vazia: true inicia com lista vazia', async () => {
    const fonte = criarFonteDeSequenciasSimulada({ vazia: true })
    expect(await fonte.sequencias()).toEqual([])
    expect(await fonte.sequenciaPorConta('openai')).toBeNull()
  })

  it('resposta correlacionada retém a Conta sem IA; duplicata não reabre e decisão velha não libera', async () => {
    const fonte = criarFonteDeSequenciasSimulada({ hoje: hojeFixo })
    const primeira = await fonte.registrarRespostaCorrelacionada({
      sequenciaId: 'sequencia-openai',
      eventoId: 'evt-1',
      de: 'Sarah Chen',
      assunto: 'Re: Abertura',
    })
    const segunda = await fonte.registrarRespostaCorrelacionada({
      sequenciaId: 'sequencia-openai',
      eventoId: 'evt-2',
      de: 'Marcus Vance',
      assunto: 'Re: Outro',
    })
    expect(primeira.aberta).toBe(true)
    expect(segunda.pendentes.map((item) => item.assunto)).toEqual(['Re: Abertura', 'Re: Outro'])
    expect((await fonte.sequencia('sequencia-openai')).status).toBe('pausada')

    const velha = await fonte.decidirRetencao!({
      sequenciaId: 'sequencia-openai',
      decisao: 'continue',
      versao: primeira.versao,
      respostasRevisadas: primeira.pendentes.map((item) => item.id),
    })
    expect(velha.outcome).toBe('stale')
    expect((await fonte.sequencia('sequencia-openai')).status).toBe('pausada')

    const atual = await fonte.decidirRetencao!({
      sequenciaId: 'sequencia-openai',
      decisao: 'continue',
      versao: segunda.versao,
      respostasRevisadas: segunda.pendentes.map((item) => item.id),
    })
    expect(atual.outcome).toBe('continued')
    expect((await fonte.sequencia('sequencia-openai')).status).toBe('ativa')

    await fonte.registrarRespostaCorrelacionada({
      sequenciaId: 'sequencia-openai',
      eventoId: 'evt-1',
      de: 'Sarah Chen',
      assunto: 'Re: Abertura',
    })
    expect((await fonte.revisaoDeRetencao!('sequencia-openai')).aberta).toBe(false)
    await expect(fonte.atualizarDocumento('sequencia-openai', { status: 'ativa' })).resolves.toBeTruthy()
  })
})
