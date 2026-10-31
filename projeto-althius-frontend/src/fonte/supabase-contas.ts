// As Contas-alvo e os Contatos do Workspace operacional, no Supabase (CRM-04 e CRM-05). Lê Contas, Contatos com
// Vínculo ativo (a visão `target_contacts`) e Interações pelo RLS da Participação ativa e escreve só pelas RPCs, que
// conferem a responsabilidade no servidor. Sinais ainda não têm backend: vêm vazios e recusam as ações, sem dados da
// Demonstração. Arquivar e apagar (CRM-18) também passam só pelas RPCs: as listas padrão escondem o que está arquivado,
// e a Conta apagada nem chega ao navegador (o RLS a esconde). Os e-mails e telefones além do principal (CRM-27) vêm só
// pelas funções `list_contact_channels` e `set_contact_channels`: as tabelas deles não têm acesso direto.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ErroDeModuloIndisponivel } from './ambiente'
import type { CanaisDoContato, RotuloDeEmail, TipoDeTelefone } from './canais-do-contato'
import type {
  ContaAlvo,
  Contato,
  ContatoArquivado,
  ContatoProposto,
  DadosDaReceita,
  DestinosReaisContato,
  EdicaoDoContato,
  EnvioAoCrm,
  EstadoDoEnvioAoCrm,
  FonteDeContas,
  Interacao,
  NovaContaAlvo,
  NovaInteracao,
  NovoContato,
  ResultadoDaRestauracaoDaConta,
  ResultadoDoApagamentoDaConta,
  ResultadoDoArquivamentoDaConta,
  ResultadoDoComite,
  ResultadoDoEnvioAoCrm,
  TipoDeInteracao,
} from './contas-tipos'
import { eEstagioDeProspeccao, type EstagioDeProspeccao } from './estagios-de-prospeccao'
import { corpoDoErroDaFuncao, motivoDaFalhaDaFuncao } from './falha-da-edge-function'
import { criarFonteDeImportacaoSupabase } from './supabase-importacao'
import { lerSinaisDaConta, lerSinaisDasContas } from './supabase-sinais'

interface RegistroConta {
  id: string
  name: string
  canonical_url: string
  domain: string | null
  linkedin_url: string | null
  segment: string | null
  legal_identifier?: string | null
  receita_data?: unknown
  last_interaction_at: string | null
  archived_at?: string | null
}

/** Um Contato arquivado, como a tabela `contacts` o devolve. */
interface RegistroContatoArquivado {
  id: string
  name: string
  role: string | null
  archived_at: string
}

interface RegistroInteracao {
  id: string
  target_account_id: string
  contact_id?: string | null
  kind: TipoDeInteracao
  occurred_at: string
}

/** Um Contato com Vínculo ativo numa Conta, como a visão `target_contacts` o devolve. */
interface RegistroContato {
  id: string
  target_account_id: string
  name: string
  role: string | null
  email: string | null
  whatsapp: string | null
  linkedin: string | null
  last_interaction_at: string | null
  persona: string | null
}

/** O estado da foto de um Contato, como a visão `contact_photo_status` o devolve: `photo_url` só vem se ainda vale. */
interface RegistroFoto {
  contact_id: string
  status: 'pending' | 'found' | 'not_found' | 'failed'
  photo_url: string | null
}

/** Um canal do Contato, como a função `list_contact_channels` o devolve: `label` é o rótulo do e-mail ou o tipo do telefone. */
interface RegistroCanal {
  contact_id: string
  channel: 'email' | 'phone'
  ordinal: number
  value: string
  label: string
  whatsapp: boolean | null
}

const COLUNAS_DO_CONTATO = 'id, target_account_id, name, role, email, whatsapp, linkedin, last_interaction_at, persona'

const COLUNAS_DA_CONTA = 'id, name, canonical_url, domain, linkedin_url, segment, legal_identifier, receita_data, last_interaction_at, archived_at'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const naoEncontrada = () => new Error('Conta-alvo não encontrada.')

function converterErro(error: { message: string; code?: string }): Error {
  // O kanban de prospecção (kanban 03): as recusas de move_prospecting_stage.
  if (error.message.includes('only the responsible seller can move')) {
    return new Error('Só o Vendedor responsável pode mover esta Conta no kanban.')
  }
  if (error.message.includes('only sending to the CRM sets this stage')) {
    return new Error('Só o envio ao CRM leva a Conta para No CRM.')
  }
  if (error.message.includes('unknown prospecting stage')) return new Error('Estágio de prospecção desconhecido.')
  // "Buscar Sinais de novo" (sinais-reais 08): as recusas de request_account_rescan.
  if (error.message.includes('no active monitor to search with')) {
    return new Error('Nenhum Monitoramento ativo para buscar. Ative um em Sinais.')
  }
  if (error.message.includes('insufficient credits')) return new Error('Sem créditos suficientes para esta busca.')
  if (error.message.includes('monthly credit limit reached')) return new Error('Limite do mês atingido. A Automação volta na renovação ou fale com a equipe Althius.')
  // Transferir a responsabilidade (CRM-06): as recusas de transfer_target_account_responsibility.
  if (error.message.includes('the responsible seller is still an active participant')) {
    return new Error('O responsável ainda é Participante ativo: só se transfere depois que ele sair do Workspace.')
  }
  if (error.message.includes('the new responsible seller must be an active participant')) {
    return new Error('Escolha um Participante ativo do Workspace para receber a Conta.')
  }
  if (error.message.includes('a reason is required to transfer responsibility')) {
    return new Error('Diga o motivo da transferência.')
  }
  if (error.message.includes('only administrators can transfer responsibility')) {
    return new Error('Só um Administrador pode transferir a responsabilidade.')
  }
  // Arquivar e apagar (CRM-18): as recusas do banco, antes das regras gerais do Contato.
  if (error.code === '42501' && error.message.includes('only administrators can permanently delete')) {
    return new Error('Só um Administrador pode apagar definitivamente.')
  }
  if (error.code === '42501' && error.message.includes('archive this')) {
    return new Error('Só o Vendedor responsável ou um Administrador pode arquivar este registro.')
  }
  if (error.code === '42501' && error.message.includes('restore this')) {
    return new Error('Só o Vendedor responsável ou um Administrador pode restaurar este registro.')
  }
  if (error.message.includes('the confirmation does not match')) return new Error('O nome digitado não confere com o do registro.')
  if (error.message.includes('the target account is archived')) {
    return new Error('A Conta-alvo está arquivada. Restaure-a para continuar.')
  }
  if (error.message.includes('the contact is archived')) return new Error('O Contato está arquivado. Restaure-o para continuar.')
  if (error.message.includes('the target account was deleted')) return new Error('A Conta-alvo foi apagada.')
  if (error.code === '55P03') return new Error('O registro está sendo arquivado ou apagado agora. Tente de novo em instantes.')
  if (error.code === '42501' && error.message.includes('edit this target account')) {
    return new Error('Esta Conta-alvo já existe e só o Vendedor responsável pode editá-la.')
  }
  if (error.code === '42501' && error.message.includes('interactions')) {
    return new Error('Só o Vendedor responsável pode registrar Interações nesta Conta-alvo.')
  }
  if (error.code === '42501' && error.message.includes('edit this contact')) {
    return new Error('Só um Administrador ou o Vendedor responsável por todas as Contas deste Contato pode editá-lo.')
  }
  if (error.code === '42501' && error.message.includes('contact')) {
    return new Error('Só o Vendedor responsável pela Conta-alvo ou um Administrador pode cadastrar e editar os Contatos dela.')
  }
  // As listas de e-mails e de telefones (CRM-27): as recusas dos gatilhos, que também valem para o principal.
  if (error.code === '23505' && error.message.includes('email already belongs')) {
    return new Error('Já existe um Contato com este e-mail neste Workspace.')
  }
  if (error.code === '23505' && error.message.includes('phone already belongs')) {
    return new Error('Já existe um Contato com este telefone neste Workspace.')
  }
  if (error.message.includes('appears twice in the list')) {
    return new Error('O mesmo e-mail ou telefone aparece duas vezes na lista.')
  }
  if (error.message.includes('at most 3 emails')) return new Error('Um Contato pode ter até 3 e-mails.')
  if (error.message.includes('at most 3 phones')) return new Error('Um Contato pode ter até 3 telefones.')
  if (error.message.includes('primary email cannot be removed') || error.message.includes('primary phone cannot be removed')) {
    return new Error('Este Contato tem e-mails ou telefones adicionais: remova-os, ou troque o principal, na edição do Contato.')
  }
  if (error.code === '23505' && error.message.includes('contacts_email')) {
    return new Error('Já existe um Contato com este e-mail neste Workspace.')
  }
  if (error.code === '23505' && error.message.includes('contacts_phone')) {
    return new Error('Já existe um Contato com este telefone neste Workspace.')
  }
  if (error.code === '23505' && error.message.includes('contacts_linkedin')) {
    return new Error('Já existe um Contato com este LinkedIn neste Workspace.')
  }
  if (error.message.includes('invalid email address')) return new Error('Informe um e-mail válido.')
  if (error.message.includes('invalid whatsapp number')) return new Error('Informe um telefone com DDD ou código do país.')
  if (error.message.includes('contact name is required')) return new Error('Informe o nome do Contato.')
  if (error.message.includes('no active link')) return new Error('O Contato não tem Vínculo ativo com esta Conta-alvo.')
  if (error.message.includes('contact not found') || error.message.includes('active contact link not found')) {
    return new Error('Contato não encontrado nesta Conta-alvo.')
  }
  if (error.message.includes('invalid company url')) return new Error('Informe uma URL da empresa válida.')
  if (error.message.includes('account name is required')) return new Error('Informe o nome da empresa.')
  if (error.code === 'P0002') return naoEncontrada()
  return new Error(error.message)
}

/** As listas de cada Contato, na ordem que a função devolve: o principal (posição 1) primeiro. */
function agruparCanais(registros: RegistroCanal[]): Map<string, CanaisDoContato> {
  const porContato = new Map<string, CanaisDoContato>()
  for (const r of registros) {
    const canais = porContato.get(r.contact_id) ?? { emails: [], telefones: [] }
    if (r.channel === 'email') canais.emails.push({ valor: r.value, rotulo: r.label as RotuloDeEmail })
    else canais.telefones.push({ valor: r.value, tipo: r.label as TipoDeTelefone, whatsapp: r.whatsapp ?? true })
    porContato.set(r.contact_id, canais)
  }
  return porContato
}

function mapearContato(
  linha: RegistroContato,
  foto?: RegistroFoto,
  permissoes: Permissoes = SEM_PERMISSOES,
  canais?: CanaisDoContato,
): Contato {
  return {
    id: linha.id,
    contaId: linha.target_account_id,
    ...(permissoes.podeEditar ? { podeEditar: true } : {}),
    ...(permissoes.podeArquivar ? { podeArquivar: true } : {}),
    ...(permissoes.podeApagar ? { podeApagar: true } : {}),
    nome: linha.name,
    ...(linha.role ? { cargo: linha.role } : {}),
    ...(linha.persona ? { persona: linha.persona } : {}),
    canais: { email: !!linha.email, telefone: !!linha.whatsapp, linkedin: !!linha.linkedin },
    ...(linha.email ? { email: linha.email } : {}),
    ...(linha.whatsapp ? { whatsapp: linha.whatsapp } : {}),
    ...(linha.linkedin ? { linkedin: linha.linkedin } : {}),
    ...(canais ? { emails: canais.emails, telefones: canais.telefones } : {}),
    ...(linha.last_interaction_at ? { ultimoContatoEm: linha.last_interaction_at } : {}),
    ...(foto?.photo_url ? { foto: foto.photo_url } : {}),
    // Uma foto que ainda vale não leva o estado da última busca; sem ela, o estado explica por que faltou.
    ...(!foto?.photo_url && foto?.status === 'not_found' ? { fotoConsulta: 'nao-encontrada' as const } : {}),
    ...(!foto?.photo_url && foto?.status === 'failed' ? { fotoConsulta: 'falhou' as const } : {}),
    ehReal: true,
  }
}

/** A Conta sem nenhum Sinal: não é Quente e não tem o que contar. */
const SEM_SINAIS = { quente: false, totalSinaisValidos: 0 } as const

/** O que quem está na sessão pode fazer com um registro. O banco decide de novo a cada ação: isto só mostra os botões. */
interface Permissoes {
  podeEditar: boolean
  podeArquivar: boolean
  podeApagar: boolean
}

const SEM_PERMISSOES: Permissoes = { podeEditar: false, podeArquivar: false, podeApagar: false }

function mapearConta(
  linha: RegistroConta,
  responsavel: string | undefined,
  usuarioId: string,
  contatos: Contato[] = [],
  administrador = false,
): ContaAlvo {
  const minha = responsavel === usuarioId
  return {
    ...(linha.archived_at ? { arquivadaEm: linha.archived_at } : {}),
    ...(minha || administrador ? { podeArquivar: true } : {}),
    ...(administrador ? { podeApagar: true } : {}),
    id: linha.id,
    nome: linha.name,
    dominio: linha.domain ?? '',
    siteUrl: linha.canonical_url,
    ...(linha.linkedin_url ? { linkedinUrl: linha.linkedin_url } : {}),
    ...(linha.segment ? { segmento: linha.segment } : {}),
    ...(linha.legal_identifier ? { legalIdentifier: linha.legal_identifier } : {}),
    ...(linha.receita_data ? { receitaData: linha.receita_data as any } : {}),
    totalContatos: contatos.length,
    ...(contatos.length > 0
      ? { previaContatos: contatos.slice(0, 3).map((c) => ({ nome: c.nome, ...(c.foto ? { foto: c.foto } : {}) })) }
      : {}),
    ...(linha.last_interaction_at ? { ultimoContatoEm: linha.last_interaction_at } : {}),
    sobMinhaResponsabilidade: responsavel === usuarioId,
  }
}

function mapearInteracao(linha: RegistroInteracao): Interacao {
  return {
    id: linha.id,
    contaId: linha.target_account_id,
    ...(linha.contact_id ? { contatoId: linha.contact_id } : {}),
    tipo: linha.kind,
    data: linha.occurred_at,
    origem: 'Registro manual',
  }
}

export function criarFonteDeContasSupabase(
  cliente: SupabaseClient,
  obterWorkspaceId: () => string,
  obterUsuarioId: () => string,
  /** O papel da Participação da sessão: só o Administrador vê a ação de apagar. O banco confere de novo a cada ação. */
  obterEhAdministrador: () => boolean = () => false,
): FonteDeContas {
  const ouvintes = new Set<() => void>()
  const notificar = () => {
    for (const ouvinte of ouvintes) ouvinte()
  }
  function workspace(): string {
    const id = obterWorkspaceId()
    if (!id) throw new Error('Nenhum Workspace ativo foi selecionado.')
    return id
  }

  /** Quem responde por cada Conta do Workspace, pelo identificador da Conta. */
  async function responsaveis(contaId?: string): Promise<Map<string, string>> {
    let consulta = cliente.from('sales_responsibilities').select('target_account_id, owner_user_id').eq('workspace_id', workspace())
    if (contaId) consulta = consulta.eq('target_account_id', contaId)
    const { data, error } = await consulta
    if (error) throw converterErro(error)
    return new Map((data ?? []).map((r: { target_account_id: string; owner_user_id: string }) => [r.target_account_id, r.owner_user_id]))
  }

  async function conta(id: string): Promise<ContaAlvo> {
    if (!UUID.test(id)) throw naoEncontrada()
    const { data, error } = await cliente.from('target_accounts').select(COLUNAS_DA_CONTA)
      .eq('workspace_id', workspace()).eq('id', id).maybeSingle()
    if (error) throw converterErro(error)
    if (!data) throw naoEncontrada()
    const responsavel = (await responsaveis(id)).get(id)
    return {
      ...mapearConta(data as RegistroConta, responsavel, obterUsuarioId(), await contatos(id), obterEhAdministrador()),
      ...(await foguinhoDaConta(id)),
      ...(await responsavelAusente(responsavel)),
    }
  }

  /** Os Participantes ativos do Workspace, pelo identificador da Conta de usuário. Só quem é Participante ativo lê. */
  async function participantesAtivos(): Promise<{ id: string; nome: string }[]> {
    const { data, error } = await cliente.rpc('list_workspace_participants', { p_workspace_id: workspace() })
    if (error) throw converterErro(error)
    return ((data ?? []) as { user_id: string; email: string; name: string | null }[]).map((p) => ({
      id: p.user_id,
      nome: p.name ?? p.email,
    }))
  }

  /** O Administrador vê quando o responsável saiu do Workspace; para os outros, a fonte não informa. */
  async function responsavelAusente(responsavel: string | undefined): Promise<{ responsavelAusente?: boolean }> {
    if (!obterEhAdministrador() || !responsavel) return {}
    try {
      return { responsavelAusente: !(await participantesAtivos()).some((p) => p.id === responsavel) }
    } catch {
      return {}
    }
  }

  async function foguinhoDaConta(id: string) {
    const sinais = await lerSinaisDasContas(cliente, workspace())
    return sinais ? (sinais.get(id) ?? SEM_SINAIS) : {}
  }

  /** As Contas arquivadas do Workspace, pelo identificador. */
  async function idsDasContasArquivadas(): Promise<Set<string>> {
    const { data, error } = await cliente.from('target_accounts').select('id')
      .eq('workspace_id', workspace()).not('archived_at', 'is', null)
    if (error) throw converterErro(error)
    return new Set(((data ?? []) as { id: string }[]).map((linha) => linha.id))
  }

  /**
   * Os Contatos com Vínculo ativo do Workspace, ou só os de uma Conta, em ordem de nome. A lista do Workspace deixa de
   * fora os das Contas arquivadas; a de uma Conta arquivada mostra os dela, que são o histórico.
   */
  async function contatos(contaId?: string): Promise<Contato[]> {
    const [todos, arquivadas] = await Promise.all([
      contatosDoWorkspace(),
      contaId ? Promise.resolve(new Set<string>()) : idsDasContasArquivadas(),
    ])
    return todos.filter((c) => (contaId ? c.contaId === contaId : !arquivadas.has(c.contaId)))
  }

  /** Uma linha por Vínculo ativo do Workspace, inclusive o das Contas arquivadas, com o que a sessão pode fazer em cada uma. */
  async function contatosDoWorkspace(): Promise<Contato[]> {
    const administrador = obterEhAdministrador()
    const [{ data, error }, fotos, donos] = await Promise.all([
      cliente.from('target_contacts').select(COLUNAS_DO_CONTATO).eq('workspace_id', workspace()).order('name', { ascending: true }),
      fotosDoWorkspace(),
      administrador ? Promise.resolve(new Map<string, string>()) : responsaveis(),
    ])
    if (error) throw converterErro(error)
    const linhas = (data ?? []) as RegistroContato[]
    const canais = await canaisDoWorkspace([...new Set(linhas.map((linha) => linha.id))])
    const contasDoContato = new Map<string, string[]>()
    for (const linha of linhas) {
      contasDoContato.set(linha.id, [...(contasDoContato.get(linha.id) ?? []), linha.target_account_id])
    }
    const usuarioId = obterUsuarioId()
    return linhas.map((linha) =>
      mapearContato(
        linha,
        fotos.get(linha.id),
        {
          podeEditar: administrador || contasDoContato.get(linha.id)!.every((conta) => donos.get(conta) === usuarioId),
          podeArquivar: administrador || donos.get(linha.target_account_id) === usuarioId,
          podeApagar: administrador,
        },
        canais.get(linha.id),
      ),
    )
  }

  /**
   * Os e-mails e telefones dos Contatos, com o rótulo e a marca de WhatsApp de cada um. Se a leitura falhar, os Contatos
   * aparecem só com o principal e sem as listas: a tela não oferece editá-las, para nunca gravar uma lista incompleta.
   */
  async function canaisDoWorkspace(ids: string[]): Promise<Map<string, CanaisDoContato>> {
    if (ids.length === 0) return new Map()
    const { data, error } = await cliente.rpc('list_contact_channels', { p_contact_ids: ids })
    if (error) return new Map()
    return agruparCanais((data ?? []) as RegistroCanal[])
  }

  /**
   * O estado da foto de cada Contato do Workspace, pelo identificador do Contato. A foto é um enfeite: se a leitura
   * falhar, os Contatos aparecem com as iniciais em vez de a lista falhar.
   */
  async function fotosDoWorkspace(): Promise<Map<string, RegistroFoto>> {
    const { data, error } = await cliente.from('contact_photo_status').select('contact_id, status, photo_url')
      .eq('workspace_id', workspace())
    if (error) return new Map()
    return new Map(((data ?? []) as RegistroFoto[]).map((linha) => [linha.contact_id, linha]))
  }

  /** O Contato com Vínculo ativo, na Conta pedida ou na primeira em que atua (mesmo arquivada). */
  async function contato(id: string, contaId?: string): Promise<Contato> {
    const todos = contaId ? await contatos(contaId) : await contatosDoWorkspace()
    const encontrado = todos.find((c) => c.id === id)
    if (!encontrado) throw new Error('Contato não encontrado nesta Conta-alvo.')
    return encontrado
  }

  /**
   * O Estágio de prospecção de cada Conta do Workspace. Uma falha impede mostrar um estágio incorreto no Kanban.
   */
  async function estagiosDoWorkspace(): Promise<Map<string, EstagioDeProspeccao>> {
    const { data, error } = await cliente.rpc('list_prospecting_stages', { p_workspace_id: workspace() })
    if (error) throw converterErro(error)
    const linhas = (data ?? []) as { target_account_id: string; stage: string }[]
    return new Map(
      linhas.filter((l) => eEstagioDeProspeccao(l.stage)).map((l) => [l.target_account_id, l.stage as EstagioDeProspeccao]),
    )
  }

  async function rpc(nome: string, parametros: Record<string, unknown>) {
    const { data, error } = await cliente.rpc(nome, parametros)
    if (error) throw converterErro(error)
    notificar()
    return data
  }

  const nenhum = async () => []

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    hoje: () => new Date(),

    importacao: criarFonteDeImportacaoSupabase(cliente, obterWorkspaceId, notificar),

    async contas() {
      const { data, error } = await cliente.from('target_accounts').select(COLUNAS_DA_CONTA)
        .eq('workspace_id', workspace()).is('archived_at', null).order('name', { ascending: true })
      if (error) throw converterErro(error)
      const [donos, estagios, sinais] = await Promise.all([responsaveis(), estagiosDoWorkspace(), lerSinaisDasContas(cliente, workspace())])
      const porConta = new Map<string, Contato[]>()
      for (const c of await contatos()) porConta.set(c.contaId, [...(porConta.get(c.contaId) ?? []), c])
      return ((data ?? []) as RegistroConta[]).map((linha) => {
        const conta = mapearConta(linha, donos.get(linha.id), obterUsuarioId(), porConta.get(linha.id), obterEhAdministrador())
        const estagio = estagios.get(linha.id)
        // Sem Sinal nenhum a Conta não é Quente; se a leitura dos Sinais falhou, a Fonte não informa (nem Quente, nem não).
        const foguinho = sinais ? (sinais.get(linha.id) ?? SEM_SINAIS) : {}
        return { ...conta, ...(estagio ? { estagio } : {}), ...foguinho }
      })
    },

    async moverEstagio(contaId, estagio) {
      await rpc('move_prospecting_stage', {
        p_workspace_id: workspace(),
        p_target_account_id: contaId,
        p_stage: estagio,
      })
    },

    async custoDeBuscarSinais(contaId) {
      const { data, error } = await cliente.rpc('quote_account_rescan', {
        p_workspace_id: workspace(),
        p_target_account_id: contaId,
      })
      if (error) throw converterErro(error)
      const [linha] = (data ?? []) as {
        monitors: number
        credits: number | string
        available: number | string
        in_progress: boolean
        last_finished_at: string | null
        last_error: string | null
      }[]
      if (!linha) throw new Error('Não foi possível calcular o custo da busca.')
      return {
        monitoramentos: linha.monitors,
        creditos: Number(linha.credits),
        saldo: Number(linha.available),
        emAndamento: linha.in_progress,
        terminouEm: linha.last_finished_at,
        motivo: linha.last_error,
      }
    },

    async buscarSinaisDeNovo(contaId) {
      await rpc('request_account_rescan', { p_workspace_id: workspace(), p_target_account_id: contaId })
    },

    async contasArquivadas() {
      const { data, error } = await cliente.from('target_accounts').select(COLUNAS_DA_CONTA)
        .eq('workspace_id', workspace()).not('archived_at', 'is', null).order('name', { ascending: true })
      if (error) throw converterErro(error)
      const donos = await responsaveis()
      return ((data ?? []) as RegistroConta[]).map((linha) =>
        mapearConta(linha, donos.get(linha.id), obterUsuarioId(), [], obterEhAdministrador()),
      )
    },

    conta,

    async salvarConta(nova: NovaContaAlvo) {
      const { data, error } = await cliente.rpc('save_target_account', {
        p_workspace_id: workspace(),
        p_name: nova.nome.trim(),
        p_url: nova.url.trim(),
        ...(/^(https?:\/\/)?([a-z]{2,3}\.)?(www\.)?linkedin\.com\/company\/[^/?#]+/i.test(nova.url.trim()) ? { p_linkedin_url: nova.url.trim() } : {}),
        p_segment: nova.segmento?.trim() || null,
      })
      if (error) throw converterErro(error)
      const linha = data as RegistroConta
      notificar()
      return mapearConta(
        linha,
        (await responsaveis(linha.id)).get(linha.id),
        obterUsuarioId(),
        await contatos(linha.id),
        obterEhAdministrador(),
      )
    },

    async interacoesDaConta(contaId: string) {
      if (!UUID.test(contaId)) return []
      const { data, error } = await cliente.from('account_interactions').select('id, target_account_id, contact_id, kind, occurred_at')
        .eq('workspace_id', workspace()).eq('target_account_id', contaId).order('occurred_at', { ascending: false })
      if (error) throw converterErro(error)
      return ((data ?? []) as RegistroInteracao[]).map(mapearInteracao)
    },

    async registrarInteracao(nova: NovaInteracao) {
      const { data, error } = await cliente.rpc('register_account_interaction', {
        p_target_account_id: nova.contaId,
        p_kind: nova.tipo,
        p_occurred_at: nova.data ?? null,
        p_contact_id: nova.contatoId ?? null,
      })
      if (error) throw converterErro(error)
      notificar()
      return mapearInteracao(data as RegistroInteracao)
    },

    contatos: () => contatos(),
    contatosDaConta: (contaId: string) => (UUID.test(contaId) ? contatos(contaId) : Promise.resolve([])),

    async salvarContato(novo: NovoContato) {
      const opcional = (valor?: string) => valor?.trim() || null
      const linha = (await rpc('create_contact', {
        p_target_account_id: novo.contaId,
        p_name: novo.nome.trim(),
        p_role: opcional(novo.cargo),
        p_email: opcional(novo.email),
        p_phone: opcional(novo.whatsapp),
        p_linkedin: opcional(novo.linkedin),
      })) as { id: string }
      return contato(linha.id, novo.contaId)
    },

    // Só o que a pessoa informou vai ao banco: texto vazio apaga o canal ou o cargo, campo ausente mantém o valor.
    async editarContato(contatoId: string, campos: EdicaoDoContato) {
      const nome = campos.nome.trim()
      if (!nome) throw new Error('Informe o nome do Contato.')
      await rpc('update_contact', {
        p_contact_id: contatoId,
        p_name: nome,
        p_role: campos.cargo?.trim() ?? null,
        p_email: campos.email?.trim() ?? null,
        p_phone: campos.whatsapp?.trim() ?? null,
        p_linkedin: campos.linkedin?.trim() ?? null,
      })
      return contato(contatoId)
    },

    // A troca das listas é atômica no banco: um valor recusado (de outro Contato, repetido, acima do limite) não muda nada.
    async salvarCanaisDoContato(contatoId: string, canais: CanaisDoContato) {
      await rpc('set_contact_channels', {
        p_contact_id: contatoId,
        p_emails: canais.emails.map((email) => ({ value: email.valor.trim(), label: email.rotulo })),
        p_phones: canais.telefones.map((telefone) => ({
          value: telefone.valor.trim(),
          kind: telefone.tipo,
          whatsapp: telefone.whatsapp,
        })),
      })
      return contato(contatoId)
    },

    async vincularContato(contatoId: string, contaId: string) {
      await rpc('link_contact', { p_contact_id: contatoId, p_target_account_id: contaId })
    },

    async encerrarVinculo(contatoId: string, contaId: string) {
      await rpc('end_contact_link', { p_contact_id: contatoId, p_target_account_id: contaId })
    },

    // Os destinos informados substituem os três canais: um campo vazio apaga o destino.
    async atualizarDestinosContato(contatoId: string, destinos: DestinosReaisContato) {
      await rpc('update_contact', {
        p_contact_id: contatoId,
        p_email: destinos.email?.trim() ?? '',
        p_phone: destinos.whatsapp?.trim() ?? '',
        p_linkedin: destinos.linkedin?.trim() ?? '',
      })
      return contato(contatoId)
    },

    async consultarFotoDoContato(contatoId: string) {
      const { error } = await cliente.functions.invoke('contact-photo-lookup', { body: { contactId: contatoId } })
      if (!error) {
        notificar()
        return
      }
      const recusa = await corpoDoErroDaFuncao(error)
      if (typeof recusa?.error === 'string') throw new Error(recusa.error)
      throw new Error(await motivoDaFalhaDaFuncao('contact-photo-lookup', error, ''))
    },

    // Arquivar e apagar (CRM-18). Depois de apagada, a Conta some da tela (o RLS a esconde); arquivada, vai para a lista
    // de arquivadas. O banco confere o papel, a confirmação e a repetição em cada chamada.
    async arquivarConta(contaId: string): Promise<ResultadoDoArquivamentoDaConta> {
      const resposta = (await rpc('archive_target_account', { p_target_account_id: contaId })) as { sequences_paused?: number }
      return { sequenciasPausadas: resposta.sequences_paused ?? 0 }
    },

    participantesParaTransferir: participantesAtivos,

    async transferirResponsabilidade(contaId: string, novoResponsavelId: string, motivo: string) {
      await rpc('transfer_target_account_responsibility', {
        p_target_account_id: contaId,
        p_new_user_id: novoResponsavelId,
        p_reason: motivo,
      })
    },

    async restaurarConta(contaId: string): Promise<ResultadoDaRestauracaoDaConta> {
      const resposta = (await rpc('restore_target_account', { p_target_account_id: contaId })) as { sequences_unblocked?: number }
      return { sequenciasDestravadas: resposta.sequences_unblocked ?? 0 }
    },

    async apagarConta(contaId: string, confirmacao: string): Promise<ResultadoDoApagamentoDaConta> {
      const resposta = (await rpc('erase_target_account', {
        p_target_account_id: contaId,
        p_confirmation: confirmacao,
      })) as { contacts_erased?: number; contacts_kept?: number; sequences_ended?: number }
      return {
        contatosApagados: resposta.contacts_erased ?? 0,
        contatosMantidos: resposta.contacts_kept ?? 0,
        sequenciasEncerradas: resposta.sequences_ended ?? 0,
      }
    },

    async contatosArquivados(): Promise<ContatoArquivado[]> {
      const [arquivados, vinculos, contas] = await Promise.all([
        cliente.from('contacts').select('id, name, role, archived_at')
          .eq('workspace_id', workspace()).not('archived_at', 'is', null).order('name', { ascending: true }),
        cliente.from('contact_account_links').select('contact_id, target_account_id')
          .eq('workspace_id', workspace()).eq('ended_reason', 'contact_archived'),
        cliente.from('target_accounts').select('id, name').eq('workspace_id', workspace()),
      ])
      for (const { error } of [arquivados, vinculos, contas]) if (error) throw converterErro(error)
      const nomes = new Map(((contas.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]))
      const contaDoContato = new Map(
        ((vinculos.data ?? []) as { contact_id: string; target_account_id: string }[]).map((v) => [v.contact_id, v.target_account_id]),
      )
      return ((arquivados.data ?? []) as RegistroContatoArquivado[]).map((linha) => {
        const contaId = contaDoContato.get(linha.id)
        const contaNome = contaId ? nomes.get(contaId) : undefined
        return {
          id: linha.id,
          nome: linha.name,
          ...(linha.role ? { cargo: linha.role } : {}),
          arquivadoEm: linha.archived_at,
          ...(contaId && contaNome ? { contaId, contaNome } : {}),
          ...(obterEhAdministrador() ? { podeApagar: true } : {}),
        }
      })
    },

    async arquivarContato(contatoId: string) {
      await rpc('archive_contact', { p_contact_id: contatoId })
    },

    async restaurarContato(contatoId: string) {
      await rpc('restore_contact', { p_contact_id: contatoId })
    },

    async apagarContato(contatoId: string, confirmacao: string) {
      await rpc('erase_contact', { p_contact_id: contatoId, p_confirmation: confirmacao })
    },

    async comiteDaConta(contaId: string): Promise<ContatoProposto[]> {
      const { data, error } = await cliente.rpc('list_proposed_contacts', {
        p_target_account_id: contaId,
        p_state: 'nova',
      })
      if (error) return []
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        targetAccountId: r.target_account_id,
        state: r.state,
        name: r.name,
        role: r.role ?? undefined,
        headline: r.headline ?? undefined,
        linkedinUrl: r.linkedin_url ?? undefined,
        location: r.location ?? undefined,
        photoUrl: r.photo_url ?? undefined,
        persona: r.persona ?? undefined,
        contactId: r.contact_id ?? undefined,
        createdAt: r.created_at,
      }))
    },

    async buscarComite(contaId: string): Promise<ResultadoDoComite> {
      const { data: c, error: errConta } = await cliente.from('target_accounts').select('name, linkedin_url, domain').eq('workspace_id', workspace()).eq('id', contaId).maybeSingle()
      if (errConta || !c) throw new Error('Conta não encontrada')
      const { data, error } = await cliente.functions.invoke('account-enrichment', {
        body: {
          action: 'comite-compra',
          workspaceId: workspace(),
          targetAccountId: contaId,
          companyName: c.name,
          companyLinkedinUrl: c.linkedin_url ?? undefined,
          companyDomain: /^(www\.)?linkedin\.com$/i.test(c.domain ?? '') ? undefined : c.domain ?? undefined,
        },
      })
      if (error) {
        const recusa = await corpoDoErroDaFuncao(error)
        if (typeof recusa?.error === 'string' && recusa.error.trim()) throw new Error(recusa.error)
        throw new Error('A busca do comitê falhou.')
      }
      notificar()
      // Só as novas custam crédito; as já encontradas voltam sem custo.
      // A pessoa achada que não foi gravada só aparece quando existe, para a tela avisar.
      const naoGravadas = Number(data?.contactsNotSaved ?? 0)
      return {
        encontradas: Number(data?.contactsFound ?? 0),
        novas: Number(data?.contactsAdded ?? 0),
        jaEncontradas: Number(data?.contactsAlreadyKnown ?? 0),
        ...(naoGravadas > 0 ? { naoGravadas } : {}),
      }
    },

    async aceitarContatoProposto(propostaId: string): Promise<Contato> {
      const { data, error } = await cliente.rpc('accept_proposed_contact', {
        p_id: propostaId,
      })
      if (error) throw converterErro(error)
      notificar()
      return data as Contato
    },

    async descartarContatoProposto(propostaId: string, motivo?: string): Promise<void> {
      const { error } = await cliente.rpc('discard_proposed_contact', {
        p_id: propostaId,
        p_reason: motivo ?? null,
      })
      if (error) throw converterErro(error)
      notificar()
    },

    // E-mail 2 créditos, telefone 5 (decisão de 28/10/2026): o preço vem da cotação do banco.
    async cotarRevelacaoContato(contatoId: string, canal: 'email' | 'telefone') {
      const { data, error } = await cliente.rpc('quote_reveal_contact', {
        p_contact_id: contatoId,
        p_channel: canal,
      })
      if (error) throw converterErro(error)
      const [linha] = (data ?? []) as {
        credits: number | string
        current_balance: number | string
        can_reveal: boolean
        already_known?: boolean
      }[]
      if (!linha || linha.credits == null || linha.current_balance == null
        || !Number.isFinite(Number(linha.credits)) || !Number.isFinite(Number(linha.current_balance))
        || typeof linha.can_reveal !== 'boolean') throw new Error('Não foi possível consultar a cotação.')
      return {
        creditos: Number(linha.credits),
        saldo: Number(linha.current_balance),
        podeRevelar: linha.can_reveal,
        jaEncontrado: linha.already_known === true,
      }
    },

    async revelarContato(contatoId: string, canal: 'email' | 'telefone') {
      const { data, error } = await cliente.functions.invoke('account-enrichment', {
        body: {
          action: 'revelar-contato',
          workspaceId: workspace(),
          contactId: contatoId,
          canal,
        },
      })
      if (error) {
        // A falha da busca é falha, com a causa que a função deu; não vira "não encontrado".
        const recusa = await corpoDoErroDaFuncao(error)
        if (typeof recusa?.error === 'string' && recusa.error.trim()) throw converterErro({ message: recusa.error })
        throw converterErro(error)
      }
      notificar()
      return {
        sucesso: Boolean(data?.sucesso),
        valor: (data?.valor as string) || null,
        creditosDebitados: Number(data?.creditosDebitados || 0),
        jaExistia: data?.jaExistia === true,
      }
    },

    async enriquecerReceita(contaId: string, cnpj: string): Promise<DadosDaReceita> {
      const { data, error } = await cliente.functions.invoke('account-enrichment', {
        body: {
          action: 'cnpj-receita',
          workspaceId: workspace(),
          targetAccountId: contaId,
          cnpj,
        },
      })
      if (error) {
        // A falha da consulta é falha, com a causa que a função deu; não vira "não encontrado" nem o erro genérico.
        const recusa = await corpoDoErroDaFuncao(error)
        if (typeof recusa?.error === 'string' && recusa.error.trim()) throw converterErro({ message: recusa.error })
        throw converterErro(error)
      }
      notificar()
      return data as DadosDaReceita
    },

    // Enviar ao CRM (kanban 05): a Edge Function confere tudo de novo no banco e escreve no CRM com o Acesso da pessoa.
    async enviarAoCrm(contaId, integracaoId): Promise<ResultadoDoEnvioAoCrm> {
      const { data, error } = await cliente.functions.invoke('crm-handoff', {
        body: { action: 'enviar', workspaceId: workspace(), targetAccountId: contaId, integrationId: integracaoId },
      })
      // Uma tentativa que falhou também muda o estado do envio.
      notificar()
      if (error) {
        const recusa = await corpoDoErroDaFuncao(error)
        if (typeof recusa?.error === 'string') throw new Error(recusa.error)
        throw new Error(await motivoDaFalhaDaFuncao('crm-handoff', error, 'SUPABASE_SERVICE_ROLE_KEY e APP_ORIGIN'))
      }
      const resposta = (data ?? {}) as { mensagem?: unknown; pendencias?: unknown }
      return {
        mensagem: typeof resposta.mensagem === 'string' ? resposta.mensagem : 'Enviada ao CRM.',
        pendencias: Array.isArray(resposta.pendencias) ? resposta.pendencias.filter((p): p is string => typeof p === 'string') : [],
      }
    },

    async envioAoCrm(contaId): Promise<EnvioAoCrm | null> {
      const { data, error } = await cliente.rpc('list_crm_handoffs', { p_workspace_id: workspace() })
      if (error) throw converterErro(error)
      const linha = ((data ?? []) as {
        target_account_id: string
        integration_id: string
        status: EstadoDoEnvioAoCrm
        error: string | null
        finished_at: string | null
      }[]).find((l) => l.target_account_id === contaId)
      if (!linha) return null
      return {
        integracaoId: linha.integration_id as EnvioAoCrm['integracaoId'],
        estado: linha.status,
        ...(linha.error ? { erro: linha.error } : {}),
        ...(linha.finished_at ? { concluidoEm: linha.finished_at } : {}),
      }
    },

    // Enviar ao CRM pelos Agentes (ADR-0023): a Edge Function das Conversas confere tudo no banco, guarda o pedido com o
    // pacote e roda a Execução; a tela abre a Conversa para acompanhar e decidir as Aprovações.
    async enviarAoCrmPelosAgentes(contaId, integracaoId) {
      const { data, error } = await cliente.functions.invoke('agent-conversation', {
        body: {
          action: 'enviar_ao_crm',
          workspaceId: workspace(),
          targetAccountId: contaId,
          integrationId: integracaoId,
          clientRequestId: crypto.randomUUID(),
        },
      })
      notificar()
      if (error) {
        const recusa = await corpoDoErroDaFuncao(error)
        if (typeof recusa?.error === 'string') throw new Error(recusa.error)
        throw new Error(await motivoDaFalhaDaFuncao('agent-conversation', error, 'ANTHROPIC_API_KEY e APP_ORIGIN'))
      }
      const conversaId = (data as { conversationId?: unknown } | null)?.conversationId
      if (typeof conversaId !== 'string') throw new Error('Os Agentes não confirmaram o pedido. Tente de novo.')
      return { conversaId }
    },

    async conversaDoEnvioAoCrm(contaId) {
      const { data, error } = await cliente.rpc('list_crm_handoff_conversations', { p_workspace_id: workspace() })
      if (error) return null
      const linha = ((data ?? []) as { target_account_id: string; conversation_id: string }[])
        .find((l) => l.target_account_id === contaId)
      return linha?.conversation_id ?? null
    },

    sinais: nenhum,
    // Os Sinais gravados pela varredura (sinais-reais 02), do mais novo ao mais antigo.
    sinaisDaConta: (contaId) => lerSinaisDaConta(cliente, workspace(), contaId),
    adicionarSinal: () => Promise.reject(new ErroDeModuloIndisponivel('sinais')),
  }
}
