import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PropostaDeResposta } from '@/fonte/sequencias-tipos'
import { RespostaSugerida } from './resposta-sugerida'

afterEach(cleanup)

const PRONTA: PropostaDeResposta = {
  id: 'proposta-1',
  canal: 'email',
  destinatario: 'carla@acme.com.br',
  nomeDoDestinatario: 'Carla',
  assunto: 'Re: Proposta',
  texto: 'Oi Carla, obrigado pelo retorno.',
  revisao: 2,
  status: 'pronta',
  mensagemDeOrigem: 'Pode me mandar mais detalhes?',
}

function montar(proposta: PropostaDeResposta, acoes: Partial<Parameters<typeof RespostaSugerida>[0]> = {}) {
  const props = {
    propostas: [proposta],
    aoAprovarEEnviar: vi.fn(async () => ({ enviada: true })),
    aoRejeitar: vi.fn(async () => {}),
    aoGerarDeNovo: vi.fn(async () => {}),
    ...acoes,
  }
  render(<RespostaSugerida {...props} />)
  return { ...props, usuario: userEvent.setup(), regiao: screen.getByRole('region', { name: 'Resposta sugerida' }) }
}

describe('Resposta sugerida (canais 08 e 09)', () => {
  it('mostra a sugestão para revisar e envia só com a Aprovação do titular', async () => {
    const { usuario, regiao, aoAprovarEEnviar } = montar(PRONTA)

    expect(within(regiao).getByText('Para Carla · carla@acme.com.br')).toBeInTheDocument()
    expect(within(regiao).getByText('Pode me mandar mais detalhes?')).toBeInTheDocument()
    await usuario.click(within(regiao).getByRole('button', { name: 'Aprovar e enviar' }))

    expect(aoAprovarEEnviar).toHaveBeenCalledWith({ id: 'proposta-1', revisao: 2 })
    expect(await within(regiao).findByText('Resposta enviada.')).toBeInTheDocument()
  })

  it('manda o texto editado junto com a Aprovação', async () => {
    const { usuario, regiao, aoAprovarEEnviar } = montar(PRONTA)

    const campo = within(regiao).getByLabelText('Texto da resposta')
    await usuario.clear(campo)
    await usuario.type(campo, 'Oi Carla, segue o material.')
    await usuario.click(within(regiao).getByRole('button', { name: 'Aprovar e enviar' }))

    expect(aoAprovarEEnviar).toHaveBeenCalledWith({ id: 'proposta-1', revisao: 2, textoEditado: 'Oi Carla, segue o material.' })
  })

  it('mostra o bloqueio do envio sem dizer que enviou', async () => {
    const { usuario, regiao } = montar(PRONTA, {
      aoAprovarEEnviar: vi.fn(async () => ({ enviada: false, mensagem: 'Sua Conta remetente não está pronta para enviar.' })),
    })

    await usuario.click(within(regiao).getByRole('button', { name: 'Aprovar e enviar' }))

    expect(await within(regiao).findByText('Sua Conta remetente não está pronta para enviar.')).toBeInTheDocument()
    expect(within(regiao).queryByText('Resposta enviada.')).not.toBeInTheDocument()
  })

  it('rejeita e gera de novo', async () => {
    const { usuario, regiao, aoRejeitar, aoGerarDeNovo } = montar(PRONTA)

    await usuario.click(within(regiao).getByRole('button', { name: 'Gerar de novo' }))
    expect(aoGerarDeNovo).toHaveBeenCalledWith('proposta-1')
    await usuario.click(within(regiao).getByRole('button', { name: 'Rejeitar' }))
    expect(aoRejeitar).toHaveBeenCalledWith('proposta-1')
  })

  it('não deixa aprovar uma proposta desatualizada', () => {
    const { regiao } = montar({ ...PRONTA, status: 'desatualizada' })

    expect(within(regiao).getByText('Chegou outra mensagem nesta conversa. Gere a resposta de novo antes de aprovar.')).toBeInTheDocument()
    expect(within(regiao).queryByRole('button', { name: 'Aprovar e enviar' })).not.toBeInTheDocument()
    expect(within(regiao).getByRole('button', { name: 'Gerar de novo' })).toBeInTheDocument()
  })

  it('avisa enquanto o Rhetor prepara e quando a geração falha', () => {
    montar({ ...PRONTA, status: 'gerando', texto: '' })
    expect(screen.getByText('O Rhetor está preparando uma resposta…')).toBeInTheDocument()
    cleanup()

    const { regiao } = montar({ ...PRONTA, status: 'falhou', texto: '' })
    expect(within(regiao).getByText('Não foi possível preparar a resposta. A mensagem do Contato está guardada e a Sequência segue pausada.')).toBeInTheDocument()
    expect(within(regiao).getByRole('button', { name: 'Gerar de novo' })).toBeInTheDocument()
  })
})
