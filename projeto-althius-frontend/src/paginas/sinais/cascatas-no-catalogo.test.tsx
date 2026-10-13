// Os cartões das cascatas no catálogo de Sinais (ticket 13): dentro de Externo, agrupados por ICP de A a H, com o selo
// de disponibilidade e o de Mercado. A Fonte de Sinais é a do Workspace operacional, simulada: nunca há rede nem banco.
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CascataDoCatalogo, FonteDeSinais } from '@/fonte/sinais-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

const MARCA_INTERNA = /apify|\bactors?\b|openai|anthropic|\bclaude\b|\bgpt[-\s]?\d|\bcodex\b/i

// Uma cascata de cada jeito: disponível, em teste, sem fonte (com o motivo) e de Mercado.
const CASCATAS: CascataDoCatalogo[] = [
  { tipo: 'vaga_comex', icp: 'A', nome: 'Vaga de Comex', estado: 'disponivel', escopo: 'conta' },
  { tipo: 'novo_importador', icp: 'A', nome: 'Novo importador', estado: 'em-teste', escopo: 'mercado' },
  { tipo: 'habilitacao_radar', icp: 'A', nome: 'Habilitação no Radar', estado: 'sem-fonte', escopo: 'conta', motivo: 'Não há fonte pública aberta para este dado.' },
  { tipo: 'processos_publicos', icp: 'C', nome: 'Processos públicos', estado: 'em-teste', escopo: 'conta' },
  { tipo: 'cpr_registrada', icp: 'H', nome: 'CPR registrada', estado: 'em-teste', escopo: 'mercado' },
]

const comCascatas = (cascatas: CascataDoCatalogo[] | Error) => (fonte: FonteDeSinais): FonteDeSinais =>
  Object.assign(Object.create(fonte) as FonteDeSinais, {
    cascatas: () => (cascatas instanceof Error ? Promise.reject(cascatas) : Promise.resolve(cascatas)),
  })

const cartao = async (nome: string) => (await screen.findByRole('heading', { level: 4, name: nome })).closest('li') as HTMLElement
const secao = async () => screen.findByRole('region', { name: 'Sinais por mercado' })

describe('Catálogo de Sinais: as cascatas dentro de Externo, agrupadas por ICP', () => {
  it('mostra um grupo por ICP que tenha cascata, na ordem de A a H, com o nome do ICP', async () => {
    renderizarAppCom('/sinais', { sinais: comCascatas(CASCATAS) })
    const grupos = within(await secao()).getAllByRole('heading', { level: 3 })
    expect(grupos.map((g) => g.textContent)).toEqual(['A · Comex e importação', 'C · Jurídico empresarial', 'H · Agro B2B'])
    expect(within(await secao()).getByText('Externo')).toBeInTheDocument()
  })

  it('o ICP com restrição regulatória a mostra numa linha; o sem restrição não mostra nada', async () => {
    renderizarAppCom('/sinais', { sinais: comCascatas(CASCATAS) })
    const s = await secao()
    expect(within(s).getByText(/OAB e LGPD: só Sinal por empresa\/CNPJ/)).toBeInTheDocument()
    const comex = within(s).getByRole('heading', { level: 3, name: /^A · / }).closest('section') as HTMLElement
    expect(within(comex).queryByText(/CFC|OAB|SUSEP|ANEEL|CVM/)).not.toBeInTheDocument()
  })

  it('disponível mostra o selo; em teste mostra o selo e que está em validação; nenhum deixa criar Monitoramento por aqui', async () => {
    renderizarAppCom('/sinais', { sinais: comCascatas(CASCATAS) })
    const disponivel = await cartao('Vaga de Comex')
    expect(within(disponivel).getByText('Disponível')).toBeInTheDocument()
    const emTeste = await cartao('Processos públicos')
    expect(within(emTeste).getByText('Em teste')).toBeInTheDocument()
    expect(within(emTeste).getByText(/validação/)).toBeInTheDocument()
    for (const c of [disponivel, emTeste]) expect(within(c).queryByRole('link')).not.toBeInTheDocument()
  })

  it('sem fonte mostra o selo e o motivo, sem custo e sem Monitoramento', async () => {
    renderizarAppCom('/sinais', { sinais: comCascatas(CASCATAS) })
    const semFonte = await cartao('Habilitação no Radar')
    expect(within(semFonte).getByText('Sem fonte')).toBeInTheDocument()
    expect(within(semFonte).getByText('Não há fonte pública aberta para este dado.')).toBeInTheDocument()
    expect(within(semFonte).queryByRole('link')).not.toBeInTheDocument()
    expect(within(semFonte).queryByText('Disponível')).not.toBeInTheDocument()
  })

  it('o de Mercado leva o selo e a explicação de que não é de uma Conta sua', async () => {
    renderizarAppCom('/sinais', { sinais: comCascatas(CASCATAS) })
    const mercado = await cartao('CPR registrada')
    expect(within(mercado).getByText('Mercado')).toBeInTheDocument()
    expect(within(mercado).getByText(/movimento do mercado, não de uma Conta sua/)).toBeInTheDocument()
    const daConta = await cartao('Processos públicos')
    expect(within(daConta).queryByText('Mercado')).not.toBeInTheDocument()
  })

  it('o filtro Externo e o Todos mostram a seção; Interno e Originado a escondem', async () => {
    const { usuario } = renderizarAppCom('/sinais', { sinais: comCascatas(CASCATAS) })
    await secao()
    for (const [filtro, aparece] of [['Interno', false], ['Originado', false], ['Externo', true], ['Todos', true]] as const) {
      await usuario.click(within(screen.getByRole('group', { name: 'Filtrar por origem' })).getByRole('button', { name: new RegExp(`^${filtro}`) }))
      if (aparece) expect(await secao()).toBeInTheDocument()
      else expect(screen.queryByRole('region', { name: 'Sinais por mercado' })).not.toBeInTheDocument()
    }
  })

  it('a busca acha pelo nome do Sinal ou do ICP, e some com o grupo que não corresponde', async () => {
    const { usuario } = renderizarAppCom('/sinais', { sinais: comCascatas(CASCATAS) })
    await secao()
    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar tipos de sinal' }), 'agro')
    const s = await secao()
    expect(within(s).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['CPR registrada'])
  })

  it('a Demonstração não tem cascatas: o catálogo é o de sempre, sem a seção', async () => {
    renderizarApp('/sinais')
    await screen.findByRole('heading', { level: 3, name: 'Abertura de vagas' })
    expect(screen.queryByRole('region', { name: 'Sinais por mercado' })).not.toBeInTheDocument()
  })

  it('se a leitura das cascatas falha, o catálogo atual segue intacto e sem erro na tela', async () => {
    renderizarAppCom('/sinais', { sinais: comCascatas(new Error('rpc fora do ar: sk-SEGREDO')) })
    await screen.findByRole('heading', { level: 3, name: 'Abertura de vagas' })
    expect(screen.queryByRole('region', { name: 'Sinais por mercado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('SEGREDO')
  })

  it('nada do que a seção mostra cita fornecedor, "actor" ou modelo', async () => {
    renderizarAppCom('/sinais', { sinais: comCascatas(CASCATAS) })
    expect((await secao()).textContent).not.toMatch(MARCA_INTERNA)
  })
})
