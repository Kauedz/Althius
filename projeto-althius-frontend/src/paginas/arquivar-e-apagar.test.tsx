import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ContaAlvo, Contato, ContatoArquivado, FonteDeContas } from '@/fonte/contas-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

/** A Conta do detalhe com o que a fonte operacional acrescenta, mais os métodos de arquivar e apagar que o teste passar. */
function comArquivo(conta: Partial<ContaAlvo>, metodos: Partial<FonteDeContas> = {}) {
  return (fonteDeContas: FonteDeContas): FonteDeContas => ({
    ...fonteDeContas,
    conta: async (id) => ({ ...(await fonteDeContas.conta(id)), ...conta }),
    ...metodos,
  })
}

function botaoDoDialogo(nome: string) {
  return within(screen.getByRole('dialog')).getByRole('button', { name: nome })
}

describe('Arquivar e apagar a Conta-alvo', () => {
  it('a Demonstração não oferece arquivar, apagar nem a lista de arquivadas', async () => {
    renderizarApp('/contas/openai')

    expect(await screen.findByRole('heading', { level: 2, name: 'OpenAI' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Arquivar Conta|Restaurar Conta|Apagar definitivamente/ })).not.toBeInTheDocument()
  })

  it('a Conta arquivada mostra o aviso e a ação de restaurar, e sai da operação: sem Sequência, Contato nem Interação nova', async () => {
    const restaurarConta = vi.fn(async () => ({ sequenciasDestravadas: 1 }))
    const { usuario } = renderizarAppCom('/contas/figma', {
      contas: comArquivo({ arquivadaEm: '2026-09-20T12:00:00Z', podeArquivar: true }, { restaurarConta, arquivarConta: vi.fn() }),
    })

    const aviso = (await screen.findByText(/Conta arquivada em/)).closest('p')!
    expect(aviso).toHaveTextContent('Conta arquivada em 20 set.')
    expect(aviso).toHaveTextContent('a Sequência continua pausada até o Vendedor responsável retomá-la')
    expect(screen.queryByRole('button', { name: 'Arquivar Conta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Criar sequência/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Registrar interação' })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Restaurar Conta' }))
    expect(restaurarConta).toHaveBeenCalledWith('figma')
    expect(await screen.findByText('Conta restaurada. A Sequência continua pausada até o Vendedor responsável retomá-la.')).toBeInTheDocument()
  })

  it('arquivar pede confirmação, avisa da pausa da Sequência em andamento e só então arquiva', async () => {
    const arquivarConta = vi.fn(async () => ({ sequenciasPausadas: 1 }))
    const { usuario } = renderizarAppCom('/contas/openai', { contas: comArquivo({ podeArquivar: true }, { arquivarConta }) })

    await usuario.click(await screen.findByRole('button', { name: 'Arquivar Conta' }))
    const dialogo = screen.getByRole('dialog', { name: 'Arquivar OpenAI?' })
    expect(dialogo).toHaveTextContent('A Sequência em andamento será pausada e os passos pendentes, cancelados.')
    expect(dialogo).toHaveTextContent('Restaurar a Conta só a destrava')
    expect(arquivarConta).not.toHaveBeenCalled()

    await usuario.click(botaoDoDialogo('Arquivar'))

    expect(arquivarConta).toHaveBeenCalledWith('openai')
    expect(await screen.findByText('Conta arquivada. 1 Sequência pausada.')).toBeInTheDocument()
  })

  it('cancelar a confirmação não arquiva nada', async () => {
    const arquivarConta = vi.fn(async () => ({ sequenciasPausadas: 0 }))
    const { usuario } = renderizarAppCom('/contas/figma', { contas: comArquivo({ podeArquivar: true }, { arquivarConta }) })

    await usuario.click(await screen.findByRole('button', { name: 'Arquivar Conta' }))
    await usuario.click(botaoDoDialogo('Cancelar'))

    expect(arquivarConta).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('quem não pode arquivar não vê a ação, e apagar só aparece a quem pode', async () => {
    renderizarAppCom('/contas/figma', {
      contas: comArquivo({ podeArquivar: false, podeApagar: false }, { arquivarConta: vi.fn(), apagarConta: vi.fn() }),
    })

    expect(await screen.findByRole('heading', { level: 2, name: 'Figma' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Arquivar Conta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apagar definitivamente' })).not.toBeInTheDocument()
  })

  it('apagar exige digitar o nome da Conta, avisa o que some e o que fica, e volta para a lista', async () => {
    const apagarConta = vi.fn(async () => ({ contatosApagados: 2, contatosMantidos: 0, sequenciasEncerradas: 1 }))
    const { usuario } = renderizarAppCom('/contas/figma', { contas: comArquivo({ podeApagar: true }, { apagarConta }) })

    await usuario.click(await screen.findByRole('button', { name: 'Apagar definitivamente' }))
    const dialogo = screen.getByRole('dialog', { name: 'Apagar Figma definitivamente?' })
    expect(dialogo).toHaveTextContent('Não dá para desfazer.')
    expect(dialogo).toHaveTextContent('Ficam só os eventos comerciais')
    const confirmar = botaoDoDialogo('Apagar definitivamente')
    expect(confirmar).toBeDisabled()

    await usuario.type(screen.getByRole('textbox', { name: 'Nome para confirmar' }), 'Fig')
    expect(confirmar).toBeDisabled()
    await usuario.type(screen.getByRole('textbox', { name: 'Nome para confirmar' }), 'ma')
    expect(confirmar).toBeEnabled()
    await usuario.click(confirmar)

    expect(apagarConta).toHaveBeenCalledWith('figma', 'Figma')
    expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
  })

  it('uma recusa do banco fica no diálogo, com a razão, e nada some da tela', async () => {
    const apagarConta = vi.fn(async () => {
      throw new Error('Só um Administrador pode apagar definitivamente.')
    })
    const { usuario } = renderizarAppCom('/contas/figma', { contas: comArquivo({ podeApagar: true }, { apagarConta }) })

    await usuario.click(await screen.findByRole('button', { name: 'Apagar definitivamente' }))
    await usuario.type(screen.getByRole('textbox', { name: 'Nome para confirmar' }), 'figma')
    await usuario.click(botaoDoDialogo('Apagar definitivamente'))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Só um Administrador pode apagar definitivamente.')
    expect(screen.getByRole('heading', { level: 2, name: 'Figma', hidden: true })).toBeInTheDocument()
  })
})

describe('Lista de Contas arquivadas', () => {
  const arquivada: ContaAlvo = {
    id: 'conta-velha',
    nome: 'Velha S.A.',
    dominio: 'velha.com.br',
    totalContatos: 0,
    arquivadaEm: '2026-09-10T12:00:00Z',
    podeArquivar: true,
    podeApagar: true,
  }

  it('o botão Arquivadas mostra as Contas arquivadas, e Voltar às Contas devolve a lista padrão', async () => {
    const { usuario } = renderizarAppCom('/contas', {
      contas: (fonteDeContas) => ({ ...fonteDeContas, contasArquivadas: async () => [arquivada], restaurarConta: vi.fn(), apagarConta: vi.fn() }),
    })

    await usuario.click(await screen.findByRole('button', { name: 'Arquivadas' }))

    const lista = await screen.findByRole('list', { name: 'Contas arquivadas' })
    expect(within(lista).getByRole('link', { name: 'Velha S.A.' })).toHaveAttribute('href', '/contas/conta-velha')
    expect(lista).toHaveTextContent('Arquivado em 10 set.')
    expect(screen.queryByRole('table', { name: 'Tabela de Contas' })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Voltar às Contas' }))
    expect(await screen.findByRole('table', { name: 'Tabela de Contas' })).toBeInTheDocument()
  })

  it('restaura e apaga a partir da lista, com o nome digitado', async () => {
    const restaurarConta = vi.fn(async () => ({ sequenciasDestravadas: 0 }))
    const apagarConta = vi.fn(async () => ({ contatosApagados: 0, contatosMantidos: 0, sequenciasEncerradas: 0 }))
    const { usuario } = renderizarAppCom('/contas', {
      contas: (fonteDeContas) => ({ ...fonteDeContas, contasArquivadas: async () => [arquivada], restaurarConta, apagarConta }),
    })
    await usuario.click(await screen.findByRole('button', { name: 'Arquivadas' }))

    await usuario.click(await screen.findByRole('button', { name: 'Restaurar Velha S.A.' }))
    expect(restaurarConta).toHaveBeenCalledWith('conta-velha')

    await usuario.click(screen.getByRole('button', { name: 'Apagar Velha S.A. definitivamente' }))
    await usuario.type(screen.getByRole('textbox', { name: 'Nome para confirmar' }), 'velha s.a.')
    await usuario.click(botaoDoDialogo('Apagar definitivamente'))
    await waitFor(() => expect(apagarConta).toHaveBeenCalledWith('conta-velha', 'velha s.a.'))
  })

  it('sem Conta arquivada, a lista diz isso', async () => {
    const { usuario } = renderizarAppCom('/contas', {
      contas: (fonteDeContas) => ({ ...fonteDeContas, contasArquivadas: async () => [] }),
    })

    await usuario.click(await screen.findByRole('button', { name: 'Arquivadas' }))

    expect(await screen.findByText('Nenhuma Conta-alvo arquivada.')).toBeInTheDocument()
  })
})

describe('Arquivar e apagar o Contato', () => {
  /** Os Contatos da demo com o que a fonte operacional acrescenta e os métodos que o teste passar. */
  function comContatos(metodos: Partial<FonteDeContas>, permissoes: Partial<Contato> = { podeArquivar: true, podeApagar: true }) {
    return (fonteDeContas: FonteDeContas): FonteDeContas => ({
      ...fonteDeContas,
      contatos: async () => (await fonteDeContas.contatos()).map((contato) => ({ ...contato, ...permissoes })),
      ...metodos,
    })
  }

  it('a tabela de Contatos da Demonstração não ganha a coluna Ações', async () => {
    renderizarApp('/contatos')

    const tabela = await screen.findByRole('table', { name: 'Tabela de Contatos' })
    expect(within(tabela).queryByRole('columnheader', { name: 'Ações' })).not.toBeInTheDocument()
  })

  it('arquivar o Contato pede confirmação e chama o backend', async () => {
    const arquivarContato = vi.fn(async () => {})
    const { usuario, fonteDeContas } = renderizarAppCom('/contatos', { contas: comContatos({ arquivarContato }) })
    const clara = (await fonteDeContas.contatos()).find((c) => c.nome === 'Clara Dupont')!

    await usuario.click(await screen.findByRole('button', { name: 'Arquivar Clara Dupont' }))
    expect(screen.getByRole('dialog', { name: 'Arquivar Clara Dupont?' })).toHaveTextContent('os Vínculos com as Contas são encerrados')
    await usuario.click(botaoDoDialogo('Arquivar'))

    await waitFor(() => expect(arquivarContato).toHaveBeenCalledWith(clara.id))
  })

  it('apagar o Contato exige o nome e só o Administrador vê a ação', async () => {
    const apagarContato = vi.fn(async () => {})
    const { usuario, fonteDeContas } = renderizarAppCom('/contatos', { contas: comContatos({ arquivarContato: vi.fn(), apagarContato }) })
    const clara = (await fonteDeContas.contatos()).find((c) => c.nome === 'Clara Dupont')!

    await usuario.click(await screen.findByRole('button', { name: 'Apagar Clara Dupont definitivamente' }))
    const confirmar = botaoDoDialogo('Apagar definitivamente')
    expect(confirmar).toBeDisabled()
    await usuario.type(screen.getByRole('textbox', { name: 'Nome para confirmar' }), 'clara dupont')
    await usuario.click(confirmar)

    await waitFor(() => expect(apagarContato).toHaveBeenCalledWith(clara.id, 'clara dupont'))
  })

  it('quem só pode arquivar não vê apagar', async () => {
    renderizarAppCom('/contatos', {
      contas: comContatos({ arquivarContato: vi.fn(), apagarContato: vi.fn() }, { podeArquivar: true, podeApagar: false }),
    })

    expect(await screen.findByRole('button', { name: 'Arquivar Clara Dupont' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Apagar .* definitivamente/ })).not.toBeInTheDocument()
  })

  it('a lista de Contatos arquivados restaura o Contato e mostra a Conta de onde ele saiu', async () => {
    const restaurarContato = vi.fn(async () => {})
    const rui: ContatoArquivado = { id: 'c-rui', nome: 'Rui Arquivado', cargo: 'Analista', arquivadoEm: '2026-09-27T09:00:00Z', contaId: 'openai', contaNome: 'OpenAI' }
    const { usuario } = renderizarAppCom('/contatos', {
      contas: (fonteDeContas) => ({ ...fonteDeContas, contatosArquivados: async () => [rui], restaurarContato }),
    })

    await usuario.click(await screen.findByRole('button', { name: 'Arquivados' }))

    const lista = await screen.findByRole('list', { name: 'Contatos arquivados' })
    expect(lista).toHaveTextContent('Rui Arquivado')
    expect(lista).toHaveTextContent('Analista · OpenAI')
    await usuario.click(within(lista).getByRole('button', { name: 'Restaurar Rui Arquivado' }))
    expect(restaurarContato).toHaveBeenCalledWith('c-rui')
    expect(within(lista).queryByRole('button', { name: /Apagar/ })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Voltar aos Contatos' }))
    expect(await screen.findByRole('table', { name: 'Tabela de Contatos' })).toBeInTheDocument()
  })
})
