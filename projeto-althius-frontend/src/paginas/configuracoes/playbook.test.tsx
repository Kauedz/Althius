import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

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
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Restaurar/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Campos do ICP' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Setor' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Setor' })).toHaveAttribute('readOnly')
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
  it('o Administrador salva os campos do ICP', async () => {
    const { usuario } = abrir('/configuracoes/playbook/icp', 'marina')
    await usuario.type(await screen.findByRole('textbox', { name: 'Setor' }), 'Logística')
    await usuario.type(screen.getByRole('textbox', { name: 'Porte' }), '51-200')
    await usuario.type(screen.getByRole('textbox', { name: 'Região' }), 'SP')
    await usuario.click(screen.getByRole('button', { name: 'Salvar campos' }))
    expect(await screen.findByText('Campos do ICP salvos.')).toBeInTheDocument()
  })

  it('recusa porte inválido sem chamar a fonte', async () => {
    const { usuario, fonteDoPlaybook } = abrir('/configuracoes/playbook/icp', 'marina')
    const salvarCampos = fonteDoPlaybookSalvarCampos(fonteDoPlaybook!)
    await usuario.type(await screen.findByRole('textbox', { name: 'Porte' }), 'desconhecido')
    await usuario.click(screen.getByRole('button', { name: 'Salvar campos' }))
    expect(await screen.findByText(/Porte inválido: desconhecido/)).toBeInTheDocument()
    expect(salvarCampos).not.toHaveBeenCalled()
  })

  it('mostra também cargos, o que vende, para quem e por que compram, só para leitura', async () => {
    renderizarAppCom('/configuracoes/playbook/icp', {
      playbook: (fonte) => ({
        ...fonte,
        camposDoIcp: async () => ({
          setor: 'Logística', porte: '51-200', regiao: 'RS', versao: 4,
          detalhes: { cargos: ['Diretor de Operações', 'Gerente de Logística'], oQueVende: 'Roteirização de frota.', miniIcp: 'Transportadoras médias do Sul.', porQueCompram: '' },
        }),
      }),
    })
    const detalhes = within(await screen.findByRole('region', { name: 'Mais do ICP' }))
    expect(detalhes.getByText('Diretor de Operações, Gerente de Logística')).toBeInTheDocument()
    expect(detalhes.getByText('Roteirização de frota.')).toBeInTheDocument()
    expect(detalhes.getByText('Transportadoras médias do Sul.')).toBeInTheDocument()
    expect(detalhes.getByText('Por que compram').nextElementSibling).toHaveTextContent('Não preenchido')
    expect(detalhes.getByRole('link', { name: 'Ajustar com o Agente' })).toHaveAttribute('href', '/')
  })

  it('mostra a sugestão do texto e só preenche ao usar a sugestão', async () => {
    const { usuario } = renderizarAppCom('/configuracoes/playbook/icp', {
      playbook: (fonte) => ({
        ...fonte,
        async secao(id) {
          const secao = await fonte.secao(id)
          if (id !== 'icp' || !secao.vigente) return secao
          return { ...secao, vigente: { ...secao.vigente, conteudo: { texto: 'Setor: Varejo\nPorte: 51 a 200\nRegião: SP', linhas: [] } } }
        },
      }),
    })
    expect(await screen.findByText(/Sugestão a partir do texto do ICP/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Setor' })).toHaveValue('')
    await usuario.click(screen.getByRole('button', { name: 'Usar sugestão' }))
    expect(screen.getByRole('textbox', { name: 'Setor' })).toHaveValue('Varejo')
    expect(screen.getByRole('textbox', { name: 'Porte' })).toHaveValue('51-200')
    expect(screen.getByRole('textbox', { name: 'Região' })).toHaveValue('SP')
    expect(screen.queryByText('Campos do ICP salvos.')).not.toBeInTheDocument()
  })

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

function fonteDoPlaybookSalvarCampos(fonte: NonNullable<ReturnType<typeof abrir>['fonteDoPlaybook']>) {
  return vi.spyOn(fonte, 'salvarCamposDoIcp')
}
