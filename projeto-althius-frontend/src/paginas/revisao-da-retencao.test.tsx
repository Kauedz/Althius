import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Revisão conjunta das respostas que retêm a Conta', () => {
  it('mostra as respostas pendentes no bloco atual e não libera com decisão obsoleta', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByRole('heading', { level: 2, name: /OpenAI/i })).toBeInTheDocument()
    expect(screen.getByText(/Participantes ·/i)).toBeInTheDocument()
    expect(screen.getByText('Abertura pelo Sinal')).toBeInTheDocument()

    await fonteDeSequencias.registrarRespostaCorrelacionada({
      sequenciaId: 'sequencia-openai',
      eventoId: 'evt-sarah',
      de: 'Sarah Chen',
      assunto: 'Re: Abertura',
    })
    await fonteDeSequencias.registrarRespostaCorrelacionada({
      sequenciaId: 'sequencia-openai',
      eventoId: 'evt-marcus',
      de: 'Marcus Vance',
      assunto: 'Re: Follow-up',
    })

    const revisao = await screen.findByLabelText('Revisão das respostas pendentes')
    expect(within(revisao).getByText('Retenção preventiva')).toBeInTheDocument()
    expect(within(revisao).getByText('Sarah Chen: Re: Abertura')).toBeInTheDocument()
    expect(within(revisao).getByText('Marcus Vance: Re: Follow-up')).toBeInTheDocument()
    expect(screen.getByText(/Participantes ·/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pausar abordagem' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retomar' })).not.toBeInTheDocument()

    fonteDeSequencias.decidirRetencao = async () => ({ outcome: 'stale', versao: 3 })
    await usuario.click(screen.getByRole('button', { name: 'Continuar envios da Conta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Chegou outra resposta. Revise o conjunto atual antes de continuar.')
    expect(screen.getByText('Pausada')).toBeInTheDocument()
    expect(screen.getByText('Abertura pelo Sinal')).toBeInTheDocument()
  })

  it('continua a Conta e reabre a revisão com a decisão persistida', async () => {
    const { fonteDeSequencias, usuario } = renderizarApp('/sequencias/sequencia-openai')
    await screen.findByRole('heading', { level: 2, name: /OpenAI/i })
    await fonteDeSequencias.registrarRespostaCorrelacionada({
      sequenciaId: 'sequencia-openai',
      eventoId: 'evt-sarah',
      de: 'Sarah Chen',
      assunto: 'Re: Abertura',
    })
    await screen.findByText('Sarah Chen: Re: Abertura')
    await usuario.click(screen.getByRole('button', { name: 'Continuar envios da Conta' }))

    await waitFor(() => {
      expect(screen.getByText('Ativa')).toBeInTheDocument()
    })
    const depois = await fonteDeSequencias.revisaoDeRetencao!('sequencia-openai')
    expect(depois.aberta).toBe(false)
    expect(depois.decisoes).toEqual([
      expect.objectContaining({ decisao: 'continue', versao: 1 }),
    ])
  })
})
