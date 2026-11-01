import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { criarFonteDeOnboardingSupabase } from './supabase-onboarding'

interface Chamada { nome: string; parametros: Record<string, unknown> }

const DAY0 = {
  ramo: 'criador', etapa: 'checklist', papel: 'Founder', comoConheceu: 'Indicação', empresa: 'Norte',
  dominio: 'norte.test', logoDoSite: null, concluido: false, miniIcp: '', oQueVende: '', porQueCompram: '',
}

/** Um cliente local falso: responde às RPCs e à Edge Function pelo nome e guarda o que foi pedido. */
function clienteFalso({
  day0 = { ...DAY0 } as Record<string, unknown>,
  leitura = null as unknown,
} = {}) {
  const chamadas: Chamada[] = []
  let liberarLeitura: () => void = () => {}
  const leituraPendente = new Promise<void>((resolver) => { liberarLeitura = resolver })
  const cliente = createClient('http://localhost:54399', 'fake-local', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: vi.fn(async (input, init) => {
        const nome = String(input).split('?')[0].split('/').pop() ?? ''
        const parametros = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        chamadas.push({ nome, parametros })
        const responder = (corpo: unknown, status = 200) =>
          new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
        if (nome === 'save_my_day0') {
          if (parametros.p_action === 'produto') Object.assign(day0, JSON.parse(String(parametros.p_value)))
          if (parametros.p_action === 'dominio') day0.dominio = parametros.p_value
          return responder(day0)
        }
        if (nome === 'get_my_day0') return responder(day0)
        if (nome === 'icp-site-read') {
          await leituraPendente
          return responder({ leitura })
        }
        return responder({ message: 'não esperado' }, 404)
      }),
    },
  })
  return { cliente, chamadas, liberarLeitura }
}

describe('Fonte Supabase do onboarding', () => {
  it('salva e retoma os três campos do mini-ICP no Workspace do Day0, sem ler nem gravar o ICP estruturado', async () => {
    const { cliente, chamadas } = clienteFalso()
    const fonte = criarFonteDeOnboardingSupabase(cliente, 'workspace-01')
    const produto = { miniIcp: 'Fintechs B2B', oQueVende: 'Software financeiro', porQueCompram: 'Reduzem conciliação' }

    await fonte.salvarProduto(produto)
    const retomado = await fonte.retomar()

    expect(chamadas[0]).toMatchObject({
      nome: 'save_my_day0',
      parametros: { p_workspace_id: 'workspace-01', p_action: 'produto', p_value: JSON.stringify(produto) },
    })
    expect(chamadas.map((c) => c.nome)).toEqual(['save_my_day0', 'get_my_day0'])
    expect(retomado.checklist).toMatchObject(produto)
  })

  it('confirmar o domínio começa a leitura do site, que pré-preenche o checklist sem sobrescrever o que já foi salvo', async () => {
    const leitura = {
      oQueVende: 'Roteirização', miniIcp: 'Transportadoras médias', porQueCompram: 'Cortam frete',
      personas: ['COO: decide'],
    }
    const { cliente, chamadas, liberarLeitura } = clienteFalso({
      day0: { ...DAY0, dominio: '', oQueVende: 'O que eu escrevi' }, leitura,
    })
    const fonte = criarFonteDeOnboardingSupabase(cliente, 'workspace-01')
    await fonte.ler()
    const avisos = vi.fn()
    fonte.observar(avisos)

    const confirmado = await fonte.definirDominio('https://Norte.test/')
    expect(confirmado.dominio).toBe('norte.test')
    await vi.waitFor(() => expect(chamadas.some((c) => c.nome === 'icp-site-read')).toBe(true))
    expect(chamadas.find((c) => c.nome === 'icp-site-read')?.parametros).toEqual({ workspaceId: 'workspace-01', dominio: 'norte.test' })
    expect((await fonte.ler()).leitura.situacao).toBe('lendo')

    liberarLeitura()
    await vi.waitFor(async () => expect((await fonte.ler()).leitura.situacao).toBe('pronta'))
    const estado = await fonte.ler()
    expect(estado.checklist).toMatchObject({
      oQueVende: 'O que eu escrevi', miniIcp: 'Transportadoras médias', porQueCompram: 'Cortam frete',
      personas: ['COO: decide'],
    })
    expect(avisos).toHaveBeenCalled()
    // Nada foi gravado pela leitura: só a pessoa salva.
    expect(chamadas.filter((c) => c.nome === 'save_my_day0').map((c) => c.parametros.p_action)).toEqual(['dominio'])
  })

  it('sem leitura (motor desligado ou falha), nada é inventado e a leitura fica como falhou', async () => {
    const { cliente, liberarLeitura } = clienteFalso({ leitura: null })
    const fonte = criarFonteDeOnboardingSupabase(cliente, 'workspace-01')
    await fonte.ler()
    liberarLeitura()
    expect(await fonte.lerSite('norte.test')).toBeNull()
    const estado = await fonte.ler()
    expect(estado.leitura.situacao).toBe('falhou')
    expect(estado.checklist).toMatchObject({ oQueVende: '', miniIcp: '', porQueCompram: '' })
  })

  it('só lê o domínio confirmado no Day0', async () => {
    const { cliente, chamadas } = clienteFalso()
    const fonte = criarFonteDeOnboardingSupabase(cliente, 'workspace-01')
    await fonte.ler()
    expect(await fonte.lerSite('outro.test')).toBeNull()
    expect(chamadas.some((c) => c.nome === 'icp-site-read')).toBe(false)
  })
})
