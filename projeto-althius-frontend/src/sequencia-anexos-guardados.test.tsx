import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { criarBancoDeAgentes, rpcsDeAgentes } from '@/test/agentes-no-banco'
import { criarBancoDeConexoes, rpcsDeConexoes } from '@/test/conexoes-no-banco'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { anexosDisponiveis, criarFonteDeSequenciasSupabase } from '@/fonte/supabase-sequencias'
import type { StepSequencia } from '@/fonte/sequencias-tipos'

// Anexos persistentes e privados nos passos (canais-10), no Workspace operacional.

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const WORKSPACE_PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }
const LIMITES = [{ channel: 'email', max_bytes: 10485760, max_files: 5, mime_types: ['image/png'] }]

afterEach(() => {
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})

function participacao(workspaceId: string) {
  return { workspace_id: workspaceId, role: 'admin', user_id: MARINA.id, active: true }
}

function linhaDaSequencia() {
  return {
    id: 'sequencia-da-marina',
    workspace_id: 'ws-norte',
    target_account_id: 'conta-do-norte',
    owner_user_id: MARINA.id,
    status: 'ativa',
    public_summary: { totalParticipantes: 1, totalSteps: 1, passoAtual: 0 },
    created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-21T12:00:00Z',
  }
}

const PASSO: StepSequencia = {
  id: 'passo-1', ordem: 1, canal: 'email', contatoId: 'contato-1', delayDiasUteis: 0,
  titulo: 'Primeiro contato', assunto: 'Olá', corpo: 'Oi!',
}

/** O banco em memória: o documento gravado volta na próxima leitura, como numa nova sessão. */
function bancoDaSequencia() {
  const banco = { documento: { participantesIds: ['contato-1'], steps: [PASSO] } as Record<string, unknown> }
  const linha = linhaDaSequencia()
  const rpcs = {
    get_owned_sequence: () => [{ ...linha, public_summary: { ...linha.public_summary, _document: banco.documento } }],
    update_owned_sequence: ({ p_private_document }: Record<string, unknown>) => {
      if (p_private_document) banco.documento = p_private_document as Record<string, unknown>
      return null
    },
    list_sequence_step_sends: () => [],
    list_received_emails: () => [],
    get_sequence_authorization: () => [],
  }
  return { banco, linha, rpcs }
}

function funcaoDeAnexos() {
  const pedidos: unknown[] = []
  return {
    pedidos,
    funcoes: {
      'sequence-attachments': (corpo: unknown) => {
        pedidos.push(corpo)
        if (corpo instanceof FormData) {
          return { status: 201, corpo: { id: 'anexo-1', tipo: 'imagem', mime: 'image/png', tamanho: 3 } }
        }
        return { corpo: { url: 'https://storage.test/sign/anexo-1?token=curto', expiresIn: 120 } }
      },
    },
  }
}

function abrirASequencia(
  { banco, linha, rpcs }: ReturnType<typeof bancoDaSequencia>,
  funcoes: Record<string, (corpo: unknown) => { status?: number; corpo: unknown }>,
  comAnexos = true,
) {
  window.history.replaceState(null, '', '/sequencias/sequencia-da-marina')
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', 'ws-norte')
  const tabelas: Record<string, Record<string, unknown>[]> = {
    workspace_memberships: [participacao('ws-norte')],
    sequences: [linha],
  }
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas,
    rpcs: {
      bootstrap_personal_workspace: () => {
        const workspaces = (tabelas.workspaces ??= [])
        if (!workspaces.some((w) => w.id === WORKSPACE_PESSOAL.id)) workspaces.push(WORKSPACE_PESSOAL)
        if (!tabelas.workspace_memberships.some((p) => p.workspace_id === WORKSPACE_PESSOAL.id)) {
          tabelas.workspace_memberships.push(participacao(WORKSPACE_PESSOAL.id))
        }
        return WORKSPACE_PESSOAL
      },
      ...rpcsDeAgentes(criarBancoDeAgentes()),
      ...rpcsDeConexoes(criarBancoDeConexoes()),
      ...rpcs,
      ...(comAnexos ? { sequence_attachment_limits: () => LIMITES } : {}),
    },
    funcoes: funcoes as never,
  })
  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { usuario, banco }
}

describe('Anexos guardados no passo da Sequência (canais-10)', () => {
  it('o módulo só aparece quando o backend diz que está ligado', async () => {
    const vazio = criarSupabaseFalso({ sessao: sessaoDe(MARINA), rpcs: { sequence_attachment_limits: () => [] } })
    const ligado = criarSupabaseFalso({ sessao: sessaoDe(MARINA), rpcs: { sequence_attachment_limits: () => LIMITES } })
    const semFuncao = criarSupabaseFalso({ sessao: sessaoDe(MARINA) })
    expect(await anexosDisponiveis(vazio.cliente)).toBe(false)
    expect(await anexosDisponiveis(ligado.cliente)).toBe(true)
    expect(await anexosDisponiveis(semFuncao.cliente)).toBe(false)
  })

  it('a Fonte sobe o arquivo pela Edge Function e o documento guarda só o id, nunca um endereço', async () => {
    const db = bancoDaSequencia()
    const funcoes = funcaoDeAnexos()
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(MARINA),
      tabelas: { sequences: [db.linha] },
      rpcs: db.rpcs,
      funcoes: funcoes.funcoes as never,
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => MARINA.id)

    const anexo = await fonte.anexarArquivo!('sequencia-da-marina', 'passo-1', new File([new Uint8Array([1, 2, 3])], 'print.png'))
    expect(anexo).toEqual({ id: 'anexo-1', tipo: 'imagem', nome: 'print.png', mime: 'image/png', tamanho: 3 })
    const formulario = funcoes.pedidos[0] as FormData
    expect(formulario.get('sequenceId')).toBe('sequencia-da-marina')
    expect(formulario.get('stepId')).toBe('passo-1')

    await fonte.atualizarDocumento('sequencia-da-marina', { steps: [{ ...PASSO, anexos: [{ ...anexo, url: 'blob:x' }] }] })
    const [passo] = (db.banco.documento.steps as StepSequencia[])
    expect(passo.anexos).toEqual([{ id: 'anexo-1', tipo: 'imagem', nome: 'print.png', mime: 'image/png', tamanho: 3 }])

    expect(await fonte.urlDoAnexoDoPasso!('anexo-1')).toBe('https://storage.test/sign/anexo-1?token=curto')
    expect(funcoes.pedidos[1]).toEqual({ action: 'url', attachmentId: 'anexo-1' })
  })

  it('a recusa do backend (tipo, tamanho, canal) aparece em português e nada vai para o documento', async () => {
    const db = bancoDaSequencia()
    const { cliente } = criarSupabaseFalso({
      sessao: sessaoDe(MARINA),
      tabelas: { sequences: [db.linha] },
      rpcs: db.rpcs,
      funcoes: {
        'sequence-attachments': () => ({ status: 400, corpo: { error: 'O arquivo passa do tamanho que este canal aceita.' } }),
      },
    })
    const fonte = criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => MARINA.id)
    await expect(fonte.anexarArquivo!('sequencia-da-marina', 'passo-1', new File(['x'], 'grande.mp4'))).rejects.toThrow(
      'O arquivo passa do tamanho que este canal aceita.',
    )
    expect((db.banco.documento.steps as StepSequencia[])[0].anexos).toBeUndefined()
  })

  it('a Vendedora responsável anexa um print; ele fica no passo e continua lá numa nova sessão', async () => {
    const db = bancoDaSequencia()
    const funcoes = funcaoDeAnexos()
    const { usuario } = abrirASequencia(db, funcoes.funcoes)

    const campo = await screen.findByLabelText('Anexar imagem')
    expect(screen.getByText(/fica guardado no Workspace, só você o vê/)).toBeInTheDocument()
    await usuario.upload(campo, new File([new Uint8Array([1, 2, 3])], 'print.png', { type: 'image/png' }))

    await waitFor(() => expect((db.banco.documento.steps as StepSequencia[])[0].anexos).toEqual([
      { id: 'anexo-1', tipo: 'imagem', nome: 'print.png', mime: 'image/png', tamanho: 3 },
    ]))
    expect(await screen.findByRole('img', { name: 'print.png' })).toHaveAttribute('src', 'https://storage.test/sign/anexo-1?token=curto')

    // Nova sessão: o mesmo documento volta do banco, e a miniatura pede um novo endereço temporário.
    cleanup()
    const outra = funcaoDeAnexos()
    abrirASequencia(db, outra.funcoes)
    expect(await screen.findByRole('img', { name: 'print.png' })).toHaveAttribute('src', 'https://storage.test/sign/anexo-1?token=curto')
    expect(outra.pedidos).toEqual([{ action: 'url', attachmentId: 'anexo-1' }])
  })

  it('a recusa do backend aparece no passo, e o arquivo não entra', async () => {
    const db = bancoDaSequencia()
    const { usuario } = abrirASequencia(db, {
      'sequence-attachments': () => ({ status: 400, corpo: { error: 'Este tipo de arquivo não pode ser enviado por este canal.' } }),
    })
    await usuario.upload(await screen.findByLabelText('Anexar imagem'), new File(['x'], 'a.png', { type: 'image/png' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este tipo de arquivo não pode ser enviado por este canal.')
    expect((db.banco.documento.steps as StepSequencia[])[0].anexos).toBeUndefined()
  })

  it('com o módulo desligado, a tela continua dizendo que os anexos não estão disponíveis', async () => {
    abrirASequencia(bancoDaSequencia(), funcaoDeAnexos().funcoes, false)
    expect(await screen.findByText('Anexos ainda não estão disponíveis neste Workspace.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Anexar imagem')).not.toBeInTheDocument()
  })
})
