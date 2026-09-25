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
    target_contacts: [],
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

  it('não inventa Contatos nem Sinais que o Workspace não guarda', async () => {
    const { fonte } = fonteDaMarina()

    expect(await fonte.contatos()).toEqual([])
    expect(await fonte.contatosDaConta(ID_DA_ALFA)).toEqual([])
    expect(await fonte.sinaisDaConta(ID_DA_ALFA)).toEqual([])
  })
})

const ID_DA_MARIA = '7a1c2d3e-4a5b-4c6d-8e7f-000000000001'
const ID_DO_RUI = '7a1c2d3e-4a5b-4c6d-8e7f-000000000002'

/** Um Contato com Vínculo ativo, como a visão `target_contacts` o devolve. */
function contatoNoBanco(id: string, contaId: string, nome: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    workspace_id: 'ws-norte',
    target_account_id: contaId,
    link_id: `vinculo-${id}-${contaId}`,
    name: nome,
    role: null,
    email: null,
    phone: null,
    whatsapp: null,
    linkedin: null,
    linkedin_identity: null,
    is_real: true,
    last_interaction_at: null,
    ...extra,
  }
}

describe('Contatos e Vínculos do Contato no Workspace operacional', () => {
  it('lê os Contatos com Vínculo ativo, um por Conta onde atuam, e os conta nas Contas', async () => {
    const { fonte, tabelas } = fonteDaMarina()
    tabelas.target_contacts.push(
      contatoNoBanco(ID_DA_MARIA, ID_DA_ALFA, 'Maria Souza', {
        role: 'CFO', email: 'maria@alfa.com.br', phone: '+5511988887777', whatsapp: '+5511988887777',
        linkedin: 'https://www.linkedin.com/in/maria-souza', last_interaction_at: '2026-09-24T15:00:00Z',
      }),
      contatoNoBanco(ID_DA_MARIA, ID_DA_BETA, 'Maria Souza', { role: 'CFO', email: 'maria@alfa.com.br' }),
      contatoNoBanco(ID_DO_RUI, ID_DA_ALFA, 'Rui'),
    )

    const daAlfa = await fonte.contatosDaConta(ID_DA_ALFA)

    expect(daAlfa).toEqual([
      {
        id: ID_DA_MARIA, contaId: ID_DA_ALFA, nome: 'Maria Souza', cargo: 'CFO',
        canais: { email: true, telefone: true, linkedin: true },
        email: 'maria@alfa.com.br', whatsapp: '+5511988887777', linkedin: 'https://www.linkedin.com/in/maria-souza',
        ultimoContatoEm: '2026-09-24T15:00:00Z', ehReal: true,
      },
      // Sem e-mail, telefone, LinkedIn nem foto: a tela usa os fallbacks.
      { id: ID_DO_RUI, contaId: ID_DA_ALFA, nome: 'Rui', canais: { email: false, telefone: false, linkedin: false }, ehReal: true },
    ])
    expect((await fonte.contatos()).map((c) => [c.nome, c.contaId])).toEqual([
      ['Maria Souza', ID_DA_ALFA], ['Maria Souza', ID_DA_BETA], ['Rui', ID_DA_ALFA],
    ])
    const [alfa, beta] = await fonte.contas()
    expect(alfa).toMatchObject({ totalContatos: 2, previaContatos: [{ nome: 'Maria Souza' }, { nome: 'Rui' }] })
    expect(beta).toMatchObject({ totalContatos: 1 })
    expect(await fonte.conta(ID_DA_ALFA)).toMatchObject({ totalContatos: 2 })
  })

  it('cadastra o Contato na Conta pelo backend e avisa quem observa', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { fonte, tabelas } = fonteDaMarina({
      rpcs: {
        create_contact: (parametros) => {
          chamadas.push(parametros)
          tabelas.target_contacts.push(contatoNoBanco(ID_DA_MARIA, ID_DA_ALFA, 'Maria Souza', { email: 'maria@alfa.com.br' }))
          return { id: ID_DA_MARIA, workspace_id: 'ws-norte', name: 'Maria Souza', email: 'maria@alfa.com.br' }
        },
      },
    })
    let avisos = 0
    fonte.observar(() => avisos++)

    const contato = await fonte.salvarContato!({ contaId: ID_DA_ALFA, nome: ' Maria Souza ', email: 'maria@alfa.com.br', cargo: '' })

    expect(chamadas).toEqual([{
      p_target_account_id: ID_DA_ALFA, p_name: 'Maria Souza', p_role: null,
      p_email: 'maria@alfa.com.br', p_phone: null, p_linkedin: null,
    }])
    expect(contato).toMatchObject({ id: ID_DA_MARIA, contaId: ID_DA_ALFA, canais: { email: true } })
    expect(avisos).toBe(1)
  })

  it('traduz as recusas do backend ao cadastrar um Contato', async () => {
    const recusas = [
      [Object.assign(new Error('only the responsible seller or an admin can manage contacts of this target account'), { code: '42501' }),
        'Só o Vendedor responsável pela Conta-alvo ou um Administrador pode cadastrar e editar os Contatos dela.'],
      [Object.assign(new Error('duplicate key value violates unique constraint "contacts_email_per_workspace"'), { code: '23505' }),
        'Já existe um Contato com este e-mail neste Workspace.'],
      [Object.assign(new Error('invalid whatsapp number: must have 8 to 15 digits'), { code: '22023' }),
        'Informe um telefone com DDD ou código do país.'],
    ] as const
    for (const [recusa, mensagem] of recusas) {
      const { fonte } = fonteDaMarina({ rpcs: { create_contact: () => { throw recusa } } })
      await expect(fonte.salvarContato!({ contaId: ID_DA_BETA, nome: 'Joana' })).rejects.toThrow(mensagem)
    }
  })

  it('atualiza os destinos do Contato substituindo os três canais', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { fonte, tabelas } = fonteDaMarina({
      rpcs: {
        update_contact: (parametros) => {
          chamadas.push(parametros)
          return { id: ID_DA_MARIA }
        },
      },
    })
    tabelas.target_contacts.push(contatoNoBanco(ID_DA_MARIA, ID_DA_ALFA, 'Maria Souza', { email: 'maria@alfa.com.br', whatsapp: '+5511988887777' }))

    const contato = await fonte.atualizarDestinosContato(ID_DA_MARIA, { email: 'maria@alfa.com.br', whatsapp: '(11) 98888-7777' })

    expect(chamadas).toEqual([{
      p_contact_id: ID_DA_MARIA, p_email: 'maria@alfa.com.br', p_phone: '(11) 98888-7777', p_linkedin: '',
    }])
    expect(contato).toMatchObject({ id: ID_DA_MARIA, whatsapp: '+5511988887777' })
  })

  it('vincula o Contato a outra Conta e encerra o Vínculo pelo backend', async () => {
    const chamadas: [string, Record<string, unknown>][] = []
    const { fonte } = fonteDaMarina({
      rpcs: {
        link_contact: (parametros) => { chamadas.push(['link_contact', parametros]); return {} },
        end_contact_link: (parametros) => { chamadas.push(['end_contact_link', parametros]); return {} },
      },
    })
    let avisos = 0
    fonte.observar(() => avisos++)

    await fonte.vincularContato!(ID_DA_MARIA, ID_DA_BETA)
    await fonte.encerrarVinculo!(ID_DA_MARIA, ID_DA_ALFA)

    expect(chamadas).toEqual([
      ['link_contact', { p_contact_id: ID_DA_MARIA, p_target_account_id: ID_DA_BETA }],
      ['end_contact_link', { p_contact_id: ID_DA_MARIA, p_target_account_id: ID_DA_ALFA }],
    ])
    expect(avisos).toBe(2)
  })

  it('registra a Interação com o Contato e a mantém na Conta onde aconteceu', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { fonte, tabelas } = fonteDaMarina({
      rpcs: {
        register_account_interaction: (parametros) => {
          chamadas.push(parametros)
          const linha = {
            id: 'interacao-1', workspace_id: 'ws-norte', target_account_id: parametros.p_target_account_id,
            contact_id: parametros.p_contact_id, kind: parametros.p_kind, occurred_at: '2026-09-25T10:00:00Z',
          }
          tabelas.account_interactions.push(linha)
          return linha
        },
      },
    })

    await fonte.registrarInteracao({ contaId: ID_DA_ALFA, contatoId: ID_DA_MARIA, tipo: 'reuniao' })

    expect(chamadas[0]).toMatchObject({ p_contact_id: ID_DA_MARIA })
    expect(await fonte.interacoesDaConta(ID_DA_ALFA)).toEqual([
      { id: 'interacao-1', contaId: ID_DA_ALFA, contatoId: ID_DA_MARIA, tipo: 'reuniao', data: '2026-09-25T10:00:00Z', origem: 'Registro manual' },
    ])
  })
})
