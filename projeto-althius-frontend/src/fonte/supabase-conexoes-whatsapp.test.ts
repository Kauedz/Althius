import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { lerCanaisDoWorkspace } from './supabase-conexoes'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

describe('Canal WhatsApp em Conexões', () => {
  it('mostra o estado habilitado do Workspace sem revelar dados de conversa', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(MARINA),
      rpcs: { whatsapp_channel_status: () => [{ state: 'ativo' }] },
      funcoes: { 'canal-whatsapp-status': () => ({ corpo: { configurado: true } }) },
    })

    const whatsapp = (await lerCanaisDoWorkspace(cliente, 'ws-norte')).find((canal) => canal.id === 'whatsapp')

    expect(whatsapp).toMatchObject({ id: 'whatsapp', estado: 'conectado', conectado: true })
    expect(whatsapp).not.toHaveProperty('conversa')
  })

  it.each(['nao_habilitado', 'retirado', 'falha'])('mantém o WhatsApp desligado quando o estado é %s', async (estado) => {
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(MARINA),
      rpcs: {
        whatsapp_channel_status: () => {
          if (estado === 'falha') throw new Error('falha')
          return [{ state: estado }]
        },
      },
      funcoes: { 'canal-whatsapp-status': () => ({ corpo: { configurado: true } }) },
    })

    const whatsapp = (await lerCanaisDoWorkspace(cliente, 'ws-norte')).find((canal) => canal.id === 'whatsapp')

    expect(whatsapp?.conectado).toBe(false)
  })

  it('não apresenta estado operacional se o adaptador não está configurado', async () => {
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(MARINA),
      rpcs: { whatsapp_channel_status: () => [{ state: 'nao_habilitado' }] },
      funcoes: { 'canal-whatsapp-status': () => ({ corpo: { configurado: false } }) },
    })

    const whatsapp = (await lerCanaisDoWorkspace(cliente, 'ws-norte')).find((canal) => canal.id === 'whatsapp')

    expect(whatsapp?.estado).toBe('em_breve')
  })
})
