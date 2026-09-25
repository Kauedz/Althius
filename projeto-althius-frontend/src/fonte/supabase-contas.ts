// As Contas-alvo do Workspace operacional, no Supabase (CRM-04). Lê as Contas e as Interações pelo RLS da
// Participação ativa e escreve só pelas RPCs, que conferem a responsabilidade no servidor. Contatos e Sinais ainda
// não têm backend: vêm vazios e recusam as ações, sem dados da Demonstração.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ErroDeModuloIndisponivel } from './ambiente'
import type { ContaAlvo, FonteDeContas, Interacao, NovaContaAlvo, NovaInteracao, TipoDeInteracao } from './contas-tipos'

interface RegistroConta {
  id: string
  name: string
  canonical_url: string
  domain: string
  linkedin_url: string | null
  segment: string | null
  last_interaction_at: string | null
}

interface RegistroInteracao {
  id: string
  target_account_id: string
  kind: TipoDeInteracao
  occurred_at: string
}

const COLUNAS_DA_CONTA = 'id, name, canonical_url, domain, linkedin_url, segment, last_interaction_at'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const naoEncontrada = () => new Error('Conta-alvo não encontrada.')

function converterErro(error: { message: string; code?: string }): Error {
  if (error.code === '42501' && error.message.includes('edit this target account')) {
    return new Error('Esta Conta-alvo já existe e só o Vendedor responsável pode editá-la.')
  }
  if (error.code === '42501' && error.message.includes('interactions')) {
    return new Error('Só o Vendedor responsável pode registrar Interações nesta Conta-alvo.')
  }
  if (error.message.includes('invalid company url')) return new Error('Informe uma URL da empresa válida.')
  if (error.message.includes('account name is required')) return new Error('Informe o nome da empresa.')
  if (error.code === 'P0002') return naoEncontrada()
  return new Error(error.message)
}

function mapearConta(linha: RegistroConta, responsavel: string | undefined, usuarioId: string): ContaAlvo {
  return {
    id: linha.id,
    nome: linha.name,
    dominio: linha.domain,
    siteUrl: linha.canonical_url,
    ...(linha.linkedin_url ? { linkedinUrl: linha.linkedin_url } : {}),
    ...(linha.segment ? { segmento: linha.segment } : {}),
    totalContatos: 0,
    ...(linha.last_interaction_at ? { ultimoContatoEm: linha.last_interaction_at } : {}),
    sobMinhaResponsabilidade: responsavel === usuarioId,
  }
}

function mapearInteracao(linha: RegistroInteracao): Interacao {
  return {
    id: linha.id,
    contaId: linha.target_account_id,
    tipo: linha.kind,
    data: linha.occurred_at,
    origem: 'Registro manual',
  }
}

export function criarFonteDeContasSupabase(
  cliente: SupabaseClient,
  obterWorkspaceId: () => string,
  obterUsuarioId: () => string,
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
    return mapearConta(data as RegistroConta, (await responsaveis(id)).get(id), obterUsuarioId())
  }

  const nenhum = async () => []

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    hoje: () => new Date(),

    async contas() {
      const { data, error } = await cliente.from('target_accounts').select(COLUNAS_DA_CONTA)
        .eq('workspace_id', workspace()).order('name', { ascending: true })
      if (error) throw converterErro(error)
      const donos = await responsaveis()
      return ((data ?? []) as RegistroConta[]).map((linha) => mapearConta(linha, donos.get(linha.id), obterUsuarioId()))
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
      return mapearConta(linha, (await responsaveis(linha.id)).get(linha.id), obterUsuarioId())
    },

    async interacoesDaConta(contaId: string) {
      if (!UUID.test(contaId)) return []
      const { data, error } = await cliente.from('account_interactions').select('id, target_account_id, kind, occurred_at')
        .eq('workspace_id', workspace()).eq('target_account_id', contaId).order('occurred_at', { ascending: false })
      if (error) throw converterErro(error)
      return ((data ?? []) as RegistroInteracao[]).map(mapearInteracao)
    },

    async registrarInteracao(nova: NovaInteracao) {
      // Contatos chegam com o CRM-05: por enquanto a Interação manual fica só na Conta.
      if (nova.contatoId) throw new ErroDeModuloIndisponivel('contatos')
      const { data, error } = await cliente.rpc('register_account_interaction', {
        p_target_account_id: nova.contaId,
        p_kind: nova.tipo,
        p_occurred_at: nova.data ?? null,
      })
      if (error) throw converterErro(error)
      notificar()
      return mapearInteracao(data as RegistroInteracao)
    },

    contatos: nenhum,
    contatosDaConta: nenhum,
    sinais: nenhum,
    sinaisDaConta: nenhum,
    adicionarSinal: () => Promise.reject(new ErroDeModuloIndisponivel('sinais')),
    atualizarDestinosContato: () => Promise.reject(new ErroDeModuloIndisponivel('contatos')),
  }
}
