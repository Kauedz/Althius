import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { conteudoLido, criarFonteDoPlaybookSupabase } from './supabase-playbook'

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

describe('Playbook no Supabase', () => {
  it('o Membro propõe pela função do banco; a fila e o Playbook relêem juntos', async () => {
    const { cliente, chamadas } = clienteCom(() => ({ data: [{ approval_id: 'ap-1', outcome: 'criada' }] }))
    let ouvinteDaFila: (() => void) | null = null
    const aprovacoes = {
      observar: (ouvinte: () => void) => {
        ouvinteDaFila = ouvinte
        return () => undefined
      },
      invalidar: vi.fn(),
    }
    const fonte = criarFonteDoPlaybookSupabase(cliente, () => 'ws-1', NOMES, aprovacoes)
    const aviso = vi.fn()
    fonte.observar(aviso)

    await fonte.propor('icp', { texto: 'Indústria', linhas: [] }, 'Vi nos fechamentos')

    expect(chamadas).toEqual([
      {
        funcao: 'propose_playbook_revision',
        parametros: {
          p_workspace_id: 'ws-1',
          p_section: 'icp',
          p_content: { texto: 'Indústria', linhas: [] },
          p_justification: 'Vi nos fechamentos',
        },
      },
    ])
    expect(aprovacoes.invalidar).toHaveBeenCalledTimes(1)
    expect(aviso).toHaveBeenCalledTimes(1)
    // Decidir na fila relê o Playbook (e a Memória, que é ele no Workspace operacional).
    ouvinteDaFila!()
    expect(aviso).toHaveBeenCalledTimes(2)
  })

  it('lê a seção com a versão vigente, o autor pelo nome e o histórico', async () => {
    const { cliente, chamadas } = clienteCom(() => ({
      data: {
        section: 'icp',
        name: 'ICP',
        version: 2,
        content: { texto: 'Incorporadoras', linhas: [{ segmento: 'Médio porte' }] },
        updated_by: 'u1',
        updated_at: '2026-09-30T10:00:00Z',
        history: [
          { version: 2, updated_by: 'u1', updated_at: '2026-09-30T10:00:00Z' },
          { version: 1, updated_by: 'saiu', updated_at: '2026-09-29T10:00:00Z' },
        ],
      },
    }))
    const fonte = criarFonteDoPlaybookSupabase(cliente, () => 'ws-1', NOMES)

    const secao = await fonte.secao('icp')

    expect(chamadas).toEqual([{ funcao: 'get_playbook_section', parametros: { p_workspace_id: 'ws-1', p_section: 'icp' } }])
    expect(secao.vigente).toEqual({
      versao: 2,
      autor: 'Ana Lima',
      em: '2026-09-30T10:00:00Z',
      conteudo: { texto: 'Incorporadoras', linhas: [{ segmento: 'Médio porte' }] },
    })
    expect(secao.historico.map((h) => [h.versao, h.autor])).toEqual([[2, 'Ana Lima'], [1, null]])
  })

  it('uma seção ainda não escrita vem sem versão vigente', async () => {
    const { cliente } = clienteCom(() => ({
      data: { section: 'rotina', name: 'Rotina', version: null, content: null, updated_by: null, updated_at: null, history: [] },
    }))
    const secao = await criarFonteDoPlaybookSupabase(cliente, () => 'ws-1', NOMES).secao('rotina')

    expect(secao.vigente).toBeNull()
    expect(secao.historico).toEqual([])
  })

  it('grava e restaura pelas funções do banco e avisa quem observa', async () => {
    const { cliente, chamadas } = clienteCom((funcao) => ({ data: funcao === 'save_playbook_section' ? 3 : 4 }))
    const fonte = criarFonteDoPlaybookSupabase(cliente, () => 'ws-1', NOMES)
    const ouvinte = vi.fn()
    fonte.observar(ouvinte)

    expect(await fonte.salvar('icp', { texto: 'x', linhas: [] })).toBe(3)
    expect(await fonte.restaurar('icp', 1)).toBe(4)

    expect(chamadas).toEqual([
      {
        funcao: 'save_playbook_section',
        parametros: { p_workspace_id: 'ws-1', p_section: 'icp', p_content: { texto: 'x', linhas: [] } },
      },
      { funcao: 'restore_playbook_version', parametros: { p_workspace_id: 'ws-1', p_section: 'icp', p_version: 1 } },
    ])
    expect(ouvinte).toHaveBeenCalledTimes(2)
  })

  it('diz em português por que o banco recusou, e não avisa ninguém', async () => {
    const { cliente } = clienteCom(() => ({
      error: { code: '42501', message: 'only administrators can edit the playbook' },
    }))
    const fonte = criarFonteDoPlaybookSupabase(cliente, () => 'ws-1', NOMES)
    const ouvinte = vi.fn()
    fonte.observar(ouvinte)

    await expect(fonte.salvar('icp', { texto: 'x', linhas: [] })).rejects.toThrow('Só um Administrador edita o Playbook.')
    expect(ouvinte).not.toHaveBeenCalled()
  })

  it('não confia no formato do conteúdo que o banco devolve', () => {
    expect(conteudoLido(null)).toEqual({ texto: '', linhas: [] })
    expect(conteudoLido({ texto: 3, linhas: [{ a: 'x', b: 2 }, 'solta', null] })).toEqual({
      texto: '',
      linhas: [{ a: 'x', b: '' }],
    })
  })
})
