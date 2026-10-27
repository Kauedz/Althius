import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'
import { adicionarCargosCustom, adicionarRecorteCustom, cargosCustom, criteriosComRecortes, limparTextoCustom, manterCargosCustom, recortesDoMonitoramento } from './criterios-custom'
import { criteriosFormatados } from './resumos'

describe('Critérios Custom de Abertura de vagas: regras', () => {
  it('normaliza os recortes novos e lê os critérios antigos', () => {
    expect(recortesDoMonitoramento({ nichos: ['logistica-e-transporte'], nichosCustom: [' Seguros '] })).toEqual([
      { tipo: 'pronto', valor: 'logistica-e-transporte', nome: 'Logística e transporte' },
      { tipo: 'custom', valor: 'Seguros', nome: 'Seguros' },
    ])
    expect(recortesDoMonitoramento({ nicho: 'custom', nichoCustom: ' Naval ' })).toEqual([
      { tipo: 'custom', valor: 'Naval', nome: 'Naval' },
    ])
    expect(recortesDoMonitoramento({ nicho: 'qualquer' })).toEqual([])
    expect(criteriosComRecortes({ nicho: 'qualquer', nichoCustom: 'Legado', funcoes: ['SDR'] }, [
      { tipo: 'pronto', valor: 'logistica-e-transporte', nome: 'Logística e transporte' },
      { tipo: 'custom', valor: 'Seguros', nome: 'Seguros' },
    ])).toEqual({ funcoes: ['SDR'], nichos: ['logistica-e-transporte'], nichosCustom: ['Seguros'] })
  })

  it('evita setores repetidos por caixa e acento e aplica os limites do setor escrito', () => {
    const naval = adicionarRecorteCustom([], ' Óleo e gás ')
    expect(adicionarRecorteCustom(naval.recortes, 'oleo E GAS').recortes).toEqual(naval.recortes)
    expect(adicionarRecorteCustom([], 'x'.repeat(61)).erro).toBe('Cada setor tem até 60 caracteres.')
    const cinco = Array.from({ length: 5 }, (_, i) => ({ tipo: 'custom' as const, valor: `Setor ${i}`, nome: `Setor ${i}` }))
    expect(adicionarRecorteCustom(cinco, 'Outro').erro).toBe('Até 5 setores escritos por Monitoramento.')
  })

  it('limpa o texto, não repete, respeita as opções da tela e o limite de 10 cargos Custom', () => {
    expect(limparTextoCustom('  Óleo   e gás ')).toBe('Óleo e gás')
    const opcoes = ['Analista fiscal', 'Contador']
    expect(adicionarCargosCustom([], 'SDR, LDR , bdr, sdr', opcoes).funcoes).toEqual(['SDR', 'LDR', 'bdr'])
    expect(adicionarCargosCustom(['SDR'], 'contador', opcoes).funcoes).toEqual(['SDR', 'Contador'])
    const longo = adicionarCargosCustom([], 'x'.repeat(61), opcoes)
    expect(longo.funcoes).toEqual([])
    expect(longo.erro).toBe('Cada cargo tem até 60 caracteres.')
    const dez = Array.from({ length: 10 }, (_, i) => `Cargo ${i}`)
    const cheio = adicionarCargosCustom(dez, 'Mais um', opcoes)
    expect(cheio.funcoes).toHaveLength(10)
    expect(cheio.erro).toBe('Até 10 cargos Custom por Monitoramento.')
    expect(cargosCustom(['SDR', 'Contador'], opcoes)).toEqual(['SDR'])
    expect(manterCargosCustom(['SDR', 'Contador', 'Engenharia de dados'])).toEqual(['SDR'])
  })

  it('o resumo mostra todos os recortes pelo nome ou como foram escritos, nunca a letra interna', () => {
    const custom = criteriosFormatados({ tipoId: 'abertura-de-vagas', criterios: { nicho: 'custom', nichoCustom: 'Naval', funcoes: ['SDR'] } })
    expect(custom[0]).toEqual({ rotulo: 'Nichos', texto: 'Naval', numerico: false })
    expect(custom.find((c) => c.rotulo === 'Cargos ou funções')?.texto).toBe('SDR')
    const pronto = criteriosFormatados({ tipoId: 'abertura-de-vagas', criterios: { nicho: 'comex-e-importacao' } })
    expect(pronto[0].texto).toBe('Comex e importação')
    expect(criteriosFormatados({ tipoId: 'abertura-de-vagas', criterios: { nicho: 'qualquer' } })).toEqual([])
  })
})

describe('Critérios Custom de Abertura de vagas: tela', () => {
  it('salva vários recortes, mostra o resumo e mantém os cargos escritos ao trocar nichos', async () => {
    const { usuario } = renderizarApp('/sinais/tipos/abertura-de-vagas')
    await usuario.click(await screen.findByRole('link', { name: 'Ativar Monitoramento' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo monitoramento' })).toBeInTheDocument()

    const nichos = screen.getByRole('group', { name: 'Nichos e setores' })
    await usuario.click(within(nichos).getByRole('checkbox', { name: 'Logística e transporte' }))
    const campoNicho = screen.getByRole('textbox', { name: 'Setor escrito' })
    await usuario.type(campoNicho, 'Seguros')
    await usuario.click(screen.getByRole('button', { name: 'Adicionar setor' }))
    expect(screen.getByRole('list', { name: 'Setores escritos' })).toHaveTextContent('Seguros')

    const cargos = screen.getByRole('group', { name: 'Cargos ou funções' })
    await usuario.click(within(cargos).getByRole('checkbox', { name: 'Custom' }))
    const campoCargo = screen.getByRole('textbox', { name: 'Cargo Custom' })
    await usuario.type(campoCargo, 'SDR, LDR, BDR{Enter}')
    expect(campoCargo).toHaveValue('')
    for (const cargo of ['SDR', 'LDR', 'BDR']) {
      expect(within(cargos).getByRole('checkbox', { name: cargo })).toHaveAttribute('aria-checked', 'true')
    }

    await usuario.type(campoCargo, 'sdr')
    await usuario.click(screen.getByRole('button', { name: 'Adicionar cargo' }))
    expect(within(cargos).getAllByRole('checkbox', { name: /sdr/i })).toHaveLength(1)

    await usuario.click(within(cargos).getByRole('checkbox', { name: 'LDR' }))
    expect(within(cargos).queryByRole('checkbox', { name: 'LDR' })).not.toBeInTheDocument()

    await usuario.click(within(nichos).getByRole('checkbox', { name: 'Comex e importação' }))
    expect(within(cargos).getByRole('checkbox', { name: 'Analista de comércio exterior' })).toBeInTheDocument()
    expect(within(cargos).getByRole('checkbox', { name: 'SDR' })).toHaveAttribute('aria-checked', 'true')
    expect(within(cargos).getByRole('checkbox', { name: 'BDR' })).toHaveAttribute('aria-checked', 'true')
    await usuario.click(within(nichos).getByRole('checkbox', { name: 'Comex e importação' }))
    expect(within(nichos).getAllByRole('checkbox').map((opcao) => opcao.textContent)).not.toContain('F')

    // Salva como rascunho e confere o resumo da lista ao reabrir a página do tipo.
    await usuario.type(screen.getByRole('textbox', { name: 'Nome do monitoramento' }), 'Transporte e seguros')
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Abertura de vagas' })).toBeInTheDocument()
    const item = screen.getByRole('listitem', { name: 'Transporte e seguros' })
    expect(item).toHaveTextContent('Logística e transporte, Seguros')
    await usuario.click(within(item).getByRole('link', { name: 'Transporte e seguros' }))
    expect(await screen.findByRole('checkbox', { name: 'Logística e transporte' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('list', { name: 'Setores escritos' })).toHaveTextContent('Seguros')
  })
})
