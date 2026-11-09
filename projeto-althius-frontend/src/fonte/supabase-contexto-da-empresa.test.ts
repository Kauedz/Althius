import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { ERRO_CONTEXTO_MUDOU } from './contexto-da-empresa-tipos'
import { criarFonteDoContextoDaEmpresaSupabase, geracaoLida } from './supabase-contexto-da-empresa'

const NOMES = async () => new Map([['u1', 'Ana Lima']])

function clienteCom(rpc: (funcao: string, parametros: Record<string, unknown>) => { data?: unknown; error?: unknown }) {
  const chamadas: { funcao: string; parametros: Record<string, unknown> }[] = []
  const cliente = {
    rpc: vi.fn(async (funcao: string, parametros: Record<string, unknown>) => {
      chamadas.push({ funcao, parametros })
      return { data: null, error: null, ...rpc(funcao, parametros) }
    }),
  } as unknown as SupabaseClient
  return { cliente, chamadas }
}

describe('Contexto da empresa no Supabase', () => {
  it('lê os três textos, a versão, o autor e o site pela função do banco', async () => {
    const { cliente, chamadas } = clienteCom(() => ({
      data: {
        version: 3,
        empresa: 'Vendemos software.',
        icp: 'ICP primário: incorporadoras.',
        personas: 'Diretor comercial.',
        origin: 'manual',
        updated_by: 'u1',
        updated_at: '2026-11-06T12:00:00Z',
        site: 'norte.com.br',
        can_edit: true,
      },
    }))
    const fonte = criarFonteDoContextoDaEmpresaSupabase(cliente, () => 'ws-1', NOMES)

    expect(await fonte.contexto()).toEqual({
      site: 'norte.com.br',
      geracao: null,
      vigente: {
        versao: 3,
        empresa: 'Vendemos software.',
        icp: 'ICP primário: incorporadoras.',
        personas: 'Diretor comercial.',
        origem: 'manual',
        autor: 'Ana Lima',
        em: '2026-11-06T12:00:00Z',
      },
    })
    expect(chamadas).toEqual([{ funcao: 'get_company_context', parametros: { p_workspace_id: 'ws-1' } }])
  })

  it('sem versão, o contexto vem vazio, sem inventar texto', async () => {
    const { cliente } = clienteCom(() => ({
      data: { version: null, empresa: '', icp: '', personas: '', origin: null, updated_by: null, updated_at: null, site: '' },
    }))
    const fonte = criarFonteDoContextoDaEmpresaSupabase(cliente, () => 'ws-1', NOMES)

    expect(await fonte.contexto()).toEqual({ site: '', vigente: null, geracao: null })
  })

  it('salva com a versão que a tela via e avisa as telas', async () => {
    const { cliente, chamadas } = clienteCom(() => ({ data: 4 }))
    const fonte = criarFonteDoContextoDaEmpresaSupabase(cliente, () => 'ws-1', NOMES)
    const aviso = vi.fn()
    fonte.observar(aviso)

    expect(await fonte.salvar({ empresa: 'a', icp: 'b', personas: 'c' }, 3)).toBe(4)
    expect(chamadas).toEqual([
      {
        funcao: 'save_company_context',
        parametros: { p_workspace_id: 'ws-1', p_empresa: 'a', p_icp: 'b', p_personas: 'c', p_expected_version: 3 },
      },
    ])
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ code: '40001', message: 'company context changed' }, ERRO_CONTEXTO_MUDOU],
    [{ code: '42501', message: 'only administrators can edit the company context' }, 'Só um Administrador altera o Contexto da empresa.'],
    [{ code: '42501', message: 'active workspace membership required' }, 'Você não participa mais deste Workspace.'],
    [{ code: '22023', message: 'company context too long' }, 'Um dos textos passou do tamanho máximo (40 mil caracteres).'],
    [{ code: 'XX000', message: 'boom' }, 'Não foi possível concluir agora. Tente de novo.'],
  ])('traduz a recusa do banco %o', async (erro, texto) => {
    const { cliente } = clienteCom(() => ({ error: erro }))
    const fonte = criarFonteDoContextoDaEmpresaSupabase(cliente, () => 'ws-1', NOMES)
    const aviso = vi.fn()
    fonte.observar(aviso)

    await expect(fonte.salvar({ empresa: 'a', icp: 'b', personas: 'c' }, 1)).rejects.toThrow(texto)
    expect(aviso).not.toHaveBeenCalled()
  })
})

describe('Geração do contexto no Supabase', () => {
  it('lê o andamento, a sugestão e a falha como o banco devolve', () => {
    expect(geracaoLida({ id: 'g1', state: 'gerando', site: 'norte.com.br', created_at: 't' })).toEqual({
      id: 'g1', site: 'norte.com.br', estado: 'gerando', iniciadaEm: 't',
    })
    expect(
      geracaoLida({ id: 'g2', state: 'sugestao', site: 's', created_at: 't', empresa: 'a', icp: 'b', personas: 'c', sources: ['https://s/', 3] }),
    ).toEqual({ id: 'g2', site: 's', estado: 'sugestao', iniciadaEm: 't', textos: { empresa: 'a', icp: 'b', personas: 'c' }, fontes: ['https://s/'] })
    expect(geracaoLida({ id: 'g3', state: 'falha', site: 's', created_at: 't', failure: 'site_insuficiente' })).toMatchObject({
      estado: 'falha', motivo: 'site_insuficiente',
    })
    expect(geracaoLida({ id: 'g4', state: 'falha', failure: 'outra coisa' })).toMatchObject({ motivo: 'falhou' })
    expect(geracaoLida(null)).toBeNull()
    expect(geracaoLida({ id: 'g5', state: 'aceita' })).toBeNull()
  })

  it('gerar chama a Edge Function com o Workspace e o site; a recusa dela vira a mensagem dela', async () => {
    const invocacoes: unknown[] = []
    let erro: unknown = null
    const cliente = {
      rpc: vi.fn(),
      functions: {
        invoke: vi.fn(async (nome: string, opcoes: { body: unknown }) => {
          invocacoes.push({ nome, body: opcoes.body })
          return { data: erro ? null : { generationId: 'g1', estado: 'gerando' }, error: erro }
        }),
      },
    } as unknown as SupabaseClient
    const fonte = criarFonteDoContextoDaEmpresaSupabase(cliente, () => 'ws-1', NOMES)
    const aviso = vi.fn()
    fonte.observar(aviso)

    await fonte.gerar('norte.com.br')
    await fonte.gerar()
    expect(invocacoes).toEqual([
      { nome: 'company-context-generation', body: { workspaceId: 'ws-1', site: 'norte.com.br' } },
      { nome: 'company-context-generation', body: { workspaceId: 'ws-1' } },
    ])
    expect(aviso).toHaveBeenCalledTimes(2)

    erro = Object.assign(new Error('x'), {
      name: 'FunctionsHttpError',
      context: new Response(JSON.stringify({ error: 'Só um Administrador gera o Contexto da empresa.' }), { status: 403 }),
    })
    await expect(fonte.gerar()).rejects.toThrow('Só um Administrador gera o Contexto da empresa.')
  })

  it('aceitar e descartar passam pela função do banco com a versão que a tela via', async () => {
    const { cliente, chamadas } = clienteCom((funcao) => ({ data: funcao === 'accept_company_context_suggestion' ? 5 : null }))
    const fonte = criarFonteDoContextoDaEmpresaSupabase(cliente, () => 'ws-1', NOMES)

    expect(await fonte.aceitarSugestao('g1', 4)).toBe(5)
    await fonte.descartarGeracao('g2')
    expect(chamadas).toEqual([
      { funcao: 'accept_company_context_suggestion', parametros: { p_workspace_id: 'ws-1', p_generation_id: 'g1', p_expected_version: 4 } },
      { funcao: 'discard_company_context_generation', parametros: { p_workspace_id: 'ws-1', p_generation_id: 'g2' } },
    ])
  })
})
