import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RaizDoAplicativo } from '@/raiz'
import { renderizarApp } from '@/test/renderizar'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }
const LOTE = '72000000-0000-0000-0000-000000000001'
const PESSOAL = { id: 'ws-pessoal-marina', kind: 'pessoal', name: 'Marina Souza', owner_user_id: MARINA.id }

afterEach(() => {
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
  vi.restoreAllMocks()
})

type Estado = 'mapping' | 'preview' | 'processing' | 'completed'

/** O banco da importação, em memória: cada função devolve o que o banco devolveria para o passo em que o lote está. */
function bancoDaImportacao({ papel = 'admin' as 'admin' | 'member', decisoesIniciais = 1, estado = 'mapping' as Estado } = {}) {
  const chamadas: { funcao: string; parametros: Record<string, unknown> }[] = []
  const banco = { estado, decisoes: decisoesIniciais, processadas: 0, decisao: null as string | null, distribuidas: false }
  const contagens = () => ({
    total: 3,
    pending: banco.estado === 'processing' ? 3 - banco.processadas : banco.estado === 'completed' ? 0 : 2,
    invalid: banco.estado === 'preview' || banco.estado === 'mapping' ? 1 : 0,
    created: banco.estado === 'completed' ? 1 : banco.processadas >= 1 ? 1 : 0,
    updated: banco.estado === 'completed' ? 1 : 0,
    linked: 0,
    skipped: 0,
    failed: banco.estado === 'processing' || banco.estado === 'completed' ? 1 : 0,
  })
  const resumo = () => ({
    id: LOTE, file_name: 'contas.csv', status: banco.estado, delimiter: ';', has_header: true,
    headers: ['Empresa', 'Site', 'Contato', 'E-mail'], row_count: 3,
    mapping: { company_name: 0, company_url: 1, contact_name: 2, contact_email: 3 },
    replace_manual: false, error_code: null, is_mine: true, created_at: '2026-09-29T12:00:00Z', finished_at: null,
    counts: contagens(),
    preview: {
      account_create: 1, account_update: 1, account_skip: 0, contact_create: 0, contact_match: 1,
      decisions_pending: banco.decisao ? 0 : banco.decisoes, conflicts: 1,
    },
  })
  const previaDaAlfa = {
    line_number: 2, status: 'pending', cells: ['Alfa', 'alfa.com.br', '', ''], parsed: { company_name: 'Alfa' },
    decision: null, error_codes: [], outcome: {},
    preview: {
      account_action: 'update', account_name: 'Alfa', account_changes: ['legal_identifier'], account_conflicts: ['name'],
      needs_decision: false,
    },
  }
  const previaDaDelta = {
    line_number: 3, status: 'pending', cells: ['Delta', 'delta.com.br', 'Maria Souza', 'maria@alfa.com.br'],
    parsed: { company_name: 'Delta', contact_name: 'Maria Souza' }, decision: banco.decisao, error_codes: [], outcome: {},
    preview: {
      account_action: 'create', contact_match: 'existing', contact_name: 'Maria Souza', contact_links: [{ name: 'Alfa' }],
      needs_decision: true, can_transfer: true, account_changes: [], account_conflicts: [],
    },
  }
  const invalida = {
    line_number: 4, status: banco.estado === 'processing' || banco.estado === 'completed' ? 'failed' : 'invalid',
    cells: ['Sem site', '', '', ''], parsed: { company_name: 'Sem site' }, preview: {}, decision: null,
    error_codes: ['company_url_required'], outcome: {},
  }
  const rpc = (funcao: string, resposta: (p: Record<string, unknown>) => unknown) =>
    [funcao, (parametros: Record<string, unknown>) => {
      chamadas.push({ funcao, parametros })
      return resposta(parametros)
    }] as const
  const rpcs = Object.fromEntries([
    rpc('list_import_batches', () => [{ batch_id: LOTE, file_name: 'contas.csv', status: 'completed', row_count: 3, is_mine: true, created_at: '2026-09-28T12:00:00Z' }]),
    rpc('get_import_batch', () => resumo()),
    rpc('preview_import_batch', () => {
      banco.estado = 'preview'
      return resumo()
    }),
    rpc('list_import_rows', (p) => {
      const filtro = p.p_filter
      if (filtro === 'problems') return [invalida]
      if (filtro === 'decisions') return banco.decisao ? [] : [previaDaDelta]
      return banco.estado === 'preview' ? [previaDaAlfa, previaDaDelta, invalida] : [invalida]
    }),
    rpc('set_import_decisions', (p) => {
      banco.decisao = String(p.p_decision)
      return 1
    }),
    rpc('confirm_import_batch', () => {
      if (!banco.decisao) throw new Error('decisions are pending')
      banco.estado = 'processing'
      return resumo()
    }),
    rpc('process_import_chunk', () => {
      banco.processadas += 1
      if (banco.processadas >= 2) banco.estado = 'completed'
      return resumo()
    }),
    rpc('list_import_distributable_accounts', () =>
      banco.distribuidas ? [] : [{ target_account_id: 'conta-delta', account_name: 'Delta', owner_user_id: MARINA.id, distributable_until: '2026-09-30T12:00:00Z' }]),
    rpc('distribute_imported_target_accounts', () => {
      banco.distribuidas = true
      return 1
    }),
    rpc('list_workspace_participants', () => [
      { user_id: MARINA.id, email: MARINA.email, name: 'Marina Souza', role: papel, is_owner: false },
      { user_id: 'usuario-caio', email: 'caio@cliente.com.br', name: 'Caio Lima', role: 'member', is_owner: false },
    ]),
    rpc('list_workspace_invitations', () => []),
  ])
  return { rpcs, chamadas, banco }
}

function abrir(
  rota: string,
  opcoes: Parameters<typeof bancoDaImportacao>[0] & { rpcs?: Record<string, (p: Record<string, unknown>) => unknown> } = {},
) {
  window.history.replaceState(null, '', rota)
  localStorage.setItem('althius:modo_demo', 'false')
  sessionStorage.setItem('althius:workspace', 'ws-norte')
  const backend = bancoDaImportacao(opcoes)
  const arquivosEnviados: File[] = []
  const supabase = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    tabelas: {
      workspaces: [PESSOAL],
      workspace_memberships: [
        { workspace_id: 'ws-norte', role: opcoes.papel ?? 'admin', user_id: MARINA.id, active: true },
        { workspace_id: PESSOAL.id, role: 'admin', user_id: MARINA.id, active: true },
      ],
      target_accounts: [],
      sales_responsibilities: [],
      target_contacts: [],
      sequences: [],
    },
    rpcs: { bootstrap_personal_workspace: () => PESSOAL, ...backend.rpcs, ...opcoes.rpcs },
    funcoes: {
      'csv-import': (corpo) => {
        arquivosEnviados.push((corpo as unknown as FormData).get('file') as File)
        return { corpo: { batchId: LOTE } }
      },
    },
  })
  const { servicos } = criarServicosDoNavegadorFalsos()
  const usuario = userEvent.setup()
  render(<RaizDoAplicativo cliente={supabase.cliente} servicos={servicos} />)
  return { usuario, arquivosEnviados, ...backend }
}

describe('Importar CSV no Workspace operacional', () => {
  it('a Demonstração não oferece a importação nem simula um resultado', async () => {
    renderizarApp('/contas')
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Importar CSV/ })).not.toBeInTheDocument()
  })

  it('envia o arquivo, mapeia as colunas, decide o Contato, confirma e acompanha até o relatório', async () => {
    const { usuario, arquivosEnviados, chamadas } = abrir('/contas')

    await usuario.click(await screen.findByRole('link', { name: 'Importar CSV' }))
    const envio = await screen.findByRole('form', { name: 'Enviar arquivo CSV' })
    expect(await screen.findByRole('link', { name: 'contas.csv' })).toBeInTheDocument()
    await usuario.upload(within(envio).getByLabelText('Arquivo CSV'), new File(['Empresa;Site'], 'contas.csv', { type: 'text/csv' }))
    await usuario.click(within(envio).getByRole('button', { name: 'Enviar arquivo' }))
    expect(arquivosEnviados.map((a) => a.name)).toEqual(['contas.csv'])

    // O mapeamento sugerido vem preenchido; a prévia só existe depois de pedi-la.
    const mapa = await screen.findByRole('form', { name: 'Mapear colunas' })
    expect(within(mapa).getByLabelText(/Nome da empresa/)).toHaveValue('0')
    expect(within(mapa).getByLabelText(/URL da empresa/)).toHaveValue('1')
    await usuario.click(within(mapa).getByRole('button', { name: 'Ver prévia' }))

    const resumo = await screen.findByRole('region', { name: 'Prévia' })
    expect(resumo).toHaveTextContent('1 Conta nova, 1 Conta atualizada')
    expect(resumo).toHaveTextContent('1 linha inválida')
    expect(resumo).toHaveTextContent('1 Contato espera a sua decisão')
    const tabela = await screen.findByRole('table', { name: 'Linhas da importação' })
    expect(within(tabela).getByText(/Atualiza a Conta Alfa \(identificador legal\)/)).toBeInTheDocument()
    expect(within(tabela).getByText('Preserva os valores escritos à mão: nome.')).toBeInTheDocument()
    expect(within(tabela).getByText(/Contato que já existe: Maria Souza, vinculado a Alfa/)).toBeInTheDocument()
    expect(within(tabela).getByText('Falta a URL da empresa.')).toBeInTheDocument()

    // Sem a decisão sobre o Contato que já existe, não confirma.
    expect(screen.getByRole('button', { name: 'Confirmar importação' })).toBeDisabled()
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Decisão da linha 3' }), 'Adicionar Vínculo com esta Conta')
    expect(chamadas.find((c) => c.funcao === 'set_import_decisions')?.parametros).toMatchObject({ p_decision: 'link', p_line_numbers: [3] })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar importação' })).toBeEnabled())
    await usuario.click(screen.getByRole('button', { name: 'Confirmar importação' }))

    // O processamento segue em blocos até o relatório.
    expect(await screen.findByRole('region', { name: 'Relatório' })).toBeInTheDocument()
    const contagens = within(screen.getByRole('region', { name: 'Relatório' }))
    expect(contagens.getByText('Criadas').nextElementSibling).toHaveTextContent('1')
    expect(contagens.getByText('Atualizadas').nextElementSibling).toHaveTextContent('1')
    expect(contagens.getByText('Com falha').nextElementSibling).toHaveTextContent('1')
    expect(chamadas.filter((c) => c.funcao === 'process_import_chunk')).toHaveLength(2)
    expect(await screen.findByText('Falta a URL da empresa.')).toBeInTheDocument()
  })

  it('baixa o relatório de erros como CSV com as células originais', async () => {
    const { usuario } = abrir(`/contas/importar/${LOTE}`, { estado: 'completed' })
    let conteudo = ''
    URL.createObjectURL = vi.fn((blob: Blob) => {
      void blob.text().then((texto) => (conteudo = texto))
      return 'blob:relatorio'
    })
    URL.revokeObjectURL = vi.fn()
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await usuario.click(await screen.findByRole('button', { name: 'Baixar erros (CSV)' }))

    await waitFor(() => expect(clique).toHaveBeenCalled())
    await waitFor(() => expect(conteudo).toContain('4;Falhou;Falta a URL da empresa.;Sem site'))
  })

  it('o Administrador distribui as Contas criadas em rodízio entre os participantes escolhidos', async () => {
    const { usuario, chamadas } = abrir(`/contas/importar/${LOTE}`, { estado: 'completed' })

    const secao = await screen.findByRole('region', { name: 'Distribuir Contas' })
    expect(secao).toHaveTextContent('1 Conta criada por esta importação ainda está com quem importou')
    await usuario.click(within(secao).getByRole('checkbox', { name: 'Caio Lima' }))
    await usuario.click(within(secao).getByRole('button', { name: 'Distribuir Contas' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 Conta mudou de responsável.'))
    expect(chamadas.find((c) => c.funcao === 'distribute_imported_target_accounts')?.parametros).toEqual({
      p_workspace_id: 'ws-norte',
      p_import_batch_id: LOTE,
      p_target_account_ids: ['conta-delta'],
      p_user_ids: ['usuario-caio'],
    })
    expect(screen.queryByRole('button', { name: 'Distribuir Contas' })).not.toBeInTheDocument()
  })

  it('o Membro vê o relatório do próprio lote, sem a distribuição', async () => {
    abrir(`/contas/importar/${LOTE}`, { papel: 'member', estado: 'completed' })

    expect(await screen.findByRole('region', { name: 'Relatório' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Distribuir Contas' })).not.toBeInTheDocument()
  })

  it('um lote que o banco não encontra mostra a recusa e deixa tentar de novo', async () => {
    abrir(`/contas/importar/${LOTE}`, {
      rpcs: {
        get_import_batch: () => {
          throw Object.assign(new Error('import batch not found'), { code: 'P0002' })
        },
      },
    })

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Importação não encontrada.')
    expect(within(alerta).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})
