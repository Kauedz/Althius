import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

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
})
