import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

function abrir(rota: string, contaId: 'marina' | 'lucas') {
  return renderizarApp(rota, {}, {}, {}, {}, { sessao: { contaId } })
}

describe('Playbook do Workspace: leitura', () => {
  it('aparece em Configurações, com as 16 seções na ordem do modelo', async () => {
    abrir('/configuracoes/playbook', 'lucas')

    expect(await screen.findByRole('heading', { level: 2, name: 'Playbook do Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Playbook' })).toBeInTheDocument()
    const secoes = within(screen.getByRole('navigation', { name: 'Seções do Playbook' })).getAllByRole('link')
    expect(secoes).toHaveLength(16)
    expect(secoes[0]).toHaveTextContent('Empresa')
    expect(secoes[15]).toHaveTextContent('Negociação e follow-up')
  })

  it('um Membro lê a seção e não vê como editar', async () => {
    abrir('/configuracoes/playbook/icp', 'lucas')

    expect(await screen.findByRole('heading', { level: 3, name: 'ICP' })).toBeInTheDocument()
    expect(screen.getByText(/Incorporadoras com 200 a 2.000 funcionários/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Versão vigente' })).getByText(/Versão 1 · Ana Lima/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Restaurar/ })).not.toBeInTheDocument()
  })

  it('mostra a tabela das seções estruturadas para leitura', async () => {
    abrir('/configuracoes/playbook/dor_e_percepcao', 'lucas')

    const tabela = within(await screen.findByRole('table'))
    expect(tabela.getByRole('columnheader', { name: 'Urgência' })).toBeInTheDocument()
    expect(tabela.getByText('Leads de lançamento sem resposta rápida')).toBeInTheDocument()
  })

  it('diz que uma seção ainda não foi escrita', async () => {
    abrir('/configuracoes/playbook/rotina', 'lucas')

    expect(await screen.findByText('Um Administrador ainda não escreveu esta seção.')).toBeInTheDocument()
    expect(screen.getByText('Ainda não foi escrita.')).toBeInTheDocument()
  })

  it('uma seção que não existe volta para a Empresa', async () => {
    abrir('/configuracoes/playbook/base_de_pesquisa', 'lucas')

    expect(await screen.findByRole('heading', { level: 3, name: 'Empresa' })).toBeInTheDocument()
  })
})

describe('Playbook do Workspace: edição pelo Administrador', () => {
  it('edita o texto e grava uma versão nova, que entra no histórico', async () => {
    const { usuario } = abrir('/configuracoes/playbook/icp', 'marina')

    const texto = await screen.findByRole('textbox', { name: 'Texto' })
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    await usuario.clear(texto)
    await usuario.type(texto, 'Incorporadoras de São Paulo.')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await within(screen.getByRole('region', { name: 'Versão vigente' })).findByText(/Versão 2 · Ana Lima/)).toBeInTheDocument()
    const historico = within(screen.getByRole('region', { name: 'Histórico de versões' }))
    expect(historico.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('textbox', { name: 'Texto' })).toHaveValue('Incorporadoras de São Paulo.')
  })

  it('edita a tabela linha a linha: adiciona, preenche e remove', async () => {
    const { usuario } = abrir('/configuracoes/playbook/objecoes', 'marina')

    await usuario.click(await screen.findByRole('button', { name: 'Adicionar linha' }))
    await usuario.type(screen.getByRole('textbox', { name: 'Objeção (linha 1)' }), 'Já temos um sistema')
    await usuario.type(screen.getByRole('textbox', { name: 'Resposta (linha 1)' }), 'Mostrar a integração')
    await usuario.click(screen.getByRole('button', { name: 'Adicionar linha' }))
    expect(screen.getByRole('textbox', { name: 'Objeção (linha 2)' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Remover a linha 2' }))
    expect(screen.queryByRole('textbox', { name: 'Objeção (linha 2)' })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await within(screen.getByRole('region', { name: 'Versão vigente' })).findByText(/Versão 1 ·/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Objeção (linha 1)' })).toHaveValue('Já temos um sistema')
  })

  it('restaurar pede confirmação e grava uma versão nova com o conteúdo antigo', async () => {
    const { usuario } = abrir('/configuracoes/playbook/icp', 'marina')

    const texto = await screen.findByRole('textbox', { name: 'Texto' })
    await usuario.clear(texto)
    await usuario.type(texto, 'Só incorporadoras grandes.')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await within(screen.getByRole('region', { name: 'Versão vigente' })).findByText(/Versão 2 ·/)

    await usuario.click(screen.getByRole('button', { name: 'Restaurar a versão 1' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Restaurar a versão 1?' }))
    await usuario.click(dialogo.getByRole('button', { name: 'Cancelar' }))
    expect(within(screen.getByRole('region', { name: 'Versão vigente' })).getByText(/Versão 2 ·/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Restaurar a versão 1' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Restaurar' }))

    expect(await within(screen.getByRole('region', { name: 'Versão vigente' })).findByText(/Versão 3 ·/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Texto' })).toHaveValue(
      'Incorporadoras com 200 a 2.000 funcionários, com equipe comercial própria e lançamentos em mais de uma cidade.',
    )
  })
})
