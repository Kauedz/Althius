import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'
import { criarFonteDoContextoDaEmpresaSimulada } from '@/fonte/simulada-contexto-da-empresa'
import type { FonteDoContextoDaEmpresa } from '@/fonte/contexto-da-empresa-tipos'

function abrir(contaId: 'marina' | 'lucas') {
  return renderizarApp('/configuracoes/contexto', {}, {}, {}, {}, { sessao: { contaId } })
}

describe('Contexto da empresa: a tela do AI Context', () => {
  it('fica em Configurações com o site, gerar, os três textos e salvar, e nada mais', async () => {
    abrir('marina')

    expect(await screen.findByRole('heading', { level: 2, name: 'Contexto da empresa' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contexto da empresa' })).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: 'Site da empresa' })).toHaveValue('nortesistemas.com.br')
    expect(screen.getByRole('button', { name: 'Gerar' })).toBeInTheDocument()
    const form = within(screen.getByRole('form', { name: 'Editar o Contexto da empresa' }))
    expect(form.getAllByRole('textbox').map((campo) => campo.getAttribute('id'))).toEqual([
      'contexto-empresa',
      'contexto-icp',
      'contexto-personas',
    ])
    expect(form.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    // Sem formulário firmográfico nem cards de perfis.
    for (const campo of ['Setor', 'Porte', 'Região', 'Funcionários', 'Faturamento']) {
      expect(screen.queryByRole('textbox', { name: campo })).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: /Aprovar/ })).not.toBeInTheDocument()
  })

  it('primário e secundários ficam no mesmo texto de ICP; personas no próprio campo', async () => {
    abrir('marina')

    const icp = await screen.findByRole('textbox', { name: 'Perfil de cliente ideal' })
    expect((icp as HTMLTextAreaElement).value).toMatch(/ICP primário/)
    expect((icp as HTMLTextAreaElement).value).toMatch(/ICP secundário/)
    expect((screen.getByRole('textbox', { name: 'Personas' }) as HTMLTextAreaElement).value).toMatch(/Diretor\(a\) comercial/)
  })

  it('o Administrador salva e a nova versão fica vigente na hora', async () => {
    const { usuario } = abrir('marina')

    const icp = await screen.findByRole('textbox', { name: 'Perfil de cliente ideal' })
    await usuario.clear(icp)
    await usuario.type(icp, 'ICP primário: incorporadoras de São Paulo.')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await within(screen.getByRole('region', { name: 'Versão vigente' })).findByText(/Versão 2 · Ana Lima/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Perfil de cliente ideal' })).toHaveValue('ICP primário: incorporadoras de São Paulo.')
  })

  it('um Membro só lê os três textos', async () => {
    abrir('lucas')

    expect(await screen.findByRole('region', { name: 'Empresa' })).toHaveTextContent(/Norte Sistemas/)
    expect(screen.getByRole('region', { name: 'Perfil de cliente ideal' })).toHaveTextContent(/ICP secundário/)
    expect(screen.getByRole('region', { name: 'Personas' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Editar o Contexto da empresa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gerar' })).not.toBeInTheDocument()
  })
})

describe('Contexto da empresa: vazio, erro e conflito', () => {
  function abrirComFonte(contaId: 'marina' | 'lucas', fonte: FonteDoContextoDaEmpresa) {
    return renderizarAppCom('/configuracoes/contexto', { contextoDaEmpresa: () => fonte, opcoesFonte: { sessao: { contaId } } })
  }

  it('sem contexto, diz que está vazio e deixa escrever à mão', async () => {
    abrirComFonte('marina', criarFonteDoContextoDaEmpresaSimulada({ inicial: null, site: '' }))

    expect(await screen.findByText('Ainda sem contexto. Escreva os três textos ou gere pelo site.')).toBeInTheDocument()
    expect(screen.getByText('Informe o site para gerar os textos, ou escreva-os à mão.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Empresa' })).toHaveValue('')
  })

  it('o Membro vê o estado vazio sem campos', async () => {
    abrirComFonte('lucas', criarFonteDoContextoDaEmpresaSimulada({ inicial: null }))

    expect(await screen.findByText('Ainda sem contexto. Um Administrador escreve ou gera pelo site.')).toBeInTheDocument()
    expect(screen.getAllByText('Ainda não foi escrito.')).toHaveLength(3)
  })

  it('um erro de gravação aparece e o texto digitado continua na tela', async () => {
    const base = criarFonteDoContextoDaEmpresaSimulada()
    const { usuario } = abrirComFonte('marina', {
      ...base,
      salvar: async () => {
        throw new Error('Não foi possível concluir agora. Tente de novo.')
      },
    })

    const empresa = await screen.findByRole('textbox', { name: 'Empresa' })
    await usuario.clear(empresa)
    await usuario.type(empresa, 'Texto novo')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await within(screen.getByRole('form', { name: 'Editar o Contexto da empresa' })).findByRole('alert')).toHaveTextContent('Não foi possível concluir agora. Tente de novo.')
    expect(screen.getByRole('textbox', { name: 'Empresa' })).toHaveValue('Texto novo')
  })

  it('a corrida: a gravação recusada mostra o aviso e mantém o rascunho', async () => {
    const base = criarFonteDoContextoDaEmpresaSimulada()
    // A fonte não avisa a tela da gravação da outra aba: a tela continua na versão 1.
    let outraAbaGravou = false
    const fonte: FonteDoContextoDaEmpresa = {
      ...base,
      observar: () => () => undefined,
      async salvar(textos, esperada) {
        if (!outraAbaGravou) {
          outraAbaGravou = true
          await base.salvar({ empresa: 'Da outra aba', icp: 'x', personas: 'y' }, 1)
        }
        return base.salvar(textos, esperada)
      },
    }
    const { usuario } = abrirComFonte('marina', fonte)

    const empresa = await screen.findByRole('textbox', { name: 'Empresa' })
    await usuario.clear(empresa)
    await usuario.type(empresa, 'Meu rascunho')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await within(screen.getByRole('form', { name: 'Editar o Contexto da empresa' })).findByRole('alert')).toHaveTextContent(/Outra pessoa salvou o contexto enquanto você editava/)
    expect(screen.getByRole('textbox', { name: 'Empresa' })).toHaveValue('Meu rascunho')
    expect(screen.getByRole('button', { name: 'Recarregar a versão atual' })).toBeInTheDocument()
    expect((await base.contexto()).vigente?.empresa).toBe('Da outra aba')
  })
})
