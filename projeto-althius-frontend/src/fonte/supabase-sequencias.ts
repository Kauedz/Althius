import type { SupabaseClient } from '@supabase/supabase-js'
import { ehCanalSuportado, type AtualizacaoDocumento, type FonteDeSequencias, type MetricasDemoSequencia, type NovaSequencia, type ResumoPublicoSequencia, type Sequencia, type StepSequencia, type StatusSequencia } from './sequencias-tipos'
import { JANELA_PADRAO, REGRA_DE_PAUSE_PADRAO } from './dados-sequencias-demo'

interface RegistroSequencia {
  id: string
  workspace_id: string
  target_account_id: string
  owner_user_id: string
  status: StatusSequencia
  public_summary: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface DocumentoPrivado {
  participantesIds?: string[]
  janelaPadrao?: { de: string; ate: string }
  regraDePause?: string
  steps?: StepSequencia[]
  passoAtual?: number
  motivoPause?: string
}

function numeroSeguro(valor: unknown): number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0 ? valor : 0
}

function documentoDe(row: RegistroSequencia): DocumentoPrivado | null {
  const documento = row.public_summary._document
  return documento && typeof documento === 'object' ? documento as DocumentoPrivado : null
}

function mapear(row: RegistroSequencia, ehResponsavel: boolean): Sequencia {
  const documento = ehResponsavel ? documentoDe(row) : null
  const resumo = row.public_summary
  const steps = documento?.steps ?? []
  const participantesIds = documento?.participantesIds ?? []
  return {
    id: row.id,
    contaId: row.target_account_id,
    status: row.status,
    ...(ehResponsavel && documento?.motivoPause ? { motivoPause: documento.motivoPause } : {}),
    responsavel: ehResponsavel,
    totalSteps: ehResponsavel ? steps.length : numeroSeguro(resumo.totalSteps),
    participantesIds,
    janelaPadrao: documento?.janelaPadrao ?? JANELA_PADRAO,
    regraDePause: documento?.regraDePause ?? REGRA_DE_PAUSE_PADRAO,
    steps,
    passoAtual: documento?.passoAtual ?? numeroSeguro(resumo.passoAtual),
    totalParticipantes: numeroSeguro(resumo.totalParticipantes) || participantesIds.length,
    criadaEm: row.created_at,
    atualizadaEm: row.updated_at,
  }
}

function converterErro(error: { message: string; code?: string }): Error {
  if (error.code === '42501') return new Error('Apenas o responsável ativo pode abrir ou alterar o documento desta Sequência.')
  if (error.code === '23505') return new Error('Esta Conta-alvo já tem uma Sequência e um responsável definidos.')
  return new Error(error.message)
}

export function criarFonteDeSequenciasSupabase(
  cliente: SupabaseClient,
  obterWorkspaceId: () => string,
  obterUsuarioId: () => string,
): FonteDeSequencias {
  const ouvintes = new Set<() => void>()
  let canalAtual: ReturnType<SupabaseClient['channel']> | null = null
  let workspaceInscrito = ''

  function notificar() { for (const ouvinte of ouvintes) ouvinte() }
  function workspace(): string {
    const id = obterWorkspaceId()
    if (!id) throw new Error('Nenhum Workspace ativo foi selecionado.')
    return id
  }
  function observar(ouvinte: () => void) {
    ouvintes.add(ouvinte)
    const id = workspace()
    if (workspaceInscrito !== id) {
      if (canalAtual) void cliente.removeChannel(canalAtual)
      workspaceInscrito = id
      canalAtual = cliente.channel(`sequencias:${id}`).on('postgres_changes', {
        event: '*', schema: 'public', table: 'sequences', filter: `workspace_id=eq.${id}`,
      }, notificar).subscribe()
    }
    return () => {
      ouvintes.delete(ouvinte)
      if (ouvintes.size === 0 && canalAtual) {
        void cliente.removeChannel(canalAtual)
        canalAtual = null
        workspaceInscrito = ''
      }
    }
  }

  async function listarRegistros(): Promise<RegistroSequencia[]> {
    const { data, error } = await cliente.from('sequences')
      .select('id, workspace_id, target_account_id, owner_user_id, status, public_summary, created_at, updated_at')
      .eq('workspace_id', workspace())
      .order('updated_at', { ascending: false })
    if (error) throw converterErro(error)
    return (data ?? []) as RegistroSequencia[]
  }

  async function registroPorId(id: string): Promise<RegistroSequencia> {
    const { data, error } = await cliente.from('sequences')
      .select('id, workspace_id, target_account_id, owner_user_id, status, public_summary, created_at, updated_at')
      .eq('workspace_id', workspace()).eq('id', id).maybeSingle()
    if (error) throw converterErro(error)
    if (!data) throw new Error('Sequência não encontrada neste Workspace.')
    return data as RegistroSequencia
  }

  async function privada(id: string): Promise<Sequencia> {
    const row = await registroPorId(id)
    const ehResponsavel = row.owner_user_id === obterUsuarioId()
    if (!ehResponsavel) return mapear(row, false)
    const { data, error } = await cliente.rpc('get_owned_sequence', { p_sequence_id: id })
    if (error) throw converterErro(error)
    const ownerRow = (Array.isArray(data) ? data[0] : data) as RegistroSequencia | null
    if (!ownerRow) throw new Error('Sequência não encontrada ou sem autorização para leitura privada.')
    return mapear(ownerRow, true)
  }

  return {
    modo: 'real',
    hoje: () => new Date(),
    observar,
    async sequencias() {
      const rows = await listarRegistros()
      const usuarioId = obterUsuarioId()
      return Promise.all(rows.map(async (row) => {
        if (row.owner_user_id !== usuarioId) return mapear(row, false)
        const { data, error } = await cliente.rpc('get_owned_sequence', { p_sequence_id: row.id })
        if (error) throw converterErro(error)
        const privateRow = (Array.isArray(data) ? data[0] : data) as RegistroSequencia | null
        if (!privateRow) throw new Error('Não foi possível carregar o documento privado de uma Sequência sua.')
        return mapear(privateRow, true)
      }))
    },
    sequencia: privada,
    async sequenciaPorConta(contaId) {
      const row = (await listarRegistros()).find((item) => item.target_account_id === contaId)
      return row ? privada(row.id) : null
    },
    async criarSequencia(nova: NovaSequencia) {
      const participantesIds = nova.participantesIds ?? []
      const steps = nova.steps ?? []
      for (const step of steps) if (!ehCanalSuportado(step.canal)) throw new Error(`Canal "${step.canal}" fora do escopo.`)
      const documento: DocumentoPrivado = {
        participantesIds,
        janelaPadrao: nova.janelaPadrao ?? JANELA_PADRAO,
        regraDePause: nova.regraDePause ?? REGRA_DE_PAUSE_PADRAO,
        steps,
        passoAtual: 0,
      }
      const { data, error } = await cliente.rpc('create_sequence', {
        p_workspace_id: workspace(),
        p_target_account_id: nova.contaId,
        p_private_document: documento,
        p_public_summary: { totalParticipantes: participantesIds.length, totalSteps: steps.length, passoAtual: 0 },
      })
      if (error) throw converterErro(error)
      const row = (Array.isArray(data) ? data[0] : data) as RegistroSequencia | null
      if (!row) throw new Error('O banco não retornou a Sequência criada.')
      notificar()
      return privada(row.id)
    },
    async atualizarDocumento(id: string, atualizacao: AtualizacaoDocumento) {
      const atual = await privada(id)
      if (!atual.responsavel) throw new Error('Apenas o responsável pode alterar esta Sequência.')
      const novoDocumento: DocumentoPrivado = {
        participantesIds: atualizacao.participantesIds ?? atual.participantesIds,
        janelaPadrao: atualizacao.janelaPadrao ?? atual.janelaPadrao,
        regraDePause: atualizacao.regraDePause ?? atual.regraDePause,
        steps: atualizacao.steps ?? atual.steps,
        passoAtual: atual.passoAtual,
        ...('motivoPause' in atualizacao
          ? { motivoPause: atualizacao.motivoPause }
          : atual.motivoPause ? { motivoPause: atual.motivoPause } : {}),
      }
      for (const step of atualizacao.steps ?? []) if (!ehCanalSuportado(step.canal)) throw new Error(`Canal "${step.canal}" fora do escopo.`)
      const estado: StatusSequencia = atualizacao.status ?? atual.status
      const { error } = await cliente.rpc('update_owned_sequence', {
        p_sequence_id: id,
        p_private_document: novoDocumento,
        p_public_summary: {
          totalParticipantes: novoDocumento.participantesIds?.length ?? 0,
          totalSteps: novoDocumento.steps?.length ?? 0,
          passoAtual: novoDocumento.passoAtual ?? 0,
        },
        p_status: estado,
      })
      if (error) throw converterErro(error)
      notificar()
      return privada(id)
    },
    async confirmarParticipantes(id, participantesIds) {
      return this.atualizarDocumento(id, { participantesIds })
    },
    async metricasDeDemo(_id: string): Promise<MetricasDemoSequencia | null> { return null },
    async resumoPublico(id: string): Promise<ResumoPublicoSequencia | null> {
      const row = await registroPorId(id)
      const resumo = mapear(row, false)
      return {
        id: resumo.id,
        contaId: resumo.contaId,
        status: resumo.status,
        totalParticipantes: resumo.totalParticipantes,
        totalSteps: numeroSeguro(row.public_summary.totalSteps),
        passoAtual: numeroSeguro(row.public_summary.passoAtual),
        atualizadaEm: resumo.atualizadaEm,
      }
    },
  }
}
