import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const ADMIN = { id: 'usuario-admin', email: 'admin@cliente.com.br' }
const WORKSPACE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  sessionStorage.clear()
})

function abrir(papel: 'admin' | 'member' = 'admin', inicial = 'nao_habilitado', adaptadorPronto = true) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', WORKSPACE.id)
  window.history.replaceState(null, '', '/conexoes')
  let state = inicial
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(ADMIN),
    tabelas: {
      workspaces: [WORKSPACE],
      workspace_memberships: [{ workspace_id: WORKSPACE.id, role: papel, user_id: ADMIN.id, active: true }],
    },
    rpcs: {
      bootstrap_personal_workspace: () => WORKSPACE,
      ...rpcsDeConexoes(criarBancoDeConexoes()),
      slack_channel_status: () => [{ state: 'nao_instalado', team_name: null }],
      whatsapp_channel_status: () => [{ state }],
      set_whatsapp_channel_enabled: ({ p_enabled }) => {
        state = p_enabled ? 'ativo' : 'retirado'
        return p_enabled
      },
    },
    funcoes: { 'canal-whatsapp-status': () => ({ corpo: { configurado: adaptadorPronto } }) },
  })
  const { servicos } = criarServicosDoNavegadorFalsos()
  render(<RaizDoAplicativo cliente={cliente} servicos={servicos} />)
  return userEvent.setup()
}

async function cartaoWhatsapp() {
  const secao = await screen.findByRole('region', { name: 'Canais' })
  return within(secao).findByRole('article', { name: 'WhatsApp' })
}

describe('Canal WhatsApp em Conexões', () => {
  it('o Administrador habilita e retira sem apagar Conversas ou Atividade', async () => {
    const usuario = abrir()
    const cartao = await cartaoWhatsapp()

    expect(await within(cartao).findByText('Não conectado')).toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Habilitar o WhatsApp' }))
    expect(await within(cartao).findByText('Ativo')).toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Retirar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Retirar o WhatsApp' })
    expect(within(dialogo).getByText(/As Conversas e a Atividade ficam/)).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Retirar' }))
    expect(await within(cartao).findByText('Retirado')).toBeInTheDocument()
    expect(within(cartao).getByRole('button', { name: 'Habilitar o WhatsApp de novo' })).toBeInTheDocument()
  })

  it('o Membro vê o estado sem poder habilitar ou retirar', async () => {
    abrir('member', 'ativo')
    const cartao = await cartaoWhatsapp()

    expect(await within(cartao).findByText('Ativo')).toBeInTheDocument()
    expect(within(cartao).getByText('Só um Administrador habilita ou retira o WhatsApp.')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button')).not.toBeInTheDocument()
  })

  it('não oferece Habilitar quando o adaptador não está configurado', async () => {
    abrir('admin', 'nao_habilitado', false)
    const cartao = await cartaoWhatsapp()

    expect(await within(cartao).findByText('Em breve')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button')).not.toBeInTheDocument()
  })

  it('permite retirar um Canal ativo quando o adaptador não está configurado', async () => {
    const usuario = abrir('admin', 'ativo', false)
    const cartao = await cartaoWhatsapp()

    expect(await within(cartao).findByText('Ativo')).toBeInTheDocument()
    await usuario.click(within(cartao).getByRole('button', { name: 'Retirar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Retirar o WhatsApp' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Retirar' }))

    expect(await within(cartao).findByText('Retirado')).toBeInTheDocument()
  })
})
