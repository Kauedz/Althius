import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FonteDoContextoDaEmpresa, TextosDoContexto } from '@/fonte/contexto-da-empresa-tipos'
import {
  CONTEXTO_DA_DEMONSTRACAO,
  criarFonteDoContextoDaEmpresaSimulada,
  type LeituraSimulada,
} from '@/fonte/simulada-contexto-da-empresa'
import {
  criarFonteDeOnboardingSimulada,
  type ArmazenamentoDeOnboarding,
  type OpcoesFonteDeOnboardingSimulada,
} from '@/fonte/simulada-onboarding'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

type Usuario = ReturnType<typeof renderizarApp>['usuario']

/** Um Workspace novo: sem site e sem Contexto da empresa. A leitura do site simulada responde na hora. */
function contextoNovo(lerSite: (site: string) => Promise<LeituraSimulada> = async () => CONTEXTO_DA_DEMONSTRACAO) {
  return criarFonteDoContextoDaEmpresaSimulada({ inicial: null, site: '', lerSite })
}

/**
 * O app de uma sessão que ainda não passou pelo onboarding, a partir desta rota. Sem `contexto`, o Workspace começa
 * sem Contexto da empresa.
 */
function renderizarSemOnboarding(
  rota: string,
  opcoes: OpcoesFonteDeOnboardingSimulada = {},
  noNavegador = false,
  contexto: FonteDoContextoDaEmpresa = contextoNovo(),
) {
  return renderizarAppCom(rota, { opcoesOnboarding: { jaConcluido: false, ...opcoes }, contextoDaEmpresa: () => contexto }, noNavegador)
}

/** Uma leitura do site que só termina quando o teste manda. */
function leituraControlada() {
  let entregar: (leitura: LeituraSimulada) => void = () => {}
  const lerSite = vi.fn(
    () =>
      new Promise<LeituraSimulada>((resolver) => {
        entregar = resolver
      }),
  )
  return { lerSite, entregar: (leitura: LeituraSimulada) => entregar(leitura) }
}

const PAPEIS = ['Founder', 'Head de Vendas', 'SDR/BDR', 'AE', 'Marketing', 'RevOps', 'Outro']
const ORIGENS = [
  'Google Ads',
  'Meta Ads',
  'Instagram',
  'LinkedIn',
  'YouTube',
  'X',
  'TikTok',
  'Influenciador',
  'Indicação',
  'Evento',
  'Podcast',
  'Busca no Google',
  'Outro',
]

function memoria(): ArmazenamentoDeOnboarding {
  const dados = new Map<string, string>()
  return {
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => {
      dados.set(chave, valor)
    },
  }
}

function continuar(usuario: Usuario) {
  return usuario.click(screen.getByRole('button', { name: 'Continuar' }))
}

function voltar(usuario: Usuario) {
  return usuario.click(screen.getByRole('button', { name: 'Voltar' }))
}

async function day0Criador(usuario: Usuario) {
  await usuario.click(await screen.findByRole('radio', { name: 'RevOps' }))
  await continuar(usuario)
  await usuario.type(await screen.findByRole('textbox', { name: 'Empresa' }), 'Norte Dados')
  await continuar(usuario)
  await usuario.type(await screen.findByRole('textbox', { name: 'Domínio do site' }), 'nortedados.com.br')
  await continuar(usuario)
  await usuario.click(await screen.findByRole('radio', { name: 'LinkedIn' }))
  await continuar(usuario)
  await usuario.click(await screen.findByRole('button', { name: 'Pular convite' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
}

async function day0Convidado(usuario: Usuario) {
  await usuario.click(await screen.findByRole('radio', { name: 'Head de Vendas' }))
  await continuar(usuario)
  await usuario.click(await screen.findByRole('radio', { name: 'Indicação' }))
  await continuar(usuario)
  await usuario.click(await screen.findByRole('button', { name: 'Pular convite' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
}

describe('Onboarding pós-login: entrada', () => {
  it('sem link de convite entra direto no fluxo de criador, sem perguntar o caminho', async () => {
    const { fonteDeOnboarding } = renderizarSemOnboarding('/onboarding')

    expect(await screen.findByRole('heading', { level: 1, name: 'Qual é o seu papel?' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Criar um Workspace|Fui convidado/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Navegação' })).not.toBeInTheDocument()
    expect(screen.getByText('Passo 1 de 6')).toBeInTheDocument()
    for (const papel of PAPEIS) {
      expect(screen.getByRole('radio', { name: papel })).toBeInTheDocument()
    }

    const estado = await fonteDeOnboarding.ler()
    expect(estado.ramo).toBe('criador')
    expect(estado.workspace?.id).toBeTruthy()
  })

  it('com parâmetro de convite entra no ramo de convidado, sem empresa, domínio nem leitura do site', async () => {
    const lerSite = vi.fn(async () => CONTEXTO_DA_DEMONSTRACAO)
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding?convite=demo', {}, false, contextoNovo(lerSite))

    expect(await screen.findByRole('heading', { level: 1, name: 'Qual é o seu papel?' })).toBeInTheDocument()
    expect(screen.getByText('Passo 1 de 4')).toBeInTheDocument()
    await usuario.click(screen.getByRole('radio', { name: 'Head de Vendas' }))
    await continuar(usuario)

    expect(await screen.findByRole('heading', { level: 1, name: 'Como nos conheceu?' })).toBeInTheDocument()
    expect(screen.getByText('Passo 2 de 4')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Empresa' })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('radio', { name: 'Indicação' }))
    await continuar(usuario)

    expect(screen.getByText(/Nenhum e-mail é enviado/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Pular convite' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    expect(screen.getByText(/Workspace para o qual foi convidado/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Mini-ICP' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: '1. Contexto da empresa' })).getByText(/Um Administrador do Workspace ainda vai gerar/)).toBeInTheDocument()

    const estado = await fonteDeOnboarding.ler()
    expect(estado.ramo).toBe('convidado')
    expect(estado.workspace).toBeNull()
    expect(estado.empresa).toBe('')
    expect(estado.dominio).toBe('')
    expect(estado.papel).toBe('Head de Vendas')
    expect(estado.comoConheceu).toBe('Indicação')
    expect(estado.convitePulado).toBe(true)
    expect(lerSite).not.toHaveBeenCalled()
  })
})

/** O site tem um SVG na raiz: é o logo que a Fonte resolve. */
const LOGO_EM_SVG = (dominio: string) => Promise.resolve(`https://${dominio}/favicon.svg`)

/** Leva o criador da Norte Dados até o passo do domínio e digita o site. */
async function digitarDominio(usuario: Usuario, dominio: string) {
  await usuario.click(await screen.findByRole('radio', { name: 'Founder' }))
  await continuar(usuario)
  await usuario.type(await screen.findByRole('textbox', { name: 'Empresa' }), 'Norte Dados')
  await continuar(usuario)
  await usuario.type(await screen.findByRole('textbox', { name: 'Domínio do site' }), dominio)
}

function logoDaNorteDados() {
  return screen.getByRole('img', { name: 'Logo de Norte Dados' })
}

describe('Onboarding pós-login: Day0 do criador', () => {
  it('a empresa sugere o nome do Workspace, o domínio dá o logo e nenhuma Conta-alvo é semeada', async () => {
    const { usuario, fonteDeOnboarding, fonteDeContas } = renderizarSemOnboarding('/onboarding', { resolverLogo: LOGO_EM_SVG })
    const contasAntes = (await fonteDeContas.contas()).map((conta) => conta.id).sort()
    await screen.findByText('Passo 1 de 6')
    const id = (await fonteDeOnboarding.ler()).workspace?.id
    expect(id).toBeTruthy()

    await usuario.click(await screen.findByRole('radio', { name: 'RevOps' }))
    await continuar(usuario)

    expect(await screen.findByText('Passo 2 de 6')).toBeInTheDocument()
    await usuario.type(screen.getByRole('textbox', { name: 'Empresa' }), 'Norte Dados')
    expect(screen.getByText(/Nome sugerido do Workspace e do Cliente: Norte Dados/)).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma Conta-alvo nasce daqui/)).toBeInTheDocument()
    await continuar(usuario)

    expect(await screen.findByText('Passo 3 de 6')).toBeInTheDocument()
    await usuario.type(screen.getByRole('textbox', { name: 'Domínio do site' }), 'https://www.nortedados.com.br/')
    await vi.waitFor(() => expect(logoDaNorteDados()).toHaveAttribute('src', 'https://nortedados.com.br/favicon.svg'))
    await continuar(usuario)

    expect(await screen.findByText('Passo 4 de 6')).toBeInTheDocument()
    const origens = screen.getByRole('radiogroup', { name: 'Como nos conheceu?' })
    expect(within(origens).getAllByRole('radio').map((opcao) => opcao.textContent)).toEqual(ORIGENS)
    await usuario.click(screen.getByRole('radio', { name: 'LinkedIn' }))
    await continuar(usuario)

    expect(await screen.findByText('Passo 5 de 6')).toBeInTheDocument()
    await usuario.type(screen.getByRole('textbox', { name: 'E-mails dos colegas' }), 'ana@norte.dev')
    await usuario.click(screen.getByRole('button', { name: 'Pular convite' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    expect(screen.getByText('Passo 6 de 6')).toBeInTheDocument()
    expect(screen.getByText(/Workspace: Norte Dados/)).toBeInTheDocument()

    const estado = await fonteDeOnboarding.ler()
    expect(estado.workspace?.nomeSugerido).toBe('Norte Dados')
    expect(estado.workspace?.id).toBe(id)
    expect(estado.papel).toBe('RevOps')
    expect(estado.empresa).toBe('Norte Dados')
    expect(estado.dominio).toBe('nortedados.com.br')
    expect(estado.logoDoSite).toBe('https://nortedados.com.br/favicon.svg')
    expect(estado.comoConheceu).toBe('LinkedIn')
    expect(estado.convitePulado).toBe(true)
    expect(JSON.stringify(estado)).not.toContain('ana@norte.dev')
    expect((await fonteDeContas.contas()).map((conta) => conta.id).sort()).toEqual(contasAntes)
    expect((await fonteDeContas.contas()).some((conta) => conta.nome === 'Norte Dados')).toBe(false)
  })

  it('sem logo no site, o Workspace fica com a inicial do nome', async () => {
    const resolverLogo = vi.fn(async () => null)
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding', { resolverLogo })
    await digitarDominio(usuario, 'nortedados.com.br')

    await vi.waitFor(() => expect(resolverLogo).toHaveBeenCalledWith('nortedados.com.br'))
    expect(logoDaNorteDados().tagName).not.toBe('IMG')
    expect(logoDaNorteDados()).toHaveTextContent('N')
    await continuar(usuario)
    await vi.waitFor(async () => expect((await fonteDeOnboarding.ler()).dominio).toBe('nortedados.com.br'))
    expect((await fonteDeOnboarding.ler()).logoDoSite).toBeNull()
  })

  it('um logo resolvido que depois não carrega cai para a inicial do nome', async () => {
    const { usuario } = renderizarSemOnboarding('/onboarding', { resolverLogo: LOGO_EM_SVG })
    await digitarDominio(usuario, 'nortedados.com.br')
    await vi.waitFor(() => expect(logoDaNorteDados().tagName).toBe('IMG'))

    fireEvent.error(logoDaNorteDados())
    expect(logoDaNorteDados().tagName).not.toBe('IMG')
    expect(logoDaNorteDados()).toHaveTextContent('N')
  })

  it('o logo do domínio confirmado fica guardado na Fonte e volta ao reabrir, sem ser resolvido de novo', async () => {
    const armazenamento = memoria()
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento, resolverLogo: LOGO_EM_SVG })
    await day0Criador(primeira.usuario)
    primeira.unmount()

    const resolverLogo = vi.fn(LOGO_EM_SVG)
    const segunda = renderizarSemOnboarding('/onboarding', { armazenamento, resolverLogo })
    expect(await screen.findByRole('img', { name: 'Logo de Norte Dados' })).toHaveAttribute(
      'src',
      'https://nortedados.com.br/favicon.svg',
    )
    expect((await segunda.fonteDeOnboarding.ler()).logoDoSite).toBe('https://nortedados.com.br/favicon.svg')
    expect(resolverLogo).not.toHaveBeenCalled()
  })

  it('Voltar e Continuar existem em todos os passos, e Voltar preserva o que foi preenchido', async () => {
    const { usuario } = renderizarSemOnboarding('/onboarding')
    await screen.findByText('Passo 1 de 6')
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()

    await usuario.click(screen.getByRole('radio', { name: 'AE' }))
    await continuar(usuario)
    await usuario.type(await screen.findByRole('textbox', { name: 'Empresa' }), 'Norte Dados')
    await continuar(usuario)
    await usuario.type(await screen.findByRole('textbox', { name: 'Domínio do site' }), 'nortedados.com.br')
    await continuar(usuario)
    await usuario.click(await screen.findByRole('radio', { name: 'Podcast' }))
    await continuar(usuario)
    expect(await screen.findByText('Passo 5 de 6')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pular convite' })).toBeEnabled()

    await voltar(usuario)
    expect(await screen.findByRole('radio', { name: 'Podcast' })).toHaveAttribute('aria-checked', 'true')
    await voltar(usuario)
    expect(await screen.findByRole('textbox', { name: 'Domínio do site' })).toHaveValue('nortedados.com.br')
    await voltar(usuario)
    expect(await screen.findByRole('textbox', { name: 'Empresa' })).toHaveValue('Norte Dados')
    await voltar(usuario)
    expect(await screen.findByRole('radio', { name: 'AE' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Passo 1 de 6')).toBeInTheDocument()
  })

  it('Voltar também preserva o que foi escolhido ou digitado sem Continuar, sem confirmar nada na Fonte', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding')
    await usuario.click(await screen.findByRole('radio', { name: 'AE' }))
    await continuar(usuario)
    await usuario.type(await screen.findByRole('textbox', { name: 'Empresa' }), 'Norte Dados')
    await continuar(usuario)
    await usuario.type(await screen.findByRole('textbox', { name: 'Domínio do site' }), 'nortedados.com.br')
    await continuar(usuario)
    await usuario.click(await screen.findByRole('radio', { name: 'Podcast' }))

    await voltar(usuario)
    const dominio = await screen.findByRole('textbox', { name: 'Domínio do site' })
    await usuario.clear(dominio)
    await usuario.type(dominio, 'norte.dev')
    await voltar(usuario)
    const empresa = await screen.findByRole('textbox', { name: 'Empresa' })
    await usuario.type(empresa, ' Brasil')
    await voltar(usuario)
    await usuario.click(await screen.findByRole('radio', { name: 'RevOps' }))
    expect(await fonteDeOnboarding.ler()).toMatchObject({ papel: 'AE', empresa: 'Norte Dados', dominio: 'nortedados.com.br', comoConheceu: null })

    await continuar(usuario)
    expect(await screen.findByRole('textbox', { name: 'Empresa' })).toHaveValue('Norte Dados Brasil')
    await continuar(usuario)
    expect(await screen.findByRole('textbox', { name: 'Domínio do site' })).toHaveValue('norte.dev')
    await continuar(usuario)
    expect(await screen.findByRole('radio', { name: 'Podcast' })).toHaveAttribute('aria-checked', 'true')
    expect(await fonteDeOnboarding.ler()).toMatchObject({ papel: 'RevOps', empresa: 'Norte Dados Brasil', dominio: 'norte.dev' })
  })

  it('o papel Outro segue para a empresa sem campo extra', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding')
    await usuario.click(await screen.findByRole('radio', { name: 'Outro' }))
    await continuar(usuario)

    expect(await screen.findByRole('textbox', { name: 'Empresa' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /descreva|qual papel/i })).not.toBeInTheDocument()
    expect((await fonteDeOnboarding.ler()).papel).toBe('Outro')
  })

  it('convidar colegas é só interface: Continuar segue sem guardar os e-mails', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding?convite=demo')
    await usuario.click(await screen.findByRole('radio', { name: 'Marketing' }))
    await continuar(usuario)
    await usuario.click(await screen.findByRole('radio', { name: 'Evento' }))
    await continuar(usuario)

    await usuario.type(await screen.findByRole('textbox', { name: 'E-mails dos colegas' }), 'bia@norte.dev')
    await continuar(usuario)

    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    const estado = await fonteDeOnboarding.ler()
    expect(estado.convitePulado).toBe(false)
    expect(JSON.stringify(estado)).not.toContain('bia@norte.dev')
  })
})

describe('Onboarding pós-login: Contexto da empresa', () => {
  function itemDoContexto() {
    return screen.getByRole('listitem', { name: '1. Contexto da empresa' })
  }

  it('confirmar o site gera o contexto sem outra confirmação, e a primeira geração fica vigente sozinha', async () => {
    const contexto = contextoNovo()
    const { usuario } = renderizarSemOnboarding('/onboarding', {}, false, contexto)
    await day0Criador(usuario)

    expect(await within(itemDoContexto()).findByText('Concluído')).toBeInTheDocument()
    expect(within(itemDoContexto()).getByText(/Pronto: Empresa, Perfil de cliente ideal e Personas/)).toBeInTheDocument()
    expect(within(itemDoContexto()).getByRole('link', { name: 'Abrir em Configurações' })).toHaveAttribute('href', '/configuracoes/contexto')
    expect(within(itemDoContexto()).queryByRole('button', { name: 'Pular contexto' })).not.toBeInTheDocument()
    const { site, vigente, geracao } = await contexto.contexto()
    expect(site).toBe('nortedados.com.br')
    expect(vigente).toMatchObject({ versao: 1, origem: 'geracao', empresa: CONTEXTO_DA_DEMONSTRACAO.empresa })
    expect(geracao).toBeNull()
    for (const campo of ['Mini-ICP', 'O que você vende', 'Por que compram', 'Personas possíveis']) {
      expect(screen.queryByRole('textbox', { name: campo })).not.toBeInTheDocument()
    }
  })

  it('uma leitura lenta não trava o wizard; o checklist mostra o andamento até o contexto valer', async () => {
    const { lerSite, entregar } = leituraControlada()
    const { usuario } = renderizarSemOnboarding('/onboarding', {}, false, contextoNovo(lerSite))
    await day0Criador(usuario)

    expect(within(itemDoContexto()).getByText(/Lendo o site nortedados\.com\.br/)).toBeInTheDocument()
    expect(within(itemDoContexto()).getByText('Pendente')).toBeInTheDocument()
    await act(async () => entregar(CONTEXTO_DA_DEMONSTRACAO))
    expect(await within(itemDoContexto()).findByText('Concluído')).toBeInTheDocument()
    expect(lerSite).toHaveBeenCalledTimes(1)
    expect(lerSite).toHaveBeenCalledWith('nortedados.com.br')
  })

  it('uma falha é comunicada e permite tentar de novo, escrever à mão ou concluir assim mesmo', async () => {
    const respostas: LeituraSimulada[] = [{ falha: 'site_indisponivel' }, CONTEXTO_DA_DEMONSTRACAO]
    const lerSite = vi.fn(async () => respostas.shift()!)
    const { usuario } = renderizarSemOnboarding('/onboarding', {}, false, contextoNovo(lerSite))
    await day0Criador(usuario)

    expect(await within(itemDoContexto()).findByText(/Não conseguimos abrir o site/)).toBeInTheDocument()
    expect(within(itemDoContexto()).getByRole('link', { name: 'Escrever à mão em Configurações' })).toHaveAttribute('href', '/configuracoes/contexto')
    await usuario.click(within(itemDoContexto()).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(itemDoContexto()).findByText('Concluído')).toBeInTheDocument()
    expect(lerSite).toHaveBeenCalledTimes(2)

    await usuario.click(screen.getByRole('button', { name: 'Concluir onboarding' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
  })

  it('o site pode ficar para depois: nada é lido, e o checklist leva a Configurações para informá-lo', async () => {
    const lerSite = vi.fn(async () => CONTEXTO_DA_DEMONSTRACAO)
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding', {}, false, contextoNovo(lerSite))
    await usuario.click(await screen.findByRole('radio', { name: 'RevOps' }))
    await continuar(usuario)
    await usuario.type(await screen.findByRole('textbox', { name: 'Empresa' }), 'Norte Dados')
    await continuar(usuario)
    await usuario.click(await screen.findByRole('button', { name: 'Informar o site depois' }))
    await usuario.click(await screen.findByRole('radio', { name: 'LinkedIn' }))
    await continuar(usuario)
    await usuario.click(await screen.findByRole('button', { name: 'Pular convite' }))

    expect(await within(itemDoContexto()).findByText(/O site ficou para depois/)).toBeInTheDocument()
    expect(within(itemDoContexto()).getByRole('link', { name: 'Informar o site em Configurações' })).toHaveAttribute('href', '/configuracoes/contexto')
    expect(screen.getByRole('listitem', { name: 'Site e logo: falta' })).toBeInTheDocument()
    expect(await fonteDeOnboarding.ler()).toMatchObject({ dominio: '', sitePulado: true })
    expect(lerSite).not.toHaveBeenCalled()

    await usuario.click(screen.getByRole('button', { name: 'Concluir onboarding' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
  })

  it('num Workspace que já tem contexto vigente, confirmar o site não gera nem substitui nada', async () => {
    const lerSite = vi.fn(async () => ({ ...CONTEXTO_DA_DEMONSTRACAO, empresa: 'Outra' }) satisfies TextosDoContexto)
    const contexto = criarFonteDoContextoDaEmpresaSimulada({ lerSite })
    const { usuario } = renderizarSemOnboarding('/onboarding', {}, false, contexto)
    await day0Criador(usuario)

    expect(within(itemDoContexto()).getByText('Concluído')).toBeInTheDocument()
    expect(lerSite).not.toHaveBeenCalled()
    expect(await contexto.contexto()).toMatchObject({ vigente: { versao: 1, empresa: CONTEXTO_DA_DEMONSTRACAO.empresa }, geracao: null })
  })

  it('reabrir o onboarding no meio da leitura não começa outra', async () => {
    const armazenamento = memoria()
    const { lerSite, entregar } = leituraControlada()
    const contexto = contextoNovo(lerSite)
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento }, false, contexto)
    await day0Criador(primeira.usuario)
    primeira.unmount()

    renderizarSemOnboarding('/onboarding', { armazenamento }, false, contexto)
    expect(await within(await screen.findByRole('listitem', { name: '1. Contexto da empresa' })).findByText(/Lendo o site/)).toBeInTheDocument()
    await act(async () => entregar(CONTEXTO_DA_DEMONSTRACAO))
    expect(await within(itemDoContexto()).findByText('Concluído')).toBeInTheDocument()
    expect(lerSite).toHaveBeenCalledTimes(1)
  })
})

describe('Onboarding pós-login: checklist e próximos passos', () => {
  it('mostra os itens na ordem do Norte e, depois deles, Contas-alvo com Sinal e a Sequência como próximos passos', async () => {
    const { usuario } = renderizarSemOnboarding('/onboarding')
    await day0Criador(usuario)

    const lista = screen.getByRole('list', { name: 'Checklist do Norte' })
    expect(within(lista).getAllByRole('heading', { level: 2 }).map((titulo) => titulo.textContent)).toEqual([
      '1. Contexto da empresa',
      '2. Sinal',
    ])
    expect(within(lista).queryByText(/Cadência/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: '2. Sinal' })).getByText('Pendente')).toBeInTheDocument()

    const proximos = screen.getByRole('list', { name: 'Próximos passos' })
    const passos = within(proximos).getAllByRole('link')
    expect(passos.map((passo) => passo.textContent)).toEqual(['Ver Contas-alvo com Sinal', 'Criar a Sequência'])
    expect(passos[0]).toHaveAttribute('href', '/sinais?vista=encontrados')
    expect(passos[1]).toHaveAttribute('href', '/sequencias')
    expect(screen.getByText(/Reunião no App segue só como status de demonstração/)).toBeInTheDocument()
  })

  it('abrir Sinais conclui o item sem Monitoramento e permite voltar ao checklist ou à home', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding', { resolverLogo: LOGO_EM_SVG })
    await day0Criador(usuario)

    await usuario.click(screen.getByRole('button', { name: 'Abrir Sinais' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Novo monitoramento' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Retorno do checklist' })).toHaveTextContent(/sem criar um Monitoramento/)
    expect((await fonteDeOnboarding.ler()).checklist.sinal).toBe('concluido')

    await usuario.click(screen.getByRole('link', { name: 'Voltar ao checklist' }))
    const sinal = await screen.findByRole('listitem', { name: '2. Sinal' })
    expect(within(sinal).getByText('Concluído')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Concluir onboarding' }))
    expect(await screen.findByRole('complementary', { name: 'Navegação' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    // A barra lateral lê o onboarding depois de montar; o nome e o logo do Workspace chegam depois da página.
    expect(await screen.findByRole('button', { name: 'Workspace: Norte Dados' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Logo de Norte Dados' })).toHaveAttribute(
      'src',
      'https://nortedados.com.br/favicon.svg',
    )
    expect((await fonteDeOnboarding.ler()).concluido).toBe(true)
  })

  it('o convidado pula um item e o convite e ainda aterra na home dentro da Casca', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding?convite=demo')
    await day0Convidado(usuario)

    await usuario.click(screen.getByRole('button', { name: 'Pular contexto' }))
    expect(within(screen.getByRole('listitem', { name: '1. Contexto da empresa' })).getByText('Pulado')).toBeInTheDocument()
    expect((await fonteDeOnboarding.ler()).checklist.contexto).toBe('pulado')

    await usuario.click(screen.getByRole('button', { name: 'Concluir onboarding' }))
    expect(await screen.findByRole('complementary', { name: 'Navegação' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect((await fonteDeOnboarding.ler()).workspace).toBeNull()
  })

  it('Voltar no checklist leva ao convite sem perder o Day0', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding')
    await day0Criador(usuario)

    await voltar(usuario)
    expect(await screen.findByRole('heading', { level: 1, name: 'Convide colegas' })).toBeInTheDocument()
    const estado = await fonteDeOnboarding.ler()
    expect(estado).toMatchObject({ papel: 'RevOps', empresa: 'Norte Dados', dominio: 'nortedados.com.br', comoConheceu: 'LinkedIn' })
  })

  it('reabrir restaura Day0 e checklist e não cria outro Workspace', async () => {
    const armazenamento = memoria()
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento })
    await day0Criador(primeira.usuario)
    await primeira.usuario.click(screen.getByRole('button', { name: 'Pular Sinal' }))
    const id = (await primeira.fonteDeOnboarding.ler()).workspace?.id
    primeira.unmount()

    const segunda = renderizarSemOnboarding('/onboarding', { armazenamento })
    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: '2. Sinal' })).getByText('Pulado')).toBeInTheDocument()

    const estado = await segunda.fonteDeOnboarding.ler()
    expect(estado.workspace).toEqual({ id, nomeSugerido: 'Norte Dados' })
    expect(estado.papel).toBe('RevOps')
    expect(estado.dominio).toBe('nortedados.com.br')
    expect(estado.comoConheceu).toBe('LinkedIn')
    expect(estado.convitePulado).toBe(true)
  })
})

describe('Onboarding pós-login: entrada na Casca', () => {
  it('uma sessão sem onboarding que abre a Casca é levada a /onboarding, fora da Casca', async () => {
    renderizarSemOnboarding('/contas', {}, true)

    expect(await screen.findByRole('heading', { level: 1, name: 'Qual é o seu papel?' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/onboarding')
    expect(screen.queryByRole('complementary', { name: 'Navegação' })).not.toBeInTheDocument()
  })

  it('com o Day0 pela metade, a Casca leva de volta ao passo em que a sessão parou', async () => {
    const armazenamento = memoria()
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento })
    await primeira.usuario.click(await screen.findByRole('radio', { name: 'Founder' }))
    await continuar(primeira.usuario)
    expect(await screen.findByRole('heading', { level: 1, name: 'Qual é a sua empresa?' })).toBeInTheDocument()
    primeira.unmount()

    renderizarSemOnboarding('/', { armazenamento })
    expect(await screen.findByRole('heading', { level: 1, name: 'Qual é a sua empresa?' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Navegação' })).not.toBeInTheDocument()
  })

  it('com o Day0 concluído, o checklist pendente não prende: a Casca abre sem redirecionar', async () => {
    const armazenamento = memoria()
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento })
    await day0Criador(primeira.usuario)
    primeira.unmount()

    const segunda = renderizarSemOnboarding('/', { armazenamento })
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Navegação' })).toBeInTheDocument()
    expect((await segunda.fonteDeOnboarding.ler()).concluido).toBe(false)
  })

  it('depois de concluir o onboarding, entrar de novo na Casca não força o onboarding', async () => {
    const armazenamento = memoria()
    const primeira = renderizarSemOnboarding('/onboarding?convite=demo', { armazenamento })
    await day0Convidado(primeira.usuario)
    await primeira.usuario.click(screen.getByRole('button', { name: 'Concluir onboarding' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    primeira.unmount()

    renderizarSemOnboarding('/contas', { armazenamento }, true)
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/contas')
    expect(screen.queryByRole('heading', { level: 1, name: 'Qual é o seu papel?' })).not.toBeInTheDocument()
  })

  it('uma sessão que já concluiu o onboarding entra direto na Casca', async () => {
    renderizarApp('/contas', {}, {}, { jaConcluido: true })

    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Navegação' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Qual é o seu papel?' })).not.toBeInTheDocument()
  })
})

describe('Onboarding pós-login: switch de demonstração entre criador e convidado', () => {
  function trocaDeRamo() {
    return screen.getByRole('group', { name: 'Ramo da demonstração' })
  }

  /** Troca de ramo com algo preenchido: a troca pede confirmação antes de recomeçar. */
  async function trocarConfirmando(usuario: Usuario, ramo: 'Criador' | 'Convidado') {
    await usuario.click(within(trocaDeRamo()).getByRole('button', { name: ramo }))
    const dialogo = await screen.findByRole('dialog', { name: `Trocar para ${ramo}` })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Trocar e recomeçar' }))
  }

  it('troca de criador para convidado e passa a mostrar o caminho do convidado, sem login', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding', {}, true)
    await usuario.click(await screen.findByRole('radio', { name: 'Founder' }))
    await continuar(usuario)
    await usuario.type(await screen.findByRole('textbox', { name: 'Empresa' }), 'Norte Dados')
    await continuar(usuario)
    expect(await screen.findByText('Passo 3 de 6')).toBeInTheDocument()
    expect(within(trocaDeRamo()).getByRole('button', { name: 'Criador' })).toHaveAttribute('aria-pressed', 'true')

    await trocarConfirmando(usuario, 'Convidado')

    expect(await screen.findByText('Passo 1 de 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Qual é o seu papel?' })).toBeInTheDocument()
    expect(within(trocaDeRamo()).getByRole('button', { name: 'Convidado' })).toHaveAttribute('aria-pressed', 'true')
    expect(window.location.search).toBe('?convite=demo')
    await usuario.click(screen.getByRole('radio', { name: 'SDR/BDR' }))
    await continuar(usuario)
    expect(await screen.findByRole('heading', { level: 1, name: 'Como nos conheceu?' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Empresa' })).not.toBeInTheDocument()

    const estado = await fonteDeOnboarding.ler()
    expect(estado).toMatchObject({ ramo: 'convidado', workspace: null, empresa: '', dominio: '', papel: 'SDR/BDR' })
  })

  it('troca de convidado para criador e recomeça no caminho do criador, com o Workspace dele', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding?convite=demo', {}, true)
    await usuario.click(await screen.findByRole('radio', { name: 'Head de Vendas' }))
    await continuar(usuario)
    expect(await screen.findByText('Passo 2 de 4')).toBeInTheDocument()
    expect(within(trocaDeRamo()).getByRole('button', { name: 'Convidado' })).toHaveAttribute('aria-pressed', 'true')

    await trocarConfirmando(usuario, 'Criador')

    expect(await screen.findByText('Passo 1 de 6')).toBeInTheDocument()
    expect(within(trocaDeRamo()).getByRole('button', { name: 'Criador' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: 'Head de Vendas' })).toHaveAttribute('aria-checked', 'false')
    expect(window.location.search).toBe('')
    await usuario.click(screen.getByRole('radio', { name: 'Founder' }))
    await continuar(usuario)
    await usuario.type(await screen.findByRole('textbox', { name: 'Empresa' }), 'Norte Dados')
    await continuar(usuario)
    expect(await screen.findByRole('textbox', { name: 'Domínio do site' })).toBeInTheDocument()

    const estado = await fonteDeOnboarding.ler()
    expect(estado).toMatchObject({ ramo: 'criador', papel: 'Founder', comoConheceu: null, empresa: 'Norte Dados' })
    expect(estado.workspace).toEqual({ id: expect.any(String), nomeSugerido: 'Norte Dados' })
  })

  it('com o Day0 feito, a troca avisa que recomeça do zero e pede confirmação; cancelar não muda nada', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding')
    await day0Criador(usuario)

    await usuario.click(within(trocaDeRamo()).getByRole('button', { name: 'Convidado' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Trocar para Convidado' })
    expect(dialogo).toHaveTextContent(/recomeça o onboarding do zero, sem login/)
    expect(dialogo).toHaveTextContent(/O que foi preenchido é descartado/)
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    expect(within(trocaDeRamo()).getByRole('button', { name: 'Criador' })).toHaveAttribute('aria-pressed', 'true')
    expect(await fonteDeOnboarding.ler()).toMatchObject({ ramo: 'criador', empresa: 'Norte Dados', day0Concluido: true })

    await trocarConfirmando(usuario, 'Convidado')
    expect(await screen.findByText('Passo 1 de 4')).toBeInTheDocument()
    expect(await fonteDeOnboarding.ler()).toMatchObject({ ramo: 'convidado', day0Concluido: false, concluido: false })
  })

  it('sem nada preenchido, troca na hora; a troca fica guardada e reabrir segue no ramo escolhido', async () => {
    const armazenamento = memoria()
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento })
    await screen.findByText('Passo 1 de 6')
    await primeira.usuario.click(within(trocaDeRamo()).getByRole('button', { name: 'Convidado' }))
    expect(await screen.findByText('Passo 1 de 4')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    primeira.unmount()

    renderizarSemOnboarding('/onboarding', { armazenamento })
    expect(await screen.findByText('Passo 1 de 4')).toBeInTheDocument()
    expect(within(trocaDeRamo()).getByRole('button', { name: 'Convidado' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('fica restrito à demonstração: uma Fonte que não oferece a troca não mostra o switch', async () => {
    renderizarAppCom('/onboarding', {
      opcoesOnboarding: { jaConcluido: false },
      onboarding: (fonte) => ({ ...fonte, trocarRamoDaDemonstracao: undefined }),
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Qual é o seu papel?' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Ramo da demonstração' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Convidado' })).not.toBeInTheDocument()
  })
})

describe('Onboarding pós-login: reentrada e progresso do checklist', () => {
  it('com o Day0 concluído, reabrir o fluxo começa no checklist, mesmo depois de voltar a um passo do Day0', async () => {
    const armazenamento = memoria()
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento })
    await day0Criador(primeira.usuario)
    await voltar(primeira.usuario)
    await voltar(primeira.usuario)
    expect(await screen.findByRole('heading', { level: 1, name: 'Como nos conheceu?' })).toBeInTheDocument()
    primeira.unmount()

    renderizarSemOnboarding('/onboarding', { armazenamento })
    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    expect(screen.getByText('Passo 6 de 6')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Como nos conheceu?' })).not.toBeInTheDocument()
  })

  it('visitar Sinais pela Casca conclui o item do Sinal sem Monitoramento, mesmo depois de voltar a um passo do Day0', async () => {
    const armazenamento = memoria()
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento })
    await day0Criador(primeira.usuario)
    await voltar(primeira.usuario)
    expect(await screen.findByRole('heading', { level: 1, name: 'Convide colegas' })).toBeInTheDocument()
    primeira.unmount()

    const segunda = renderizarSemOnboarding('/sinais', { armazenamento }, true)
    const monitoramentosAntes = (await segunda.fonteDeSinais.monitoramentos()).length
    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/sinais')
    await vi.waitFor(async () => expect((await segunda.fonteDeOnboarding.ler()).checklist.sinal).toBe('concluido'))
    expect((await segunda.fonteDeSinais.monitoramentos()).length).toBe(monitoramentosAntes)
  })

  it('com o onboarding incompleto, a Casca mostra o progresso e reabre o checklist onde a sessão parou', async () => {
    const { usuario } = renderizarSemOnboarding('/onboarding')
    await day0Criador(usuario)
    await usuario.click(screen.getByRole('link', { name: 'Criar a Sequência' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()

    await usuario.click(await screen.findByRole('link', { name: 'Onboarding, 75% completo' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: '1. Contexto da empresa' })).getByText('Concluído')).toBeInTheDocument()
  })

  it('cada item concluído aparece como concluído, e o progresso do checklist fica guardado na Fonte', async () => {
    const armazenamento = memoria()
    const { lerSite } = leituraControlada()
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento }, false, contextoNovo(lerSite))
    await day0Criador(primeira.usuario)
    expect(progressoNaTela()).toBe(50)

    await primeira.usuario.click(screen.getByRole('button', { name: 'Pular Sinal' }))
    expect(await within(screen.getByRole('listitem', { name: '2. Sinal' })).findByText('Pulado')).toBeInTheDocument()
    expect(progressoNaTela()).toBe(50)

    await primeira.usuario.click(screen.getByRole('button', { name: 'Abrir Sinais' }))
    await primeira.usuario.click(await screen.findByRole('link', { name: 'Voltar ao checklist' }))
    expect(await within(await screen.findByRole('listitem', { name: '2. Sinal' })).findByText('Concluído')).toBeInTheDocument()
    expect(progressoNaTela()).toBe(75)
    primeira.unmount()

    const segunda = renderizarSemOnboarding('/onboarding', { armazenamento }, false, contextoNovo(lerSite))
    await screen.findByRole('progressbar', { name: 'Onboarding completo' })
    expect(progressoNaTela()).toBe(75)
    expect(within(screen.getByRole('listitem', { name: '1. Contexto da empresa' })).getByText('Pendente')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: '2. Sinal' })).getByText('Concluído')).toBeInTheDocument()
    expect((await segunda.fonteDeOnboarding.ler()).checklist).toEqual({ contexto: 'pendente', sinal: 'concluido' })
  })
})

/** Quanto do onboarding o checklist mostra como completo, em porcentagem. */
function progressoNaTela() {
  return Number(screen.getByRole('progressbar', { name: 'Onboarding completo' }).getAttribute('aria-valuenow'))
}

describe('Onboarding pós-login: progresso gamificado até 100%', () => {
  it('o criador chega ao checklist com Workspace, Site e o contexto gerado, e a chamada aponta o próximo marco do Norte', async () => {
    const { usuario } = renderizarSemOnboarding('/onboarding')
    await day0Criador(usuario)

    expect(await screen.findByText('75%')).toBeInTheDocument()
    expect(progressoNaTela()).toBe(75)
    const marcos = screen.getByRole('list', { name: 'Marcos do onboarding' })
    expect(within(marcos).getAllByRole('listitem').map((marco) => marco.getAttribute('aria-label'))).toEqual([
      'Workspace: feito',
      'Site e logo: feito',
      'Contexto da empresa: feito',
      'Sinal: falta',
    ])
    expect(screen.getByText(/Próximo: Sinal/)).toBeInTheDocument()
  })

  it('o convidado não informa o site: o progresso tem três marcos e começa em 33%', async () => {
    const { usuario } = renderizarSemOnboarding('/onboarding?convite=demo')
    await day0Convidado(usuario)

    expect(progressoNaTela()).toBe(33)
    const marcos = screen.getByRole('list', { name: 'Marcos do onboarding' })
    expect(within(marcos).getAllByRole('listitem').map((marco) => marco.getAttribute('aria-label'))).toEqual([
      'Workspace: feito',
      'Contexto da empresa: falta',
      'Sinal: falta',
    ])
  })

  it('um item pulado não conta, e a chamada continua apontando para ele', async () => {
    const { usuario } = renderizarSemOnboarding('/onboarding', {}, false, contextoNovo(leituraControlada().lerSite))
    await day0Criador(usuario)

    await usuario.click(screen.getByRole('button', { name: 'Pular contexto' }))
    expect(await within(screen.getByRole('listitem', { name: '1. Contexto da empresa' })).findByText('Pulado')).toBeInTheDocument()
    expect(progressoNaTela()).toBe(50)
    expect(screen.getByText(/Próximo: Contexto da empresa/)).toBeInTheDocument()
  })

  it('a 100%, o checklist comemora o onboarding completo e a Casca deixa de mostrar o atalho', async () => {
    const { usuario } = renderizarSemOnboarding('/onboarding')
    await day0Criador(usuario)
    expect(screen.queryByText(/Onboarding 100% completo/)).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Abrir Sinais' }))
    await usuario.click(await screen.findByRole('link', { name: 'Voltar ao checklist' }))

    await screen.findByRole('progressbar', { name: 'Onboarding completo' })
    await vi.waitFor(() => expect(progressoNaTela()).toBe(100))
    expect(screen.getByText(/Onboarding 100% completo/)).toBeInTheDocument()
    expect(screen.queryByText(/Próximo:/)).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Concluir onboarding' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Onboarding, / })).not.toBeInTheDocument()
  })

  it('concluir o onboarding incompleto não esconde o atalho: ele fica na Casca até 100%', async () => {
    const { usuario } = renderizarSemOnboarding('/onboarding')
    await day0Criador(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Pular Sinal' }))
    await usuario.click(screen.getByRole('button', { name: 'Concluir onboarding' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()

    await usuario.click(await screen.findByRole('link', { name: 'Onboarding, 75% completo' }))
    await usuario.click(await screen.findByRole('button', { name: 'Abrir Sinais' }))
    await usuario.click(await screen.findByRole('link', { name: 'Ir para a home' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    await vi.waitFor(() => expect(screen.queryByRole('link', { name: /^Onboarding, / })).not.toBeInTheDocument())
  })

  it('a sessão que já começa com o onboarding concluído está 100% completa e não vê o atalho', async () => {
    const { fonteDeOnboarding } = renderizarApp('/contas', {}, {}, { jaConcluido: true })

    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Onboarding, / })).not.toBeInTheDocument()
    expect((await fonteDeOnboarding.ler()).checklist).toEqual({ contexto: 'concluido', sinal: 'concluido' })
  })
})

describe('Fonte de onboarding simulada', () => {
  /** Um criador da Norte Dados parado no passo do site, direto na Fonte, sem a tela. */
  async function criadorNoSite(opcoes: OpcoesFonteDeOnboardingSimulada = {}) {
    const fonte = criarFonteDeOnboardingSimulada({ resolverLogo: async () => null, ...opcoes })
    await fonte.iniciar('criador')
    await fonte.definirPapel('Founder')
    await fonte.definirCliente('Norte Dados')
    return fonte
  }

  it('pular o site segue o Day0 sem domínio, fica guardado e é desfeito ao confirmar o domínio depois', async () => {
    const armazenamento = memoria()
    const fonte = await criadorNoSite({ armazenamento })
    expect(await fonte.pularSite()).toMatchObject({ etapa: 'hdyhau', dominio: '', sitePulado: true })

    const reaberta = criarFonteDeOnboardingSimulada({ armazenamento, resolverLogo: async () => null })
    expect((await reaberta.ler()).sitePulado).toBe(true)
    await reaberta.voltar()
    expect(await reaberta.definirDominio('nortedados.com.br')).toMatchObject({ dominio: 'nortedados.com.br', sitePulado: false })
  })

  it('só o criador, no passo do site, pode deixá-lo para depois', async () => {
    const convidado = criarFonteDeOnboardingSimulada({ resolverLogo: async () => null })
    await convidado.iniciar('convidado')
    expect((await convidado.pularSite()).sitePulado).toBe(false)

    const criador = await criadorNoSite()
    await criador.voltar()
    expect(await criador.pularSite()).toMatchObject({ etapa: 'empresa', sitePulado: false })
  })

  it('um onboarding guardado por uma versão anterior, com mini-ICP e Personas, abre sem eles e procura o logo de novo', async () => {
    const armazenamento = memoria()
    const fonte = await criadorNoSite({ armazenamento })
    await fonte.definirDominio('nortedados.com.br')
    const chave = 'althius.onboarding.v3'
    const antigo = JSON.parse(armazenamento.getItem(chave)!)
    antigo.checklist = { miniIcp: 'antigo', personas: 'Diretora de Dados', produto: 'concluido', persona: 'concluido', sinal: 'concluido' }
    antigo.leitura = { situacao: 'pronta', resultado: null }
    antigo.logoDoSite = ['https://nortedados.com.br/favicon.svg', 'https://nortedados.com.br/favicon.ico']
    armazenamento.setItem(chave, JSON.stringify(antigo))

    const reaberta = criarFonteDeOnboardingSimulada({ armazenamento, resolverLogo: LOGO_EM_SVG })
    const estado = await reaberta.ler()
    expect(estado.checklist).toEqual({ contexto: 'pendente', sinal: 'concluido' })
    expect(estado).not.toHaveProperty('leitura')
    await vi.waitFor(async () => expect((await reaberta.ler()).logoDoSite).toBe('https://nortedados.com.br/favicon.svg'))
  })
})
