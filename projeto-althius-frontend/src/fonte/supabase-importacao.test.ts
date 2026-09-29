import { describe, expect, it, vi } from 'vitest'
import { criarSupabaseFalso, type OpcoesDoSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeImportacaoSupabase } from './supabase-importacao'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const LOTE = '72000000-0000-0000-0000-000000000001'

const RESUMO = {
  id: LOTE,
  file_name: 'contas.csv',
  status: 'preview',
  delimiter: ';',
  has_header: true,
  headers: ['Empresa', 'Site', 'Contato'],
  row_count: 3,
  mapping: { company_name: 0, company_url: 1, contact_name: 2 },
  replace_manual: false,
  error_code: null,
  is_mine: true,
  created_at: '2026-09-29T12:00:00Z',
  finished_at: null,
  counts: { total: 3, pending: 2, invalid: 1 },
  preview: { account_create: 1, account_update: 1, contact_match: 1, decisions_pending: 1, conflicts: 1 },
}

function montar(
  rpcs: Record<string, (parametros: Record<string, unknown>) => unknown>,
  funcoes: OpcoesDoSupabaseFalso['funcoes'] = {},
) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), rpcs, funcoes })
  const aoMudar = vi.fn()
  return { fonte: criarFonteDeImportacaoSupabase(cliente, () => 'ws-norte', aoMudar), aoMudar }
}

describe('FonteDeImportacaoDeContas do Workspace operacional', () => {
  it('traduz o lote do banco: estado, mapeamento, contagens e o que a prévia vai fazer', async () => {
    const { fonte } = montar({ get_import_batch: () => RESUMO })

    const lote = await fonte.lote(LOTE)

    expect(lote).toMatchObject({
      id: LOTE,
      arquivo: 'contas.csv',
      estado: 'previa',
      delimitador: ';',
      colunas: ['Empresa', 'Site', 'Contato'],
      mapeamento: { nomeDaEmpresa: 0, urlDaEmpresa: 1, nomeDoContato: 2 },
      ehMeu: true,
      contagens: { total: 3, pendentes: 2, invalidas: 1, criadas: 0 },
      previa: { contasNovas: 1, contasAtualizadas: 1, contatosExistentes: 1, decisoesPendentes: 1, conflitos: 1 },
    })
  })

  it('manda o mapeamento com os campos do banco e devolve o lote validado', async () => {
    const pedidos: Record<string, unknown>[] = []
    const { fonte } = montar({
      preview_import_batch: (p) => {
        pedidos.push(p)
        return RESUMO
      },
    })

    await fonte.visualizar(LOTE, {
      mapeamento: { nomeDaEmpresa: 0, urlDaEmpresa: 1, email: 4 },
      primeiraLinhaEhCabecalho: false,
      substituirCorrigidosAMao: true,
    })

    expect(pedidos).toEqual([{
      p_batch_id: LOTE,
      p_mapping: { company_name: 0, company_url: 1, contact_email: 4 },
      p_has_header: false,
      p_replace_manual: true,
    }])
  })

  it('lê as linhas com os motivos em português, o que mudou, o que foi preservado e a decisão', async () => {
    const { fonte } = montar({
      list_import_rows: () => [
        {
          line_number: 4, status: 'invalid', cells: ['Sem site', '', ''], parsed: { company_name: 'Sem site' }, preview: {},
          decision: null, error_codes: ['company_url_required'], outcome: {},
        },
        {
          line_number: 2, status: 'pending', cells: [], parsed: { company_name: 'Alfa', contact_name: 'Maria' }, decision: 'link',
          error_codes: [], outcome: {},
          preview: {
            account_action: 'update', account_name: 'Alfa', account_changes: ['legal_identifier'], account_conflicts: ['name'],
            contact_match: 'existing', contact_name: 'Maria Souza', contact_links: [{ account_id: 'x', name: 'Beta' }],
            contact_changes: [], contact_conflicts: [], needs_decision: true, can_transfer: false,
          },
        },
        {
          line_number: 5, status: 'updated', cells: [], parsed: {}, preview: {}, decision: null, error_codes: [],
          outcome: { changed: ['account.legal_identifier'], preserved: ['contact.role'] },
        },
      ],
    })

    const [invalida, pendente, atualizada] = await fonte.linhas(LOTE, 'todas', 0, 50)

    expect(invalida).toMatchObject({ situacao: 'invalida', empresa: 'Sem site', motivos: ['Falta a URL da empresa.'] })
    expect(pendente).toMatchObject({
      situacao: 'pendente',
      decisao: 'vincular',
      previa: {
        conta: 'atualizar', contaExistente: 'Alfa', camposDaConta: ['identificador legal'], conflitosDaConta: ['nome'],
        contato: 'existente', contatoExistente: 'Maria Souza', outrosVinculos: ['Beta'], precisaDecidir: true, podeTransferir: false,
      },
    })
    expect(atualizada.observacoes).toEqual([
      'Campos atualizados: identificador legal.',
      'Valores escritos à mão preservados: cargo.',
    ])
  })

  it('envia o arquivo pela Edge Function csv-import com o Workspace e devolve o lote lido', async () => {
    const recebidos: FormData[] = []
    const { fonte } = montar(
      { get_import_batch: () => ({ ...RESUMO, status: 'mapping' }) },
      { 'csv-import': (corpo) => (recebidos.push(corpo as unknown as FormData), { corpo: { batchId: LOTE } }) },
    )

    const lote = await fonte.enviarArquivo(new File(['Empresa;Site\n'], 'contas.csv', { type: 'text/csv' }))

    expect(lote.estado).toBe('mapeando')
    expect(recebidos[0].get('workspaceId')).toBe('ws-norte')
    expect((recebidos[0].get('file') as File).name).toBe('contas.csv')
  })

  it('mostra a mensagem que a Edge Function escreveu quando ela recusa o arquivo', async () => {
    const { fonte } = montar({}, { 'csv-import': () => ({ status: 422, corpo: { error: 'O arquivo está vazio.' } }) })

    await expect(fonte.enviarArquivo(new File(['x'], 'a.csv'))).rejects.toThrow('O arquivo está vazio.')
  })

  it('traduz as recusas do banco e nunca mostra o erro técnico', async () => {
    const { fonte } = montar({
      confirm_import_batch: () => {
        throw new Error('decisions are pending')
      },
      process_import_chunk: () => {
        throw new Error('connection reset')
      },
    })

    await expect(fonte.confirmar(LOTE)).rejects.toThrow('Decida o que fazer com os Contatos que já existem antes de confirmar.')
    await expect(fonte.processarBloco(LOTE)).rejects.toThrow('Não foi possível concluir a operação. Tente de novo.')
  })

  it('avisa as listas do Workspace a cada bloco processado e a cada distribuição', async () => {
    const { fonte, aoMudar } = montar({
      process_import_chunk: () => ({ ...RESUMO, status: 'processing' }),
      distribute_imported_target_accounts: () => 2,
    })

    await fonte.processarBloco(LOTE)
    const alteradas = await fonte.distribuir(LOTE, [
      { contaId: 'a', responsavelId: 'u1' },
      { contaId: 'b', responsavelId: 'u2' },
    ])

    expect(alteradas).toBe(2)
    expect(aoMudar).toHaveBeenCalledTimes(2)
  })
})
