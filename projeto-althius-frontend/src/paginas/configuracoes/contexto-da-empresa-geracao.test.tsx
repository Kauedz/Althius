import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarAppCom } from '@/test/renderizar'
import { criarFonteDoContextoDaEmpresaSimulada, type LeituraSimulada } from '@/fonte/simulada-contexto-da-empresa'
import type { FonteDoContextoDaEmpresa, TextosDoContexto } from '@/fonte/contexto-da-empresa-tipos'

const GERADO: TextosDoContexto = {
  empresa: 'A Sul Logística vende roteirização de entregas.',
  icp: 'ICP primário: transportadoras.\nICP secundário: operadores logísticos.',
  personas: 'Diretor de operações — decide.',
}

/** Uma leitura do site que só responde quando o teste manda. */
function leituraControlada() {
  let responder: (lida: LeituraSimulada) => void = () => undefined
  const lerSite = () => new Promise<LeituraSimulada>((r) => (responder = r))
  return { lerSite, responder: (lida: LeituraSimulada) => responder(lida) }
}

function abrir(contaId: 'marina' | 'lucas', fonte: FonteDoContextoDaEmpresa) {
  return renderizarAppCom('/configuracoes/contexto', { contextoDaEmpresa: () => fonte, opcoesFonte: { sessao: { contaId } } })
}

const textoDe = (nome: string) => (screen.getByRole('textbox', { name: nome }) as HTMLTextAreaElement).value

describe('Contexto da empresa: geração pelo site', () => {
  it('sem contexto, o Administrador informa o site e a primeira geração fica vigente sozinha', async () => {
    const leitura = leituraControlada()
    const fonte = criarFonteDoContextoDaEmpresaSimulada({ inicial: null, site: '', lerSite: leitura.lerSite })
    const { usuario } = abrir('marina', fonte)

    const site = await screen.findByRole('textbox', { name: 'Site da empresa' })
    expect(screen.getByRole('button', { name: 'Gerar' })).toBeDisabled()
    await usuario.type(site, 'https://SulLogistica.com.br/')
    await usuario.click(screen.getByRole('button', { name: 'Gerar' }))

    expect(await screen.findByText(/Lendo sullogistica\.com\.br/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gerando…' })).toBeDisabled()
    leitura.responder(GERADO)

    expect(await within(screen.getByRole('region', { name: 'Versão vigente' })).findByText(/Versão 1 · Gerada pelo site/)).toBeInTheDocument()
    expect(textoDe('Perfil de cliente ideal')).toBe(GERADO.icp)
    expect(screen.queryByRole('region', { name: 'Nova sugestão' })).not.toBeInTheDocument()
  })

  it('com contexto, a nova geração é sugestão: a vigente fica até aceitar', async () => {
    const leitura = leituraControlada()
    const fonte = criarFonteDoContextoDaEmpresaSimulada({ lerSite: leitura.lerSite })
    const { usuario } = abrir('marina', fonte)

    await usuario.click(await screen.findByRole('button', { name: 'Gerar' }))
    leitura.responder(GERADO)

    const sugestao = within(await screen.findByRole('region', { name: 'Nova sugestão' }))
    expect(sugestao.getByRole('region', { name: 'Perfil de cliente ideal sugerido' })).toHaveTextContent(/ICP secundário: operadores logísticos/)
    expect(textoDe('Empresa')).toMatch(/Norte Sistemas/)
    await usuario.click(sugestao.getByRole('button', { name: 'Aceitar sugestão' }))

    expect(await within(screen.getByRole('region', { name: 'Versão vigente' })).findByText(/Versão 2 · Ana Lima/)).toBeInTheDocument()
    expect(textoDe('Empresa')).toBe(GERADO.empresa)
    expect(screen.queryByRole('region', { name: 'Nova sugestão' })).not.toBeInTheDocument()
  })

  it('descartar a sugestão conserva a versão vigente', async () => {
    const leitura = leituraControlada()
    const fonte = criarFonteDoContextoDaEmpresaSimulada({ lerSite: leitura.lerSite })
    const { usuario } = abrir('marina', fonte)

    await usuario.click(await screen.findByRole('button', { name: 'Gerar' }))
    leitura.responder(GERADO)
    await usuario.click(await within(await screen.findByRole('region', { name: 'Nova sugestão' })).findByRole('button', { name: 'Descartar' }))

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Nova sugestão' })).not.toBeInTheDocument())
    expect((await fonte.contexto()).vigente?.versao).toBe(1)
    expect(textoDe('Empresa')).toMatch(/Norte Sistemas/)
  })

  it('a falha diz o motivo, conserva a vigente e permite tentar de novo ou escrever à mão', async () => {
    let tentativas = 0
    const fonte = criarFonteDoContextoDaEmpresaSimulada({
      lerSite: async () => (++tentativas === 1 ? { falha: 'site_insuficiente' } : GERADO),
    })
    const { usuario } = abrir('marina', fonte)

    await usuario.click(await screen.findByRole('button', { name: 'Gerar' }))
    const leituraDoSite = within(await screen.findByRole('region', { name: 'Leitura do site' }))
    expect(await leituraDoSite.findByText(/O site não traz informação suficiente/)).toBeInTheDocument()
    expect(leituraDoSite.getByText(/Nada foi inventado/)).toBeInTheDocument()
    expect(textoDe('Empresa')).toMatch(/Norte Sistemas/)
    expect(screen.getByRole('textbox', { name: 'Empresa' })).toBeEnabled()

    await usuario.click(leituraDoSite.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('region', { name: 'Nova sugestão' })).toBeInTheDocument()
    expect(tentativas).toBe(2)
  })

  it('uma edição salva durante a primeira leitura não é sobrescrita: a resposta atrasada vira sugestão', async () => {
    const leitura = leituraControlada()
    const fonte = criarFonteDoContextoDaEmpresaSimulada({ inicial: null, lerSite: leitura.lerSite })
    const { usuario } = abrir('marina', fonte)

    await usuario.click(await screen.findByRole('button', { name: 'Gerar' }))
    await screen.findByText(/Lendo nortesistemas\.com\.br/)
    await usuario.type(screen.getByRole('textbox', { name: 'Empresa' }), 'Escrito à mão')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    await within(screen.getByRole('region', { name: 'Versão vigente' })).findByText(/Versão 1 · Ana Lima/)

    leitura.responder(GERADO)
    expect(await screen.findByRole('region', { name: 'Nova sugestão' })).toBeInTheDocument()
    expect(textoDe('Empresa')).toBe('Escrito à mão')
    expect((await fonte.contexto()).vigente?.empresa).toBe('Escrito à mão')
  })

  it('um rascunho não salvo fica na tela quando outra versão passa a valer', async () => {
    const leitura = leituraControlada()
    const fonte = criarFonteDoContextoDaEmpresaSimulada({ inicial: null, lerSite: leitura.lerSite })
    const { usuario } = abrir('marina', fonte)

    await usuario.click(await screen.findByRole('button', { name: 'Gerar' }))
    await usuario.type(await screen.findByRole('textbox', { name: 'Personas' }), 'Meu rascunho')
    leitura.responder(GERADO)

    expect(await screen.findByText(/Uma nova versão do contexto passou a valer enquanto você editava/)).toBeInTheDocument()
    expect(textoDe('Personas')).toBe('Meu rascunho')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await within(screen.getByRole('form', { name: 'Editar o Contexto da empresa' })).findByRole('alert')).toHaveTextContent(
      /Outra pessoa salvou o contexto/,
    )
    expect((await fonte.contexto()).vigente?.personas).toBe(GERADO.personas)
  })

  it('pedir de novo durante a leitura não abre outra', async () => {
    let leituras = 0
    const leitura = leituraControlada()
    const fonte = criarFonteDoContextoDaEmpresaSimulada({
      lerSite: () => {
        leituras++
        return leitura.lerSite()
      },
    })
    abrir('marina', fonte)
    await screen.findByRole('button', { name: 'Gerar' })

    await Promise.all([fonte.gerar(), fonte.gerar()])
    await fonte.gerar()
    expect(leituras).toBe(1)
  })

  it('o Membro vê o andamento e a sugestão pendente, sem gerar nem decidir', async () => {
    const leitura = leituraControlada()
    const fonte = criarFonteDoContextoDaEmpresaSimulada({ lerSite: leitura.lerSite })
    await fonte.gerar()
    abrir('lucas', fonte)

    expect(await screen.findByText(/Lendo nortesistemas\.com\.br/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Site da empresa' })).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: /Gerar/ })).not.toBeInTheDocument()
    leitura.responder(GERADO)

    expect(await screen.findByText(/aguardando a decisão de um Administrador/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aceitar sugestão' })).not.toBeInTheDocument()
  })

  it('site que não é público é recusado antes de ler', async () => {
    const fonte = criarFonteDoContextoDaEmpresaSimulada({ inicial: null, site: '' })
    const { usuario } = abrir('marina', fonte)

    await usuario.type(await screen.findByRole('textbox', { name: 'Site da empresa' }), 'intranet')
    await usuario.click(screen.getByRole('button', { name: 'Gerar' }))

    expect(await within(screen.getByRole('form', { name: 'Site da empresa' })).findByRole('alert')).toHaveTextContent(
      'Informe um site público, como suaempresa.com.br.',
    )
  })
})
