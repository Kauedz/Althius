// O editor da cascata continua no endereço direto. O painel de mercado não é card do catálogo.
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CascataDoCatalogo, FonteDeSinais, NovoMonitoramento, SinalDeMercado } from '@/fonte/sinais-tipos'
import { renderizarAppCom } from '@/test/renderizar'

const MARCA_INTERNA = /apify|\bactors?\b|openai|anthropic|\bclaude\b|\bgpt[-\s]?\d|\bcodex\b/i

const CASCATAS: CascataDoCatalogo[] = [
  { tipo: 'vaga_comex', icp: 'A', nome: 'Vaga de Comex', estado: 'disponivel', escopo: 'conta' },
  { tipo: 'habilitacao_radar', icp: 'A', nome: 'Habilitação no Radar', estado: 'sem-fonte', escopo: 'conta', motivo: 'Não há fonte pública aberta para este dado.' },
  { tipo: 'volume_por_porto', icp: 'A', nome: 'Aumento de volume importado por porto', estado: 'disponivel', escopo: 'mercado' },
  { tipo: 'novo_importador', icp: 'A', nome: 'Novo importador', estado: 'em-teste', escopo: 'mercado' },
  { tipo: 'tipo_estranho', icp: 'Z', nome: 'Fora do mapa', estado: 'disponivel', escopo: 'conta' },
]

const SINAIS: SinalDeMercado[] = [
  {
    id: 's-mercado',
    tipo: 'volume_por_porto',
    nome: 'Aumento de volume importado por porto',
    frase: 'Volume importado pelo porto de Santos subiu',
    data: '2026-10-01T00:00:00.000Z',
  },
]

function fonteComCascatas(gravados: NovoMonitoramento[]) {
  return (fonte: FonteDeSinais): FonteDeSinais =>
    Object.assign(Object.create(fonte) as FonteDeSinais, {
      cascatas: () => Promise.resolve(CASCATAS),
      sinaisDeMercado: (icp: string) => Promise.resolve(icp === 'A' ? SINAIS : []),
      salvarMonitoramento: async (m: NovoMonitoramento) => {
        gravados.push(m)
        return fonte.salvarMonitoramento(m)
      },
    })
}

describe('Criar Monitoramento a partir da cascata disponível', () => {
  it('abre o fluxo preenchido com a cascata, o nome do nicho e o modo de Automação', async () => {
    renderizarAppCom('/sinais/cascatas/vaga_comex/novo', { sinais: fonteComCascatas([]) })

    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nome do monitoramento' })).toHaveValue('Vaga de Comex')
    expect(screen.getByText('Comex e importação')).toBeInTheDocument()
    expect(screen.queryByText(/A ·/)).not.toBeInTheDocument()
    expect(screen.getByText('ICP do Workspace')).toBeInTheDocument()
    expect(screen.getByText(/varredura está em confirmar/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Automação e tetos' })).toHaveAttribute('href', '/configuracoes/automacao')
    expect(screen.queryByRole('radio', { name: /Descobrir por perfil/ })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(MARCA_INTERNA)
  })

  it('salvar o rascunho grava o Monitoramento da cascata e volta para Sinais', async () => {
    const gravados: NovoMonitoramento[] = []
    const { usuario } = renderizarAppCom('/sinais/cascatas/vaga_comex/novo', { sinais: fonteComCascatas(gravados) })
    await screen.findByRole('textbox', { name: 'Nome do monitoramento' })
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/Rascunho “Vaga de Comex” salvo/)
    expect(gravados[0]).toMatchObject({
      tipoId: 'vaga_comex',
      nome: 'Vaga de Comex',
      estado: 'rascunho',
      publico: { modo: 'listas', usaRecomendado: true },
    })
  })

  it('nicho desconhecido no editor diz Nicho não encontrado', async () => {
    renderizarAppCom('/sinais/cascatas/tipo_estranho/novo', { sinais: fonteComCascatas([]) })
    expect(await screen.findByText('Nicho não encontrado')).toBeInTheDocument()
  })
})

describe('Ver Sinais de mercado', () => {
  it('a letra antiga abre o slug e mostra a frase gravada, sem dado pessoal', async () => {
    renderizarAppCom('/sinais/mercado/A?tipo=volume_por_porto', { sinais: fonteComCascatas([]) })
    const vista = await screen.findByRole('region', { name: 'Sinais de mercado' })
    expect(within(vista).getByText('Volume importado pelo porto de Santos subiu')).toBeInTheDocument()
    expect(within(vista).getByText(/deste nicho/)).toBeInTheDocument()
    expect(vista.textContent).not.toMatch(/\bA ·/)
    expect(vista.textContent).not.toMatch(MARCA_INTERNA)
    expect(vista.textContent).not.toMatch(/@|cpf|evidência|payload/i)
  })

  it('cascata de mercado disponível explica como ativar o Monitoramento, dentro do teto e da Automação', async () => {
    renderizarAppCom('/sinais/mercado/comex-e-importacao?tipo=volume_por_porto', { sinais: fonteComCascatas([]) })
    const vista = await screen.findByRole('region', { name: 'Sinais de mercado' })
    const criar = within(vista).getByRole('link', { name: 'Criar Monitoramento' })
    expect(criar).toHaveAttribute('href', '/sinais/cascatas/volume_por_porto/novo')
    expect(within(vista).getByText(/teto/)).toBeInTheDocument()
    expect(within(vista).getByText(/confirmar|automático/)).toBeInTheDocument()
  })

  it('cascata de mercado em teste explica a validação e não oferece criar', async () => {
    renderizarAppCom('/sinais/mercado/comex-e-importacao?tipo=novo_importador', { sinais: fonteComCascatas([]) })
    const vista = await screen.findByRole('region', { name: 'Sinais de mercado' })
    expect(within(vista).getByText(/validação/)).toBeInTheDocument()
    expect(within(vista).queryByRole('link', { name: 'Criar Monitoramento' })).not.toBeInTheDocument()
  })
})
