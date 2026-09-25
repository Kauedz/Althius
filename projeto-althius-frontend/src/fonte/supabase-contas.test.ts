import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeContasSupabase } from './supabase-contas'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const ID_DA_ALFA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const ID_DA_BETA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000002'

function contaNoBanco(id: string, nome: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    workspace_id: 'ws-norte',
    name: nome,
    canonical_url: `https://${nome.toLowerCase().replace(/\s+/g, '')}.com.br`,
    domain: `${nome.toLowerCase().replace(/\s+/g, '')}.com.br`,
    legal_identifier: null,
    linkedin_url: null,
    segment: null,
    created_by: MARINA.id,
    last_interaction_at: null,
    created_at: '2026-09-20T12:00:00Z',
    updated_at: '2026-09-20T12:00:00Z',
    ...extra,
  }
}

function fonteDaMarina({ rpcs = {} }: { rpcs?: Record<string, (parametros: Record<string, unknown>) => unknown> } = {}) {
  const tabelas: Record<string, Record<string, unknown>[]> = {
    target_accounts: [
      contaNoBanco(ID_DA_ALFA, 'Alfa', { segment: 'Varejo', last_interaction_at: '2026-09-24T15:00:00Z' }),
      contaNoBanco(ID_DA_BETA, 'Beta', { created_by: 'usuario-outro' }),
    ],
    sales_responsibilities: [
      { workspace_id: 'ws-norte', target_account_id: ID_DA_ALFA, owner_user_id: MARINA.id },
      { workspace_id: 'ws-norte', target_account_id: ID_DA_BETA, owner_user_id: 'usuario-outro' },
    ],
    account_interactions: [],
  }
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), tabelas, rpcs })
  return { fonte: criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => MARINA.id), tabelas }
}

describe('FonteDeContas do Workspace operacional', () => {
  it('lista as Contas-alvo do Workspace com o que o banco guardou, sem completar lacunas', async () => {
    const { fonte } = fonteDaMarina()

    const contas = await fonte.contas()

    expect(contas.map((c) => c.nome)).toEqual(['Alfa', 'Beta'])
    const alfa = contas[0]
    expect(alfa).toMatchObject({
      id: ID_DA_ALFA,
      dominio: 'alfa.com.br',
      siteUrl: 'https://alfa.com.br',
      segmento: 'Varejo',
      totalContatos: 0,
      ultimoContatoEm: '2026-09-24T15:00:00Z',
      sobMinhaResponsabilidade: true,
    })
    expect(alfa.aderencia).toBeUndefined()
    expect(alfa.ultimoSinal).toBeUndefined()
    expect(contas[1].sobMinhaResponsabilidade).toBe(false)
  })

  it('recusa uma Conta-alvo que não existe, inclusive um identificador que não é UUID', async () => {
    const { fonte } = fonteDaMarina()

    await expect(fonte.conta('6f1c2d3e-4a5b-4c6d-8e7f-00000000ffff')).rejects.toThrow('Conta-alvo não encontrada.')
    await expect(fonte.conta('openai')).rejects.toThrow('Conta-alvo não encontrada.')
  })

  it('cadastra a Conta-alvo pelo backend e avisa quem observa', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { fonte, tabelas } = fonteDaMarina({
      rpcs: {
        save_target_account: (parametros) => {
          chamadas.push(parametros)
          const nova = contaNoBanco('6f1c2d3e-4a5b-4c6d-8e7f-000000000003', 'Gama')
          tabelas.target_accounts.push(nova)
          tabelas.sales_responsibilities.push({ workspace_id: 'ws-norte', target_account_id: nova.id, owner_user_id: MARINA.id })
          return nova
        },
      },
    })
    let avisos = 0
    fonte.observar(() => avisos++)

    const conta = await fonte.salvarConta!({ nome: 'Gama', url: 'gama.com.br', segmento: '' })

    expect(chamadas).toEqual([{ p_workspace_id: 'ws-norte', p_name: 'Gama', p_url: 'gama.com.br', p_segment: null }])
    expect(conta).toMatchObject({ nome: 'Gama', sobMinhaResponsabilidade: true })
    expect(avisos).toBe(1)
  })

  it('traduz a recusa do backend a editar uma Conta de outro responsável', async () => {
    const { fonte } = fonteDaMarina({
      rpcs: {
        save_target_account: () => {
          throw Object.assign(new Error('only the responsible seller can edit this target account'), { code: '42501' })
        },
      },
    })

    await expect(fonte.salvarConta!({ nome: 'Beta', url: 'beta.com.br' })).rejects.toThrow(
      'Esta Conta-alvo já existe e só o Vendedor responsável pode editá-la.',
    )
  })

  it('registra a Interação manual e a devolve no histórico da Conta', async () => {
    const { fonte, tabelas } = fonteDaMarina({
      rpcs: {
        register_account_interaction: ({ p_target_account_id, p_kind, p_occurred_at }) => {
          const linha = {
            id: 'interacao-1',
            workspace_id: 'ws-norte',
            target_account_id: p_target_account_id,
            kind: p_kind,
            occurred_at: p_occurred_at ?? '2026-09-25T10:00:00Z',
            source: 'manual',
            recorded_by: MARINA.id,
          }
          tabelas.account_interactions.push(linha)
          return linha
        },
      },
    })

    await fonte.registrarInteracao({ contaId: ID_DA_ALFA, tipo: 'ligacao' })

    expect(await fonte.interacoesDaConta(ID_DA_ALFA)).toEqual([
      { id: 'interacao-1', contaId: ID_DA_ALFA, tipo: 'ligacao', data: '2026-09-25T10:00:00Z', origem: 'Registro manual' },
    ])
  })

  it('não inventa Contatos nem Sinais que o Workspace ainda não guarda', async () => {
    const { fonte } = fonteDaMarina()

    expect(await fonte.contatos()).toEqual([])
    expect(await fonte.contatosDaConta(ID_DA_ALFA)).toEqual([])
    expect(await fonte.sinaisDaConta(ID_DA_ALFA)).toEqual([])
  })
})
