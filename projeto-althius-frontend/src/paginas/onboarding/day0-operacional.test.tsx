import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createClient } from '@supabase/supabase-js'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { criarAmbienteDoWorkspace } from '@/fonte/composicao'
import { AmbienteProvider, FonteDeOnboardingProvider, FonteDoContextoDaEmpresaProvider } from '@/fonte/contexto'
import { EntradaNaCasca } from './entrada-na-casca'
import { PaginaOnboarding } from './pagina-onboarding'

interface Registro { ramo: string; etapa: string; papel: string | null; comoConheceu: string | null; empresa: string; dominio: string; logoDoSite: string | null; concluido: boolean }
const INICIAL: Registro = { ramo: 'criador', etapa: 'papel', papel: null, comoConheceu: null, empresa: '', dominio: '', logoDoSite: null, concluido: false }

function montar(responder = async (_url: string, _body: Record<string, string>) => INICIAL, rota = '/') {
  const cliente = createClient('http://localhost:54399', 'fake-local', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: vi.fn(async (input, init) => new Response(JSON.stringify(await responder(String(input), JSON.parse(String(init?.body ?? '{}')))), { headers: { 'Content-Type': 'application/json' } })) },
  })
  const ambiente = criarAmbienteDoWorkspace({ cliente, usuario: { id: 'pessoa', email: 'teste@example.test' }, participacao: { workspaceId: 'workspace', nomeDoWorkspace: 'Contrato', papel: 'administrador' } })
  const tela = render(
    <AmbienteProvider ambiente={ambiente}>
      <FonteDeOnboardingProvider fonte={ambiente.fonteDeOnboarding}>
        <FonteDoContextoDaEmpresaProvider fonte={ambiente.fonteDoContextoDaEmpresa!}>
          <MemoryRouter initialEntries={[rota]}>
            <Routes>
              <Route path="/onboarding" element={<PaginaOnboarding />} />
              <Route element={<EntradaNaCasca />}><Route path="/" element={<h1>Casca operacional</h1>} /></Route>
              <Route path="/configuracoes/contexto" element={<h1>Contexto da empresa</h1>} />
            </Routes>
          </MemoryRouter>
        </FonteDoContextoDaEmpresaProvider>
      </FonteDeOnboardingProvider>
    </AmbienteProvider>,
  )
  return { ...tela, usuario: userEvent.setup(), ambiente }
}

describe('Day0 operacional', () => {
  it('aguarda o backend antes de abrir a Casca', () => {
    montar(() => new Promise(() => {}))
    expect(screen.queryByRole('heading', { name: 'Casca operacional' })).not.toBeInTheDocument()
  })

  it('primeira entrada vai ao Day0 real, sem selo nem dados da Demonstração', async () => {
    const { ambiente } = montar()
    expect(await screen.findByRole('heading', { name: 'Qual é o seu papel?' })).toBeInTheDocument()
    expect(screen.queryByText('Demonstração')).not.toBeInTheDocument()
    expect(ambiente.indisponiveis.has('onboarding')).toBe(false)
  })

  it('pular fica no backend e outra instância abre direto na Casca', async () => {
    let salvo = INICIAL
    const responder = async (_url: string, body: Record<string, string>) => {
      if (body.p_action === 'concluir') salvo = { ...INICIAL, concluido: true, etapa: 'checklist' }
      return salvo
    }
    const primeira = montar(responder)
    await primeira.usuario.click(await screen.findByRole('button', { name: 'Pular Day0' }))
    expect(await screen.findByRole('heading', { name: 'Casca operacional' })).toBeInTheDocument()
    primeira.unmount()
    montar(responder)
    expect(await screen.findByRole('heading', { name: 'Casca operacional' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pular Day0' })).not.toBeInTheDocument()
  })

  it('retoma no domínio confirmado pelo backend e conclui sem convite ou checklist', async () => {
    let salvo = { ...INICIAL, papel: 'RevOps', empresa: 'Cliente real', etapa: 'dominio' }
    const responder = async (_url: string, body: Record<string, string>) => {
      if (body.p_action === 'dominio') salvo = { ...salvo, dominio: 'cliente.test', etapa: 'hdyhau' }
      if (body.p_action === 'hdyhau') salvo = { ...salvo, comoConheceu: 'LinkedIn', etapa: 'convite' }
      if (body.p_action === 'concluir') salvo = { ...salvo, concluido: true, etapa: 'checklist' }
      return salvo
    }
    const { usuario } = montar(responder)
    await usuario.type(await screen.findByRole('textbox', { name: 'Domínio do site' }), 'cliente.test')
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await usuario.click(await screen.findByRole('radio', { name: 'LinkedIn' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await usuario.click(await screen.findByRole('button', { name: 'Concluir Day0' }))
    expect(await screen.findByRole('heading', { name: 'Casca operacional' })).toBeInTheDocument()
    expect(screen.queryByText('Checklist do Norte')).not.toBeInTheDocument()
  })

  it('atalho após concluir informa que checklist completo está indisponível', async () => {
    montar(async () => ({ ...INICIAL, concluido: true, etapa: 'checklist' }), '/onboarding')
    expect(await screen.findByRole('heading', { name: 'Day0 concluído' })).toBeInTheDocument()
    expect(screen.getByText('O checklist completo ainda não está disponível neste Workspace.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir Workspace' })).toHaveAttribute('href', '/')
  })

  it('convidado retoma em HDYHAU sem perguntas de empresa', async () => {
    montar(async () => ({ ...INICIAL, ramo: 'convidado', etapa: 'hdyhau' }), '/onboarding?convite=falso')
    expect(await screen.findByRole('heading', { name: 'Como nos conheceu?' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Empresa' })).not.toBeInTheDocument()
  })

  it('falha ao salvar mantém o Day0 aberto e permite tentar novamente', async () => {
    let falha = true
    let salvo = INICIAL
    const { usuario } = montar(async (_url, body) => {
      if (body.p_action && falha) { falha = false; throw new Error('offline') }
      if (body.p_action) salvo = { ...INICIAL, concluido: true, etapa: 'checklist' }
      return salvo
    })
    await usuario.click(await screen.findByRole('button', { name: 'Pular Day0' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível')
    expect(screen.getByRole('heading', { name: 'Qual é o seu papel?' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Pular Day0' }))
    expect(await screen.findByRole('heading', { name: 'Casca operacional' })).toBeInTheDocument()
  })
})

/** O Contexto da empresa como `get_company_context` devolve: sem versão vigente, com o site e a geração dados. */
function contextoDoBanco({ site = '', generation = null as unknown, vigente = false } = {}) {
  return vigente
    ? { version: 1, empresa: 'E', icp: 'I', personas: 'P', origin: 'geracao', updated_by: null, updated_at: '2026-11-06T10:00:00Z', site, generation }
    : { version: null, empresa: '', icp: '', personas: '', origin: null, updated_by: null, updated_at: null, site, generation }
}

/** O Day0 e o Contexto da empresa no mesmo backend falso, guardando os pedidos. */
function backend(day0: Record<string, unknown>, contexto: { site?: string; generation?: unknown; vigente?: boolean } = {}) {
  const pedidos: { url: string; body: Record<string, string> }[] = []
  const estadoDoContexto = { site: String(day0.dominio ?? ''), generation: null as unknown, vigente: false, ...contexto }
  const responder = async (url: string, body: Record<string, string>) => {
    pedidos.push({ url, body })
    if (url.endsWith('/save_my_day0')) {
      if (body.p_action === 'dominio') Object.assign(day0, { dominio: body.p_value, etapa: 'hdyhau' })
      if (body.p_action === 'pular_site') Object.assign(day0, { sitePulado: true, etapa: 'hdyhau' })
      if (body.p_action === 'hdyhau') Object.assign(day0, { comoConheceu: body.p_value, etapa: 'convite' })
      if (body.p_action === 'concluir') Object.assign(day0, { concluido: true, etapa: 'checklist' })
      if (body.p_action === 'dominio') estadoDoContexto.site = body.p_value
    }
    if (url.endsWith('/get_company_context')) return contextoDoBanco(estadoDoContexto) as never
    if (url.endsWith('/company-context-generation')) {
      estadoDoContexto.generation = { id: 'g1', state: 'gerando', site: body.site ?? estadoDoContexto.site, created_at: '2026-11-06T10:00:00Z' }
      return { generationId: 'g1' } as never
    }
    return day0 as never
  }
  const geracoes = () => pedidos.filter((p) => p.url.endsWith('/company-context-generation'))
  return { responder, pedidos, geracoes }
}

const CRIADOR = { ...INICIAL, papel: 'Founder', empresa: 'Norte', sitePulado: false }

describe('Day0 operacional: Contexto da empresa', () => {
  it('confirmar o site começa a geração do contexto, sem outra confirmação, e o Day0 segue', async () => {
    const { responder, geracoes } = backend({ ...CRIADOR, etapa: 'dominio' })
    const { usuario } = montar(responder)
    await usuario.type(await screen.findByRole('textbox', { name: 'Domínio do site' }), 'norte.test')
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { name: 'Como nos conheceu?' })).toBeInTheDocument()
    await vi.waitFor(() => expect(geracoes()).toHaveLength(1))
    expect(geracoes()[0].body).toEqual({ workspaceId: 'workspace', site: 'norte.test' })

    await usuario.click(screen.getByRole('radio', { name: 'LinkedIn' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    const contexto = await screen.findByRole('region', { name: 'Contexto da empresa' })
    expect(await within(contexto).findByText(/Lendo o site norte\.test/)).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Concluir Day0' }))
    expect(await screen.findByRole('heading', { name: 'Casca operacional' })).toBeInTheDocument()
    expect(geracoes()).toHaveLength(1)
  })

  it('o site pode ficar para depois: o Day0 conclui e aponta Configurações para informá-lo', async () => {
    const { responder, pedidos, geracoes } = backend({ ...CRIADOR, etapa: 'dominio' })
    const { usuario } = montar(responder)
    await usuario.click(await screen.findByRole('button', { name: 'Informar o site depois' }))
    await usuario.click(await screen.findByRole('radio', { name: 'LinkedIn' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))

    const contexto = await screen.findByRole('region', { name: 'Contexto da empresa' })
    expect(await within(contexto).findByText(/O site ficou para depois/)).toBeInTheDocument()
    expect(within(contexto).getByRole('link', { name: 'Informar o site em Configurações' })).toHaveAttribute('href', '/configuracoes/contexto')
    expect(pedidos.some((p) => p.body.p_action === 'pular_site')).toBe(true)
    expect(geracoes()).toHaveLength(0)
    await usuario.click(screen.getByRole('button', { name: 'Concluir Day0' }))
    expect(await screen.findByRole('heading', { name: 'Casca operacional' })).toBeInTheDocument()
  })

  it('a falha é comunicada: tentar de novo, escrever à mão ou concluir assim mesmo', async () => {
    const falha = { id: 'g0', state: 'falha', site: 'norte.test', created_at: '2026-11-06T10:00:00Z', failure: 'site_insuficiente' }
    const { responder, geracoes } = backend({ ...CRIADOR, etapa: 'convite', dominio: 'norte.test' }, { generation: falha })
    const { usuario } = montar(responder)
    const contexto = await screen.findByRole('region', { name: 'Contexto da empresa' })
    expect(await within(contexto).findByText(/não traz informação suficiente/)).toBeInTheDocument()
    expect(within(contexto).getByRole('link', { name: 'Escrever à mão em Configurações' })).toHaveAttribute('href', '/configuracoes/contexto')

    await usuario.click(within(contexto).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(contexto).findByText(/Lendo o site norte\.test/)).toBeInTheDocument()
    expect(geracoes()).toHaveLength(1)
    await usuario.click(screen.getByRole('button', { name: 'Concluir Day0' }))
    expect(await screen.findByRole('heading', { name: 'Casca operacional' })).toBeInTheDocument()
  })

  it('se a leitura nem começa (por exemplo, sem a função publicada), o motivo aparece e dá para tentar de novo', async () => {
    const { responder, geracoes } = backend({ ...CRIADOR, etapa: 'dominio' })
    let recusar = true
    const { usuario } = montar(async (url, body) => {
      if (url.endsWith('/company-context-generation') && recusar) {
        recusar = false
        geracoes().push({ url, body })
        throw new Error('offline')
      }
      return responder(url, body)
    })
    await usuario.type(await screen.findByRole('textbox', { name: 'Domínio do site' }), 'norte.test')
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await usuario.click(await screen.findByRole('radio', { name: 'LinkedIn' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))

    const contexto = await screen.findByRole('region', { name: 'Contexto da empresa' })
    expect(await within(contexto).findByRole('alert')).toHaveTextContent(/.+/)
    expect(within(contexto).getByRole('link', { name: 'Escrever à mão em Configurações' })).toBeInTheDocument()
    await usuario.click(within(contexto).getByRole('button', { name: 'Gerar contexto' }))
    expect(await within(contexto).findByText(/Lendo o site norte\.test/)).toBeInTheDocument()
    expect(within(contexto).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('retomar ou recarregar o Day0 não repete a geração', async () => {
    const { responder, geracoes } = backend({ ...CRIADOR, etapa: 'convite', dominio: 'norte.test' }, { generation: { id: 'g1', state: 'gerando', site: 'norte.test', created_at: '' } })
    const primeira = montar(responder)
    await within(await screen.findByRole('region', { name: 'Contexto da empresa' })).findByText(/Lendo o site/)
    primeira.unmount()
    montar(responder)
    await within(await screen.findByRole('region', { name: 'Contexto da empresa' })).findByText(/Lendo o site/)
    expect(geracoes()).toHaveLength(0)
  })

  it('num Workspace que já tem contexto vigente, confirmar o site não gera de novo', async () => {
    const { responder, geracoes } = backend({ ...CRIADOR, etapa: 'dominio' }, { vigente: true, site: 'antigo.test' })
    const { usuario } = montar(responder)
    await usuario.type(await screen.findByRole('textbox', { name: 'Domínio do site' }), 'norte.test')
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    await usuario.click(await screen.findByRole('radio', { name: 'LinkedIn' }))
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await within(await screen.findByRole('region', { name: 'Contexto da empresa' })).findByText(/Pronto/)).toBeInTheDocument()
    expect(geracoes()).toHaveLength(0)
  })

  it('não pergunta mais o mini-ICP, e um convidado não vê o Contexto da empresa', async () => {
    montar(backend({ ...INICIAL, ramo: 'convidado', etapa: 'convite' }).responder)
    expect(await screen.findByRole('heading', { name: 'Tudo pronto para começar' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Contexto da empresa' })).not.toBeInTheDocument()
    for (const campo of ['Mini-ICP', 'O que você vende', 'Por que compram']) expect(screen.queryByRole('textbox', { name: campo })).not.toBeInTheDocument()
  })
})
