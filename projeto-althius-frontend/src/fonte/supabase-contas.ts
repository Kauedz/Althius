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
  DestinosReaisContato,
  EdicaoDoContato,
  FonteDeContas,
  Interacao,
  NovaContaAlvo,
  NovaInteracao,
  NovoContato,
  ResultadoDaRestauracaoDaConta,
  ResultadoDoApagamentoDaConta,
  ResultadoDoArquivamentoDaConta,
  TipoDeInteracao,
} from './contas-tipos'
import { corpoDoErroDaFuncao, motivoDaFalhaDaFuncao } from './falha-da-edge-function'
import { criarFonteDeImportacaoSupabase } from './supabase-importacao'

interface RegistroConta {
  id: string
  name: string
  canonical_url: string
  domain: string
  linkedin_url: string | null
  segment: string | null
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
  /** O telefone principal, marcado ou não como WhatsApp. */
  phone?: string | null
  /** O telefone principal só quando marcado como WhatsApp (a visão `target_contacts` o esconde sem a marca). */
  whatsapp: string | null
  linkedin: string | null
  last_interaction_at: string | null
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

const COLUNAS_DO_CONTATO = 'id, target_account_id, name, role, email, phone, whatsapp, linkedin, last_interaction_at'

const COLUNAS_DA_CONTA = 'id, name, canonical_url, domain, linkedin_url, segment, last_interaction_at, archived_at'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const naoEncontrada = () => new Error('Conta-alvo não encontrada.')

function converterErro(error: { message: string; code?: string }): Error {
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
    canais: { email: !!linha.email, telefone: !!(linha.whatsapp ?? linha.phone), linkedin: !!linha.linkedin },
    ...(linha.email ? { email: linha.email } : {}),
    ...(linha.whatsapp ? { whatsapp: linha.whatsapp } : {}),
    ...(linha.phone && !linha.whatsapp ? { telefoneSemWhatsApp: linha.phone } : {}),
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
    dominio: linha.domain,
    siteUrl: linha.canonical_url,
    ...(linha.linkedin_url ? { linkedinUrl: linha.linkedin_url } : {}),
    ...(linha.segment ? { segmento: linha.segment } : {}),
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
    return mapearConta(
      data as RegistroConta,
      (await responsaveis(id)).get(id),
      obterUsuarioId(),
      await contatos(id),
      obterEhAdministrador(),
    )
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
      const donos = await responsaveis()
      const porConta = new Map<string, Contato[]>()
      for (const c of await contatos()) porConta.set(c.contaId, [...(porConta.get(c.contaId) ?? []), c])
      return ((data ?? []) as RegistroConta[]).map((linha) =>
        mapearConta(linha, donos.get(linha.id), obterUsuarioId(), porConta.get(linha.id), obterEhAdministrador()),
      )
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
      throw new Error(await motivoDaFalhaDaFuncao('contact-photo-lookup', error, 'APIFY_TOKEN e APP_ORIGIN'))
    },

    // Arquivar e apagar (CRM-18). Depois de apagada, a Conta some da tela (o RLS a esconde); arquivada, vai para a lista
    // de arquivadas. O banco confere o papel, a confirmação e a repetição em cada chamada.
    async arquivarConta(contaId: string): Promise<ResultadoDoArquivamentoDaConta> {
      const resposta = (await rpc('archive_target_account', { p_target_account_id: contaId })) as { sequences_paused?: number }
      return { sequenciasPausadas: resposta.sequences_paused ?? 0 }
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

    sinais: nenhum,
    sinaisDaConta: nenhum,
    adicionarSinal: () => Promise.reject(new ErroDeModuloIndisponivel('sinais')),
  }
}
