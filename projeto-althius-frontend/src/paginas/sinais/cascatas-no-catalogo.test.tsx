// As cascatas saíram do catálogo (PR-A). A letra do nicho não aparece. O painel de mercado fica em /sinais/mercado.
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CascataDoCatalogo, FonteDeSinais } from '@/fonte/sinais-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

const MARCA_INTERNA = /apify|\bactors?\b|openai|anthropic|\bclaude\b|\bgpt[-\s]?\d|\bcodex\b/i

const CASCATAS: CascataDoCatalogo[] = [
  { tipo: 'vaga_comex', icp: 'A', nome: 'Vaga de Comex', estado: 'disponivel', escopo: 'conta' },
  { tipo: 'novo_importador', icp: 'A', nome: 'Novo importador', estado: 'em-teste', escopo: 'mercado' },
  { tipo: 'habilitacao_radar', icp: 'A', nome: 'Habilitação no Radar', estado: 'sem-fonte', escopo: 'conta', motivo: 'Não há fonte pública aberta para este dado.' },
  { tipo: 'volume_por_porto', icp: 'A', nome: 'Aumento de volume importado por porto', estado: 'disponivel', escopo: 'mercado' },
]

const comCascatas = (cascatas: CascataDoCatalogo[] | Error) => (fonte: FonteDeSinais): FonteDeSinais =>
  Object.assign(Object.create(fonte) as FonteDeSinais, {
    cascatas: () => (cascatas instanceof Error ? Promise.reject(cascatas) : Promise.resolve(cascatas)),
  })

describe('Catálogo único: cascatas e letras fora da grade', () => {
  it('não agrupa por letra e não mostra selo de cascata', async () => {
    renderizarAppCom('/sinais', { sinais: comCascatas(CASCATAS) })
    await screen.findByRole('heading', { level: 3, name: 'Abertura de vagas' })
    expect(screen.queryByRole('region', { name: 'Sinais por mercado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /A ·/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Em teste')).not.toBeInTheDocument()
    expect(screen.queryByText('Sem fonte')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 4, name: 'Vaga de Comex' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(MARCA_INTERNA)
  })

  it('a Demonstração também não tem a seção antiga', async () => {
    renderizarApp('/sinais')
    await screen.findByRole('heading', { level: 3, name: 'Abertura de vagas' })
    expect(screen.queryByRole('region', { name: 'Sinais por mercado' })).not.toBeInTheDocument()
  })

  it('se a leitura das cascatas falha, o catálogo segue sem erro na tela', async () => {
    renderizarAppCom('/sinais', { sinais: comCascatas(new Error('rpc fora do ar: sk-SEGREDO')) })
    await screen.findByRole('heading', { level: 3, name: 'Abertura de vagas' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('SEGREDO')
  })

  it('Mercado lista o nicho pelo nome, e a letra antiga redireciona para o slug', async () => {
    const { usuario } = renderizarAppCom('/sinais/mercado', { sinais: comCascatas(CASCATAS) })
    const link = await screen.findByRole('link', { name: 'Comex e importação' })
    expect(link).toHaveAttribute('href', '/sinais/mercado/comex-e-importacao')
    expect(screen.queryByText(/^A ·/)).not.toBeInTheDocument()

    await usuario.click(link)
    const vista = await screen.findByRole('region', { name: 'Sinais de mercado' })
    expect(within(vista).getByRole('heading', { level: 2, name: 'Comex e importação' })).toBeInTheDocument()
    expect(within(vista).getByText('Volume por porto')).toBeInTheDocument()
    expect(vista.textContent).toMatch(/deste nicho/)
    expect(vista.textContent).not.toMatch(/\bA ·/)
  })
})
