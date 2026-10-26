// A configuração dos Agentes do Workspace operacional, no Supabase (CRM-13): os Agentes padrão e criados, a
// Personalização, a Permissão por Integração, a Memória, as Habilidades, as Rotinas e a Atividade. Tudo passa pelas
// funções do banco, que conferem a Participação ativa de quem chama: todo participante consulta, e só o Administrador
// cria, exclui e altera. O banco também guarda que o Agente padrão não é excluído nem renomeado. Nada aqui executa um
// Agente: a Atividade só lê as Execuções que já existem (agent_activity), e o estado do Agente é sempre ocioso.
// Conectar Canais e Integrações é do módulo de Conexões. Aqui os Canais só dizem se estão conectados, pela mesma leitura
// de Conexões (o Slack quando instalado e ativo); as Integrações vêm do catálogo, todas não conectadas.

import type { SupabaseClient } from '@supabase/supabase-js'
import { integracoesConectadas } from './catalogo-de-conexoes'
import { formatarDataDoModulo } from './formatar-data'
import { especialidade, especialidades } from './especialidades'
import { ERRO_SEM_PARTICIPACAO, ERRO_SO_ADMINISTRADOR, nomeDeAgenteCriado } from './regras'
import { lerCanaisDoWorkspace } from './supabase-conexoes'
import { mensagemDaFalha } from './supabase-conversas'
import type {
  Agente,
  AgenteId,
  CanalId,
  DocumentoDaMemoria,
  EspecialidadeId,
  Fato,
  FonteDeAgentes,
  FonteDeConhecimento,
  Frequencia,
  Gatilho,
  Habilidade,
  IntegracaoId,
  ItemDeAtividade,
  NovaRotina,
  Permissao,
  Personalizacao,
  Rotina,
  TipoDeAgente,
} from './tipos'

interface RegistroDaRotinaAtiva {
  id: string
  task: string
  frequency: Frequencia
  weekday: string | null
  time: string
  channel: CanalId | null
}

interface RegistroDoAgente {
  id: string
  name: string
  kind: TipoDeAgente
  specialty: EspecialidadeId
  instructions: string
  integrations: IntegracaoId[]
  active_routine: RegistroDaRotinaAtiva | null
}

interface RegistroDaPersonalizacao {
  instructions: string
  voice_tone: string
  channels: CanalId[]
  knowledge: { id: string; kind: FonteDeConhecimento['tipo']; name: string }[]
  permissions: Partial<Record<IntegracaoId, Permissao>>
}

interface RegistroDaExecucao {
  id: string
  agent_id: string
  conversation_id: string
  trigger_kind: Gatilho
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  request_text: string
  result_text: string | null
  error_code: string | null
  created_at: string
  started_at: string | null
  retried_by: string | null
}

/** Quantas Execuções a Atividade mostra de uma vez. */
const EXECUCOES_NA_ATIVIDADE = 50

/** Quando a Execução começou, como a Atividade mostra: "Hoje, 08:00", "Ontem, 17:30", "Há 3 dias, 09:00". */
function quandoDaExecucao(criadaEm: string): string {
  const data = new Date(criadaEm)
  const horario = `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`
  return `${formatarDataDoModulo(data, new Date(), { maiuscula: true })}, ${horario}`
}

function converterExecucao(linha: RegistroDaExecucao): ItemDeAtividade {
  const falhou = linha.status === 'failed'
  const motivoDaFalha = mensagemDaFalha(linha.error_code)
  const resultado = falhou
    ? motivoDaFalha === 'Não foi possível responder agora.'
      ? 'A Execução não se concluiu e nada foi alterado.'
      : motivoDaFalha
    : linha.status === 'succeeded'
      ? linha.result_text || 'Concluída.'
      : linha.started_at === undefined
        ? 'Em andamento.'
      : (() => {
          const inicio = new Date(linha.started_at ?? linha.created_at).getTime()
          const minutos = Math.max(0, Math.floor((Date.now() - inicio) / 60_000))
          return minutos >= 10 ? `Parada há ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.` : 'Em andamento.'
        })()
  return {
    id: linha.id,
    agenteId: linha.agent_id,
    tipo: 'execucao',
    gatilho: linha.trigger_kind,
    quando: quandoDaExecucao(linha.created_at),
    descricao: linha.request_text,
    resultado,
    ...(linha.trigger_kind !== 'rotina'
      ? { link: { rotulo: 'Ver Conversa', para: `/agentes/${linha.agent_id}/conversa?conversa=${linha.conversation_id}` } }
      : {}),
    ...(falhou ? { falhou: true } : {}),
    ...(falhou && linha.error_code !== 'membership_inactive' && !linha.retried_by ? { tentarDeNovo: true } : {}),
  }
}

interface RegistroDoFato {
  id: string
  content: string
  origin: string
}

interface RegistroDaHabilidade {
  id: string
  name: string
  description: string
  uses: number
  last_improved_at: string
  active: boolean
  uses_document: DocumentoDaMemoria | null
}

interface RegistroDaRotina {
  id: string
  task: string
  frequency: Frequencia
  weekday: string | null
  run_time: string
  destination_channel: CanalId | null
  paused: boolean
  day_of_month?: number | null
  monthly_cap?: number | string | null
  month_spent?: number | string
  blocked_reason?: 'confirmar' | 'sem_teto' | 'teto_atingido' | null
}

/** Uma recusa das funções do banco: o SQLSTATE, o trecho da mensagem que a identifica e o texto para a pessoa. */
type Recusa = [code: string, trecho: string, texto: (nome?: string) => string]

/** As recusas das funções de Agentes (migration agentes_e_permissoes), num só lugar. */
const RECUSAS: Recusa[] = [
  ['42501', 'only administrators', () => ERRO_SO_ADMINISTRADOR],
  ['42501', 'active workspace membership required', () => ERRO_SEM_PARTICIPACAO],
  ['42501', 'default agents cannot be deleted', () => 'O Agente padrão não pode ser excluído.'],
  ['42501', 'agents cannot be renamed', () => 'Um Agente não é renomeado nem muda de Especialidade.'],
  ['23505', 'agent name already exists', (nome) => `Já existe um Agente chamado ${nome ?? 'assim'}.`],
  [
    '23503',
    'agent has references',
    () => 'Este Agente ainda tem registros ligados a ele que não acompanham a exclusão. Nada foi apagado.',
  ],
  ['P0002', 'agent not found', () => 'Este Agente não existe mais neste Workspace.'],
  ['22023', 'invalid specialty', () => 'Escolha uma das Especialidades da Althius.'],
  ['22023', 'invalid complement', () => 'Informe o complemento do nome, com até 60 caracteres.'],
  ['22023', 'invalid instructions', () => 'As instruções têm no máximo 4.000 caracteres.'],
  ['22023', 'invalid voice tone', () => 'O tom de voz tem no máximo 500 caracteres.'],
  ['22023', 'invalid knowledge', () => 'Confira a base de conhecimento: cada item precisa de um nome de até 500 caracteres.'],
  ['22023', 'invalid permission', () => 'A Permissão de uma Integração é Ler, Propor ou Executar.'],
  ['22023', 'unknown integration', () => 'Esta Integração não existe no catálogo da Althius.'],
  ['22023', 'invalid channel', () => 'Escolha um dos Canais da Althius.'],
  ['22023', 'invalid content', () => 'O fato precisa de um texto, com até 1.000 caracteres.'],
  ['22023', 'invalid task', () => 'Descreva a tarefa da Rotina, com até 500 caracteres.'],
  ['22023', 'invalid frequency', () => 'Escolha a frequência da Rotina: todo dia, toda semana ou todo mês.'],
  ['22023', 'invalid weekday', () => 'Escolha o dia da semana de uma Rotina semanal; só ela tem dia da semana.'],
  ['22023', 'invalid day of month', () => 'Informe o dia do mês da Rotina mensal, de 1 a 28.'],
  ['22023', 'invalid time', () => 'Informe um horário válido, como 09:00.'],
]

const FALHA_AO_CARREGAR = 'Não foi possível carregar os Agentes. Verifique sua conexão e tente de novo.'
const FALHA_AO_GRAVAR = 'Não foi possível concluir agora. Nada foi alterado; verifique sua conexão e tente de novo.'

/**
 * A mensagem para a pessoa, a partir da recusa que a função do banco levantou; uma falha que não é recusa (rede,
 * servidor) vira `falha`, sem mostrar o erro técnico.
 */
function converterErro(error: { message: string; code?: string }, falha: string, nome?: string): Error {
  const recusa = RECUSAS.find(([code, trecho]) => error.code === code && error.message.includes(trecho))
  return new Error(recusa ? recusa[2](nome) : falha)
}

/** A data do banco (aaaa-mm-dd) como a Habilidade a mostra (dd/mm/aaaa). */
const diaEmPortugues = (dia: string) => dia.slice(0, 10).split('-').reverse().join('/')

function converterRotina(agenteId: AgenteId, linha: RegistroDaRotina): Rotina {
  return {
    id: linha.id,
    agenteId,
    tarefa: linha.task,
    frequencia: linha.frequency,
    ...(linha.weekday ? { diaDaSemana: linha.weekday } : {}),
    ...(linha.day_of_month ? { diaDoMes: linha.day_of_month } : {}),
    horario: linha.run_time,
    canalDestino: linha.destination_channel,
    pausada: linha.paused,
    ...(linha.blocked_reason !== undefined
      ? {
          teto: linha.monthly_cap == null ? null : Number(linha.monthly_cap),
          gastoNoMes: Number(linha.month_spent ?? 0),
          bloqueio: linha.blocked_reason,
        }
      : {}),
  }
}

function converterAgente(linha: RegistroDoAgente): Agente {
  const daEspecialidade = especialidade(linha.specialty)
  const rotina = linha.active_routine
  return {
    id: linha.id,
    nome: linha.name,
    tipo: linha.kind,
    especialidade: daEspecialidade,
    // Sem Execução não há o que o Agente esteja fazendo, nem o que tenha detectado.
    estado: 'ocioso',
    execucoes: 0,
    descricao: (linha.kind === 'criado' && linha.instructions) || daEspecialidade.descricao,
    rotinaAtiva: rotina
      ? converterRotina(linha.id, {
          id: rotina.id,
          task: rotina.task,
          frequency: rotina.frequency,
          weekday: rotina.weekday,
          run_time: rotina.time,
          destination_channel: rotina.channel,
          paused: false,
        })
      : null,
    integracoes: linha.integrations,
  }
}

export type FonteDaConfiguracaoDosAgentes = Pick<
  FonteDeAgentes,
  | 'observar'
  | 'especialidades'
  | 'agentes'
  | 'agente'
  | 'criarAgente'
  | 'excluirAgente'
  | 'memoria'
  | 'editarFato'
  | 'apagarFato'
  | 'habilidades'
  | 'definirHabilidadeAtiva'
  | 'rotinas'
  | 'criarRotina'
  | 'editarRotina'
  | 'definirRotinaPausada'
  | 'excluirRotina'
  | 'atividade'
  | 'tentarDeNovo'
  | 'personalizacao'
  | 'salvarPersonalizacao'
  | 'canais'
  | 'integracoes'
  | 'integracoesFuturas'
>

export function criarFonteDeAgentesSupabase(cliente: SupabaseClient, workspaceId: string): FonteDaConfiguracaoDosAgentes {
  const ouvintes = new Set<() => void>()
  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte())

  /** Chama a função do banco e, se ela recusar, lança a mensagem para a pessoa. */
  async function chamar<T>(funcao: string, parametros: Record<string, unknown>, falha: string, nome?: string): Promise<T> {
    const { data, error } = await cliente.rpc(funcao, parametros)
    if (error) throw converterErro(error, falha, nome)
    return data as T
  }

  /** Uma escrita: depois dela, as telas que leem Agentes recarregam. */
  async function gravar(funcao: string, parametros: Record<string, unknown>, nome?: string) {
    await chamar(funcao, parametros, FALHA_AO_GRAVAR, nome)
    avisar()
  }

  async function agentes(): Promise<Agente[]> {
    const linhas = await chamar<RegistroDoAgente[]>('list_agents', { p_workspace_id: workspaceId }, FALHA_AO_CARREGAR)
    return linhas.map(converterAgente)
  }

  async function agente(id: AgenteId): Promise<Agente> {
    const encontrado = (await agentes()).find((a) => a.id === id)
    if (!encontrado) throw new Error('Este Agente não existe mais neste Workspace.')
    return encontrado
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },

    // O catálogo é fixo: não há operação para criar uma Especialidade.
    especialidades: async () => especialidades,

    agentes,
    agente,

    async criarAgente({ especialidadeId, complemento, instrucoes }) {
      const id = await chamar<string>(
        'create_agent',
        {
          p_workspace_id: workspaceId,
          p_specialty: especialidadeId,
          p_complement: complemento,
          p_instructions: instrucoes,
        },
        FALHA_AO_GRAVAR,
        nomeDeAgenteCriado(especialidade(especialidadeId), complemento),
      )
      avisar()
      return agente(id)
    },

    excluirAgente: (id) => gravar('delete_agent', { p_agent_id: id }),

    async memoria(id): Promise<Fato[]> {
      const linhas = await chamar<RegistroDoFato[]>('list_agent_memory', { p_agent_id: id }, FALHA_AO_CARREGAR)
      return linhas.map((linha) => ({ id: linha.id, agenteId: id, texto: linha.content, origem: linha.origin }))
    },
    editarFato: (fatoId, texto) => gravar('edit_agent_memory_fact', { p_fact_id: fatoId, p_content: texto }),
    apagarFato: (fatoId) => gravar('delete_agent_memory_fact', { p_fact_id: fatoId }),

    async habilidades(id): Promise<Habilidade[]> {
      const linhas = await chamar<RegistroDaHabilidade[]>('list_agent_skills', { p_agent_id: id }, FALHA_AO_CARREGAR)
      return linhas.map((linha) => ({
        id: linha.id,
        agenteId: id,
        nome: linha.name,
        descricao: linha.description,
        usos: linha.uses,
        ultimaMelhoria: diaEmPortugues(linha.last_improved_at),
        ativa: linha.active,
        ...(linha.uses_document ? { usaDocumento: linha.uses_document } : {}),
      }))
    },
    definirHabilidadeAtiva: (habilidadeId, ativa) =>
      gravar('set_agent_skill_active', { p_skill_id: habilidadeId, p_active: ativa }),

    async rotinas(id): Promise<Rotina[]> {
      const linhas = await chamar<RegistroDaRotina[]>('list_agent_routines', { p_agent_id: id }, FALHA_AO_CARREGAR)
      return linhas.map((linha) => converterRotina(id, linha))
    },
    criarRotina: (rotina: NovaRotina) =>
      gravar('create_agent_routine', {
        p_agent_id: rotina.agenteId,
        p_task: rotina.tarefa,
        p_frequency: rotina.frequencia,
        p_weekday: rotina.diaDaSemana ?? null,
        p_time: rotina.horario,
        p_channel: rotina.canalDestino,
        // Só a Rotina mensal manda o dia do mês: as outras seguem como antes, mesmo com o banco ainda sem a migration.
        ...(rotina.frequencia === 'mensal' ? { p_day_of_month: rotina.diaDoMes ?? null } : {}),
      }),
    editarRotina: (rotinaId, rotina) =>
      gravar('update_agent_routine', {
        p_routine_id: rotinaId,
        p_task: rotina.tarefa,
        p_frequency: rotina.frequencia,
        p_weekday: rotina.diaDaSemana ?? null,
        p_time: rotina.horario,
        p_channel: rotina.canalDestino,
        // Só a Rotina mensal manda o dia do mês: as outras seguem como antes, mesmo com o banco ainda sem a migration.
        ...(rotina.frequencia === 'mensal' ? { p_day_of_month: rotina.diaDoMes ?? null } : {}),
      }),
    definirRotinaPausada: (rotinaId, pausada) =>
      gravar('set_agent_routine_paused', { p_routine_id: rotinaId, p_paused: pausada }),
    excluirRotina: (rotinaId) => gravar('delete_agent_routine', { p_routine_id: rotinaId }),

    // A Atividade são as Execuções do Agente nas Conversas de quem chama (a Conversa é de quem a começou), as mais
    // recentes primeiro.
    async atividade(id, gatilho): Promise<ItemDeAtividade[]> {
      const atual = await cliente.rpc('list_agent_run_attention', { p_workspace_id: workspaceId, p_agent_id: id })
      if (atual.error && atual.error.code !== 'PGRST202') throw converterErro(atual.error, FALHA_AO_CARREGAR)
      let linhas = (atual.error ? null : atual.data) as RegistroDaExecucao[] | null
      // Um banco anterior à migration ainda tem a leitura privada da Atividade. Ela preserva a tela até a RPC nova existir.
      if (!linhas) {
        linhas = await chamar<RegistroDaExecucao[] | null>(
          'agent_activity',
          { p_workspace_id: workspaceId, p_agent_id: id, p_trigger_kind: gatilho ?? null, p_limit: EXECUCOES_NA_ATIVIDADE },
          FALHA_AO_CARREGAR,
        )
      }
      return (linhas ?? []).filter((linha) => !gatilho || linha.trigger_kind === gatilho).slice(0, EXECUCOES_NA_ATIVIDADE).map(converterExecucao)
    },

    async tentarDeNovo(runId) {
      const linhas = await chamar<{ id: string; status: string }[] | null>(
        'retry_agent_run',
        { p_run_id: runId, p_client_request_id: crypto.randomUUID() },
        FALHA_AO_GRAVAR,
      )
      const id = linhas?.[0]?.id
      if (!id) throw new Error(FALHA_AO_GRAVAR)
      avisar()
      return id
    },

    async personalizacao(id): Promise<Personalizacao> {
      const [linha] = await chamar<RegistroDaPersonalizacao[]>('get_agent_settings', { p_agent_id: id }, FALHA_AO_CARREGAR)
      return {
        instrucoes: linha.instructions,
        tomDeVoz: linha.voice_tone,
        baseDeConhecimento: linha.knowledge.map(({ id: fonteId, kind, name }) => ({ id: fonteId, tipo: kind, nome: name })),
        canais: linha.channels,
        permissoes: linha.permissions,
      }
    },
    salvarPersonalizacao: (id, personalizacao) =>
      gravar('save_agent_settings', {
        p_agent_id: id,
        p_instructions: personalizacao.instrucoes,
        p_voice_tone: personalizacao.tomDeVoz,
        p_channels: personalizacao.canais,
        p_knowledge: personalizacao.baseDeConhecimento.map(({ tipo, nome }) => ({ kind: tipo, name: nome })),
        p_permissions: personalizacao.permissoes,
      }),

    // Conectar Canais e Integrações é o módulo de Conexões: aqui o Canal só diz se está conectado, para o Agente atender nele.
    async canais() {
      const canais = await lerCanaisDoWorkspace(cliente, workspaceId)
      return canais.map(({ id, nome, descricao, conectado }) => ({ id, nome, descricao, conectado }))
    },
    integracoes: async () => integracoesConectadas([]),
    integracoesFuturas: async () => [],
  }
}
