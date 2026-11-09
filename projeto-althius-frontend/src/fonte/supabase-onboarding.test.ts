import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { criarFonteDeOnboardingSupabase } from './supabase-onboarding'

interface Chamada { nome: string; parametros: Record<string, unknown> }

const DAY0 = {
  ramo: 'criador', etapa: 'dominio', papel: 'Founder', comoConheceu: null, empresa: 'Norte',
  dominio: '', logoDoSite: null, concluido: false, sitePulado: false,
}

/** Um cliente local falso: responde às RPCs pelo nome e guarda o que foi pedido. */
function clienteFalso(day0: Record<string, unknown> = { ...DAY0 }) {
  const chamadas: Chamada[] = []
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
          if (parametros.p_action === 'dominio') Object.assign(day0, { dominio: parametros.p_value, etapa: 'hdyhau' })
          if (parametros.p_action === 'pular_site') Object.assign(day0, { sitePulado: true, etapa: 'hdyhau' })
          return responder(day0)
        }
        if (nome === 'get_my_day0') return responder(day0)
        return responder({ message: 'não esperado' }, 404)
      }),
    },
  })
  return { cliente, chamadas }
}

describe('Fonte Supabase do onboarding', () => {
  it('confirma o domínio normalizado sem ler o site: a geração é da Fonte do contexto', async () => {
    const { cliente, chamadas } = clienteFalso()
    const fonte = criarFonteDeOnboardingSupabase(cliente, 'workspace-01')
    const avisos = vi.fn()
    fonte.observar(avisos)

    const confirmado = await fonte.definirDominio('https://Norte.test/')

    expect(confirmado).toMatchObject({ dominio: 'norte.test', etapa: 'hdyhau', sitePulado: false })
    expect(chamadas).toEqual([
      { nome: 'save_my_day0', parametros: { p_workspace_id: 'workspace-01', p_action: 'dominio', p_value: 'norte.test' } },
    ])
    expect(avisos).toHaveBeenCalled()
  })

  it('pular o site segue o Day0 e o estado retomado lembra que o site ficou para depois', async () => {
    const { cliente, chamadas } = clienteFalso()
    const fonte = criarFonteDeOnboardingSupabase(cliente, 'workspace-01')

    const pulado = await fonte.pularSite()
    const retomado = await fonte.retomar()

    expect(pulado).toMatchObject({ etapa: 'hdyhau', dominio: '', sitePulado: true })
    expect(retomado.sitePulado).toBe(true)
    expect(chamadas[0]).toEqual({
      nome: 'save_my_day0',
      parametros: { p_workspace_id: 'workspace-01', p_action: 'pular_site', p_value: null },
    })
  })

  it('não traz o mini-ICP nem as Personas do onboarding: o checklist só tem o contexto e o Sinal', async () => {
    const { cliente } = clienteFalso({ ...DAY0, miniIcp: 'antigo', oQueVende: 'antigo', porQueCompram: 'antigo' })
    const estado = await criarFonteDeOnboardingSupabase(cliente, 'workspace-01').ler()
    expect(estado.checklist).toEqual({ contexto: 'pendente', sinal: 'pendente' })
  })
})
