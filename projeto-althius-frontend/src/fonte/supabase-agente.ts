import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type CartaoDoAgente,
  type ConversaDoAgente,
  ErroDoAgente,
  type FonteDoAgente,
  type PassoDoAgente,
  type ResumoDaConversaDoAgente,
  type StatusDoTurno,
  type TurnoDoAgente,
} from './agente-tipos'
import { corpoDoErroDaFuncao, motivoDaFalhaDaFuncao } from './falha-da-edge-function'

type Bruto = Record<string, unknown>

const texto = (v: unknown) => (typeof v === 'string' ? v : '')
const numero = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)

function lerPasso(p: Bruto): PassoDoAgente {
  const resultado = (p.resultado ?? null) as { cartoes?: unknown } | null
  return {
    id: texto(p.id),
    seq: numero(p.seq),
    ferramenta: texto(p.ferramenta),
    titulo: texto(p.titulo),
    estado: texto(p.estado) as PassoDoAgente['estado'],
    motivoConfirmacao: (p.motivoConfirmacao ?? null) as PassoDoAgente['motivoConfirmacao'],
    cartoes: Array.isArray(resultado?.cartoes) ? (resultado.cartoes as CartaoDoAgente[]) : [],
    custo: numero(p.custo),
    erro: typeof p.erro === 'string' ? p.erro : null,
    pendente: Boolean(p.pendente),
  }
}

function lerTurno(t: Bruto): TurnoDoAgente {
  return {
    id: texto(t.id),
    pedido: texto(t.pedido),
    status: texto(t.status) as StatusDoTurno,
    resposta: typeof t.resposta === 'string' ? t.resposta : null,
    errorCode: typeof t.errorCode === 'string' ? t.errorCode : null,
    criadoEm: texto(t.criadoEm),
    passos: Array.isArray(t.passos) ? (t.passos as Bruto[]).map(lerPasso) : [],
  }
}

export function lerConversaDoAgente(c: Bruto): ConversaDoAgente {
  return {
    id: texto(c.id),
    titulo: texto(c.titulo) || 'Conversa',
    gastos: numero(c.creditosGastos),
    teto: numero(c.teto) || 50,
    turnos: Array.isArray(c.turnos) ? (c.turnos as Bruto[]).map(lerTurno) : [],
  }
}

/** A Fonte do agente no Workspace operacional: leitura pelas RPCs da sessão, ações pela Edge Function `agente`. */
export function criarFonteDoAgenteSupabase(cliente: SupabaseClient, workspaceId: () => string): FonteDoAgente {
  async function invocar(corpo: Record<string, unknown>): Promise<Bruto> {
    const { data, error } = await cliente.functions.invoke('agente', { body: corpo })
    if (error) {
      const falha = await corpoDoErroDaFuncao(error)
      if (typeof falha?.error === 'string') throw new ErroDoAgente(falha.error, texto(falha.code) || 'erro')
      throw new ErroDoAgente(await motivoDaFalhaDaFuncao('agente', error, ''))
    }
    return (data ?? {}) as Bruto
  }

  return {
    async disponivel() {
      try {
        return Boolean((await invocar({ action: 'capability' })).available)
      } catch {
        return false
      }
    },
    async conversas() {
      const { data, error } = await cliente.rpc('agente_listar_conversas', { p_workspace_id: workspaceId(), p_limit: 30 })
      if (error) throw new ErroDoAgente('Não foi possível carregar as conversas.')
      return ((data ?? []) as Bruto[]).map((c): ResumoDaConversaDoAgente => ({
        id: texto(c.id),
        titulo: texto(c.titulo) || 'Conversa',
        atualizadaEm: texto(c.updated_at),
        ultimoStatus: (c.ultimo_status ?? null) as StatusDoTurno | null,
      }))
    },
    async conversa(id) {
      const { data, error } = await cliente.rpc('agente_ler_conversa', { p_conversa_id: id })
      if (error || !data) throw new ErroDoAgente('Esta conversa não existe ou não é sua.', 'nao_encontrada')
      return lerConversaDoAgente(data as Bruto)
    },
    async enviar(pedido, conversaId) {
      const r = await invocar({
        action: 'enviar', workspaceId: workspaceId(), conversaId, texto: pedido, clientRequestId: crypto.randomUUID(),
      })
      return { conversaId: texto(r.conversaId), turnoId: texto(r.turnoId) }
    },
    async confirmar(passoId) {
      await invocar({ action: 'confirmar', passoId })
    },
    async cancelar(passoId) {
      await invocar({ action: 'cancelar', passoId })
    },
    async escolher(passoId, escolha, alvoId, motivo) {
      await invocar({ action: 'escolha', passoId, escolha, alvoId, clientRequestId: crypto.randomUUID(), ...(motivo ? { motivo } : {}) })
    },
    async atualizar(passoId) {
      return Boolean((await invocar({ action: 'atualizar', passoId })).pendente)
    },
  }
}
