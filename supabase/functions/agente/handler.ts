// A porta do agente único (Fase 3). O navegador manda, com o JWT de quem pede:
//   - capability: o motor de IA (worker do Hermes) deu sinal de vida nos últimos 120 s;
//   - enviar {workspaceId, conversaId?, texto, clientRequestId}: guarda o pedido (agente_iniciar_turno, com a sessão) e
//     responde 202; o turno roda depois da resposta (waitUntil) e a tela acompanha pelo banco;
//   - confirmar | cancelar {passoId}: a decisão num passo que aguarda confirmação (teto ou prospect);
//   - escolha {passoId, escolha, alvoId, motivo?, clientRequestId}: um botão de um cartão (aceitar, descartar, enriquecer)
//     vira um turno novo que roda a ferramenta sem o modelo, com o mesmo portão;
//   - atualizar {passoId}: confere uma tarefa longa (a busca de empresas) que seguiu em segundo plano.
// O JWT fica só na memória desta execução: as ferramentas o usam para agir como a pessoa, e nada dele é gravado.
import { comCors } from '../_shared/cors.ts'
import type { ModeloDoAgente } from '../_shared/agente/modelo.ts'
import { type BancoDoAgente, executarEscolha, executarTurno, mensagemSegura, type TurnoReservado } from '../_shared/agente/orquestrador.ts'
import type { Cartao, Ferramenta } from '../_shared/agente/registro.ts'

export interface Sessao {
  authorization: string
  apikey: string
}

export class ErroDoBanco extends Error {
  constructor(readonly code: string, mensagem: string) {
    super(mensagem)
  }
}

export interface PassoDoUsuario {
  passoId: string
  turnoId: string
  conversaId: string
  workspaceId: string
  turnoStatus: string
  ferramenta: string
  estado: string
  entrada: Record<string, unknown>
  resultado: { cartoes?: Cartao[] } | null
  externo: Record<string, unknown> | null
}

export interface DbDoAgente extends BancoDoAgente {
  userFromJwt(sessao: Sessao): Promise<{ userId: string } | null>
  /** agente_iniciar_turno com a sessão de quem pede. Lança ErroDoBanco com o código do Postgres. */
  iniciarTurno(sessao: Sessao, a: { workspaceId: string; conversaId: string | null; texto: string; clientRequestId: string }):
    Promise<{ conversaId: string; turnoId: string; status: string }>
  reservarTurno(turnoId: string): Promise<TurnoReservado | null>
  assumirPasso(passoId: string, userId: string, decisao: 'confirmar' | 'cancelar'): Promise<{ turnoId: string; conversaId: string }>
  passoDoUsuario(passoId: string, userId: string): Promise<PassoDoUsuario>
  trocarResultado(passoId: string, resultado: Record<string, unknown>): Promise<void>
}

export interface DepsDoAgente {
  db: DbDoAgente
  /** O modelo de um turno: a fila do Hermes confere que o turno está rodando. */
  modelo(turnoId: string): ModeloDoAgente
  ferramentas: Ferramenta[]
  ultimoSinalDoMotor(): Promise<string | null>
  waitUntil(trabalho: Promise<unknown>): void
  appOrigin: string
  agora?: () => number
  log?: (campos: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const TAMANHO_MAXIMO = 4000
const SINAL_DE_VIDA_MS = 120_000
const ESCOLHAS = ['aceitar', 'descartar', 'enriquecer'] as const
type Escolha = typeof ESCOLHAS[number]

function uuid(v: unknown): string | null {
  return typeof v === 'string' && UUID.test(v) ? v : null
}

function statusDoErro(e: unknown): number {
  const code = (e as { code?: unknown })?.code
  if (code === '55006') return 409
  if (code === 'P0002') return 404
  if (code === '42501') return 403
  if (code === '22023') return 400
  if (code === '55000') return 409
  return 500
}

const MENSAGENS: Record<number, string> = {
  409: 'O agente ainda está respondendo o pedido anterior desta conversa.',
  404: 'Não encontrado.',
  403: 'A sua Participação neste Workspace não está ativa.',
  400: 'Pedido inválido.',
  500: 'Não foi possível falar com o agente agora. Tente de novo em instantes.',
}

interface EmpresaDoCartao {
  id: string
  nome: string
  estado?: string
  contaId?: string | null
}

function empresaNoCartao(resultado: PassoDoUsuario['resultado'], alvoId: string): EmpresaDoCartao | null {
  for (const c of resultado?.cartoes ?? []) {
    if (c.tipo !== 'empresas' || !Array.isArray(c.empresas)) continue
    const e = (c.empresas as EmpresaDoCartao[]).find((x) => x.id === alvoId)
    if (e) return e
  }
  return null
}

function marcarEmpresa(resultado: PassoDoUsuario['resultado'], alvoId: string, estado: string, contaId?: string | null) {
  return {
    ...(resultado ?? {}),
    cartoes: (resultado?.cartoes ?? []).map((c) => c.tipo !== 'empresas' || !Array.isArray(c.empresas) ? c : {
      ...c,
      empresas: (c.empresas as EmpresaDoCartao[]).map((e) => e.id !== alvoId ? e : { ...e, estado, ...(contaId ? { contaId } : {}) }),
    }),
  }
}

export function createHandler(deps: DepsDoAgente): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((c) => console.log(JSON.stringify(c)))
  const agora = deps.agora ?? Date.now
  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  const falha = (e: unknown, extra: Record<string, unknown> = {}) => {
    const status = statusDoErro(e)
    if (status === 500) log({ type: 'agente', outcome: 'erro', message: mensagemSegura(e), ...extra })
    return responder({ error: MENSAGENS[status], code: (e as { code?: string })?.code ?? 'erro' }, status)
  }

  async function motorVivo(): Promise<boolean> {
    try {
      const ultimo = await deps.ultimoSinalDoMotor()
      return !!ultimo && agora() - Date.parse(ultimo) < SINAL_DE_VIDA_MS
    } catch {
      return false
    }
  }

  /** Roda um turno da fila. Nunca lança: o que falhar fica no turno (ou o cron o expira). */
  async function rodarTurno(turnoId: string, sessao: Sessao): Promise<void> {
    try {
      const t = await deps.db.reservarTurno(turnoId)
      if (!t) return
      await executarTurno(t, { banco: deps.db, modelo: deps.modelo(turnoId), ferramentas: deps.ferramentas, sessao, log })
    } catch (e) {
      log({ type: 'agente', turnoId, outcome: 'turno_falhou', message: mensagemSegura(e) })
    }
  }

  async function rodarEscolha(
    turnoId: string,
    sessao: Sessao,
    origem: PassoDoUsuario,
    escolha: Escolha,
    alvoId: string,
    entrada: Record<string, unknown>,
    ferramenta: string,
  ): Promise<void> {
    try {
      const t = await deps.db.reservarTurno(turnoId)
      if (!t) return
      const r = await executarEscolha(t, { banco: deps.db, ferramentas: deps.ferramentas, sessao, log }, { ferramenta, entrada })
      if (r.status !== 'ok' || escolha === 'enriquecer') return
      const contaId = escolha === 'aceitar'
        ? (r.resultado?.cartoes.find((c) => typeof c.contaId === 'string')?.contaId as string | undefined) ?? null
        : null
      await deps.db.trocarResultado(origem.passoId, marcarEmpresa(origem.resultado, alvoId, escolha === 'aceitar' ? 'aceita' : 'descartada', contaId))
    } catch (e) {
      log({ type: 'agente', turnoId, outcome: 'escolha_falhou', message: mensagemSegura(e) })
    }
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return responder({ error: 'Método não permitido.' }, 405)
    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    if (!authorization.startsWith('Bearer ') || !apikey) return responder({ error: 'Entre na sua Conta de usuário para continuar.' }, 401)
    const sessao: Sessao = { authorization, apikey }
    let user: { userId: string } | null = null
    try {
      user = await deps.db.userFromJwt(sessao)
    } catch {
      user = null
    }
    if (!user) return responder({ error: 'Entre na sua Conta de usuário para continuar.' }, 401)

    let corpo: Record<string, unknown>
    try {
      const bruto = await req.json()
      if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) throw new Error()
      corpo = bruto as Record<string, unknown>
    } catch {
      return responder({ error: 'Pedido inválido.' }, 400)
    }
    const acao = typeof corpo.action === 'string' ? corpo.action : ''

    if (acao === 'capability') return responder({ available: await motorVivo() })

    if (acao === 'enviar') {
      const workspaceId = uuid(corpo.workspaceId)
      const conversaId = corpo.conversaId === undefined || corpo.conversaId === null ? null : uuid(corpo.conversaId)
      const clientRequestId = uuid(corpo.clientRequestId)
      const texto = typeof corpo.texto === 'string' ? corpo.texto.trim() : ''
      if (!workspaceId || conversaId === undefined || (corpo.conversaId && !conversaId) || !clientRequestId || !texto || texto.length > TAMANHO_MAXIMO) {
        return responder({ error: 'Pedido inválido.' }, 400)
      }
      if (!(await motorVivo())) {
        return responder({ error: 'O agente está fora do ar agora. Tente de novo em instantes.', code: 'model_unavailable' }, 503)
      }
      try {
        const r = await deps.db.iniciarTurno(sessao, { workspaceId, conversaId, texto, clientRequestId })
        if (r.status === 'fila') deps.waitUntil(rodarTurno(r.turnoId, sessao))
        return responder(r, 202)
      } catch (e) {
        return falha(e, { action: 'enviar' })
      }
    }

    if (acao === 'confirmar' || acao === 'cancelar') {
      const passoId = uuid(corpo.passoId)
      if (!passoId) return responder({ error: 'Pedido inválido.' }, 400)
      if (acao === 'confirmar' && !(await motorVivo())) {
        return responder({ error: 'O agente está fora do ar agora. Tente de novo em instantes.', code: 'model_unavailable' }, 503)
      }
      try {
        const r = await deps.db.assumirPasso(passoId, user.userId, acao)
        if (acao === 'confirmar') {
          deps.waitUntil(rodarTurno(r.turnoId, sessao))
          return responder(r, 202)
        }
        return responder(r, 200)
      } catch (e) {
        return falha(e, { action: acao })
      }
    }

    if (acao === 'escolha') {
      const passoId = uuid(corpo.passoId)
      const alvoId = uuid(corpo.alvoId)
      const clientRequestId = uuid(corpo.clientRequestId)
      const escolha = ESCOLHAS.find((e) => e === corpo.escolha)
      const motivo = typeof corpo.motivo === 'string' ? corpo.motivo.trim().slice(0, 300) : ''
      if (!passoId || !alvoId || !clientRequestId || !escolha) return responder({ error: 'Pedido inválido.' }, 400)
      let origem: PassoDoUsuario
      try {
        origem = await deps.db.passoDoUsuario(passoId, user.userId)
      } catch (e) {
        return falha(e, { action: 'escolha' })
      }
      const empresa = empresaNoCartao(origem.resultado, alvoId)
      if (origem.estado !== 'ok' || !empresa) return responder({ error: 'Esta empresa não está neste cartão.' }, 404)
      let ferramenta: string
      let entrada: Record<string, unknown>
      let texto: string
      if (escolha === 'aceitar') {
        if (empresa.estado && empresa.estado !== 'nova') return responder({ error: 'Esta empresa já foi decidida.' }, 409)
        ferramenta = 'aceitar_empresa'
        entrada = { descobertaId: alvoId }
        texto = `Aceitar ${empresa.nome} como Conta-alvo`
      } else if (escolha === 'descartar') {
        if (empresa.estado && empresa.estado !== 'nova') return responder({ error: 'Esta empresa já foi decidida.' }, 409)
        ferramenta = 'descartar_empresa'
        entrada = { descobertaId: alvoId, ...(motivo ? { motivo } : {}) }
        texto = `Descartar ${empresa.nome}${motivo ? `: ${motivo}` : ''}`
      } else {
        if (!empresa.contaId) return responder({ error: 'Aceite a empresa como Conta-alvo antes de enriquecer o comitê.' }, 409)
        ferramenta = 'enriquecer_comite'
        entrada = { contaId: empresa.contaId }
        texto = `Enriquecer o comitê de compra de ${empresa.nome}`
      }
      try {
        const r = await deps.db.iniciarTurno(sessao, {
          workspaceId: origem.workspaceId, conversaId: origem.conversaId, texto, clientRequestId,
        })
        if (r.status === 'fila') deps.waitUntil(rodarEscolha(r.turnoId, sessao, origem, escolha, alvoId, entrada, ferramenta))
        return responder(r, 202)
      } catch (e) {
        return falha(e, { action: 'escolha' })
      }
    }

    if (acao === 'atualizar') {
      const passoId = uuid(corpo.passoId)
      if (!passoId) return responder({ error: 'Pedido inválido.' }, 400)
      let passo: PassoDoUsuario
      try {
        passo = await deps.db.passoDoUsuario(passoId, user.userId)
      } catch (e) {
        return falha(e, { action: 'atualizar' })
      }
      const f = deps.ferramentas.find((x) => x.nome === passo.ferramenta)
      if (passo.estado !== 'rodando' || !passo.externo || !f?.atualizar) return responder({ pendente: false })
      const ctx = { workspaceId: passo.workspaceId, userId: user.userId, passoId, ...sessao }
      try {
        const r = await f.atualizar(ctx, passo.externo)
        if (!r) return responder({ pendente: true })
        await deps.db.atualizarPasso({
          passoId, estado: 'ok', resultado: { cartoes: r.cartoes }, resumo: r.resumo, custo: Math.max(0, Number(r.custo) || 0), externo: null,
        })
        return responder({ pendente: false })
      } catch (e) {
        const erro = mensagemSegura(e)
        await deps.db.atualizarPasso({ passoId, estado: 'erro', erro, resumo: `Falhou: ${erro}`, externo: null }).catch(() => {})
        return responder({ pendente: false })
      }
    }

    return responder({ error: 'Ação desconhecida.' }, 400)
  })
}
