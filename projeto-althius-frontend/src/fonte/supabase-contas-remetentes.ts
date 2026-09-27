// As Contas remetentes do titular no Workspace operacional. A lista vem da RPC `list_owned_sender_accounts`, que só
// devolve as da Conta de usuário da sessão; conectar, reconectar e desconectar passam pela Edge Function
// `sender-accounts`, a única que fala com a Unipile.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CanalDaContaRemetente,
  ContaRemetente,
  EstadoDaContaRemetente,
  FonteDeContasRemetentes,
} from './contas-remetentes-tipos'
import { corpoDoErroDaFuncao, motivoDaFalhaDaFuncao } from './falha-da-edge-function'

interface LinhaDaContaRemetente {
  id: string
  channel: CanalDaContaRemetente
  provider: string
  status: string
  reconciliation_required: boolean
  last_status_at: string
}

const ESTADO: Record<string, EstadoDaContaRemetente> = {
  connecting: 'conectando',
  syncing: 'sincronizando',
  ready: 'pronta',
  reconnect_required: 'requer-reconexao',
  disconnected: 'desconectada',
}

function mapear(linha: LinhaDaContaRemetente): ContaRemetente {
  const estado = ESTADO[linha.status]
  if (!estado) throw new Error(`Estado de Conta remetente desconhecido: ${linha.status}`)
  return {
    id: linha.id,
    canal: linha.channel,
    provedor: linha.provider,
    estado,
    conferindoPeriodoForaDoAr: linha.reconciliation_required === true && estado !== 'desconectada',
    estadoDesde: linha.last_status_at,
  }
}

export function criarFonteDeContasRemetentesSupabase(
  cliente: SupabaseClient,
  obterWorkspaceId: () => string,
): FonteDeContasRemetentes {
  const ouvintes = new Set<() => void>()
  const notificar = () => ouvintes.forEach((ouvinte) => ouvinte())

  /** Chama a Edge Function `sender-accounts`; uma recusa chega com a mensagem que o backend escreveu. */
  async function pedir(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await cliente.functions.invoke('sender-accounts', {
      body: { ...corpo, workspaceId: obterWorkspaceId() },
    })
    if (!error) return (data ?? {}) as Record<string, unknown>
    const recusa = await corpoDoErroDaFuncao(error)
    if (typeof recusa?.error === 'string') throw new Error(recusa.error)
    throw new Error(`Não foi possível falar com o backend das Contas remetentes. ${await motivoDaFalhaDaFuncao('sender-accounts', error)}`)
  }

  /** O link da autenticação hospedada: só um endereço HTTPS é aberto. */
  function linkHospedado(resposta: Record<string, unknown>): string {
    const url = resposta.url
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      throw new Error('O backend não devolveu um link de autenticação válido.')
    }
    return url
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    async minhas() {
      const { data, error } = await cliente.rpc('list_owned_sender_accounts', { p_workspace_id: obterWorkspaceId() })
      if (error) throw new Error('Não foi possível carregar suas Contas remetentes.')
      return ((data ?? []) as LinhaDaContaRemetente[]).map(mapear)
    },
    async conectar(canal) {
      return linkHospedado(await pedir({ action: 'connect', channel: canal }))
    },
    async reconectar({ id, canal }) {
      return linkHospedado(await pedir({ action: 'reconnect', channel: canal, senderAccountId: id }))
    },
    async desconectar(id) {
      // Mesmo recusada, a desconexão pode ter chegado ao provedor: a lista é relida para mostrar o que o backend tem.
      try {
        await pedir({ action: 'disconnect', senderAccountId: id })
      } finally {
        notificar()
      }
    },
  }
}
