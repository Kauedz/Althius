import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createClient } from '@supabase/supabase-js'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { criarAmbienteDoWorkspace } from '@/fonte/composicao'
import { AmbienteProvider, FonteDeOnboardingProvider } from '@/fonte/contexto'
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
        <MemoryRouter initialEntries={[rota]}>
          <Routes>
            <Route path="/onboarding" element={<PaginaOnboarding />} />
            <Route element={<EntradaNaCasca />}><Route path="/" element={<h1>Casca operacional</h1>} /></Route>
          </Routes>
        </MemoryRouter>
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

describe('Day0 operacional: mini-ICP do Workspace', () => {
  it('a pessoa criadora preenche os 3 campos do mini-ICP, sem Setor, Porte e Região, e salva pelo Day0', async () => {
    const registro = { ...INICIAL, etapa: 'convite', papel: 'Founder', comoConheceu: 'Indicação', empresa: 'Norte', dominio: 'norte.test', miniIcp: '', oQueVende: '', porQueCompram: '' }
    const pedidos: { url: string; body: Record<string, string> }[] = []
    const responder = async (url: string, body: Record<string, string>) => {
      pedidos.push({ url, body })
      if (url.endsWith('/save_my_day0') && body.p_action === 'produto') Object.assign(registro, JSON.parse(body.p_value))
      return registro as never
    }
    const { usuario } = montar(responder)
    const secao = await screen.findByRole('region', { name: 'ICP do Workspace' })
    for (const campo of ['Setor', 'Porte', 'Região']) expect(within(secao).queryByRole('textbox', { name: campo })).not.toBeInTheDocument()

    await usuario.type(within(secao).getByRole('textbox', { name: 'O que você vende' }), 'Roteirização')
    await usuario.type(within(secao).getByRole('textbox', { name: 'Mini-ICP' }), 'Transportadoras médias')
    await usuario.type(within(secao).getByRole('textbox', { name: 'Por que compram' }), 'Cortam frete')
    await usuario.click(within(secao).getByRole('button', { name: 'Salvar ICP' }))
    expect(await screen.findByText('ICP salvo.')).toBeInTheDocument()

    const produto = pedidos.find((p) => p.url.endsWith('/save_my_day0') && p.body.p_action === 'produto')
    expect(JSON.parse(produto!.body.p_value)).toEqual({ miniIcp: 'Transportadoras médias', oQueVende: 'Roteirização', porQueCompram: 'Cortam frete' })
    expect(pedidos.some((p) => /\/(get_my_workspace_icp|save_my_workspace_icp_fields)$/.test(p.url))).toBe(false)
  })

  it('um convidado não vê o bloco do ICP', async () => {
    montar(async () => ({ ...INICIAL, ramo: 'convidado', etapa: 'convite' }))
    expect(await screen.findByRole('heading', { name: 'Tudo pronto para começar' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'ICP do Workspace' })).not.toBeInTheDocument()
  })
})
