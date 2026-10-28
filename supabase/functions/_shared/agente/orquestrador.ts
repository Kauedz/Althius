// O laço do agente único: a cada rodada, o modelo (pela fila do Hermes) lê o pedido, o histórico e os resultados e
// devolve um plano com chamadas de ferramenta. Cada chamada vira um passo visível: o portão decide se ela roda (livre,
// cabe no teto) ou se o turno para com um cartão de confirmação. Erro de uma ferramenta não derruba o turno: vira um
// passo com erro e o modelo segue com ele. No máximo 6 rodadas; o JSON inválido ganha uma segunda chance.
// O JWT de quem pede entra só no contexto da ferramenta (memória): nunca na entrada, no resultado ou no banco.
import { ErroDoAgente, type ModeloDoAgente } from './modelo.ts'
import {
  type ItemDoHistorico,
  lerResposta,
  MAXIMO_DE_CHAMADAS_POR_RODADA,
  montarPedido,
  montarSistema,
  type RespostaDoModelo,
  type ResultadoNoTurno,
} from './protocolo.ts'
import { cartaoDeConfirmacao, type ContextoDaFerramenta, type Ferramenta, portao, type ResultadoDaFerramenta } from './registro.ts'

export interface BancoDoAgente {
  gravarPasso(a: {
    turnoId: string
    ferramenta: string
    titulo: string
    estado: 'rodando' | 'erro' | 'aguardando_confirmacao'
    motivo?: 'teto' | 'prospect'
    entrada: Record<string, unknown>
  }): Promise<string>
  atualizarPasso(a: {
    passoId: string
    estado: 'rodando' | 'ok' | 'erro' | 'aguardando_confirmacao'
    resultado?: Record<string, unknown>
    resumo?: string
    custo?: number
    externo?: Record<string, unknown> | null
    erro?: string
  }): Promise<void>
  fecharTurno(a: { turnoId: string; status: 'concluido' | 'aguardando' | 'falhou'; resposta: string; errorCode?: string }): Promise<void>
}

/** O turno que `agente_reservar_turno` devolveu. */
export interface TurnoReservado {
  turnoId: string
  conversaId: string
  workspaceId: string
  userId: string
  pedido: string
  gastos: number
  teto: number
  retomar: { passoId: string; ferramenta: string; entrada: Record<string, unknown> } | null
  passosFeitos: { ferramenta: string; estado: string; resumo: string | null }[]
  historico: ItemDoHistorico[]
}

export interface DependenciasDoTurno {
  banco: BancoDoAgente
  modelo: ModeloDoAgente
  ferramentas: Ferramenta[]
  sessao: { authorization: string; apikey: string }
  relogio?: () => number
  /** O tempo do turno (a função tem limite de relógio). */
  prazoMs?: number
  log?: (campos: Record<string, unknown>) => void
}

export const MAXIMO_DE_RODADAS = 6
const RESPOSTA_PADRAO = 'Pronto. Diga o próximo passo quando quiser.'

/** A mensagem de erro que pode ir para a tela: sem pilha, sem token, curta. */
export function mensagemSegura(e: unknown): string {
  const bruta = e instanceof Error ? e.message : typeof e === 'string' ? e : 'A ferramenta falhou.'
  return bruta.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer ***').replace(/eyJ[A-Za-z0-9._-]{20,}/g, '***').slice(0, 300) ||
    'A ferramenta falhou.'
}

export async function executarTurno(t: TurnoReservado, d: DependenciasDoTurno): Promise<void> {
  const relogio = d.relogio ?? Date.now
  const fim = relogio() + (d.prazoMs ?? 300_000)
  const log = d.log ?? (() => {})
  const resultados: ResultadoNoTurno[] = t.passosFeitos.map((p) => ({
    ferramenta: p.ferramenta,
    estado: p.estado,
    resumo: p.resumo ?? '',
  }))
  let gastos = Number(t.gastos) || 0
  const teto = Number(t.teto) || 50
  const porNome = new Map(d.ferramentas.map((f) => [f.nome, f]))
  const contexto = (passoId: string): ContextoDaFerramenta => ({
    workspaceId: t.workspaceId,
    userId: t.userId,
    passoId,
    authorization: d.sessao.authorization,
    apikey: d.sessao.apikey,
  })

  async function rodar(f: Ferramenta, passoId: string, entrada: Record<string, unknown>): Promise<void> {
    let r: ResultadoDaFerramenta
    try {
      r = await f.executar(contexto(passoId), entrada)
    } catch (e) {
      const erro = mensagemSegura(e)
      await d.banco.atualizarPasso({ passoId, estado: 'erro', erro, resumo: `Falhou: ${erro}` })
      resultados.push({ ferramenta: f.nome, estado: 'erro', resumo: `Falhou: ${erro}` })
      return
    }
    if (r.pendente) {
      await d.banco.atualizarPasso({
        passoId, estado: 'rodando', resultado: { cartoes: r.cartoes }, resumo: r.resumo, externo: r.pendente.externo,
      })
      resultados.push({ ferramenta: f.nome, estado: 'em andamento', resumo: r.resumo })
      return
    }
    const custo = Math.max(0, Number(r.custo) || 0)
    await d.banco.atualizarPasso({ passoId, estado: 'ok', resultado: { cartoes: r.cartoes }, resumo: r.resumo, custo })
    gastos += custo
    resultados.push({ ferramenta: f.nome, estado: 'ok', resumo: r.resumo })
  }

  try {
    // O passo que a pessoa confirmou: roda sem passar de novo pelo portão.
    if (t.retomar) {
      const f = porNome.get(t.retomar.ferramenta)
      if (!f) {
        await d.banco.atualizarPasso({ passoId: t.retomar.passoId, estado: 'erro', erro: 'Ferramenta indisponível.' })
      } else {
        await rodar(f, t.retomar.passoId, t.retomar.entrada ?? {})
      }
    }

    const sistema = montarSistema(d.ferramentas)
    let ultimaResposta = ''
    for (let rodada = 0; rodada < MAXIMO_DE_RODADAS; rodada++) {
      if (relogio() > fim) {
        await d.banco.fecharTurno({
          turnoId: t.turnoId, status: 'concluido',
          resposta: ultimaResposta || 'Parei aqui para não demorar demais. Peça para eu continuar.',
        })
        return
      }
      const pedido = montarPedido({ pedido: t.pedido, historico: t.historico, resultados, gastos, teto })
      let plano: RespostaDoModelo | null = lerResposta(await d.modelo.responder(sistema, pedido))
      if (!plano) {
        log({ type: 'agente', turnoId: t.turnoId, outcome: 'json_invalido', rodada })
        plano = lerResposta(await d.modelo.responder(
          sistema,
          `${pedido}\n\nA sua resposta anterior não era o JSON pedido. Responda somente o objeto JSON do formato.`,
        ))
      }
      if (!plano) {
        await d.banco.fecharTurno({
          turnoId: t.turnoId, status: 'falhou', errorCode: 'model_invalid_output',
          resposta: 'Não consegui organizar a resposta agora. Tente de novo em instantes.',
        })
        return
      }
      if (plano.resposta) ultimaResposta = plano.resposta
      if (!plano.chamadas.length) {
        await d.banco.fecharTurno({ turnoId: t.turnoId, status: 'concluido', resposta: plano.resposta || RESPOSTA_PADRAO })
        return
      }

      for (const chamada of plano.chamadas.slice(0, MAXIMO_DE_CHAMADAS_POR_RODADA)) {
        const f = porNome.get(chamada.ferramenta)
        if (!f) {
          resultados.push({ ferramenta: chamada.ferramenta, estado: 'erro', resumo: 'Essa ferramenta não existe. Use só as da lista.' })
          continue
        }
        const titulo = tituloSeguro(f, chamada.entrada)
        let custo: number
        try {
          custo = Math.max(0, Number(await f.cotar(contexto(''), chamada.entrada)) || 0)
        } catch (e) {
          const erro = mensagemSegura(e)
          const passoId = await d.banco.gravarPasso({ turnoId: t.turnoId, ferramenta: f.nome, titulo, estado: 'erro', entrada: chamada.entrada })
          await d.banco.atualizarPasso({ passoId, estado: 'erro', erro, resumo: `Falhou: ${erro}` })
          resultados.push({ ferramenta: f.nome, estado: 'erro', resumo: `Falhou: ${erro}` })
          continue
        }
        const gate = portao(f, custo, gastos, teto)
        if (gate.estado === 'aguardar') {
          const cartao = cartaoDeConfirmacao({ titulo, custo, motivo: gate.motivo, gastos, teto })
          const passoId = await d.banco.gravarPasso({
            turnoId: t.turnoId, ferramenta: f.nome, titulo, estado: 'aguardando_confirmacao', motivo: gate.motivo,
            entrada: chamada.entrada,
          })
          await d.banco.atualizarPasso({
            passoId, estado: 'aguardando_confirmacao', resultado: { cartoes: [cartao] }, resumo: String(cartao.texto),
          })
          await d.banco.fecharTurno({ turnoId: t.turnoId, status: 'aguardando', resposta: String(cartao.texto) })
          return
        }
        const passoId = await d.banco.gravarPasso({ turnoId: t.turnoId, ferramenta: f.nome, titulo, estado: 'rodando', entrada: chamada.entrada })
        await rodar(f, passoId, chamada.entrada)
      }
    }
    await d.banco.fecharTurno({ turnoId: t.turnoId, status: 'concluido', resposta: ultimaResposta || RESPOSTA_PADRAO })
  } catch (e) {
    const code = e instanceof ErroDoAgente ? e.code : 'agent_failed'
    log({ type: 'agente', turnoId: t.turnoId, outcome: 'falhou', code, message: mensagemSegura(e) })
    await d.banco.fecharTurno({
      turnoId: t.turnoId, status: 'falhou', errorCode: code,
      resposta: code.startsWith('model_')
        ? 'O agente não respondeu agora. Tente de novo em instantes.'
        : 'Algo deu errado neste pedido. Tente de novo.',
    }).catch(() => {})
  }
}

/** Roda uma ferramenta pedida por um botão de cartão (aceitar, descartar, enriquecer): sem modelo, com o portão. */
export async function executarEscolha(
  t: TurnoReservado,
  d: Omit<DependenciasDoTurno, 'modelo'>,
  escolha: { ferramenta: string; entrada: Record<string, unknown> },
): Promise<{ status: 'ok' | 'erro' | 'aguardando'; resultado?: ResultadoDaFerramenta }> {
  const f = d.ferramentas.find((x) => x.nome === escolha.ferramenta)
  const ctx = (passoId: string): ContextoDaFerramenta => ({
    workspaceId: t.workspaceId, userId: t.userId, passoId, authorization: d.sessao.authorization, apikey: d.sessao.apikey,
  })
  try {
    if (!f) throw new Error('Ferramenta indisponível.')
    const titulo = tituloSeguro(f, escolha.entrada)
    const custo = Math.max(0, Number(await f.cotar(ctx(''), escolha.entrada)) || 0)
    const gate = portao(f, custo, Number(t.gastos) || 0, Number(t.teto) || 50)
    if (gate.estado === 'aguardar') {
      const cartao = cartaoDeConfirmacao({ titulo, custo, motivo: gate.motivo, gastos: Number(t.gastos) || 0, teto: Number(t.teto) || 50 })
      const passoId = await d.banco.gravarPasso({
        turnoId: t.turnoId, ferramenta: f.nome, titulo, estado: 'aguardando_confirmacao', motivo: gate.motivo, entrada: escolha.entrada,
      })
      await d.banco.atualizarPasso({ passoId, estado: 'aguardando_confirmacao', resultado: { cartoes: [cartao] }, resumo: String(cartao.texto) })
      await d.banco.fecharTurno({ turnoId: t.turnoId, status: 'aguardando', resposta: String(cartao.texto) })
      return { status: 'aguardando' }
    }
    const passoId = await d.banco.gravarPasso({ turnoId: t.turnoId, ferramenta: f.nome, titulo, estado: 'rodando', entrada: escolha.entrada })
    let r: ResultadoDaFerramenta
    try {
      r = await f.executar(ctx(passoId), escolha.entrada)
    } catch (e) {
      const erro = mensagemSegura(e)
      await d.banco.atualizarPasso({ passoId, estado: 'erro', erro, resumo: `Falhou: ${erro}` })
      await d.banco.fecharTurno({ turnoId: t.turnoId, status: 'concluido', resposta: `Não deu certo: ${erro}` })
      return { status: 'erro' }
    }
    const custoReal = Math.max(0, Number(r.custo) || 0)
    await d.banco.atualizarPasso({ passoId, estado: 'ok', resultado: { cartoes: r.cartoes }, resumo: r.resumo, custo: custoReal })
    await d.banco.fecharTurno({ turnoId: t.turnoId, status: 'concluido', resposta: r.resumo })
    return { status: 'ok', resultado: r }
  } catch (e) {
    await d.banco.fecharTurno({ turnoId: t.turnoId, status: 'falhou', errorCode: 'agent_failed', resposta: mensagemSegura(e) }).catch(() => {})
    return { status: 'erro' }
  }
}

function tituloSeguro(f: Ferramenta, entrada: Record<string, unknown>): string {
  try {
    return (f.titulo(entrada) || f.nome).slice(0, 200)
  } catch {
    return f.nome
  }
}
