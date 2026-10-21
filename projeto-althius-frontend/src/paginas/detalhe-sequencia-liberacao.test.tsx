import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

// Os controles de liberação ficam desligados na tela até o ticket 02. Aqui eles são ligados
// para manter coberto o comportamento que o ticket 02 vai expor.
vi.mock('@/fonte/liberacao-dos-passos-na-tela', () => ({ LIBERACAO_DOS_PASSOS_NA_TELA: true }))

describe('Detalhe da Sequência - liberação dos passos ligada (ticket 02)', () => {
  it('mostra condição de liberação no editor e grava predecessor sem Persona/Playbook', async () => {
    const { usuario, fonteDeSequencias } = renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByDisplayValue('Abertura pelo Sinal')).toBeInTheDocument()
    expect(screen.getByLabelText(/Condição de liberação do passo/i)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: /Convite no LinkedIn/i }))
    const liberacao = screen.getByLabelText(/Condição de liberação do passo/i)
    await usuario.selectOptions(liberacao, 'predecessor')

    const predecessor = await screen.findByLabelText(/Passo predecessor/i)
    const abertura = (await fonteDeSequencias.sequencia('sequencia-openai')).steps[0]
    await usuario.selectOptions(predecessor, abertura.id)

    await waitFor(async () => {
      const seq = await fonteDeSequencias.sequencia('sequencia-openai')
      const convite = seq.steps.find((s) => s.titulo === 'Convite no LinkedIn')
      expect(convite?.liberacao).toBe('predecessor')
      expect(convite?.predecessorId).toBe(abertura.id)
    })

    // Destinatário real permanece editável na mesma linha Para:
    const destinatario = screen.getByLabelText(/Destinatário/i)
    await usuario.selectOptions(destinatario, 'contato-openai-2')
    await waitFor(async () => {
      const seq = await fonteDeSequencias.sequencia('sequencia-openai')
      const convite = seq.steps.find((s) => s.titulo === 'Convite no LinkedIn')
      expect(convite?.contatoId).toBe('contato-openai-2')
    })
  })

  it('reordenar na timeline não altera predecessorId explícito', async () => {
    const { usuario, fonteDeSequencias } = renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByDisplayValue('Abertura pelo Sinal')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Convite no LinkedIn/i }))
    await usuario.selectOptions(screen.getByLabelText(/Condição de liberação do passo/i), 'predecessor')
    const pred = await screen.findByLabelText(/Passo predecessor/i)
    const antes = await fonteDeSequencias.sequencia('sequencia-openai')
    const idAbertura = antes.steps.find((s) => s.titulo === 'Abertura pelo Sinal')!.id
    await usuario.selectOptions(pred, idAbertura)

    await waitFor(async () => {
      const mid = await fonteDeSequencias.sequencia('sequencia-openai')
      expect(mid.steps.find((s) => s.titulo === 'Convite no LinkedIn')?.predecessorId).toBe(idAbertura)
    })

    await usuario.click(screen.getByRole('button', { name: /Mover para cima/i }))
    expect(await screen.findByText(/Step 1 de 6/i)).toBeInTheDocument()

    const depois = await fonteDeSequencias.sequencia('sequencia-openai')
    const convite = depois.steps.find((s) => s.titulo === 'Convite no LinkedIn')
    expect(convite?.predecessorId).toBe(idAbertura)
    expect(convite?.liberacao).toBe('predecessor')
    expect(depois.steps[0].titulo).toBe('Convite no LinkedIn')
  })

  it('numera o predecessor sem título pela posição real do passo', async () => {
    const { usuario, fonteDeSequencias } = renderizarApp('/sequencias/sequencia-openai')

    expect(await screen.findByDisplayValue('Abertura pelo Sinal')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Encerramento/i }))
    await usuario.selectOptions(screen.getByLabelText(/Condição de liberação do passo/i), 'predecessor')
    const pred = await screen.findByLabelText(/Passo predecessor/i)
    const seq = await fonteDeSequencias.sequencia('sequencia-openai')
    const opcoes = Array.from((pred as HTMLSelectElement).options).filter((o) => o.value !== '')
    expect(opcoes.map((o) => o.value)).toEqual(seq.steps.filter((s) => s.titulo !== 'Encerramento').map((s) => s.id))
  })
})
