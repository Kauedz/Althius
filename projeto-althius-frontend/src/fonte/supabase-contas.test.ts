import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, type OpcoesDoSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
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
    await expect(fonte.sinaisDaConta(ID_DA_ALFA)).rejects.toThrow('Não foi possível carregar os Sinais da Conta.')
  })
})

const ID_DA_MARIA = '7a1c2d3e-4a5b-4c6d-8e7f-000000000001'
const ID_DO_RUI = '7a1c2d3e-4a5b-4c6d-8e7f-000000000002'
const ID_DO_LUIZ = '7a1c2d3e-4a5b-4c6d-8e7f-000000000003'

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
        ultimoContatoEm: '2026-09-24T15:00:00Z', ehReal: true, podeArquivar: true,
      },
      // Sem e-mail, telefone, LinkedIn nem foto: a tela usa os fallbacks.
      { id: ID_DO_RUI, contaId: ID_DA_ALFA, nome: 'Rui', canais: { email: false, telefone: false, linkedin: false }, ehReal: true, podeEditar: true, podeArquivar: true },
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

  it('só oferece editar o Contato a quem responde por todas as Contas dele, e vincular a Conta sua não concede edição', async () => {
    const { fonte, tabelas } = fonteDaMarina()
    tabelas.target_contacts.push(
      contatoNoBanco(ID_DA_MARIA, ID_DA_ALFA, 'Maria Souza'),
      // A Maria também atua na Beta, que é de outro Vendedor.
      contatoNoBanco(ID_DA_MARIA, ID_DA_BETA, 'Maria Souza'),
      contatoNoBanco(ID_DO_RUI, ID_DA_ALFA, 'Rui'),
      contatoNoBanco(ID_DO_LUIZ, ID_DA_BETA, 'Luiz Beta'),
    )

    const editaveis = (contatos: { nome: string; podeEditar?: boolean }[]) => contatos.map((c) => [c.nome, c.podeEditar])
    expect(editaveis(await fonte.contatosDaConta(ID_DA_ALFA))).toEqual([['Maria Souza', undefined], ['Rui', true]])
    expect(editaveis(await fonte.contatosDaConta(ID_DA_BETA))).toEqual([['Luiz Beta', undefined], ['Maria Souza', undefined]])
    // Arquivar segue o Vínculo da linha: a Maria na Alfa a Marina pode arquivar, mesmo sem poder editá-la.
    expect((await fonte.contatosDaConta(ID_DA_ALFA))[0]).toMatchObject({ podeArquivar: true })
  })

  it('o Administrador edita qualquer Contato', async () => {
    const tabelas: Record<string, Record<string, unknown>[]> = {
      sales_responsibilities: [{ workspace_id: 'ws-norte', target_account_id: ID_DA_BETA, owner_user_id: 'usuario-outro' }],
      target_contacts: [contatoNoBanco(ID_DO_LUIZ, ID_DA_BETA, 'Luiz Beta')],
    }
    const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), tabelas })
    const fonte = criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => MARINA.id, () => true)

    expect((await fonte.contatos())[0]).toMatchObject({ podeEditar: true })
  })

  it('edita o Contato pelo backend, enviando os cinco campos, e avisa quem observa', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { fonte, tabelas } = fonteDaMarina({
      rpcs: {
        update_contact: (parametros) => {
          chamadas.push(parametros)
          Object.assign(tabelas.target_contacts[0], { name: 'Maria S. Souza', role: 'Diretora', email: 'maria.s@alfa.com.br' })
          return { id: ID_DA_MARIA }
        },
      },
    })
    tabelas.target_contacts.push(contatoNoBanco(ID_DA_MARIA, ID_DA_ALFA, 'Maria Souza', { role: 'CFO', email: 'maria@alfa.com.br' }))
    let avisos = 0
    fonte.observar(() => avisos++)

    const contato = await fonte.editarContato!(ID_DA_MARIA, {
      nome: ' Maria S. Souza ', cargo: 'Diretora ', email: ' maria.s@alfa.com.br', whatsapp: '(11) 98888-7777', linkedin: 'linkedin.com/in/maria-souza',
    })

    expect(chamadas).toEqual([{
      p_contact_id: ID_DA_MARIA, p_name: 'Maria S. Souza', p_role: 'Diretora', p_email: 'maria.s@alfa.com.br',
      p_phone: '(11) 98888-7777', p_linkedin: 'linkedin.com/in/maria-souza',
    }])
    expect(contato).toMatchObject({ id: ID_DA_MARIA, nome: 'Maria S. Souza', cargo: 'Diretora', podeEditar: true })
    expect(avisos).toBe(1)
  })

  it('editar com e-mail, telefone ou LinkedIn esvaziados manda texto vazio, que apaga o canal; campo ausente manda nulo, que o mantém', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { fonte, tabelas } = fonteDaMarina({ rpcs: { update_contact: (parametros) => void chamadas.push(parametros) } })
    tabelas.target_contacts.push(contatoNoBanco(ID_DA_MARIA, ID_DA_ALFA, 'Maria Souza', { email: 'maria@alfa.com.br' }))

    await fonte.editarContato!(ID_DA_MARIA, { nome: 'Maria Souza', cargo: '', email: '  ', whatsapp: '', linkedin: '' })
    await fonte.editarContato!(ID_DA_MARIA, { nome: 'Maria Souza' })

    expect(chamadas).toEqual([
      { p_contact_id: ID_DA_MARIA, p_name: 'Maria Souza', p_role: '', p_email: '', p_phone: '', p_linkedin: '' },
      { p_contact_id: ID_DA_MARIA, p_name: 'Maria Souza', p_role: null, p_email: null, p_phone: null, p_linkedin: null },
    ])
  })

  it('recusa o nome vazio sem chamar o banco', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { fonte } = fonteDaMarina({ rpcs: { update_contact: (parametros) => void chamadas.push(parametros) } })

    await expect(fonte.editarContato!(ID_DA_MARIA, { nome: '   ', email: 'maria@alfa.com.br' })).rejects.toThrow('Informe o nome do Contato.')

    expect(chamadas).toEqual([])
  })

  it('traduz as recusas do banco ao editar: canal de outro Contato, sem permissão e Contato que sumiu', async () => {
    const recusas = [
      [Object.assign(new Error('duplicate key value violates unique constraint "contacts_email_per_workspace"'), { code: '23505' }),
        'Já existe um Contato com este e-mail neste Workspace.'],
      [Object.assign(new Error('duplicate key value violates unique constraint "contacts_phone_per_workspace"'), { code: '23505' }),
        'Já existe um Contato com este telefone neste Workspace.'],
      [Object.assign(new Error('duplicate key value violates unique constraint "contacts_linkedin_per_workspace"'), { code: '23505' }),
        'Já existe um Contato com este LinkedIn neste Workspace.'],
      [Object.assign(new Error('only the responsible seller or an admin can edit this contact'), { code: '42501' }),
        'Só um Administrador ou o Vendedor responsável por todas as Contas deste Contato pode editá-lo.'],
      [Object.assign(new Error('invalid email address format'), { code: '22023' }), 'Informe um e-mail válido.'],
      [Object.assign(new Error('contact not found'), { code: 'P0002' }), 'Contato não encontrado nesta Conta-alvo.'],
    ] as const
    for (const [recusa, mensagem] of recusas) {
      const { fonte } = fonteDaMarina({ rpcs: { update_contact: () => { throw recusa } } })
      await expect(fonte.editarContato!(ID_DA_MARIA, { nome: 'Maria Souza', email: 'x@alfa.com.br' })).rejects.toThrow(mensagem)
    }
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

describe('Foto pública do Contato no Workspace operacional', () => {
  const FOTO = 'https://media.licdn.com/dms/image/maria.jpg'

  /** A Alfa com a Maria (com LinkedIn) e o Rui, e o estado das fotos que o banco guardou. */
  function fonteComFotos(fotos: Record<string, unknown>[], funcoes: OpcoesDoSupabaseFalso['funcoes'] = {}) {
    const tabelas: Record<string, Record<string, unknown>[]> = {
      target_accounts: [contaNoBanco(ID_DA_ALFA, 'Alfa')],
      sales_responsibilities: [{ workspace_id: 'ws-norte', target_account_id: ID_DA_ALFA, owner_user_id: MARINA.id }],
      target_contacts: [
        contatoNoBanco(ID_DA_MARIA, ID_DA_ALFA, 'Maria Souza', { linkedin: 'https://www.linkedin.com/in/maria-souza' }),
        contatoNoBanco(ID_DO_RUI, ID_DA_ALFA, 'Rui'),
      ],
      contact_photo_status: fotos,
    }
    const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), tabelas, funcoes })
    return criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => MARINA.id)
  }

  it('entrega a foto que ainda vale e a leva à prévia de Contatos da Conta', async () => {
    const fonte = fonteComFotos([
      { workspace_id: 'ws-norte', contact_id: ID_DA_MARIA, status: 'found', photo_url: FOTO },
    ])

    const [maria, rui] = await fonte.contatosDaConta(ID_DA_ALFA)

    expect(maria).toMatchObject({ nome: 'Maria Souza', foto: FOTO })
    expect(maria.fotoConsulta).toBeUndefined()
    expect(rui.foto).toBeUndefined()
    expect((await fonte.contas())[0].previaContatos).toEqual([{ nome: 'Maria Souza', foto: FOTO }, { nome: 'Rui' }])
  })

  it('sem foto que valha, o Contato fica sem foto e o estado da última busca explica o motivo', async () => {
    const fonte = fonteComFotos([
      // A visão devolve a URL nula quando ela venceu; a busca anterior tinha dado certo.
      { workspace_id: 'ws-norte', contact_id: ID_DA_MARIA, status: 'found', photo_url: null },
      { workspace_id: 'ws-norte', contact_id: ID_DO_RUI, status: 'failed', photo_url: null },
    ])

    const [maria, rui] = await fonte.contatosDaConta(ID_DA_ALFA)

    expect(maria.foto).toBeUndefined()
    expect(maria.fotoConsulta).toBeUndefined()
    expect(rui).toMatchObject({ nome: 'Rui', fotoConsulta: 'falhou' })
    const [semFoto] = await fonteComFotos([
      { workspace_id: 'ws-norte', contact_id: ID_DA_MARIA, status: 'not_found', photo_url: null },
    ]).contatosDaConta(ID_DA_ALFA)
    expect(semFoto.fotoConsulta).toBe('nao-encontrada')
  })

  it('não mostra a foto de um Contato de outro Workspace', async () => {
    const fonte = fonteComFotos([
      { workspace_id: 'ws-sul', contact_id: ID_DA_MARIA, status: 'found', photo_url: FOTO },
    ])

    expect((await fonte.contatosDaConta(ID_DA_ALFA))[0].foto).toBeUndefined()
  })

  it('pede a busca pela Edge Function só com o Contato, sem token nem URL do LinkedIn, e avisa quem observa', async () => {
    const pedidos: Record<string, unknown>[] = []
    const fonte = fonteComFotos([], {
      'contact-photo-lookup': (corpo) => {
        pedidos.push(corpo)
        return { corpo: { status: 'found' } }
      },
    })
    let avisos = 0
    fonte.observar(() => avisos++)

    await fonte.consultarFotoDoContato!(ID_DA_MARIA)

    expect(pedidos).toEqual([{ contactId: ID_DA_MARIA }])
    expect(avisos).toBe(1)
  })

  it('a recusa da função chega em palavras do produto, e uma função fora do ar é explicada', async () => {
    const recusada = fonteComFotos([], {
      'contact-photo-lookup': () => ({ status: 429, corpo: { error: 'Este Contato já teve buscas de foto há pouco.' } }),
    })
    await expect(recusada.consultarFotoDoContato!(ID_DA_MARIA)).rejects.toThrow('Este Contato já teve buscas de foto há pouco.')

    const naoPublicada = fonteComFotos([], { 'contact-photo-lookup': () => ({ status: 404, corpo: { code: 'NOT_FOUND' } }) })
    await expect(naoPublicada.consultarFotoDoContato!(ID_DA_MARIA)).rejects.toThrow(
      'A Edge Function contact-photo-lookup não está publicada neste projeto.',
    )
  })
})

describe('Vários e-mails e telefones por Contato no Workspace operacional', () => {
  const canal = (contato: string, channel: string, ordinal: number, value: string, label: string, whatsapp: boolean | null) => ({
    contact_id: contato, channel, ordinal, value, label, whatsapp,
  })

  it('lê as listas de cada Contato de uma vez, o principal primeiro, com rótulo, tipo e marca de WhatsApp', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { fonte, tabelas } = fonteDaMarina({
      rpcs: {
        list_contact_channels: (parametros) => {
          chamadas.push(parametros)
          return [
            canal(ID_DA_MARIA, 'email', 1, 'maria@alfa.com.br', 'trabalho', null),
            canal(ID_DA_MARIA, 'email', 2, 'maria.s@gmail.com', 'pessoal', null),
            canal(ID_DA_MARIA, 'phone', 1, '+5511988887777', 'celular', true),
            canal(ID_DA_MARIA, 'phone', 2, '+551133334444', 'fixo', false),
          ]
        },
      },
    })
    tabelas.target_contacts.push(
      contatoNoBanco(ID_DA_MARIA, ID_DA_ALFA, 'Maria Souza', { email: 'maria@alfa.com.br', whatsapp: '+5511988887777' }),
      contatoNoBanco(ID_DA_MARIA, ID_DA_BETA, 'Maria Souza', { email: 'maria@alfa.com.br' }),
      contatoNoBanco(ID_DO_RUI, ID_DA_ALFA, 'Rui'),
    )

    const [maria, rui] = await fonte.contatosDaConta(ID_DA_ALFA)

    expect(chamadas).toEqual([{ p_contact_ids: [ID_DA_MARIA, ID_DO_RUI] }])
    expect(maria).toMatchObject({
      email: 'maria@alfa.com.br',
      whatsapp: '+5511988887777',
      emails: [{ valor: 'maria@alfa.com.br', rotulo: 'trabalho' }, { valor: 'maria.s@gmail.com', rotulo: 'pessoal' }],
      telefones: [
        { valor: '+5511988887777', tipo: 'celular', whatsapp: true },
        { valor: '+551133334444', tipo: 'fixo', whatsapp: false },
      ],
    })
    // Um Contato sem canais não ganha listas: a tela o trata como só com o principal.
    expect(rui.emails).toBeUndefined()
  })

  it('troca as listas inteiras pelo backend, na ordem da tela, e avisa quem observa', async () => {
    const chamadas: Record<string, unknown>[] = []
    const { fonte, tabelas } = fonteDaMarina({ rpcs: { set_contact_channels: (parametros) => void chamadas.push(parametros) } })
    tabelas.target_contacts.push(contatoNoBanco(ID_DA_MARIA, ID_DA_ALFA, 'Maria Souza', { email: 'maria@alfa.com.br' }))
    let avisos = 0
    fonte.observar(() => avisos++)

    const contato = await fonte.salvarCanaisDoContato!(ID_DA_MARIA, {
      emails: [{ valor: ' maria.s@gmail.com ', rotulo: 'pessoal' }, { valor: 'maria@alfa.com.br', rotulo: 'trabalho' }],
      telefones: [{ valor: '(11) 3333-4444', tipo: 'fixo', whatsapp: false }],
    })

    expect(chamadas).toEqual([{
      p_contact_id: ID_DA_MARIA,
      p_emails: [{ value: 'maria.s@gmail.com', label: 'pessoal' }, { value: 'maria@alfa.com.br', label: 'trabalho' }],
      p_phones: [{ value: '(11) 3333-4444', kind: 'fixo', whatsapp: false }],
    }])
    expect(contato).toMatchObject({ id: ID_DA_MARIA })
    expect(avisos).toBe(1)
  })

  it('a leitura das listas que falha não derruba a lista de Contatos: eles vêm só com o principal', async () => {
    const { fonte, tabelas } = fonteDaMarina()
    tabelas.target_contacts.push(contatoNoBanco(ID_DA_MARIA, ID_DA_ALFA, 'Maria Souza', { email: 'maria@alfa.com.br' }))

    const [maria] = await fonte.contatosDaConta(ID_DA_ALFA)

    expect(maria).toMatchObject({ email: 'maria@alfa.com.br' })
    expect(maria.emails).toBeUndefined()
    expect(maria.telefones).toBeUndefined()
  })

  it('traduz as recusas do backend às listas', async () => {
    const recusas = [
      [Object.assign(new Error('email already belongs to another contact of this workspace'), { code: '23505' }),
        'Já existe um Contato com este e-mail neste Workspace.'],
      [Object.assign(new Error('phone already belongs to another contact of this workspace'), { code: '23505' }),
        'Já existe um Contato com este telefone neste Workspace.'],
      [Object.assign(new Error('the same email appears twice in the list'), { code: '23505' }),
        'O mesmo e-mail ou telefone aparece duas vezes na lista.'],
      [Object.assign(new Error('a contact can have at most 3 emails'), { code: '22023' }), 'Um Contato pode ter até 3 e-mails.'],
      [Object.assign(new Error('a contact can have at most 3 phones'), { code: '22023' }), 'Um Contato pode ter até 3 telefones.'],
      [Object.assign(new Error('only the responsible seller or an admin can edit this contact'), { code: '42501' }),
        'Só um Administrador ou o Vendedor responsável por todas as Contas deste Contato pode editá-lo.'],
      [Object.assign(new Error('the primary email cannot be removed while additional emails exist'), { code: '23514' }),
        'Este Contato tem e-mails ou telefones adicionais: remova-os, ou troque o principal, na edição do Contato.'],
    ] as const
    for (const [recusa, mensagem] of recusas) {
      const { fonte } = fonteDaMarina({ rpcs: { set_contact_channels: () => { throw recusa } } })
      await expect(fonte.salvarCanaisDoContato!(ID_DA_MARIA, { emails: [], telefones: [] })).rejects.toThrow(mensagem)
    }
  })
})

describe('Revelar o e-mail de um Contato no Workspace operacional (prospeccao-funcional B3)', () => {
  function fonteDoRevelar(
    funcoes: OpcoesDoSupabaseFalso['funcoes'] = {},
    rpcs: Record<string, (parametros: Record<string, unknown>) => unknown> = {},
  ) {
    const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), funcoes, rpcs })
    return criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => MARINA.id)
  }

  it('recusa cotação sem preço retornado pelo servidor', async () => {
    const fonte = fonteDoRevelar({}, { quote_reveal_contact: () => [] })
    await expect(fonte.cotarRevelacaoContato!(ID_DA_MARIA, 'email')).rejects.toThrow('Não foi possível consultar a cotação.')
  })

  it('recusa o telefone sem cotar nem chamar a revelação', async () => {
    const chamadas: string[] = []
    const fonte = fonteDoRevelar(
      { 'account-enrichment': (corpo) => { chamadas.push(`funcao:${corpo.canal}`); return { corpo: {} } } },
      { quote_reveal_contact: (p) => { chamadas.push(`cotacao:${p.p_channel}`); return [] } },
    )

    await expect(fonte.cotarRevelacaoContato!(ID_DA_MARIA, 'telefone')).rejects.toThrow('A revelação de telefone está indisponível.')
    await expect(fonte.revelarContato!(ID_DA_MARIA, 'telefone')).rejects.toThrow('A revelação de telefone está indisponível.')
    expect(chamadas).toEqual([])
  })

  it('a falha da busca chega como falha, com a mensagem da função', async () => {
    const fonte = fonteDoRevelar({
      'account-enrichment': () => ({
        status: 502,
        corpo: { error: 'A busca do e-mail falhou: O actor do Apify não respondeu a tempo' },
      }),
    })

    await expect(fonte.revelarContato!(ID_DA_MARIA, 'email')).rejects.toThrow(
      'A busca do e-mail falhou: O actor do Apify não respondeu a tempo',
    )
  })
})
