import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LeituraDoSite } from '@/fonte/onboarding-tipos'
import type { ArmazenamentoDeOnboarding, OpcoesFonteDeOnboardingSimulada } from '@/fonte/simulada-onboarding'
import { renderizarApp } from '@/test/renderizar'

type Usuario = ReturnType<typeof renderizarApp>['usuario']

/** O app de uma sessão que ainda não passou pelo onboarding, a partir desta rota. */
function renderizarSemOnboarding(rota: string, opcoes: OpcoesFonteDeOnboardingSimulada = {}, noNavegador = false) {
  return renderizarApp(rota, {}, {}, { jaConcluido: false, ...opcoes }, {}, {}, noNavegador)
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

/** A leitura de um site controlada pelo teste, no lugar da leitura fixa da Fonte simulada. */
const LEITURA_DE_TESTE: LeituraDoSite = {
  oQueVende: 'Sensores de vibração para linhas de produção.',
  miniIcp: 'Indústrias de processo contínuo com manutenção própria.',
  porQueCompram: 'Para prever falhas antes da parada de linha.',
  personas: ['Gerente de Manutenção', 'Diretor Industrial'],
}

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
    const leitorDeSite = vi.fn(async () => LEITURA_DE_TESTE)
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding?convite=demo', { leitorDeSite })

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
    expect(screen.getByRole('textbox', { name: 'Mini-ICP' })).toHaveValue('')

    const estado = await fonteDeOnboarding.ler()
    expect(estado.ramo).toBe('convidado')
    expect(estado.workspace).toBeNull()
    expect(estado.empresa).toBe('')
    expect(estado.dominio).toBe('')
    expect(estado.leitura.situacao).toBe('inativa')
    expect(estado.papel).toBe('Head de Vendas')
    expect(estado.comoConheceu).toBe('Indicação')
    expect(estado.convitePulado).toBe(true)
    expect(leitorDeSite).not.toHaveBeenCalled()
  })
})

describe('Onboarding pós-login: Day0 do criador', () => {
  it('a empresa sugere o nome do Workspace, o domínio dá o logo e nenhuma Conta-alvo é semeada', async () => {
    const { usuario, fonteDeOnboarding, fonteDeContas } = renderizarSemOnboarding('/onboarding')
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
    expect(screen.getByRole('img', { name: 'Logo de Norte Dados' })).toHaveAttribute(
      'src',
      'https://nortedados.com.br/favicon.svg',
    )
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
    expect(estado.logoDoSite[0]).toBe('https://nortedados.com.br/favicon.svg')
    expect(estado.comoConheceu).toBe('LinkedIn')
    expect(estado.convitePulado).toBe(true)
    expect(JSON.stringify(estado)).not.toContain('ana@norte.dev')
    expect((await fonteDeContas.contas()).map((conta) => conta.id).sort()).toEqual(contasAntes)
    expect((await fonteDeContas.contas()).some((conta) => conta.nome === 'Norte Dados')).toBe(false)
  })

  it('o logo tenta o SVG, depois o favicon, e cai para a inicial do nome', async () => {
    const { usuario } = renderizarSemOnboarding('/onboarding')
    await usuario.click(await screen.findByRole('radio', { name: 'Founder' }))
    await continuar(usuario)
    await usuario.type(await screen.findByRole('textbox', { name: 'Empresa' }), 'Norte Dados')
    await continuar(usuario)
    await usuario.type(await screen.findByRole('textbox', { name: 'Domínio do site' }), 'nortedados.com.br')

    fireEvent.error(screen.getByRole('img', { name: 'Logo de Norte Dados' }))
    expect(screen.getByRole('img', { name: 'Logo de Norte Dados' })).toHaveAttribute(
      'src',
      'https://nortedados.com.br/favicon.ico',
    )
    fireEvent.error(screen.getByRole('img', { name: 'Logo de Norte Dados' }))
    const inicial = screen.getByRole('img', { name: 'Logo de Norte Dados' })
    expect(inicial.tagName).not.toBe('IMG')
    expect(inicial).toHaveTextContent('N')
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

describe('Onboarding pós-login: leitura do site', () => {
  it('a leitura fixa da Fonte simulada pré-preenche o mini-ICP e as Personas como base editável', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding')
    await day0Criador(usuario)

    const leitura = screen.getByRole('region', { name: 'Leitura do site' })
    expect(within(leitura).getByText(/nortedados\.com\.br/)).toBeInTheDocument()
    expect(within(leitura).getByText(/Revise, edite ou descarte/)).toBeInTheDocument()

    expect(screen.getByRole('textbox', { name: 'O que você vende' })).toHaveValue(
      'Plataforma de dados que unifica engenharia, análise e IA num só lugar.',
    )
    expect(screen.getByRole('textbox', { name: 'Mini-ICP' })).toHaveValue(
      'Empresas B2B de médio e grande porte no Brasil, com time de dados próprio e operação comercial estruturada.',
    )
    expect(screen.getByRole('textbox', { name: 'Por que compram' })).toHaveValue(
      'Para decidir com uma base única de dados e cortar o custo de ferramentas soltas.',
    )
    expect(screen.getByRole('textbox', { name: 'Personas possíveis' })).toHaveValue(
      [
        'Diretora de Dados: patrocina a compra e sofre com plataformas espalhadas.',
        'Head de Engenharia de Dados: avalia a integração com o que já existe.',
        'CFO: aprova o investimento quando vê o custo cair.',
      ].join('\n'),
    )

    const estado = await fonteDeOnboarding.ler()
    expect(estado.leitura.situacao).toBe('pronta')
    expect(estado.checklist.produto).toBe('pendente')
    expect(estado.checklist.persona).toBe('pendente')
  })

  it('edições e descarte prevalecem sobre a leitura e persistem na Fonte', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding', { leitorDeSite: async () => LEITURA_DE_TESTE })
    await day0Criador(usuario)

    const miniIcp = screen.getByRole('textbox', { name: 'Mini-ICP' })
    expect(miniIcp).toHaveValue(LEITURA_DE_TESTE.miniIcp)
    await usuario.clear(miniIcp)
    await usuario.type(miniIcp, 'Indústrias com operação própria no Sul.')
    await usuario.click(screen.getByRole('button', { name: 'Concluir mini-ICP' }))
    const produto = screen.getByRole('listitem', { name: '1. Mini-ICP e produto' })
    expect(await within(produto).findByText('Concluído')).toBeInTheDocument()

    const persona = screen.getByRole('listitem', { name: '2. Persona' })
    expect(within(persona).getByText(/Memória do Workspace/)).toBeInTheDocument()
    expect(within(persona).getByText(/Não é a classificação de um Contato/)).toBeInTheDocument()
    expect(within(persona).getByText(/não é a Memória do Agente/)).toBeInTheDocument()
    await usuario.click(within(persona).getByRole('button', { name: 'Descartar sugestão' }))
    expect(within(persona).getByRole('textbox', { name: 'Personas possíveis' })).toHaveValue('')
    expect(within(persona).getByRole('button', { name: 'Concluir Persona' })).toBeDisabled()
    await usuario.type(within(persona).getByRole('textbox', { name: 'Personas possíveis' }), 'Coordenadora de Confiabilidade')
    await usuario.click(within(persona).getByRole('button', { name: 'Concluir Persona' }))
    expect(await within(persona).findByText('Concluído')).toBeInTheDocument()

    expect((await fonteDeOnboarding.ler()).checklist).toMatchObject({
      miniIcp: 'Indústrias com operação própria no Sul.',
      oQueVende: LEITURA_DE_TESTE.oQueVende,
      porQueCompram: LEITURA_DE_TESTE.porQueCompram,
      personas: 'Coordenadora de Confiabilidade',
      produto: 'concluido',
      persona: 'concluido',
    })
  })

  it('o descarte sobrevive a uma nova leitura, e só o que ainda é sugestão acompanha o novo domínio', async () => {
    const OUTRA_LEITURA: LeituraDoSite = {
      oQueVende: 'Software de gestão para clínicas.',
      miniIcp: 'Clínicas com mais de dez consultórios.',
      porQueCompram: 'Para parar de perder consultas por falta de confirmação.',
      personas: ['Gestora da Clínica'],
    }
    const leitorDeSite = async (dominio: string) => (dominio === 'nortedados.com.br' ? LEITURA_DE_TESTE : OUTRA_LEITURA)
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding', { leitorDeSite })
    await day0Criador(usuario)

    const persona = screen.getByRole('listitem', { name: '2. Persona' })
    await usuario.click(within(persona).getByRole('button', { name: 'Descartar sugestão' }))
    const oQueVende = screen.getByRole('textbox', { name: 'O que você vende' })
    await usuario.clear(oQueVende)
    await usuario.type(oQueVende, 'Consultoria de dados.')

    await voltar(usuario)
    await voltar(usuario)
    await voltar(usuario)
    const dominio = await screen.findByRole('textbox', { name: 'Domínio do site' })
    await usuario.clear(dominio)
    await usuario.type(dominio, 'clinicaviva.com.br')
    await continuar(usuario)
    await continuar(usuario)
    await usuario.click(await screen.findByRole('button', { name: 'Pular convite' }))

    expect(await screen.findByDisplayValue(OUTRA_LEITURA.miniIcp)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'O que você vende' })).toHaveValue('Consultoria de dados.')
    expect(screen.getByRole('textbox', { name: 'Personas possíveis' })).toHaveValue('')
    expect((await fonteDeOnboarding.ler()).checklist).toMatchObject({
      miniIcp: OUTRA_LEITURA.miniIcp,
      porQueCompram: OUTRA_LEITURA.porQueCompram,
      oQueVende: 'Consultoria de dados.',
      personas: '',
    })
  })

  it('uma leitura lenta não trava o wizard e não sobrescreve o que a pessoa já escreveu', async () => {
    let entregar: (leitura: LeituraDoSite) => void = () => {}
    const leitorDeSite = vi.fn(
      () =>
        new Promise<LeituraDoSite>((resolver) => {
          entregar = resolver
        }),
    )
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding', { leitorDeSite })
    await usuario.click(await screen.findByRole('radio', { name: 'RevOps' }))
    await continuar(usuario)
    await usuario.type(await screen.findByRole('textbox', { name: 'Empresa' }), 'Norte Dados')
    await continuar(usuario)
    await usuario.type(await screen.findByRole('textbox', { name: 'Domínio do site' }), 'nortedados.com.br')
    await continuar(usuario)

    expect(await screen.findByRole('status')).toHaveTextContent(/Lendo o site nortedados\.com\.br/)
    expect(leitorDeSite).toHaveBeenCalledWith('nortedados.com.br')
    await usuario.click(screen.getByRole('radio', { name: 'LinkedIn' }))
    await continuar(usuario)
    await usuario.click(await screen.findByRole('button', { name: 'Pular convite' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    const miniIcp = screen.getByRole('textbox', { name: 'Mini-ICP' })
    expect(miniIcp).toHaveValue('')
    await usuario.type(miniIcp, 'Times de receita no Sul.')

    await act(async () => entregar(LEITURA_DE_TESTE))

    expect(await screen.findByDisplayValue(LEITURA_DE_TESTE.oQueVende)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Mini-ICP' })).toHaveValue('Times de receita no Sul.')
    const estado = await fonteDeOnboarding.ler()
    expect(estado.checklist.miniIcp).toBe('Times de receita no Sul.')
    expect(estado.checklist.oQueVende).toBe(LEITURA_DE_TESTE.oQueVende)
  })

  it('uma leitura com falha deixa os campos vazios e editáveis, e pode ser tentada de novo', async () => {
    const leitorDeSite = vi
      .fn<(dominio: string) => Promise<LeituraDoSite>>()
      .mockRejectedValueOnce(new Error('site fora do ar'))
      .mockResolvedValueOnce(LEITURA_DE_TESTE)
    const { usuario } = renderizarSemOnboarding('/onboarding', { leitorDeSite })
    await day0Criador(usuario)

    const leitura = screen.getByRole('region', { name: 'Leitura do site' })
    expect(await within(leitura).findByText(/Não foi possível ler o site/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Mini-ICP' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Personas possíveis' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Mini-ICP' })).toBeEnabled()

    await usuario.click(within(leitura).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByDisplayValue(LEITURA_DE_TESTE.miniIcp)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Personas possíveis' })).toHaveValue(
      'Gerente de Manutenção\nDiretor Industrial',
    )
  })
})

describe('Onboarding pós-login: checklist e próximos passos', () => {
  it('mostra três itens na ordem do Norte e, depois deles, Contas-alvo indicadas e a Sequência como próximos passos', async () => {
    const { usuario } = renderizarSemOnboarding('/onboarding')
    await day0Criador(usuario)

    const lista = screen.getByRole('list', { name: 'Checklist do Norte' })
    expect(within(lista).getAllByRole('heading', { level: 2 }).map((titulo) => titulo.textContent)).toEqual([
      '1. Mini-ICP e produto',
      '2. Persona',
      '3. Sinal de compra',
    ])
    expect(within(lista).queryByText(/Cadência/)).not.toBeInTheDocument()
    for (const item of within(lista).getAllByRole('listitem')) {
      expect(within(item).getByText('Pendente')).toBeInTheDocument()
    }

    const proximos = screen.getByRole('list', { name: 'Próximos passos' })
    const passos = within(proximos).getAllByRole('link')
    expect(passos.map((passo) => passo.textContent)).toEqual(['Ver Contas-alvo indicadas', 'Criar a Sequência'])
    expect(passos[0]).toHaveAttribute('href', '/sinais?vista=encontrados')
    expect(passos[1]).toHaveAttribute('href', '/sequencias')
    expect(screen.getByText(/Reunião no App segue só como status de demonstração/)).toBeInTheDocument()
  })

  it('abrir Sinais conclui o item sem Monitoramento e permite voltar ao checklist ou à home', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding')
    await day0Criador(usuario)

    await usuario.click(screen.getByRole('button', { name: 'Abrir Sinais' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sinais' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Catálogo de sinais' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Novo monitoramento' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Retorno do checklist' })).toHaveTextContent(/sem criar um Monitoramento/)
    expect((await fonteDeOnboarding.ler()).checklist.sinal).toBe('concluido')

    await usuario.click(screen.getByRole('link', { name: 'Voltar ao checklist' }))
    const sinal = await screen.findByRole('listitem', { name: '3. Sinal de compra' })
    expect(within(sinal).getByText('Concluído')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Concluir onboarding' }))
    expect(await screen.findByRole('complementary', { name: 'Navegação' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Workspace: Norte Dados' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Logo de Norte Dados' })).toHaveAttribute(
      'src',
      'https://nortedados.com.br/favicon.svg',
    )
    expect((await fonteDeOnboarding.ler()).concluido).toBe(true)
  })

  it('o convidado pula um item e o convite e ainda aterra na home dentro da Casca', async () => {
    const { usuario, fonteDeOnboarding } = renderizarSemOnboarding('/onboarding?convite=demo')
    await day0Convidado(usuario)

    await usuario.click(screen.getByRole('button', { name: 'Pular mini-ICP' }))
    expect(within(screen.getByRole('listitem', { name: '1. Mini-ICP e produto' })).getByText('Pulado')).toBeInTheDocument()
    expect((await fonteDeOnboarding.ler()).checklist.produto).toBe('pulado')

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

  it('reabrir restaura Day0, leitura e checklist e não cria outro Workspace', async () => {
    const armazenamento = memoria()
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento, leitorDeSite: async () => LEITURA_DE_TESTE })
    await day0Criador(primeira.usuario)

    const miniIcp = screen.getByRole('textbox', { name: 'Mini-ICP' })
    await primeira.usuario.clear(miniIcp)
    await primeira.usuario.type(miniIcp, 'Times de receita com operação no Brasil.')
    await primeira.usuario.click(screen.getByRole('button', { name: 'Concluir mini-ICP' }))
    expect(await within(screen.getByRole('listitem', { name: '1. Mini-ICP e produto' })).findByText('Concluído')).toBeInTheDocument()

    const id = (await primeira.fonteDeOnboarding.ler()).workspace?.id
    primeira.unmount()

    const leitorDaSegunda = vi.fn(async () => LEITURA_DE_TESTE)
    const segunda = renderizarSemOnboarding('/onboarding', { armazenamento, leitorDeSite: leitorDaSegunda })
    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Mini-ICP' })).toHaveValue('Times de receita com operação no Brasil.')
    expect(screen.getByRole('textbox', { name: 'O que você vende' })).toHaveValue(LEITURA_DE_TESTE.oQueVende)
    expect(within(screen.getByRole('listitem', { name: '1. Mini-ICP e produto' })).getByText('Concluído')).toBeInTheDocument()

    const estado = await segunda.fonteDeOnboarding.ler()
    expect(estado.workspace).toEqual({ id, nomeSugerido: 'Norte Dados' })
    expect(estado.papel).toBe('RevOps')
    expect(estado.dominio).toBe('nortedados.com.br')
    expect(estado.comoConheceu).toBe('LinkedIn')
    expect(estado.convitePulado).toBe(true)
    expect(estado.leitura.situacao).toBe('pronta')
    expect(leitorDaSegunda).not.toHaveBeenCalled()
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
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento, leitorDeSite: async () => LEITURA_DE_TESTE })
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

describe('Onboarding pós-login: reentrada e progresso do checklist', () => {
  it('com o Day0 concluído, reabrir o fluxo começa no checklist, mesmo depois de voltar a um passo do Day0', async () => {
    const armazenamento = memoria()
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento, leitorDeSite: async () => LEITURA_DE_TESTE })
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

  it('visitar Sinais pela Casca conclui o item 3 sem Monitoramento, mesmo depois de voltar a um passo do Day0', async () => {
    const armazenamento = memoria()
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento, leitorDeSite: async () => LEITURA_DE_TESTE })
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

  it('com o checklist pendente, a Casca mostra o progresso e reabre o checklist onde a sessão parou', async () => {
    const { usuario } = renderizarSemOnboarding('/onboarding', { leitorDeSite: async () => LEITURA_DE_TESTE })
    await day0Criador(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Concluir mini-ICP' }))
    await usuario.click(screen.getByRole('link', { name: 'Criar a Sequência' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sequências' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: 'Checklist do Norte, 1 de 3 concluídos' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Checklist do Norte' })).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: '1. Mini-ICP e produto' })).getByText('Concluído')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Concluir onboarding' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Checklist do Norte/ })).not.toBeInTheDocument()
  })

  it('cada item concluído aparece como concluído, e o progresso do checklist fica guardado na Fonte', async () => {
    const armazenamento = memoria()
    const primeira = renderizarSemOnboarding('/onboarding', { armazenamento, leitorDeSite: async () => LEITURA_DE_TESTE })
    await day0Criador(primeira.usuario)
    expect(screen.getByText('0 de 3 concluídos')).toBeInTheDocument()

    await primeira.usuario.click(screen.getByRole('button', { name: 'Concluir Persona' }))
    expect(await within(screen.getByRole('listitem', { name: '2. Persona' })).findByText('Concluído')).toBeInTheDocument()
    expect(screen.getByText('1 de 3 concluídos')).toBeInTheDocument()

    await primeira.usuario.click(screen.getByRole('button', { name: 'Pular Sinal' }))
    expect(await within(screen.getByRole('listitem', { name: '3. Sinal de compra' })).findByText('Pulado')).toBeInTheDocument()
    expect(screen.getByText('1 de 3 concluídos')).toBeInTheDocument()

    await primeira.usuario.click(screen.getByRole('button', { name: 'Abrir Sinais' }))
    await primeira.usuario.click(await screen.findByRole('link', { name: 'Voltar ao checklist' }))
    expect(await within(await screen.findByRole('listitem', { name: '3. Sinal de compra' })).findByText('Concluído')).toBeInTheDocument()
    expect(screen.getByText('2 de 3 concluídos')).toBeInTheDocument()
    primeira.unmount()

    const segunda = renderizarSemOnboarding('/onboarding', { armazenamento })
    expect(await screen.findByText('2 de 3 concluídos')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: '1. Mini-ICP e produto' })).getByText('Pendente')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: '2. Persona' })).getByText('Concluído')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: '3. Sinal de compra' })).getByText('Concluído')).toBeInTheDocument()
    expect((await segunda.fonteDeOnboarding.ler()).checklist).toMatchObject({
      produto: 'pendente',
      persona: 'concluido',
      sinal: 'concluido',
    })
  })
})
