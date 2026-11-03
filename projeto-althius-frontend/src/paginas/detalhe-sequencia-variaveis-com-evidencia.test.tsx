import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

describe('Composer de Step - Variáveis com Evidência (Ticket 06)', () => {
  it('exibe tokens de Sinal e Referência com evidência na barra de variáveis', async () => {
    renderizarApp('/sequencias/sequencia-openai')

    await screen.findByTestId('composer-step')

    // Tokens de Sinal
    expect(screen.getByRole('button', { name: /Inserir variável \{\{sinal\.frase\}\}/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Inserir variável \{\{sinal\.fonte\}\}/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Inserir variável \{\{sinal\.evidencia\}\}/i })).toBeInTheDocument()

    // Tokens de Referência
    expect(screen.getByRole('button', { name: /Inserir variável \{\{referencia\.envio\}\}/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Inserir variável \{\{referencia\.resposta\}\}/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Inserir variável \{\{referencia\.indicacao\}\}/i })).toBeInTheDocument()
  })

  it('permite escolher um Contato de referência da mesma Conta para o passo', async () => {
    const { usuario, fonteDeSequencias } = renderizarApp('/sequencias/sequencia-openai')

    await screen.findByTestId('composer-step')

    const seletorRef = screen.getByLabelText(/Contato de referência/i) as HTMLSelectElement
    expect(seletorRef).toBeInTheDocument()

    // Sarah Chen é a destinatária do step 1, então os outros contatos (Marcus Vance, Elena Rostova) devem ser opções
    const opcaoMarcus = within(seletorRef).getByRole('option', { name: /Marcus Vance/i })
    expect(opcaoMarcus).toBeInTheDocument()

    // Seleciona Marcus Vance como referência
    await usuario.selectOptions(seletorRef, opcaoMarcus)

    await waitFor(async () => {
      const seq = await fonteDeSequencias.sequencia('sequencia-openai')
      expect(seq.steps[0].referenciaContatoId).toBe('contato-openai-2')
    })
  })

  it('exibe aviso de prévia e motivo de bloqueio quando falta evidência para a variável', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    await screen.findByTestId('composer-step')

    // Insere variável de referência sem ter selecionado contato de referência
    const textarea = screen.getByRole('textbox', { name: 'Corpo da mensagem' })
    fireEvent.change(textarea, { target: { value: 'Falando com {{referencia.envio}} sobre o projeto' } })

    // Ativa a prévia
    await usuario.click(screen.getByRole('button', { name: 'Pré-visualizar' }))

    // O token não resolvido deve ter a classe de marcação al-preview-var-missing
    const preview = screen.getByTestId('preview-email')
    expect(preview.querySelector('.al-preview-var-missing')).toHaveTextContent('{{referencia.envio}}')

    // O aviso de prévia e motivo de bloqueio deve estar visível
    const alerta = await screen.findByRole('alert', { name: /Aviso de prévia e motivo de bloqueio/i })
    expect(alerta).toBeInTheDocument()
    expect(alerta).toHaveTextContent(/Falta evidência para {{referencia.envio}}/i)
  })

  it('resolve a variável com evidência e não bloqueia a prévia quando o dado está presente', async () => {
    const { usuario } = renderizarApp('/sequencias/sequencia-openai')

    await screen.findByTestId('composer-step')

    // Insere variável de sinal da conta
    const textarea = screen.getByRole('textbox', { name: 'Corpo da mensagem' })
    fireEvent.change(textarea, { target: { value: 'Vi o sinal: {{sinal.frase}}' } })

    // Ativa a prévia
    await usuario.click(screen.getByRole('button', { name: 'Pré-visualizar' }))

    // Deve resolver o sinal e não mostrar o aviso de bloqueio
    const preview = screen.getByTestId('preview-email')
    expect(preview.querySelector('.al-preview-var')).toBeInTheDocument()
    expect(screen.queryByRole('alert', { name: /Aviso de prévia e motivo de bloqueio/i })).not.toBeInTheDocument()
  })
})
