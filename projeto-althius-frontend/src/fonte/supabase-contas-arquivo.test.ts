import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeContasSupabase } from './supabase-contas'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const CHEFE = { id: 'usuario-chefe', email: 'chefe@cliente.com.br' }
const ID_DA_ALFA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const ID_DA_BETA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000002'
const ID_DA_GAMA = '6f1c2d3e-4a5b-4c6d-8e7f-000000000003'
const ID_DA_MARIA = '7a1c2d3e-4a5b-4c6d-8e7f-000000000001'
const ID_DO_RUI = '7a1c2d3e-4a5b-4c6d-8e7f-000000000002'
const ID_DO_LUIZ = '7a1c2d3e-4a5b-4c6d-8e7f-000000000003'
const ID_DO_TOMAS = '7a1c2d3e-4a5b-4c6d-8e7f-000000000004'

function contaNoBanco(id: string, nome: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    workspace_id: 'ws-norte',
    name: nome,
    canonical_url: `https://${nome.toLowerCase()}.com.br`,
    domain: `${nome.toLowerCase()}.com.br`,
    linkedin_url: null,
    segment: null,
    last_interaction_at: null,
    ...extra,
  }
}

function contatoNoBanco(id: string, contaId: string, nome: string) {
  return {
    id,
    workspace_id: 'ws-norte',
    target_account_id: contaId,
    name: nome,
    role: null,
    email: null,
    whatsapp: null,
    linkedin: null,
    last_interaction_at: null,
  }
}

type Rpcs = Record<string, (parametros: Record<string, unknown>) => unknown>

/**
 * A Alfa (da Marina) e a Beta (de outro) em uso, a Gama arquivada e o Rui arquivado. O Administrador é o Chefe; senão,
 * a sessão é a da Marina, Membro.
 */
function fonteComArquivo({ administrador = false, rpcs = {} }: { administrador?: boolean; rpcs?: Rpcs } = {}) {
  const tabelas: Record<string, Record<string, unknown>[]> = {
    target_accounts: [
      contaNoBanco(ID_DA_ALFA, 'Alfa'),
      contaNoBanco(ID_DA_BETA, 'Beta'),
      contaNoBanco(ID_DA_GAMA, 'Gama', { archived_at: '2026-09-28T12:00:00Z' }),
    ],
    sales_responsibilities: [
      { workspace_id: 'ws-norte', target_account_id: ID_DA_ALFA, owner_user_id: MARINA.id },
      { workspace_id: 'ws-norte', target_account_id: ID_DA_BETA, owner_user_id: 'usuario-outro' },
      { workspace_id: 'ws-norte', target_account_id: ID_DA_GAMA, owner_user_id: MARINA.id },
    ],
    target_contacts: [
      contatoNoBanco(ID_DA_MARIA, ID_DA_ALFA, 'Maria Souza'),
      contatoNoBanco(ID_DO_LUIZ, ID_DA_BETA, 'Luiz Beta'),
      // O Vínculo com a Conta arquivada continua ativo: a lista do Workspace o esconde, a da Conta arquivada o mostra.
      contatoNoBanco(ID_DO_TOMAS, ID_DA_GAMA, 'Tomás Gama'),
    ],
    contacts: [
      { id: ID_DO_RUI, workspace_id: 'ws-norte', name: 'Rui Arquivado', role: 'Analista', archived_at: '2026-09-27T09:00:00Z' },
      { id: ID_DA_MARIA, workspace_id: 'ws-norte', name: 'Maria Souza', role: null, archived_at: null },
    ],
    contact_account_links: [
      { workspace_id: 'ws-norte', contact_id: ID_DO_RUI, target_account_id: ID_DA_ALFA, ended_reason: 'contact_archived' },
      { workspace_id: 'ws-norte', contact_id: ID_DA_MARIA, target_account_id: ID_DA_ALFA, ended_reason: null },
    ],
  }
  const usuario = administrador ? CHEFE : MARINA
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(usuario), tabelas, rpcs })
  return criarFonteDeContasSupabase(cliente, () => 'ws-norte', () => usuario.id, () => administrador)
}

describe('Arquivar e apagar no Workspace operacional (CRM-18)', () => {
  it('as listas padrão deixam de fora a Conta arquivada e os Contatos dela, e a lista de arquivadas a traz', async () => {
    const fonte = fonteComArquivo()

    expect((await fonte.contas()).map((c) => c.nome)).toEqual(['Alfa', 'Beta'])
    expect((await fonte.contatos()).map((c) => c.nome)).toEqual(['Luiz Beta', 'Maria Souza'])

    const [gama] = await fonte.contasArquivadas!()
    expect(gama).toMatchObject({ id: ID_DA_GAMA, nome: 'Gama', arquivadaEm: '2026-09-28T12:00:00Z', podeArquivar: true })
    expect(gama.podeApagar).toBeUndefined()
    // O histórico da Conta arquivada continua acessível pelo detalhe.
    expect(await fonte.conta(ID_DA_GAMA)).toMatchObject({ nome: 'Gama', arquivadaEm: '2026-09-28T12:00:00Z', totalContatos: 1 })
    expect((await fonte.contatosDaConta(ID_DA_GAMA)).map((c) => c.nome)).toEqual(['Tomás Gama'])
  })

  it('mostra arquivar só a quem pode, o responsável ou o Administrador, e apagar só ao Administrador', async () => {
    const membro = fonteComArquivo()
    const [alfa, beta] = await membro.contas()
    expect(alfa).toMatchObject({ podeArquivar: true })
    expect(alfa.podeApagar).toBeUndefined()
    expect(beta.podeArquivar).toBeUndefined()
    const [luiz, maria] = await membro.contatos()
    expect(luiz.podeArquivar).toBeUndefined()
    expect(maria.podeArquivar).toBe(true)
    expect(maria.podeApagar).toBeUndefined()

    const admin = fonteComArquivo({ administrador: true })
    const [alfaDoAdmin, betaDoAdmin] = await admin.contas()
    expect(alfaDoAdmin).toMatchObject({ podeArquivar: true, podeApagar: true })
    expect(betaDoAdmin).toMatchObject({ podeArquivar: true, podeApagar: true })
    expect((await admin.contatos())[0]).toMatchObject({ podeArquivar: true, podeApagar: true })
  })

  it('arquiva a Conta pelo backend, conta as Sequências pausadas e avisa quem observa', async () => {
    const pedidos: Record<string, unknown>[] = []
    const fonte = fonteComArquivo({
      rpcs: {
        archive_target_account: (parametros) => {
          pedidos.push(parametros)
          return { result: 'archived', sequences_paused: 1 }
        },
      },
    })
    let avisos = 0
    fonte.observar(() => avisos++)

    expect(await fonte.arquivarConta!(ID_DA_ALFA)).toEqual({ sequenciasPausadas: 1 })

    expect(pedidos).toEqual([{ p_target_account_id: ID_DA_ALFA }])
    expect(avisos).toBe(1)
  })

  it('restaura a Conta e diz quantas Sequências foram só destravadas', async () => {
    const fonte = fonteComArquivo({ rpcs: { restore_target_account: () => ({ result: 'restored', sequences_unblocked: 1 }) } })

    expect(await fonte.restaurarConta!(ID_DA_GAMA)).toEqual({ sequenciasDestravadas: 1 })
  })

  it('apaga a Conta com o nome digitado e devolve só números', async () => {
    const pedidos: Record<string, unknown>[] = []
    const fonte = fonteComArquivo({
      administrador: true,
      rpcs: {
        erase_target_account: (parametros) => {
          pedidos.push(parametros)
          return { result: 'erased', contacts_erased: 2, contacts_kept: 1, sequences_ended: 1, sends_anonymized: 3 }
        },
      },
    })

    expect(await fonte.apagarConta!(ID_DA_ALFA, 'Alfa')).toEqual({ contatosApagados: 2, contatosMantidos: 1, sequenciasEncerradas: 1 })
    expect(pedidos).toEqual([{ p_target_account_id: ID_DA_ALFA, p_confirmation: 'Alfa' }])
  })

  it('traduz as recusas do banco: papel, confirmação, Conta arquivada e disputa com outro pedido', async () => {
    const recusar = (message: string, code: string) => () => {
      throw Object.assign(new Error(message), { code })
    }
    const fonte = fonteComArquivo({
      rpcs: {
        archive_target_account: recusar('only the responsible seller or an administrator can archive this target account', '42501'),
        restore_contact: recusar('only the responsible seller or an administrator can restore this contact', '42501'),
        erase_target_account: recusar('only administrators can permanently delete a target account', '42501'),
        erase_contact: recusar('the confirmation does not match the contact name', '22023'),
        register_account_interaction: recusar('the target account is archived', '55006'),
        archive_contact: recusar('the record is being archived or erased, try again', '55P03'),
      },
    })

    await expect(fonte.arquivarConta!(ID_DA_BETA)).rejects.toThrow('Só o Vendedor responsável ou um Administrador pode arquivar este registro.')
    await expect(fonte.restaurarContato!(ID_DO_RUI)).rejects.toThrow('Só o Vendedor responsável ou um Administrador pode restaurar este registro.')
    await expect(fonte.apagarConta!(ID_DA_BETA, 'Beta')).rejects.toThrow('Só um Administrador pode apagar definitivamente.')
    await expect(fonte.apagarContato!(ID_DA_MARIA, 'Mari')).rejects.toThrow('O nome digitado não confere com o do registro.')
    await expect(fonte.registrarInteracao({ contaId: ID_DA_GAMA, tipo: 'ligacao' })).rejects.toThrow(
      'A Conta-alvo está arquivada. Restaure-a para continuar.',
    )
    await expect(fonte.arquivarContato!(ID_DA_MARIA)).rejects.toThrow('O registro está sendo arquivado ou apagado agora. Tente de novo em instantes.')
  })

  it('arquiva, restaura e apaga o Contato pelo backend', async () => {
    const pedidos: [string, Record<string, unknown>][] = []
    const registrar = (nome: string) => (parametros: Record<string, unknown>) => {
      pedidos.push([nome, parametros])
      return { result: 'ok' }
    }
    const fonte = fonteComArquivo({
      administrador: true,
      rpcs: { archive_contact: registrar('arquivar'), restore_contact: registrar('restaurar'), erase_contact: registrar('apagar') },
    })

    await fonte.arquivarContato!(ID_DA_MARIA)
    await fonte.restaurarContato!(ID_DO_RUI)
    await fonte.apagarContato!(ID_DO_RUI, 'Rui Arquivado')

    expect(pedidos).toEqual([
      ['arquivar', { p_contact_id: ID_DA_MARIA }],
      ['restaurar', { p_contact_id: ID_DO_RUI }],
      ['apagar', { p_contact_id: ID_DO_RUI, p_confirmation: 'Rui Arquivado' }],
    ])
  })

  it('lista os Contatos arquivados com a Conta do último Vínculo, e só o Administrador vê apagar', async () => {
    const membro = await fonteComArquivo().contatosArquivados!()
    expect(membro).toEqual([
      { id: ID_DO_RUI, nome: 'Rui Arquivado', cargo: 'Analista', arquivadoEm: '2026-09-27T09:00:00Z', contaId: ID_DA_ALFA, contaNome: 'Alfa' },
    ])

    const admin = await fonteComArquivo({ administrador: true }).contatosArquivados!()
    expect(admin[0]).toMatchObject({ nome: 'Rui Arquivado', podeApagar: true })
  })
})
