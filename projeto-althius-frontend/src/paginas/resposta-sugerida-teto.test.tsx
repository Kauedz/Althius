import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PropostaDeResposta } from '@/fonte/sequencias-tipos'
import { RespostaSugerida } from './resposta-sugerida'

afterEach(cleanup)

function barrada(paradaPeloTeto: PropostaDeResposta['paradaPeloTeto']): PropostaDeResposta {
  return {
    id: 'proposta-1',
    canal: 'email',
    destinatario: 'carla@acme.com.br',
    texto: '',
    revisao: 0,
    status: 'falhou',
    mensagemDeOrigem: 'Pode me mandar mais detalhes?',
    paradaPeloTeto,
  }
}

function montar(proposta: PropostaDeResposta) {
  const aoGerarDeNovo = vi.fn(async () => {})
  render(
    <RespostaSugerida
      propostas={[proposta]}
      aoAprovarEEnviar={vi.fn(async () => ({ enviada: true }))}
      aoRejeitar={vi.fn(async () => {})}
      aoGerarDeNovo={aoGerarDeNovo}
    />,
  )
  return { aoGerarDeNovo, usuario: userEvent.setup(), regiao: screen.getByRole('region', { name: 'Resposta sugerida' }) }
}

describe('Resposta sugerida barrada pelo teto (creditos-e-planos 03)', () => {
  it('em Confirmar, diz por que a resposta não veio e o titular a pede pelo clique', async () => {
    const { usuario, regiao, aoGerarDeNovo } = montar(barrada('confirmar'))

    expect(
      within(regiao).getByText(
        'O Rhetor só prepara a resposta quando você pede: o automático de Execuções de Agentes ou o do Rhetor está em Confirmar (Configurações › Automação e tetos).',
      ),
    ).toBeInTheDocument()
    expect(within(regiao).queryByText(/Não foi possível preparar a resposta/)).not.toBeInTheDocument()
    await usuario.click(within(regiao).getByRole('button', { name: 'Gerar resposta' }))

    expect(aoGerarDeNovo).toHaveBeenCalledWith('proposta-1')
  })

  it.each([
    [
      'sem_teto',
      'O Rhetor não preparou a resposta sozinho: o automático de Execuções de Agentes ou o do Rhetor não tem teto mensal aprovado (Configurações › Automação e tetos).',
    ],
    [
      'teto_atingido',
      'O Rhetor não preparou a resposta sozinho: o automático de Execuções de Agentes ou o do Rhetor chegou no teto do mês (Configurações › Automação e tetos).',
    ],
  ] as const)('com o motivo %s, diz por quê e oferece gerar a resposta', (motivo, texto) => {
    const { regiao } = montar(barrada(motivo))

    expect(within(regiao).getByText(texto)).toBeInTheDocument()
    expect(within(regiao).getByRole('button', { name: 'Gerar resposta' })).toBeInTheDocument()
  })
})
