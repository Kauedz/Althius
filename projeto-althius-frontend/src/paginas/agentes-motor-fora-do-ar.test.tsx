import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes, type BancoDeAgentes } from '@/test/agentes-no-banco'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const NORTE = { id: 'ws-norte', kind: 'empresa', name: 'Norte' }

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

/** A Marina abre o Norte, onde tem o papel dado, sobre o `banco` de Agentes: outra sessão com o mesmo banco reencontra o salvo. */
function abrir(
  banco: BancoDeAgentes,
  rota: string,
  papel: 'admin' | 'member' = 'admin',
  outrasRpcs: Record<string, (parametros: Record<string, unknown>) => unknown> = {},
) {
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', NORTE.id)
  window.history.replaceState(null, '', rota)
  const tabelas: Record<string, Record<string, unknown>[]> = {
    workspaces: [PESSOAL, NORTE],
    workspace_memberships: [
      { workspace_id: PESSOAL.id, role: 'admin', user_id: MARINA.id, active: true },
      { workspace_id: NORTE.id, role: papel, user_id: MARINA.id, active: true },
    ],
  }
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas,
    funcoes: { 'agent-conversation': () => ({ status: 200, corpo: { available: false, motivo: 'motor_fora_do_ar' } }) },
    rpcs: { bootstrap_personal_workspace: () => PESSOAL, list_owned_sender_accounts: () => [], ...rpcsDeAgentes(banco, papel), ...outrasRpcs },
  })
  const servicos = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos.servicos} />)
  return { usuario }
}

describe('Conversas com o motor fora do ar', () => {
  it.each(['/', '/conversa'])('explica a indisponibilidade em %s sem composer nem fornecedor', async (rota) => {
    abrir(criarBancoDeAgentes(), rota)
    expect(await screen.findByText('O motor dos Agentes está fora do ar agora. Tente de novo em alguns minutos.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/Hermes|OpenAI|Anthropic|Ele ainda não foi conectado/)).not.toBeInTheDocument()
  })
})
