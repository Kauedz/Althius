import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ArmazenamentoDeOnboarding } from '@/fonte/simulada-onboarding'
import { renderizarApp } from '@/test/renderizar'

type Usuario = ReturnType<typeof renderizarApp>['usuario']

const PAPEIS = ['Founder', 'Head de Vendas', 'SDR/BDR', 'AE', 'Marketing', 'RevOps', 'Outro']
const ORIGENS = ['Indicação', 'LinkedIn', 'Busca', 'Evento', 'Conteúdo', 'Outro']

const MINI_ICP = 'Empresas B2B que compram de Norte Dados e já operam com time comercial.'
const O_QUE_VENDE = 'A oferta pública de Norte Dados, lida em nortedados.com.br.'
const POR_QUE_COMPRAM = 'Para resolver o problema que Norte Dados comunica em nortedados.com.br.'

function memoria(): ArmazenamentoDeOnboarding {
  const dados = new Map<string, string>()
  return {
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => {
      dados.set(chave, valor)
    },
  }
}

async function entrarComoCriador(usuario: Usuario) {
  await usuario.click(await screen.findByRole('radio', { name: 'Criar um Workspace' }))
  await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
}

async function day0Criador(usuario: Usuario, dominio = 'nortedados.com.br', nome = 'Norte Dados') {
  await entrarComoCriador(usuario)
  await usuario.click(await screen.findByRole('radio', { name: 'RevOps' }))
  await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
  await usuario.type(await screen.findByRole('textbox', { name: 'Domínio' }), dominio)
  if (nome) await usuario.type(screen.getByRole('textbox', { name: 'Nome' }), nome)
  await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
  await usuario.click(await screen.findByRole('radio', { name: 'Indicação' }))
  await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
  await usuario.click(await screen.findByRole('button', { name: 'Pular convite' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
}

describe('Onboarding pós-login', () => {
  it('cria o Workspace do criador, sugere o nome pela empresa e não semeia Conta-alvo', async () => {
    const { usuario, fonteDeOnboarding, fonteDeContas } = renderizarApp('/onboarding')
    const contasAntes = (await fonteDeContas.contas()).map((conta) => conta.id).sort()

    expect(screen.queryByRole('complementary', { name: 'Navegação' })).not.toBeInTheDocument()
    await entrarComoCriador(usuario)

    for (const papel of PAPEIS) {
      expect(screen.getByRole('radio', { name: papel })).toBeInTheDocument()
    }

    await usuario.click(screen.getByRole('radio', { name: 'RevOps' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))

    const criado = await fonteDeOnboarding.ler()
    expect(criado.workspace?.id).toBeTruthy()
    expect(criado.workspace?.nomeSugerido).toBe('')
    const id = criado.workspace?.id

    await usuario.type(await screen.findByRole('textbox', { name: 'Domínio' }), 'nortedados.com.br')
    await usuario.type(screen.getByRole('textbox', { name: 'Nome' }), 'Norte Dados')
    expect(screen.getByRole('img', { name: 'Logo de Norte Dados' })).toHaveAttribute(
      'src',
      'https://www.google.com/s2/favicons?domain=nortedados.com.br&sz=128',
    )
    expect(screen.getByText(/Nome sugerido do Workspace e do Cliente: Norte Dados/)).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma Conta-alvo nasce daqui/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))

    for (const origem of ORIGENS) {
      expect(screen.getByRole('radio', { name: origem })).toBeInTheDocument()
    }
    await usuario.click(screen.getByRole('radio', { name: 'Indicação' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))

    await usuario.type(await screen.findByRole('textbox', { name: 'E-mails dos colegas' }), 'ana@norte.dev')
    await usuario.click(screen.getByRole('button', { name: 'Pular convite' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    expect(screen.getByText(/Workspace sugerido: Norte Dados/)).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Navegação' })).not.toBeInTheDocument()

    const estado = await fonteDeOnboarding.ler()
    expect(estado.workspace).toEqual({ id, nomeSugerido: 'Norte Dados' })
    expect(estado.papel).toBe('RevOps')
    expect(estado.dominio).toBe('nortedados.com.br')
    expect(estado.empresa).toBe('Norte Dados')
    expect(estado.checklist.produto).toBe('concluido')
    expect(estado.checklist.persona).toBe('concluido')
    expect(estado.checklist.sinal).toBe('concluido')
    expect(estado.checklist.miniIcp).toBe(MINI_ICP)
    expect(estado.contextoDaIa).toContain('nortedados.com.br')
    expect(estado.comoConheceu).toBe('Indicação')
    expect(estado.convitePulado).toBe(true)
    expect(JSON.stringify(estado)).not.toContain('ana@norte.dev')
    expect((await fonteDeContas.contas()).map((conta) => conta.id).sort()).toEqual(contasAntes)
    expect((await fonteDeContas.contas()).some((conta) => conta.nome === 'Norte Dados')).toBe(false)
  })

  it('o papel Outro segue para a empresa sem campo extra', async () => {
    const { usuario, fonteDeOnboarding } = renderizarApp('/onboarding')
    await entrarComoCriador(usuario)
    await usuario.click(await screen.findByRole('radio', { name: 'Outro' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('textbox', { name: 'Domínio' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nome' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /descreva|qual papel/i })).not.toBeInTheDocument()
    expect((await fonteDeOnboarding.ler()).papel).toBe('Outro')
  })

  it('o convidado pula a empresa, não cria Workspace e pode pular o convite até a home', async () => {
    const { usuario, fonteDeOnboarding } = renderizarApp('/onboarding')

    await usuario.click(await screen.findByRole('radio', { name: 'Fui convidado para um Workspace' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await usuario.click(await screen.findByRole('radio', { name: 'Head de Vendas' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Como você conheceu a Althius?' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Domínio' })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('radio', { name: 'LinkedIn' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText(/Nenhum e-mail é enviado/)).toBeInTheDocument()
    expect(screen.getByText(/Participação no Workspace/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Pular convite' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    expect(screen.getByText(/Workspace para o qual foi convidado/)).toBeInTheDocument()

    const estado = await fonteDeOnboarding.ler()
    expect(estado.ramo).toBe('convidado')
    expect(estado.workspace).toBeNull()
    expect(estado.empresa).toBe('')
    expect(estado.papel).toBe('Head de Vendas')
    expect(estado.comoConheceu).toBe('LinkedIn')
    expect(estado.convitePulado).toBe(true)

    await usuario.click(screen.getByRole('link', { name: 'Ir para a home' }))
    expect(await screen.findByRole('complementary', { name: 'Navegação' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect((await fonteDeOnboarding.ler()).workspace).toBeNull()
  })

  it('mostra os três itens do Norte, com defaults editáveis que persistem ao concluir', async () => {
    const { usuario, fonteDeOnboarding } = renderizarApp('/onboarding')
    await day0Criador(usuario)

    const lista = screen.getByRole('list', { name: 'Checklist do Norte' })
    expect(within(lista).getAllByRole('heading', { level: 2 }).map((titulo) => titulo.textContent)).toEqual([
      '1. Mini-ICP e produto',
      '2. Persona',
      '3. Sinal',
    ])
    expect(within(lista).queryByText(/Cadência/)).not.toBeInTheDocument()
    expect(screen.getByText(/Cadência fica de fora deste checklist/)).toBeInTheDocument()
    expect(screen.getByText(/Reunião no App segue só como status de demonstração/)).toBeInTheDocument()

    expect(screen.getByRole('textbox', { name: 'Mini-ICP' })).toHaveValue(MINI_ICP)
    expect(screen.getByRole('textbox', { name: 'O que você vende' })).toHaveValue(O_QUE_VENDE)
    expect(screen.getByRole('textbox', { name: 'Por que compram' })).toHaveValue(POR_QUE_COMPRAM)

    const miniIcp = screen.getByRole('textbox', { name: 'Mini-ICP' })
    const oQueVende = screen.getByRole('textbox', { name: 'O que você vende' })
    const porQueCompram = screen.getByRole('textbox', { name: 'Por que compram' })
    await usuario.clear(miniIcp)
    await usuario.type(miniIcp, 'Indústrias com operação própria no Sul.')
    await usuario.clear(oQueVende)
    await usuario.type(oQueVende, 'Peças sob encomenda para linhas contínuas.')
    await usuario.clear(porQueCompram)
    await usuario.type(porQueCompram, 'Para evitar parada de linha por falta de componente.')
    await usuario.click(screen.getByRole('button', { name: 'Concluir mini-ICP' }))

    const produto = screen.getByRole('listitem', { name: '1. Mini-ICP e produto' })
    expect(await within(produto).findByText('Concluído')).toBeInTheDocument()
    expect((await fonteDeOnboarding.ler()).checklist).toMatchObject({
      miniIcp: 'Indústrias com operação própria no Sul.',
      oQueVende: 'Peças sob encomenda para linhas contínuas.',
      porQueCompram: 'Para evitar parada de linha por falta de componente.',
      produto: 'concluido',
    })
  })

  it('o item de Persona é um stub fixo, distinto do Contato e da Memória do Agente', async () => {
    const { usuario, fonteDeOnboarding } = renderizarApp('/onboarding')
    await day0Criador(usuario)

    const persona = screen.getByRole('listitem', { name: '2. Persona' })
    expect(within(persona).getByText(/quem patrocina a compra em Norte Dados/)).toBeInTheDocument()
    expect(within(persona).getByText(/Memória do Workspace/)).toBeInTheDocument()
    expect(within(persona).getByText(/Não é a classificação de um Contato/)).toBeInTheDocument()
    expect(within(persona).getByText(/não é a Memória do Agente/)).toBeInTheDocument()
    expect(within(persona).queryByRole('button', { name: /gerar|inteligência artificial/i })).not.toBeInTheDocument()

    await usuario.click(within(persona).getByRole('button', { name: 'Concluir Persona' }))
    expect(await within(persona).findByText('Concluído')).toBeInTheDocument()
    expect((await fonteDeOnboarding.ler()).checklist.persona).toBe('concluido')
  })

  it('abrir Sinais conclui o item sem Monitoramento e permite voltar ao checklist ou à home', async () => {
    const { usuario, fonteDeOnboarding } = renderizarApp('/onboarding')
    await day0Criador(usuario)

    await usuario.click(screen.getByRole('button', { name: 'Abrir Sinais' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Novo monitoramento' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Retorno do checklist' })).toHaveTextContent(/sem criar um Monitoramento/)
    expect((await fonteDeOnboarding.ler()).checklist.sinal).toBe('concluido')

    await usuario.click(screen.getByRole('link', { name: 'Voltar ao checklist' }))
    const sinal = await screen.findByRole('listitem', { name: '3. Sinal' })
    expect(within(sinal).getByText('Concluído')).toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: 'Ir para a home' }))
    expect(await screen.findByRole('complementary', { name: 'Navegação' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Workspace: Norte Dados' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Logo de Norte Dados' })).toBeInTheDocument()
  })

  it('pular um item do checklist ainda aterra na home dentro da Casca', async () => {
    const { usuario, fonteDeOnboarding } = renderizarApp('/onboarding')
    await usuario.click(await screen.findByRole('radio', { name: 'Fui convidado para um Workspace' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await usuario.click(await screen.findByRole('radio', { name: 'RevOps' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await usuario.click(await screen.findByRole('radio', { name: 'Indicação' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await usuario.click(await screen.findByRole('button', { name: 'Pular convite' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Pular mini-ICP' }))
    expect(within(screen.getByRole('listitem', { name: '1. Mini-ICP e produto' })).getByText('Pulado')).toBeInTheDocument()
    expect((await fonteDeOnboarding.ler()).checklist.produto).toBe('pulado')

    await usuario.click(screen.getByRole('link', { name: 'Ir para a home' }))
    expect(await screen.findByRole('complementary', { name: 'Navegação' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Checklist do Norte' })).not.toBeInTheDocument()
  })

  it('reabrir restaura Day0 e checklist e não cria outro Workspace', async () => {
    const armazenamento = memoria()
    const primeira = renderizarApp('/onboarding', {}, {}, { armazenamento })
    await day0Criador(primeira.usuario)

    const miniIcp = screen.getByRole('textbox', { name: 'Mini-ICP' })
    await primeira.usuario.clear(miniIcp)
    await primeira.usuario.type(miniIcp, 'Times de receita com operação no Brasil.')
    await primeira.usuario.click(screen.getByRole('button', { name: 'Concluir mini-ICP' }))
    expect(await within(screen.getByRole('listitem', { name: '1. Mini-ICP e produto' })).findByText('Concluído')).toBeInTheDocument()

    const id = (await primeira.fonteDeOnboarding.ler()).workspace?.id
    primeira.unmount()

    const segunda = renderizarApp('/onboarding', {}, {}, { armazenamento })
    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Mini-ICP' })).toHaveValue('Times de receita com operação no Brasil.')
    expect(within(screen.getByRole('listitem', { name: '1. Mini-ICP e produto' })).getByText('Concluído')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Como você entra' })).not.toBeInTheDocument()

    const estado = await segunda.fonteDeOnboarding.ler()
    expect(estado.workspace?.id).toBe(id)
    expect(estado.workspace?.nomeSugerido).toBe('Norte Dados')
    expect(estado.papel).toBe('RevOps')
    expect(estado.empresa).toBe('Norte Dados')
    expect(estado.dominio).toBe('nortedados.com.br')
    expect(estado.comoConheceu).toBe('Indicação')
    expect(estado.convitePulado).toBe(true)
    expect(estado.checklist.produto).toBe('concluido')
    expect(estado.checklist.miniIcp).toBe('Times de receita com operação no Brasil.')
  })
})
