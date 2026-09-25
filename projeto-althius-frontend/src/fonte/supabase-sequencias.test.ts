import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import type { StepSequencia } from './sequencias-tipos'
import { criarFonteDeSequenciasSupabase } from './supabase-sequencias'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

const PASSO: StepSequencia = {
  id: 'passo-1',
  ordem: 1,
  canal: 'email',
  contatoId: 'contato-1',
  delayDiasUteis: 0,
  titulo: 'Primeiro contato',
  assunto: 'Olá',
  corpo: 'Oi!',
}

/** A Sequência da sessão num backend em memória: a RPC de atualização grava o documento que a de leitura devolve. */
function sequenciaDaMarina() {
  const linha = {
    id: 'sequencia-da-marina',
    workspace_id: 'ws-norte',
    target_account_id: 'conta-do-norte',
    owner_user_id: MARINA.id,
    status: 'ativa',
    public_summary: { totalParticipantes: 1, totalSteps: 1, passoAtual: 0 },
    created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-21T12:00:00Z',
  }
  let documento: Record<string, unknown> = { participantesIds: ['contato-1'], steps: [PASSO], passoAtual: 0 }
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: { sequences: [linha] },
    rpcs: {
      get_owned_sequence: () => [{ ...linha, public_summary: { ...linha.public_summary, _document: documento } }],
      update_owned_sequence: ({ p_private_document }) => {
        documento = p_private_document as Record<string, unknown>
        return null
      },
    },
  })
  return criarFonteDeSequenciasSupabase(cliente, () => 'ws-norte', () => MARINA.id)
}

describe('FonteDeSequencias do Workspace operacional', () => {
  it('guarda a edição do documento do Vendedor responsável', async () => {
    const fonte = sequenciaDaMarina()

    await fonte.atualizarDocumento('sequencia-da-marina', { steps: [{ ...PASSO, titulo: 'Abertura' }] })

    expect((await fonte.sequencia('sequencia-da-marina')).steps[0].titulo).toBe('Abertura')
  })

  it('recusa anexos no documento enquanto o Workspace não guarda arquivos, sem alterar nada', async () => {
    const fonte = sequenciaDaMarina()
    const comAnexo = { ...PASSO, titulo: 'Abertura', anexos: [{ tipo: 'imagem' as const, nome: 'print.png', url: 'blob:http://localhost/1' }] }

    await expect(fonte.atualizarDocumento('sequencia-da-marina', { steps: [comAnexo] })).rejects.toThrow(
      'Anexos ainda não estão disponíveis neste Workspace.',
    )

    const [passo] = (await fonte.sequencia('sequencia-da-marina')).steps
    expect(passo.titulo).toBe('Primeiro contato')
    expect(passo.anexos).toBeUndefined()
  })
})
