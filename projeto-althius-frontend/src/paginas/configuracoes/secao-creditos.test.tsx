import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { nomeDaAcao, nomeDoLancamento } from '@/fonte/creditos'
import type { LancamentoDeCredito } from '@/fonte/tipos'
import { renderizarApp } from '@/test/renderizar'
import { CartaoDeSaldo, Extrato, TabelaDePrecos } from './secao-creditos'

const EXTRATO: LancamentoDeCredito[] = [
  { id: '1', creditos: -2, tipo: 'acao', acao: 'email_revealed', sinal: 'Vagas de BDR', criadoEm: '2026-10-20T15:00:00Z' },
  { id: '2', creditos: -1, tipo: 'acao', acao: 'account_scan', sinal: 'Expansão de frota', criadoEm: '2026-10-21T15:00:00Z' },
  { id: '3', creditos: -1, tipo: 'acao', acao: 'cnpj_receita', sinal: null, criadoEm: '2026-10-22T15:00:00Z' },
  { id: '4', creditos: 4500, tipo: 'plano', acao: null, sinal: null, criadoEm: '2026-10-01T15:00:00Z' },
]

const linhas = () => within(screen.getByRole('table', { name: 'Extrato de créditos' })).getAllByRole('row').slice(1)

describe('Créditos: saldo', () => {
  it('mostra disponível, reservado e lançado em créditos', () => {
    render(<CartaoDeSaldo saldo={{ lancado: 4380, reservado: 120, disponivel: 4260, ilimitado: false }} />)
    expect(screen.getByText('4.260')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('4.380')).toBeInTheDocument()
    expect(screen.queryByText(/Ilimitado/)).not.toBeInTheDocument()
  })

  it('no Workspace interno mostra uma vez "Ilimitado (interno)" e nenhum número', () => {
    render(<CartaoDeSaldo saldo={{ lancado: 0, reservado: 0, disponivel: -37, ilimitado: true }} />)
    expect(screen.getAllByText('Ilimitado (interno)')).toHaveLength(1)
    expect(screen.queryByText('-37')).not.toBeInTheDocument()
  })

  it('sem saldo lido, explica em vez de mostrar NaN', () => {
    render(<CartaoDeSaldo saldo={null} />)
    expect(screen.getByText('Não foi possível ler o saldo agora.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/NaN/)
  })
})

describe('Créditos: preço por ação', () => {
  it('mostra só créditos e esconde descrição com moeda ou limite interno', () => {
    render(
      <TabelaDePrecos
        precos={[
          { acao: 'cascata_de_sinais', creditos: 1, descricao: 'custo real US$ 0,02 × multiplicador' },
          { acao: 'account_scan', creditos: 1, descricao: 'Teto por dia do Sinal' },
          { acao: 'email_revealed', creditos: 2, descricao: 'Um e-mail revelado no enriquecimento' },
        ]}
      />,
    )
    expect(screen.getByText('Busca de Sinais')).toBeInTheDocument()
    expect(screen.getByText('Um e-mail revelado no enriquecimento')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/US\$|Teto/)
  })

  it('catálogo vazio', () => {
    render(<TabelaDePrecos precos={[]} />)
    expect(screen.getByText('Nenhum preço disponível.')).toBeInTheDocument()
  })
})

describe('Créditos: extrato', () => {
  it('mostra data, ação em pt-BR, Sinal e créditos com sinal', () => {
    render(<Extrato lancamentos={EXTRATO} />)
    expect(linhas()).toHaveLength(4)
    const tabela = within(screen.getByRole('table', { name: 'Extrato de créditos' }))
    expect(tabela.getByText('+4.500')).toBeInTheDocument()
    expect(tabela.getByText('Crédito do contrato')).toBeInTheDocument()
    expect(tabela.getByText('E-mail revelado')).toBeInTheDocument()
    expect(tabela.getByText('Vagas de BDR')).toBeInTheDocument()
    expect(tabela.getByText('20/10/2026')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/email_revealed|account_scan/)
  })

  it('filtra por ação e por Sinal', async () => {
    const usuario = userEvent.setup()
    render(<Extrato lancamentos={EXTRATO} />)
    await usuario.selectOptions(screen.getByLabelText('Filtrar por ação'), 'account_scan')
    expect(linhas()).toHaveLength(1)
    expect(within(linhas()[0]).getByText('Expansão de frota')).toBeInTheDocument()
    await usuario.selectOptions(screen.getByLabelText('Filtrar por ação'), 'todas')
    await usuario.selectOptions(screen.getByLabelText('Filtrar por Sinal'), 'Vagas de BDR')
    expect(linhas()).toHaveLength(1)
    expect(within(linhas()[0]).getByText('E-mail revelado')).toBeInTheDocument()
  })

  it('sem Sinal no extrato, não oferece o filtro por Sinal; vazio, diz que não há lançamento', () => {
    const { unmount } = render(<Extrato lancamentos={EXTRATO.filter((l) => !l.sinal)} />)
    expect(screen.queryByLabelText('Filtrar por Sinal')).not.toBeInTheDocument()
    unmount()
    render(<Extrato lancamentos={[]} />)
    expect(screen.getByText('Nenhum lançamento ainda.')).toBeInTheDocument()
  })
})

describe('Créditos: nomes', () => {
  it('toda ação do catálogo tem nome em pt-BR, e chave desconhecida não aparece crua', () => {
    for (const acao of ['account_discovery', 'account_scan', 'agent_round', 'cascata_de_sinais', 'cnpj_receita', 'email_revealed', 'person_collected', 'phone_revealed']) {
      expect(nomeDaAcao(acao)).not.toMatch(/_/)
    }
    expect(nomeDaAcao('acao_interna')).toBe('Outra ação')
    expect(nomeDoLancamento({ tipo: 'pacote', acao: null })).toBe('Pacote de créditos')
    expect(nomeDoLancamento({ tipo: 'ajuste', acao: null })).toBe('Ajuste')
  })
})

describe('Créditos na Demonstração', () => {
  it('a seção abre em Configurações com os dados simulados', async () => {
    renderizarApp('/configuracoes/creditos')
    expect(await screen.findByRole('heading', { level: 2, name: 'Créditos' })).toBeInTheDocument()
    expect(screen.getByText('4.260')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Extrato de créditos' })).toBeInTheDocument()
    expect(screen.getByText('Como obter mais créditos')).toBeInTheDocument()
  })
})
