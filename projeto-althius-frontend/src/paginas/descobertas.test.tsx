import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

describe('Caixa de Descobertas por ICP', () => {
  it('o endereço /contas/descobertas abre a Caixa com a cotação prévia e a lista de candidatas', async () => {
    renderizarApp('/contas/descobertas')

    // Título e abas
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()
    const abas = screen.getByRole('navigation', { name: 'Abas de contas e contatos' })
    expect(within(abas).getByRole('link', { name: 'Descobertas' })).toHaveAttribute('aria-current', 'page')

    // Cotação prévia de créditos
    const botaoBuscar = screen.getByRole('button', { name: /Buscar contas pelo ICP/i })
    expect(botaoBuscar).toBeInTheDocument()
    expect(screen.getByText(/5 créditos/i)).toBeInTheDocument()

    // Candidatas exibidas com motivos e encaixe
    expect(screen.getByText('LogiFlow Brasil S.A.')).toBeInTheDocument()
    expect(screen.getByText('Encaixe alto')).toBeInTheDocument()
    expect(screen.getByText('Setor: Logística')).toBeInTheDocument()
    expect(screen.getByText('OmniVarejo Inteligência Digital Ltda')).toBeInTheDocument()
    expect(screen.getByText('Encaixe medio')).toBeInTheDocument()
  })

  it('a busca em tempo real filtra candidatas por nome ou domínio', async () => {
    const { usuario } = renderizarApp('/contas/descobertas')

    expect(await screen.findByText('LogiFlow Brasil S.A.')).toBeInTheDocument()
    expect(screen.getByText('Metalúrgica Catarinense S.A.')).toBeInTheDocument()

    const campoBusca = screen.getByRole('searchbox', { name: 'Buscar candidatas' })
    await usuario.type(campoBusca, 'logiflow')

    expect(screen.getByText('LogiFlow Brasil S.A.')).toBeInTheDocument()
    expect(screen.queryByText('Metalúrgica Catarinense S.A.')).not.toBeInTheDocument()
  })

  it('aceitar uma candidata com site cria a Conta-alvo e a move para a aba Aceitas', async () => {
    const { usuario, fonteDeContas } = renderizarApp('/contas/descobertas')

    expect(await screen.findByText('LogiFlow Brasil S.A.')).toBeInTheDocument()

    // Clica no botão Aceitar da LogiFlow
    const linhaLogiFlow = screen.getByText('LogiFlow Brasil S.A.').closest('tr')!
    const botaoAceitar = within(linhaLogiFlow).getByRole('button', { name: /Aceitar/i })
    await usuario.click(botaoAceitar)

    // Sai da lista de Novas
    await waitFor(() => {
      expect(screen.queryByText('LogiFlow Brasil S.A.')).not.toBeInTheDocument()
    })

    // Confere que a conta foi criada na Fonte de Contas-alvo
    const contas = await fonteDeContas.contas()
    const contaCriada = contas.find((c) => c.nome === 'LogiFlow Brasil S.A.')
    expect(contaCriada).toBeDefined()
    expect(contaCriada?.siteUrl).toBe('https://logiflow.com.br')

    // Na aba Aceitas ela aparece com o link
    const abaAceitas = screen.getByRole('tab', { name: /Aceitas/i })
    await usuario.click(abaAceitas)
    expect(await screen.findByText('LogiFlow Brasil S.A.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver conta/i })).toBeInTheDocument()
  })

  it('descartar uma candidata a move para a aba Descartadas com o motivo, e permite restaurar', async () => {
    const { usuario } = renderizarApp('/contas/descobertas')

    expect(await screen.findByText('Metalúrgica Catarinense S.A.')).toBeInTheDocument()

    const linha = screen.getByText('Metalúrgica Catarinense S.A.').closest('tr')!
    const botaoLixeira = within(linha).getByTitle(/Descartar/i)
    await usuario.click(botaoLixeira)

    // Modal de descarte
    expect(await screen.findByText(/Descartar Metalúrgica Catarinense S.A.\?/i)).toBeInTheDocument()
    const inputMotivo = screen.getByPlaceholderText(/Fora do ICP/i)
    await usuario.type(inputMotivo, 'Setor não prioritário no momento')

    const botaoConfirmar = screen.getByRole('button', { name: 'Descartar' })
    // O motivo estruturado é obrigatório: ele ensina a Descoberta.
    expect(botaoConfirmar).toBeDisabled()
    const motivos = within(screen.getByRole('radiogroup', { name: 'Motivo do descarte' }))
    for (const m of ['Setor fora do ICP', 'Porte errado', 'Região fora', 'Já é cliente ou concorrente', 'Sinal fraco ou irrelevante', 'Outro']) {
      expect(motivos.getByRole('radio', { name: m })).toBeInTheDocument()
    }
    await usuario.click(motivos.getByRole('radio', { name: 'Setor fora do ICP' }))
    await usuario.click(botaoConfirmar)

    // Sai de Novas
    expect(screen.queryByText('Metalúrgica Catarinense S.A.')).not.toBeInTheDocument()

    // Na aba Descartadas ela está presente
    const abaDescartadas = screen.getByRole('tab', { name: /Descartadas/i })
    await usuario.click(abaDescartadas)
    expect(await screen.findByText('Metalúrgica Catarinense S.A.')).toBeInTheDocument()

    // Clica em Restaurar e ela volta para Novas
    const botaoRestaurar = screen.getByRole('button', { name: /Restaurar/i })
    await usuario.click(botaoRestaurar)

    const abaNovas = screen.getByRole('tab', { name: /Novas/i })
    await usuario.click(abaNovas)
    expect(await screen.findByText('Metalúrgica Catarinense S.A.')).toBeInTheDocument()
  })

  it('buscar contas pelo ICP adiciona nova candidata e debita créditos', async () => {
    const { usuario } = renderizarApp('/contas/descobertas')

    expect(await screen.findByText('LogiFlow Brasil S.A.')).toBeInTheDocument()
    expect(screen.queryByText('AgroTech Soluções de Precisão')).not.toBeInTheDocument()

    const botaoBuscar = screen.getByRole('button', { name: /Buscar contas pelo ICP/i })
    await usuario.click(botaoBuscar)

    // Nova candidata aparece
    expect(await screen.findByText('AgroTech Soluções de Precisão')).toBeInTheDocument()
    expect(screen.getAllByText('Encaixe alto').length).toBeGreaterThanOrEqual(1)
  })

  it('aceitar com CNPJ informa Conta, Comitê e Receita quando os dois enriquecimentos concluem', async () => {
    const comite = vi.fn(async () => ({ encontradas: 2, novas: 2, jaEncontradas: 0 }))
    const receita = vi.fn(async () => ({}) as never)
    const { usuario } = renderizarAppCom('/contas/descobertas', {
      contas: (fonte) => ({ ...fonte, buscarComite: comite, enriquecerReceita: receita }),
      descobertas: (fonte) => ({
        ...fonte,
        aceitarDescoberta: async () => ({ targetAccountId: 'conta-orbita', created: true, sinaisMigrados: 0, comite: 'liberado' as const }),
      }),
    })
    const linha = (await screen.findByText('LogiFlow Brasil S.A.')).closest('tr')!
    await usuario.click(within(linha).getByRole('button', { name: /Aceitar/i }))

    expect(await screen.findByText(/LogiFlow Brasil S.A. agora é uma Conta-alvo/)).toBeInTheDocument()
    expect(screen.getByText(/Comitê de compra: 2 pessoas sugeridas/)).toBeInTheDocument()
    expect(screen.getByText(/Dados da Receita: ok/)).toBeInTheDocument()
    expect(comite).toHaveBeenCalledWith('conta-orbita')
    expect(receita).toHaveBeenCalledWith('conta-orbita', '45.123.890/0001-12')
  })

  it('mantém a Conta aceita e mostra a mensagem real quando o enriquecimento falha', async () => {
    const receita = vi.fn(async () => { throw new Error('Receita indisponível no momento') })
    const { usuario } = renderizarAppCom('/contas/descobertas', {
      contas: (fonte) => ({ ...fonte, enriquecerReceita: receita }),
    })
    const linha = (await screen.findByText('LogiFlow Brasil S.A.')).closest('tr')!
    await usuario.click(within(linha).getByRole('button', { name: /Aceitar/i }))

    expect(await screen.findByText(/Receita indisponível no momento/)).toBeInTheDocument()
    expect(screen.getByText(/LogiFlow Brasil S.A. agora é uma Conta-alvo/)).toBeInTheDocument()
  })

  it('não consulta Receita sem CNPJ e explica quando o Comitê está bloqueado', async () => {
    const comite = vi.fn()
    const receita = vi.fn()
    const { usuario } = renderizarAppCom('/contas/descobertas', {
      contas: (fonte) => ({ ...fonte, buscarComite: comite, enriquecerReceita: receita }),
      descobertas: (fonte) => ({
        ...fonte,
        aceitarDescoberta: async () => ({ targetAccountId: 'conta-orbita', created: true, sinaisMigrados: 0, comite: 'sem_saldo' as const }),
      }),
    })
    const linha = (await screen.findByText('Vértice Embalagens Ltda')).closest('tr')!
    await usuario.click(within(linha).getByRole('button', { name: /Aceitar/i }))
    // A candidata já tem site; o modal só aparece quando faltam site e CNPJ.

    expect(await screen.findByText(/Sem créditos suficientes para enriquecer o Comitê agora/)).toBeInTheDocument()
    expect(comite).not.toHaveBeenCalled()
    expect(receita).not.toHaveBeenCalled()
  })
})

describe('O que a Descoberta aprendeu', () => {
  it('mostra os ajustes com a frase e deixa o Administrador desfazer, com confirmação', async () => {
    const { usuario } = renderizarApp('/contas/descobertas')
    const nome = 'Metalúrgica Catarinense S.A.'
    expect(await screen.findByText(nome)).toBeInTheDocument()
    const painel = within(screen.getByRole('region', { name: 'O que a Descoberta aprendeu', hidden: true }))
    expect(painel.getByText(/Ainda nada/)).toBeInTheDocument()

    for (let i = 0; i < 3; i++) {
      await usuario.click(within(screen.getByText(nome).closest('tr')!).getByTitle(/Descartar/i))
      await usuario.click(within(screen.getByRole('radiogroup', { name: 'Motivo do descarte' })).getByRole('radio', { name: 'Região fora' }))
      await usuario.click(screen.getByRole('button', { name: 'Descartar' }))
      if (i < 2) {
        await usuario.click(screen.getByRole('tab', { name: /Descartadas/i }))
        await usuario.click(await screen.findByRole('button', { name: /Restaurar/i }))
        await usuario.click(screen.getByRole('tab', { name: /Novas/i }))
        expect(await screen.findByText(nome)).toBeInTheDocument()
      }
    }
    expect(await painel.findByText(/Menos peso para SC porque você descartou 3 parecidas/)).toBeInTheDocument()
    const desfazer = painel.queryByRole('button', { name: 'Desfazer este ajuste', hidden: true })
    if (desfazer) {
      await usuario.click(desfazer)
      await usuario.click(painel.getByRole('button', { name: 'Confirmar', hidden: true }))
      await waitFor(() => expect(painel.getByText(/Ainda nada/)).toBeInTheDocument())
    }
  })
})
