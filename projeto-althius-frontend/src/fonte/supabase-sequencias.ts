import type { SupabaseClient } from '@supabase/supabase-js'
import { ehCanalSuportado, type AnexoRecebido, type AtualizacaoDocumento, type AutorizacaoDosEnvios, type CanalStep, type DesfechoDoEnvio, type EnvioDoPasso, type FonteDeSequencias, type MetricasDemoSequencia, type MotivoDeEncerramento, type NovaSequencia, type PropostaDeResposta, type RespostaRecebida, type ResultadoDoLoteDeSequencias, type ResumoPublicoSequencia, type Sequencia, type StatusDoEnvio, type StepSequencia, type StatusSequencia, type TaxaDosEnvios, type TaxaPorAbordagem } from './sequencias-tipos'
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
  /** Só a Sequência encerrada tem motivo; a pausada pela Conta arquivada tem `suspended_reason`. */
  ended_reason?: 'responsibility_transferred' | 'account_deleted' | null
  suspended_reason?: 'account_archived' | null
  created_at: string
  updated_at: string
}

const COLUNAS_DA_SEQUENCIA =
  'id, workspace_id, target_account_id, owner_user_id, status, public_summary, ended_reason, suspended_reason, created_at, updated_at'

const MOTIVO_DE_ENCERRAMENTO: Record<string, MotivoDeEncerramento> = {
  responsibility_transferred: 'transferencia',
  account_deleted: 'exclusao',
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
  /** Nulos no Envio desidentificado, depois que o Contato ou a Conta-alvo foi apagado (CRM-18). */
  contact_id: string | null
  destination: string | null
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
  revoked_reason: AutorizacaoDosEnvios['motivoDaRevogacao'] | null
}

/** O que cada bloqueio da ativação diz ao Vendedor responsável. */
const MENSAGEM_DA_ATIVACAO: Record<string, string> = {
  contact_unlinked: 'O Contato de um passo não está vinculado à Conta-alvo. Ajuste o passo antes de ativar.',
  contact_without_email: 'O Contato de um passo não tem e-mail. Cadastre o e-mail antes de ativar.',
  destination_not_found: 'Um passo escolhe um número de e-mail que o Contato não tem. Ajuste o passo antes de ativar.',
  empty_content: 'Um passo de E-mail está sem texto. Escreva o corpo antes de ativar.',
  destination_bounced: 'O e-mail de um Contato já voltou nesta Sequência. Corrija o e-mail antes de ativar.',
  sender_not_ready: 'Sua Conta remetente de E-mail não está pronta para enviar.',
  sequence_not_active: 'Retome a Sequência antes de ativar os envios.',
  no_steps: 'A Sequência ainda não tem passos.',
  contact_without_phone: 'O Contato de um passo de WhatsApp não tem telefone. Cadastre o telefone antes de ativar.',
  phone_not_found: 'Um passo de WhatsApp escolhe um telefone que o Contato não tem. Ajuste o passo antes de ativar.',
  phone_without_whatsapp: 'O telefone escolhido num passo não está marcado como WhatsApp. Ajuste o Contato ou o passo.',
  contact_without_linkedin: 'O Contato de um passo de LinkedIn não tem perfil cadastrado. Cadastre o LinkedIn antes de ativar.',
  linkedin_profile_invalid: 'O LinkedIn do Contato não é o endereço de um perfil (linkedin.com/in/...). Corrija antes de ativar.',
  invalid_linkedin_subtype: 'Um passo de LinkedIn está sem tipo válido (convite ou mensagem). Ajuste o passo.',
  invite_note_too_long: 'A nota de um convite do LinkedIn passou do limite de caracteres. Encurte a nota antes de ativar.',
  whatsapp_sender_not_ready: 'Sua Conta remetente de WhatsApp não está pronta para enviar. Conecte o WhatsApp antes de ativar.',
  linkedin_sender_not_ready: 'Sua Conta remetente de LinkedIn não está pronta para enviar. Conecte o LinkedIn antes de ativar.',
  // Os anexos do passo (canais-10).
  attachment_not_stored: 'Um anexo de um passo não está guardado no Workspace. Anexe o arquivo de novo antes de ativar.',
  attachment_type_not_supported: 'Um passo tem um anexo de um tipo que o canal dele não aceita. Troque o arquivo antes de ativar.',
  attachment_too_large: 'Um anexo passa do tamanho que o canal do passo aceita. Troque o arquivo antes de ativar.',
  too_many_attachments: 'Um passo tem mais anexos do que o canal dele aceita. Tire um antes de ativar.',
  attachment_not_supported_on_invite: 'O convite do LinkedIn não leva anexo. Tire o anexo ou mude o passo para mensagem.',
  attachment_not_supported: 'O canal de um passo não aceita anexos.',
}

interface LinhaDaProposta {
  id: string
  channel: string
  recipient: string
  recipient_name: string | null
  subject: string | null
  body: string | null
  revision: number
  status: PropostaDeResposta['status']
  failure_code: string | null
  sent_at: string | null
  send_error: string | null
  origin_received_at: string | null
  origin_excerpt: string | null
}

/** O motivo que o reply-proposal-runner grava quando o teto barra a primeira geração. */
const PARADA_PELO_TETO: Record<string, NonNullable<PropostaDeResposta['paradaPeloTeto']>> = {
  automation_confirm: 'confirmar',
  automation_no_cap: 'sem_teto',
  automation_cap_reached: 'teto_atingido',
}

function mapearProposta(linha: LinhaDaProposta): PropostaDeResposta {
  const paradaPeloTeto = linha.failure_code ? PARADA_PELO_TETO[linha.failure_code] : undefined
  return {
    id: linha.id,
    canal: linha.channel,
    destinatario: linha.recipient,
    ...(linha.recipient_name ? { nomeDoDestinatario: linha.recipient_name } : {}),
    ...(linha.subject ? { assunto: linha.subject } : {}),
    texto: linha.body ?? '',
    revisao: linha.revision,
    status: linha.status,
    ...(linha.origin_excerpt ? { mensagemDeOrigem: linha.origin_excerpt } : {}),
    ...(linha.origin_received_at ? { recebidaEm: linha.origin_received_at } : {}),
    ...(linha.sent_at ? { enviadaEm: linha.sent_at } : {}),
    ...(linha.send_error ? { erroDoEnvio: linha.send_error } : {}),
    ...(paradaPeloTeto ? { paradaPeloTeto } : {}),
  }
}

/** As recusas das RPCs das Propostas de resposta, em português. */
function erroDaProposta(error: { message?: string }): Error {
  const mensagem = error.message ?? ''
  if (mensagem.includes('changed since it was read')) {
    return new Error('A resposta mudou desde que você abriu. Confira o texto atual e aprove de novo.')
  }
  if (mensagem.includes('outdated')) {
    return new Error('Chegou outra mensagem nesta conversa. Gere a resposta de novo antes de aprovar.')
  }
  if (mensagem.includes('not ready')) return new Error('A resposta ainda não está pronta para aprovar.')
  return new Error('Não foi possível concluir agora. Tente de novo em instantes.')
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
    contatoId: linha.contact_id ?? '',
    destino: linha.destination ?? '',
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

interface LinhaDaRespostaDeChat {
  interaction_id: string
  sequence_id: string
  send_id: string | null
  contact_id: string | null
  channel: string
  from_name: string | null
  body: string | null
  attachments_count: number | null
  received_at: string
}

function mapearRespostaDeChat(linha: LinhaDaRespostaDeChat): RespostaRecebida {
  const canal = linha.channel === 'whatsapp' || linha.channel === 'linkedin' ? linha.channel : undefined
  const quantidade = typeof linha.attachments_count === 'number' && linha.attachments_count > 0
    ? linha.attachments_count
    : undefined
  return {
    interacaoId: linha.interaction_id,
    sequenciaId: linha.sequence_id,
    ...(linha.send_id ? { envioId: linha.send_id } : {}),
    ...(linha.contact_id ? { contatoId: linha.contact_id } : {}),
    ...(canal ? { canal } : {}),
    de: { ...(linha.from_name ? { nome: linha.from_name } : {}) },
    ...(linha.body ? { corpo: linha.body } : {}),
    recebidaEm: linha.received_at,
    anexos: [],
    ...(quantidade ? { quantidadeDeAnexos: quantidade } : {}),
  }
}

function porMaisRecente(a: RespostaRecebida, b: RespostaRecebida): number {
  if (a.recebidaEm === b.recebidaEm) return 0
  return a.recebidaEm < b.recebidaEm ? 1 : -1
}

function numeroSeguro(valor: unknown): number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0 ? valor : 0
}

function documentoDe(row: RegistroSequencia): DocumentoPrivado | null {
  const documento = row.public_summary._document
  return documento && typeof documento === 'object' ? documento as DocumentoPrivado : null
}

const NOME_DO_CANAL_DA_PAUSA: Record<string, string> = { email: 'E-mail', whatsapp: 'WhatsApp', linkedin: 'LinkedIn' }

function mapear(row: RegistroSequencia, ehResponsavel: boolean, canalDaPausa?: CanalStep): Sequencia {
  const documento = ehResponsavel ? documentoDe(row) : null
  const resumo = row.public_summary
  const steps = documento?.steps ?? []
  const participantesIds = documento?.participantesIds ?? []
  const pausadaPelaConta = row.suspended_reason === 'account_archived'
  // Só o estado: os demais leem que a conta do responsável caiu, nunca o documento (canais-11).
  const pausadaPelaContaRemetente = row.status === 'pausada' && !pausadaPelaConta ? canalDaPausa : undefined
  const encerradaPor = row.ended_reason ? MOTIVO_DE_ENCERRAMENTO[row.ended_reason] : undefined
  return {
    id: row.id,
    contaId: row.target_account_id,
    status: row.status,
    // A pausa pela Conta arquivada vale mais que o motivo guardado no documento: a Conta é o que trava a retomada.
    ...(pausadaPelaConta ? { motivoPause: 'Conta arquivada', pausadaPelaConta } : {}),
    ...(!pausadaPelaConta && ehResponsavel && documento?.motivoPause ? { motivoPause: documento.motivoPause } : {}),
    ...(pausadaPelaContaRemetente ? { pausadaPelaContaRemetente } : {}),
    ...(pausadaPelaContaRemetente && !ehResponsavel
      ? { motivoPause: `Conta remetente de ${NOME_DO_CANAL_DA_PAUSA[pausadaPelaContaRemetente] ?? pausadaPelaContaRemetente} desconectada` }
      : {}),
    ...(encerradaPor ? { encerradaPor } : {}),
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

/**
 * O que o backend aceita num passo: um canal suportado e só anexos guardados no Workspace (com id). Um endereço local
 * da Demonstração (blob:) morre com a aba e nunca sairia num envio, então não entra no documento.
 */
function validarPassos(steps: StepSequencia[]) {
  for (const step of steps) {
    if (!ehCanalSuportado(step.canal)) throw new Error(`Canal "${step.canal}" fora do escopo.`)
    if (step.anexos?.some((anexo) => !anexo.id)) throw new ErroDeModuloIndisponivel('anexos')
  }
}

/** Só o que identifica o anexo guardado vai para o documento: nunca um endereço. */
function anexosDoDocumento(steps: StepSequencia[]): StepSequencia[] {
  return steps.map((step) =>
    step.anexos?.length
      ? {
          ...step,
          anexos: step.anexos.map(({ id, tipo, nome, mime, tamanho }) => ({
            id, tipo, nome, ...(mime ? { mime } : {}), ...(tamanho ? { tamanho } : {}),
          })),
        }
      : step,
  )
}

/**
 * Se os anexos dos passos já funcionam neste servidor (canais-10): o módulo foi ligado depois de publicada a Edge
 * Function sequence-attachments. Até lá, ou se a leitura falhar, os anexos ficam indisponíveis no Workspace operacional.
 */
export async function anexosDisponiveis(cliente: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await cliente.rpc('sequence_attachment_limits')
    return !error && Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

function converterErro(error: { message: string; code?: string }): Error {
  // O Resultado do Envio (motor-hermes 03): as recusas de set_send_outcome.
  if (error.message.includes('only the sequence owner can classify its sends')) {
    return new Error('Só o responsável pela Sequência registra o resultado dos Envios dela.')
  }
  if (error.message.includes('only a sent step has an outcome')) return new Error('Só um Envio que saiu tem resultado.')
  if (error.message.includes('unknown send outcome')) return new Error('Resultado desconhecido.')
  // Os motivos que o banco dá para recusar a Sequência de uma Conta-alvo (CRM-17) vêm antes dos genéricos do código.
  if (error.message.includes('target account already has another responsible seller')) {
    return new Error('Só o Vendedor responsável por esta Conta-alvo pode criar a Sequência dela.')
  }
  if (error.message.includes('target account already has a sequence in progress')) {
    return new Error('Esta Conta-alvo já tem uma Sequência em andamento.')
  }
  if (error.message.includes('target account not found')) return new Error('Conta-alvo não encontrada neste Workspace.')
  if (error.message.includes('the sequence is paused because its target account is archived')) {
    return new Error('A Conta-alvo está arquivada: a Sequência só pode ser retomada depois que a Conta for restaurada.')
  }
  if (error.message.includes('the target account is archived')) {
    return new Error('A Conta-alvo está arquivada: restaure a Conta para criar uma Sequência nela.')
  }
  if (error.message.includes('the target account was deleted')) return new Error('A Conta-alvo foi apagada.')
  if (error.message.includes('an ended sequence cannot be changed')) return new Error('Esta Sequência foi encerrada e não pode mais ser alterada.')
  if (error.code === '23503') return new Error('Esta Sequência aponta para uma Conta-alvo que não existe mais neste Workspace.')
  if (error.code === '0A000') return new Error('Só passos de E-mail podem ser confirmados por enquanto.')
  if (error.code === '22023' && error.message === 'contact has no email destination') {
    return new Error('O Contato deste passo não tem o e-mail escolhido. Cadastre-o ou escolha outro número.')
  }
  if (error.code === '22023' && error.message.includes('invalid destination position')) {
    return new Error('O passo escolhe um número de e-mail inválido: use de 1 a 3.')
  }
  if (error.code === '22023' && error.message === 'contact has no active link with this target account') return new Error('O Contato deste passo não está vinculado à Conta-alvo.')
  if (error.code === '55000') return new Error('Este passo já foi enviado ou está sendo enviado.')
  if (error.code === '42501') return new Error('Apenas o responsável ativo pode abrir ou alterar o documento desta Sequência.')
  if (error.code === '23505') return new Error('Esta Conta-alvo já tem uma Sequência em andamento.')
  return new Error(error.message)
}

/** Uma linha de send_outcome_rates; as contagens chegam como bigint, que o PostgREST pode mandar em texto. */
interface RegistroDaTaxa {
  channel: string
  segment: string
  sent: number | string
  replied: number | string
  positive: number | string
  meetings: number | string
  opportunities: number | string
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
  /** Os desfechos dos Envios da Sequência (motor-hermes 03). Se a leitura falhar, os Envios aparecem sem desfecho. */
  async function desfechosDaSequencia(sequenciaId: string): Promise<Map<string, DesfechoDoEnvio>> {
    const { data, error } = await cliente.rpc('list_send_outcomes', { p_sequence_id: sequenciaId })
    if (error) return new Map()
    return new Map(((data ?? []) as { send_id: string; outcome: DesfechoDoEnvio }[]).map((d) => [d.send_id, d.outcome]))
  }

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
      .select(COLUNAS_DA_SEQUENCIA)
      .eq('workspace_id', workspace())
      .order('updated_at', { ascending: false })
    if (error) throw converterErro(error)
    return (data ?? []) as RegistroSequencia[]
  }

  async function registroPorId(id: string): Promise<RegistroSequencia> {
    const { data, error } = await cliente.from('sequences')
      .select(COLUNAS_DA_SEQUENCIA)
      .eq('workspace_id', workspace()).eq('id', id).maybeSingle()
    if (error) throw converterErro(error)
    if (!data) throw new Error('Sequência não encontrada neste Workspace.')
    return data as RegistroSequencia
  }

  /**
   * As Sequências do Workspace pausadas porque a Conta remetente do responsável caiu, e de qual Canal (canais-11). Só o
   * estado; se a leitura falhar (ou o backend ainda não tiver a função), a tela segue sem o motivo.
   */
  async function pausasPelaContaRemetente(): Promise<Map<string, CanalStep>> {
    try {
      const { data, error } = await cliente.rpc('list_sequence_sender_holds', { p_workspace_id: workspace() })
      if (error || !Array.isArray(data)) return new Map()
      return new Map((data as { sequence_id: string; channel: string }[])
        .filter((linha) => ehCanalSuportado(linha.channel))
        .map((linha) => [linha.sequence_id, linha.channel as CanalStep]))
    } catch {
      return new Map()
    }
  }

  async function privada(id: string): Promise<Sequencia> {
    const row = await registroPorId(id)
    const ehResponsavel = row.owner_user_id === obterUsuarioId()
    const pausa = row.status === 'pausada' ? (await pausasPelaContaRemetente()).get(row.id) : undefined
    if (!ehResponsavel) return mapear(row, false, pausa)
    const { data, error } = await cliente.rpc('get_owned_sequence', { p_sequence_id: id })
    if (error) throw converterErro(error)
    const ownerRow = (Array.isArray(data) ? data[0] : data) as RegistroSequencia | null
    if (!ownerRow) throw new Error('Sequência não encontrada ou sem autorização para leitura privada.')
    return mapear(ownerRow, true, pausa)
  }

  return {
    hoje: () => new Date(),
    observar,
    async sequencias() {
      const rows = await listarRegistros()
      const usuarioId = obterUsuarioId()
      const pausas = rows.some((row) => row.status === 'pausada') ? await pausasPelaContaRemetente() : new Map<string, CanalStep>()
      return Promise.all(rows.map(async (row) => {
        if (row.owner_user_id !== usuarioId) return mapear(row, false, pausas.get(row.id))
        const { data, error } = await cliente.rpc('get_owned_sequence', { p_sequence_id: row.id })
        if (error) throw converterErro(error)
        const privateRow = (Array.isArray(data) ? data[0] : data) as RegistroSequencia | null
        if (!privateRow) throw new Error('Não foi possível carregar o documento privado de uma Sequência sua.')
        return mapear(privateRow, true, pausas.get(row.id))
      }))
    },
    sequencia: privada,
    async sequenciaPorConta(contaId) {
      // A Conta tem no máximo uma Sequência em andamento; as encerradas (por uma Transferência de responsabilidade, por
      // exemplo) ficam como histórico. A lista vem da mais recente para a mais antiga.
      const daConta = (await listarRegistros()).filter((item) => item.target_account_id === contaId)
      const row = daConta.find((item) => item.status !== 'encerrada') ?? daConta[0]
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
    async criarSequenciasEmLote(contaIds, template) {
      const { data, error } = await cliente.rpc('create_sequences_in_batch', {
        p_workspace_id: workspace(),
        p_target_account_ids: contaIds,
        p_template: template,
      })
      if (error) throw converterErro(error)
      notificar()
      return ((data ?? []) as { target_account_id: string; outcome: string; sequence_id: string | null }[]).map(
        (linha): ResultadoDoLoteDeSequencias => ({
          contaId: linha.target_account_id,
          desfecho: linha.outcome,
          ...(linha.sequence_id ? { sequenciaId: linha.sequence_id } : {}),
        }),
      )
    },
    async supressoesDoWorkspace() {
      const { data, error } = await cliente.from('contact_suppressions').select('kind, value').eq('workspace_id', workspace())
      if (error) return []
      return (data ?? []) as { kind: 'email' | 'domain'; value: string }[]
    },
    async atualizarDocumento(id: string, atualizacao: AtualizacaoDocumento) {
      const atual = await privada(id)
      if (!atual.responsavel) throw new Error('Apenas o responsável pode alterar esta Sequência.')
      const novoDocumento: DocumentoPrivado = {
        participantesIds: atualizacao.participantesIds ?? atual.participantesIds,
        janelaPadrao: atualizacao.janelaPadrao ?? atual.janelaPadrao,
        regraDePause: atualizacao.regraDePause ?? atual.regraDePause,
        steps: atualizacao.steps ? anexosDoDocumento(atualizacao.steps) : atual.steps,
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
    async taxasPorAbordagem(): Promise<TaxaPorAbordagem[]> {
      const { data, error } = await cliente.rpc('send_outcome_rates_by_approach', { p_workspace_id: workspace() })
      if (error) throw converterErro(error)
      return ((data ?? []) as (Omit<RegistroDaTaxa, 'segment'> & { approach: string })[]).map((linha) => ({
        abordagem: linha.approach,
        canal: linha.channel,
        enviados: Number(linha.sent),
        respostas: Number(linha.replied),
        positivas: Number(linha.positive),
        reunioes: Number(linha.meetings),
        oportunidades: Number(linha.opportunities),
      }))
    },
    async taxasDosEnvios(): Promise<TaxaDosEnvios[]> {
      const { data, error } = await cliente.rpc('send_outcome_rates', { p_workspace_id: workspace() })
      if (error) throw converterErro(error)
      return ((data ?? []) as RegistroDaTaxa[]).map((linha) => ({
        canal: linha.channel,
        segmento: linha.segment,
        enviados: Number(linha.sent),
        respostas: Number(linha.replied),
        positivas: Number(linha.positive),
        reunioes: Number(linha.meetings),
        oportunidades: Number(linha.opportunities),
      }))
    },
    async envios(sequenciaId) {
      const row = await registroPorId(sequenciaId)
      if (row.owner_user_id !== obterUsuarioId()) return []
      const { data, error } = await cliente.rpc('list_sequence_step_sends', { p_sequence_id: sequenciaId })
      if (error) throw converterErro(error)
      const desfechos = await desfechosDaSequencia(sequenciaId)
      return ((data ?? []) as LinhaDoEnvio[]).map((linha) => {
        const envio = mapearEnvio(linha)
        const desfecho = desfechos.get(envio.id)
        return desfecho ? { ...envio, desfecho } : envio
      })
    },
    async classificarEnvio(envioId: string, desfecho: DesfechoDoEnvio) {
      const { error } = await cliente.rpc('set_send_outcome', { p_send_id: envioId, p_outcome: desfecho })
      if (error) throw converterErro(error)
      notificar()
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
      throw new Error(`Não foi possível enviar o passo da Sequência ${sequenciaId}. ${await motivoDaFalhaDaFuncao('sequence-step-sends', error, 'UNIPILE_API_KEY e APP_ORIGIN')}`)
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
    async canaisDeChatLiberados() {
      // A tela pergunta antes de ativar (list_enabled_chat_channels). Sem a leitura, não finge que o canal está ligado.
      const { data, error } = await cliente.rpc('list_enabled_chat_channels')
      if (error || !Array.isArray(data)) return null
      const lista = data.filter((item): item is string => typeof item === 'string')
      return { whatsapp: lista.includes('whatsapp'), linkedin: lista.includes('linkedin') }
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
    async propostasDeResposta(sequenciaId) {
      const { data, error } = await cliente.rpc('list_reply_proposals', {
        p_workspace_id: obterWorkspaceId(),
        p_sequence_id: sequenciaId,
      })
      // Quem não é o titular da Sequência não vê proposta nenhuma: o banco recusa, e a tela mostra a lista vazia.
      if (error) {
        if ((error as { code?: string }).code === '42501') return []
        throw converterErro(error)
      }
      return ((data ?? []) as LinhaDaProposta[]).map(mapearProposta)
    },
    async aprovarEEnviarProposta({ id, revisao, textoEditado }) {
      let revisaoAprovada = revisao
      if (textoEditado !== undefined) {
        const { data, error } = await cliente.rpc('edit_reply_proposal', {
          p_proposal_id: id,
          p_revision: revisao,
          p_body: textoEditado,
        })
        if (error) throw erroDaProposta(error)
        revisaoAprovada = Number(data)
      }
      const aprovada = await cliente.rpc('approve_reply_proposal', { p_proposal_id: id, p_revision: revisaoAprovada })
      if (aprovada.error) throw erroDaProposta(aprovada.error)
      const { error } = await cliente.functions.invoke('reply-proposal-send', {
        body: { action: 'send', workspaceId: obterWorkspaceId(), proposalId: id },
      })
      notificar()
      if (!error) return { enviada: true }
      const corpo = await corpoDoErroDaFuncao(error)
      const mensagem = typeof corpo?.message === 'string' ? corpo.message : typeof corpo?.error === 'string' ? corpo.error : null
      return {
        enviada: false,
        mensagem: mensagem ?? (await motivoDaFalhaDaFuncao('reply-proposal-send', error, 'UNIPILE_API_KEY e APP_ORIGIN')),
      }
    },
    async rejeitarProposta(id) {
      const { error } = await cliente.rpc('reject_reply_proposal', { p_proposal_id: id })
      if (error) throw erroDaProposta(error)
      notificar()
    },
    async gerarPropostaDeNovo(id) {
      const { error } = await cliente.rpc('request_reply_proposal_again', { p_proposal_id: id })
      if (error) throw erroDaProposta(error)
      notificar()
    },
    async respostasRecebidas(sequenciaId) {
      const row = await registroPorId(sequenciaId)
      if (row.owner_user_id !== obterUsuarioId()) return []
      const emails = await cliente.rpc('list_received_emails', { p_sequence_id: sequenciaId })
      if (emails.error) throw converterErro(emails.error)
      const deEmail = ((emails.data ?? []) as LinhaDaResposta[]).map(mapearResposta)
      const chats = await cliente.rpc('list_received_chat_messages', { p_sequence_id: sequenciaId })
      // Falha do chat (função ainda não publicada no dublê, ou recusa) não esconde o e-mail e não busca o texto por outro caminho.
      if (chats.error) return deEmail.sort(porMaisRecente)
      const deChat = ((chats.data ?? []) as LinhaDaRespostaDeChat[]).map(mapearRespostaDeChat)
      return [...deEmail, ...deChat].sort(porMaisRecente)
    },
    async urlDoAnexo(interacaoId, anexoId) {
      const { data, error } = await cliente.functions.invoke('received-email-attachments', {
        body: { interactionId: interacaoId, attachmentId: anexoId },
      })
      if (error) {
        const corpo = await corpoDoErroDaFuncao(error)
        if (typeof corpo?.error === 'string') throw new Error(corpo.error)
        throw new Error(`Não foi possível abrir o anexo. ${await motivoDaFalhaDaFuncao('received-email-attachments', error, 'APP_ORIGIN')}`)
      }
      const url = (data as Record<string, unknown> | null)?.url
      if (typeof url !== 'string') throw new Error('Não foi possível abrir o anexo.')
      return url
    },
    async anexarArquivo(sequenciaId, stepId, arquivo) {
      const corpo = new FormData()
      corpo.set('sequenceId', sequenciaId)
      corpo.set('stepId', stepId)
      corpo.set('file', arquivo, arquivo.name)
      const { data, error } = await cliente.functions.invoke('sequence-attachments', { body: corpo })
      if (error) {
        const resposta = await corpoDoErroDaFuncao(error)
        if (typeof resposta?.error === 'string') throw new Error(resposta.error)
        throw new Error(`Não foi possível anexar o arquivo. ${await motivoDaFalhaDaFuncao('sequence-attachments', error, 'APP_ORIGIN')}`)
      }
      const anexo = data as Record<string, unknown> | null
      if (typeof anexo?.id !== 'string') throw new Error('Não foi possível anexar o arquivo.')
      return {
        id: anexo.id,
        tipo: anexo.tipo === 'video' ? 'video' : 'imagem',
        nome: arquivo.name || 'anexo',
        ...(typeof anexo.mime === 'string' ? { mime: anexo.mime } : {}),
        ...(typeof anexo.tamanho === 'number' ? { tamanho: anexo.tamanho } : {}),
      }
    },
    async urlDoAnexoDoPasso(anexoId) {
      const { data, error } = await cliente.functions.invoke('sequence-attachments', {
        body: { action: 'url', attachmentId: anexoId },
      })
      if (error) {
        const resposta = await corpoDoErroDaFuncao(error)
        if (typeof resposta?.error === 'string') throw new Error(resposta.error)
        throw new Error(`Não foi possível abrir o anexo. ${await motivoDaFalhaDaFuncao('sequence-attachments', error, 'APP_ORIGIN')}`)
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
        ...(resumo.encerradaPor ? { encerradaPor: resumo.encerradaPor } : {}),
        atualizadaEm: resumo.atualizadaEm,
      }
    },
  }
}
