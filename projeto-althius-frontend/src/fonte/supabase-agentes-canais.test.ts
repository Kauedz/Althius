import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeAgentesSupabase } from './supabase-agentes'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

function fonteCom(rpcs: Record<string, (parametros: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), rpcs })
  return criarFonteDeAgentesSupabase(cliente, 'ws-norte')
}

const conectados = async (fonte: ReturnType<typeof fonteCom>) =>
  (await fonte.canais()).filter((canal) => canal.conectado).map((canal) => canal.id)

describe('Canais do Agente no Workspace operacional', () => {
  it('liga o Slack quando o Canal Slack está ativo no Workspace', async () => {
    const fonte = fonteCom({
      slack_channel_status: (p) => {
        expect(p).toEqual({ p_workspace_id: 'ws-norte' })
        return [{ state: 'ativo', team_name: 'Norte' }]
      },
    })
    expect(await conectados(fonte)).toEqual(['slack'])
  })

  it('deixa o Slack desligado quando ele foi retirado ou nunca foi instalado', async () => {
    for (const state of ['retirado', 'nao_instalado']) {
      const fonte = fonteCom({ slack_channel_status: () => [{ state, team_name: null }] })
      expect(await conectados(fonte)).toEqual([])
    }
  })

  it('deixa o Slack desligado quando a leitura do Canal falha', async () => {
    const fonte = fonteCom({
      slack_channel_status: () => {
        throw new Error('falhou')
      },
    })
    expect(await conectados(fonte)).toEqual([])
  })
})
