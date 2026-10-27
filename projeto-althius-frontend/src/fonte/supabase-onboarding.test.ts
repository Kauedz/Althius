import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { criarFonteDeOnboardingSupabase } from './supabase-onboarding'

describe('Fonte Supabase do onboarding', () => {
  it('salva e retoma os três campos do mini-ICP no Workspace do Day0', async () => {
    const chamadas: { nome: string; parametros: Record<string, unknown> }[] = []
    const produto = { miniIcp: 'Fintechs B2B', oQueVende: 'Software financeiro', porQueCompram: 'Reduzem conciliação' }
    const cliente = createClient('http://localhost:54399', 'fake-local', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: vi.fn(async (input, init) => {
          const url = String(input)
          const nome = url.split('/').pop() ?? ''
          const parametros = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
          chamadas.push({ nome, parametros })
          return new Response(JSON.stringify({
            ramo: 'criador', etapa: 'checklist', papel: 'Founder', comoConheceu: 'Indicação', empresa: 'Norte',
            dominio: 'norte.test', logoDoSite: null, concluido: false, ...produto,
          }), { headers: { 'Content-Type': 'application/json' } })
        }),
      },
    })
    const fonte = criarFonteDeOnboardingSupabase(cliente, 'workspace-01')

    await fonte.salvarProduto(produto)
    const retomado = await fonte.retomar()

    expect(chamadas[0]).toMatchObject({
      nome: 'save_my_day0',
      parametros: { p_workspace_id: 'workspace-01', p_action: 'produto', p_value: JSON.stringify(produto) },
    })
    expect(retomado.checklist).toMatchObject(produto)
  })
})
