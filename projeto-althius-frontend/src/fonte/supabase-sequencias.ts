import type { SupabaseClient } from '@supabase/supabase-js'
import { ehCanalSuportado, type AnexoRecebido, type AtualizacaoDocumento, type EnvioDoPasso, type FonteDeSequencias, type MetricasDemoSequencia, type NovaSequencia, type RespostaRecebida, type ResumoPublicoSequencia, type Sequencia, type StatusDoEnvio, type StepSequencia, type StatusSequencia } from './sequencias-tipos'
import { ErroDeModuloIndisponivel } from './ambiente'
import { JANELA_PADRAO, REGRA_DE_PAUSE_PADRAO } from './dados-sequencias-demo'
import { corpoDoErroDaFuncao, motivoDaFalhaDaFuncao } from './falha-da-edge-function'

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

interface LinhaDoEnvio {
  id: string
  step_id: string
  contact_id: string
  destination: string
  status: StatusDoEnvio
  confirmed_at: string
  sent_at: string | null
  last_error: string | null
  mode?: 'auto' | 'manual' | null
  scheduled_for?: string | null
}

interface LinhaDaAutorizacao {
  version: number
  authorized_at: string
  active: boolean
  revoked_reason: 'edited' | 'reactivated' | null
}

/** O que cada bloqueio da ativação diz ao Vendedor responsável. */
const MENSAGEM_DA_ATIVACAO: Record<string, string> = {
  contact_unlinked: 'O Contato de um passo não está vinculado à Conta-alvo. Ajuste o passo antes de ativar.',
  contact_without_email: 'O Contato de um passo não tem e-mail. Cadastre o e-mail antes de ativar.',
  empty_content: 'Um passo de E-mail está sem texto. Escreva o corpo antes de ativar.',
  destination_bounced: 'O e-mail de um Contato já voltou nesta Sequência. Corrija o e-mail antes de ativar.',
  sender_not_ready: 'Sua Conta remetente de E-mail não está pronta para enviar.',
  sequence_not_active: 'Retome a Sequência antes de ativar os envios.',
  no_steps: 'A Sequência ainda não tem passos.',
}

interface LinhaDaResposta {
  interaction_id: string
  sequence_id: string
  send_id: string | null
  contact_id: string | null
  from_email: string | null
  from_name: string | null
  subject: string | null
  body: string | null
  received_at: string
  attachments: unknown
}

function mapearEnvio(linha: LinhaDoEnvio): EnvioDoPasso {
  return {
    id: linha.id,
    stepId: linha.step_id,
    contatoId: linha.contact_id,
    destino: linha.destination,
    status: linha.status,
    confirmadoEm: linha.confirmed_at,
    ...(linha.sent_at ? { enviadoEm: linha.sent_at } : {}),
    ...(linha.last_error ? { ultimoErro: linha.last_error } : {}),
    ...(linha.mode ? { modo: linha.mode } : {}),
    ...(linha.scheduled_for ? { programadoPara: linha.scheduled_for } : {}),
  }
}

function mapearAnexos(valor: unknown): AnexoRecebido[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item) => {
    const anexo = item as Record<string, unknown>
    if (typeof anexo?.id !== 'string') return []
    const status = anexo.status
    return [{
      id: anexo.id,
      nome: typeof anexo.name === 'string' ? anexo.name : 'anexo',
      ...(typeof anexo.mime === 'string' ? { mime: anexo.mime } : {}),
      ...(typeof anexo.size === 'number' ? { tamanho: anexo.size } : {}),
      status: status === 'stored' || status === 'failed' ? status : 'pending',
    }]
  })
}

function mapearResposta(linha: LinhaDaResposta): RespostaRecebida {
  return {
    interacaoId: linha.interaction_id,
    sequenciaId: linha.sequence_id,
    ...(linha.send_id ? { envioId: linha.send_id } : {}),
    ...(linha.contact_id ? { contatoId: linha.contact_id } : {}),
    de: { ...(linha.from_email ? { email: linha.from_email } : {}), ...(linha.from_name ? { nome: linha.from_name } : {}) },
    ...(linha.subject ? { assunto: linha.subject } : {}),
    ...(linha.body ? { corpo: linha.body } : {}),
    recebidaEm: linha.received_at,
    anexos: mapearAnexos(linha.attachments),
  }
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

/** O que o backend aceita num passo: um canal suportado e nenhum anexo, que o Workspace ainda não sabe guardar. */
function validarPassos(steps: StepSequencia[]) {
  for (const step of steps) {
    if (!ehCanalSuportado(step.canal)) throw new Error(`Canal "${step.canal}" fora do escopo.`)
    if (step.anexos?.length) throw new ErroDeModuloIndisponivel('anexos')
  }
}

function converterErro(error: { message: string; code?: string }): Error {
  if (error.code === '0A000') return new Error('Só passos de E-mail podem ser confirmados por enquanto.')
  if (error.code === '22023' && error.message === 'contact has no email destination') return new Error('O Contato deste passo não tem e-mail cadastrado.')
  if (error.code === '22023' && error.message === 'contact has no active link with this target account') return new Error('O Contato deste passo não está vinculado à Conta-alvo.')
  if (error.code === '55000') return new Error('Este passo já foi enviado ou está sendo enviado.')
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
      validarPassos(steps)
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
      validarPassos(atualizacao.steps ?? [])
      // O status só vai quando a pessoa o muda (pausar, retomar): regravar o lido antes apagaria uma pausa que o
      // backend fez nesse meio-tempo, como a de uma resposta do Contato, e retomaria os envios sem ninguém pedir.
      const estado: StatusSequencia | null = atualizacao.status ?? null
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
    async envios(sequenciaId) {
      const row = await registroPorId(sequenciaId)
      if (row.owner_user_id !== obterUsuarioId()) return []
      const { data, error } = await cliente.rpc('list_sequence_step_sends', { p_sequence_id: sequenciaId })
      if (error) throw converterErro(error)
      return ((data ?? []) as LinhaDoEnvio[]).map(mapearEnvio)
    },
    async confirmarPasso(sequenciaId, stepId) {
      const { data, error } = await cliente.rpc('confirm_sequence_step', { p_sequence_id: sequenciaId, p_step_id: stepId })
      if (error) throw converterErro(error)
      const linha = (Array.isArray(data) ? data[0] : data) as LinhaDoEnvio | null
      if (!linha) throw new Error('O banco não retornou o Envio confirmado.')
      notificar()
      return mapearEnvio(linha)
    },
    async enviarPasso(sequenciaId, envioId) {
      const { data, error } = await cliente.functions.invoke('sequence-step-sends', {
        body: { action: 'send', workspaceId: workspace(), sendId: envioId },
      })
      notificar()
      if (!error) {
        // Sem um desfecho explícito, nada prova o envio: fica incerto até a reconciliação.
        const resultado = data as Record<string, unknown> | null
        if (typeof resultado?.outcome === 'string') return { outcome: resultado.outcome }
        return { outcome: 'uncertain', mensagem: 'O backend não confirmou o desfecho do envio. Confira antes de reenviar.' }
      }
      const corpo = await corpoDoErroDaFuncao(error)
      if (typeof corpo?.outcome === 'string') {
        return { outcome: corpo.outcome, ...(typeof corpo.message === 'string' ? { mensagem: corpo.message } : {}) }
      }
      if (typeof corpo?.error === 'string') throw new Error(corpo.error)
      throw new Error(`Não foi possível enviar o passo da Sequência ${sequenciaId}. ${await motivoDaFalhaDaFuncao('sequence-step-sends', error)}`)
    },
    async autorizacao(sequenciaId) {
      const row = await registroPorId(sequenciaId)
      if (row.owner_user_id !== obterUsuarioId()) return null
      const { data, error } = await cliente.rpc('get_sequence_authorization', { p_sequence_id: sequenciaId })
      if (error) throw converterErro(error)
      const linha = (Array.isArray(data) ? data[0] : data) as LinhaDaAutorizacao | null | undefined
      if (!linha) return null
      return {
        versao: linha.version,
        autorizadaEm: linha.authorized_at,
        ativa: linha.active,
        ...(linha.revoked_reason ? { motivoDaRevogacao: linha.revoked_reason } : {}),
      }
    },
    async ativarEnvios(sequenciaId) {
      const { data, error } = await cliente.rpc('activate_sequence', { p_sequence_id: sequenciaId })
      if (error) throw converterErro(error)
      notificar()
      const linha = (Array.isArray(data) ? data[0] : data) as
        | { outcome: string; step_id: string | null; version: number | null; scheduled_for: string | null }
        | null
      if (!linha) throw new Error('O banco não respondeu à ativação.')
      return {
        outcome: linha.outcome,
        ...(linha.step_id ? { stepId: linha.step_id } : {}),
        ...(linha.version ? { versao: linha.version } : {}),
        ...(linha.scheduled_for ? { programadoPara: linha.scheduled_for } : {}),
        ...(MENSAGEM_DA_ATIVACAO[linha.outcome] ? { mensagem: MENSAGEM_DA_ATIVACAO[linha.outcome] } : {}),
      }
    },
    async resolverIncerto(sequenciaId, stepId, saiu) {
      const { error } = await cliente.rpc('resolve_uncertain_step', {
        p_sequence_id: sequenciaId,
        p_step_id: stepId,
        p_went_out: saiu,
      })
      if (error) throw converterErro(error)
      notificar()
    },
    async respostasRecebidas(sequenciaId) {
      const row = await registroPorId(sequenciaId)
      if (row.owner_user_id !== obterUsuarioId()) return []
      const { data, error } = await cliente.rpc('list_received_emails', { p_sequence_id: sequenciaId })
      if (error) throw converterErro(error)
      return ((data ?? []) as LinhaDaResposta[]).map(mapearResposta)
    },
    async urlDoAnexo(interacaoId, anexoId) {
      const { data, error } = await cliente.functions.invoke('received-email-attachments', {
        body: { interactionId: interacaoId, attachmentId: anexoId },
      })
      if (error) {
        const corpo = await corpoDoErroDaFuncao(error)
        if (typeof corpo?.error === 'string') throw new Error(corpo.error)
        throw new Error(`Não foi possível abrir o anexo. ${await motivoDaFalhaDaFuncao('received-email-attachments', error)}`)
      }
      const url = (data as Record<string, unknown> | null)?.url
      if (typeof url !== 'string') throw new Error('Não foi possível abrir o anexo.')
      return url
    },
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
