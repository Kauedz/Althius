import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idaAoApp } from '@/paginas/ida-ao-app'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

type EstadoNoBanco = 'nao_instalado' | 'ativo' | 'retirado'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function abrir({
  rota = '/conexoes',
  papel = 'admin' as 'admin' | 'member',
  estado = 'nao_instalado' as EstadoNoBanco,
  slack = (_corpo: Record<string, unknown>): { status?: number; corpo: unknown } | null => null,
} = {}) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  let atual = { state: estado, team_name: estado === 'nao_instalado' ? null : 'Norte no Slack' }
  const pedidos: Record<string, unknown>[] = []

  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [NORTE],
      workspace_memberships: [{ workspace_id: NORTE.id, role: papel, user_id: MARINA.id, active: true }],
    },
    rpcs: {
      bootstrap_personal_workspace: () => NORTE,
      ...rpcsDeConexoes(criarBancoDeConexoes()),
      slack_channel_status: () => [atual],
    },
    funcoes: {
      'slack-channel-connect': (corpo) => {
        pedidos.push(corpo)
        const resposta = slack(corpo)
        if (resposta) return resposta
        if (corpo.action === 'retirar') {
          atual = { ...atual, state: 'retirado' }
          return { corpo: { ok: true } }
        }
        return { corpo: { url: 'https://slack.com/oauth/v2/authorize?state=x' } }
      },
    },
  })

  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { usuario, pedidos }
}

async function cartaoDoSlack() {
  const secao = await screen.findByRole('region', { name: 'Canais' })
  return within(secao).findByRole('article', { name: 'Slack' })
}

describe('O Canal Slack em Conexões', () => {
  it('o Administrador conecta o Slack pelo fluxo oficial, e os outros Canais seguem "Em breve"', async () => {
    const indo = vi.spyOn(idaAoApp, 'ir').mockImplementation(() => {})
    const { usuario, pedidos } = abrir()

    const cartao = await cartaoDoSlack()
    expect(await within(cartao).findByText('Não conectado')).toBeInTheDocument()
    const secao = screen.getByRole('region', { name: 'Canais' })
    for (const nome of ['WhatsApp', 'Microsoft Teams', 'E-mail']) {
      expect(within(within(secao).getByRole('article', { name: nome })).getByText('Em breve')).toBeInTheDocument()
    }

    await usuario.click(within(cartao).getByRole('button', { name: 'Conectar o Slack' }))

    expect(pedidos).toEqual([{ action: 'iniciar', workspaceId: NORTE.id }])
    expect(indo).toHaveBeenCalledWith('https://slack.com/oauth/v2/authorize?state=x')
  })

  it('o Administrador vê o Canal ativo e o retira, depois de confirmar', async () => {
    const { usuario, pedidos } = abrir({ estado: 'ativo' })

    const cartao = await cartaoDoSlack()
    expect(await within(cartao).findByText('Ativo')).toBeInTheDocument()
    expect(within(cartao).getByText('Workspace do Slack: Norte no Slack')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button', { name: 'Conectar o Slack' })).not.toBeInTheDocument()

    await usuario.click(within(cartao).getByRole('button', { name: 'Retirar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Retirar o Slack' })
    expect(within(dialogo).getByText(/Conversas e a Atividade ficam/)).toBeInTheDocument()
    expect(pedidos).toEqual([])
    await usuario.click(within(dialogo).getByRole('button', { name: 'Retirar' }))

    expect(pedidos).toEqual([{ action: 'retirar', workspaceId: NORTE.id }])
    expect(await within(cartao).findByText('Retirado')).toBeInTheDocument()
    expect(within(cartao).getByRole('button', { name: 'Conectar o Slack de novo' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('a retirada que o Slack não confirma aparece no diálogo, e o Canal continua ativo', async () => {
    const { usuario } = abrir({
      estado: 'ativo',
      slack: (corpo) =>
        corpo.action === 'retirar'
          ? { status: 502, corpo: { error: 'O Slack não confirmou a retirada agora. Tente de novo em instantes.', code: 'indisponivel' } }
          : null,
    })

    const cartao = await cartaoDoSlack()
    await usuario.click(await within(cartao).findByRole('button', { name: 'Retirar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Retirar o Slack' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Retirar' }))

    expect(await within(dialogo).findByText('O Slack não confirmou a retirada agora. Tente de novo em instantes.')).toBeInTheDocument()
    expect(within(cartao).getByText('Ativo')).toBeInTheDocument()
  })

  for (const estado of ['ativo', 'retirado'] as const) {
    it(`o Membro vê o Canal ${estado} sem Conectar nem Retirar`, async () => {
      abrir({ papel: 'member', estado })

      const cartao = await cartaoDoSlack()
      expect(await within(cartao).findByText(estado === 'ativo' ? 'Ativo' : 'Retirado')).toBeInTheDocument()
      expect(within(cartao).getByText('Só um Administrador conecta ou retira o Slack.')).toBeInTheDocument()
      expect(within(cartao).queryByRole('button')).not.toBeInTheDocument()
    })
  }

  it('o Membro vê o Slack não conectado sem botão de Conectar', async () => {
    abrir({ papel: 'member' })

    const cartao = await cartaoDoSlack()
    expect(await within(cartao).findByText('Não conectado')).toBeInTheDocument()
    expect(within(cartao).queryByRole('button')).not.toBeInTheDocument()
  })

  it('confirma a instalação concluída na volta do Slack', async () => {
    abrir({ rota: '/conexoes?conexao=ok&canal=slack', estado: 'ativo' })

    expect(await screen.findByText('Slack conectado.')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  const recusas: [string, string][] = [
    ['slack_diferente', 'Este Workspace já usa outro Slack. Conecte de novo o mesmo Slack da primeira instalação.'],
    ['slack_de_outro_workspace', 'Este Slack já está ligado a outro Workspace da Althius e não pode ser usado aqui.'],
    ['nao_administrador', 'Só um Administrador do Workspace conecta o Slack.'],
    ['recusada', 'Você não autorizou o acesso no Slack. Nada foi conectado.'],
  ]
  for (const [motivo, mensagem] of recusas) {
    it(`explica a recusa da instalação: ${motivo}`, async () => {
      abrir({ rota: `/conexoes?conexao=erro&canal=slack&motivo=${motivo}` })

      expect(await screen.findByText(mensagem)).toBeInTheDocument()
    })
  }
})
