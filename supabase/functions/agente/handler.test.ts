import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createHandler, type DbDoAgente, ErroDoBanco, type PassoDoUsuario } from './handler.ts'
import type { Ferramenta } from '../_shared/agente/registro.ts'
import type { TurnoReservado } from '../_shared/agente/orquestrador.ts'

const WS = '11111111-1111-4111-8111-111111111111'
const CONV = '22222222-2222-4222-8222-222222222222'
const TURNO = '33333333-3333-4333-8333-333333333333'
const PASSO = '44444444-4444-4444-8444-444444444444'
const DESC = '55555555-5555-4555-8555-555555555555'
const CRID = '66666666-6666-4666-8666-666666666666'
const CONTA = '77777777-7777-4777-8777-777777777777'
const AGORA = Date.parse('2026-10-28T15:00:00Z')

function cenario(over: Partial<DbDoAgente> = {}, opcoes: { heartbeat?: string | null; passo?: Partial<PassoDoUsuario> } = {}) {
  const chamadas: string[] = []
  const trabalhos: Promise<unknown>[] = []
  const passos: Record<string, unknown>[] = []
  const trocas: Record<string, unknown>[] = []
  const turno: TurnoReservado = {
    turnoId: TURNO, conversaId: CONV, workspaceId: WS, userId: 'u1', pedido: 'oi', gastos: 0, teto: 50,
    retomar: null, passosFeitos: [], historico: [],
  }
  const passoBase: PassoDoUsuario = {
    passoId: PASSO, turnoId: TURNO, conversaId: CONV, workspaceId: WS, turnoStatus: 'concluido', ferramenta: 'buscar_empresas',
    estado: 'ok', entrada: {}, externo: null,
    resultado: { cartoes: [{ tipo: 'empresas', empresas: [{ id: DESC, nome: 'Acme', estado: 'nova', contaId: null }] }] },
    ...opcoes.passo,
  }
  const db: DbDoAgente = {
    userFromJwt: (s) => Promise.resolve(s.authorization === 'Bearer bom' ? { userId: 'u1' } : null),
    iniciarTurno: (_s, a) => { chamadas.push(`iniciar:${a.texto}`); return Promise.resolve({ conversaId: CONV, turnoId: TURNO, status: 'fila' }) },
    reservarTurno: () => { chamadas.push('reservar'); return Promise.resolve(turno) },
    assumirPasso: (_p, _u, d) => { chamadas.push(`assumir:${d}`); return Promise.resolve({ turnoId: TURNO, conversaId: CONV }) },
    passoDoUsuario: () => Promise.resolve(passoBase),
    trocarResultado: (_p, r) => { trocas.push(r); return Promise.resolve() },
    gravarPasso: (a) => { passos.push(a); return Promise.resolve('novo-passo') },
    atualizarPasso: (a) => { passos.push(a); return Promise.resolve() },
    fecharTurno: (a) => { chamadas.push(`fechar:${a.status}`); return Promise.resolve() },
    ...over,
  }
  const aceitar: Ferramenta = {
    nome: 'aceitar_empresa', descricao: '', esquema: {}, aprovacao: 'livre', titulo: () => 'Aceitar',
    cotar: () => Promise.resolve(0),
    executar: () => Promise.resolve({ resumo: 'aceita', custo: 0, cartoes: [{ tipo: 'aviso', texto: 'ok', contaId: CONTA }] }),
  }
  const buscar: Ferramenta = {
    nome: 'buscar_empresas', descricao: '', esquema: {}, aprovacao: 'teto', titulo: () => 'Buscar',
    cotar: () => Promise.resolve(5), executar: () => Promise.resolve({ resumo: '', custo: 0, cartoes: [] }),
    atualizar: () => Promise.resolve({ resumo: 'pronta', custo: 5, cartoes: [] }),
  }
  const handler = createHandler({
    db,
    modelo: () => ({ responder: () => Promise.resolve('{"plano":"","chamadas":[],"resposta":"Olá"}') }),
    ferramentas: [aceitar, buscar],
    ultimoSinalDoMotor: () => Promise.resolve(opcoes.heartbeat === undefined ? '2026-10-28T14:59:30Z' : opcoes.heartbeat),
    waitUntil: (t) => trabalhos.push(t),
    appOrigin: 'https://app.althius.com.br',
    agora: () => AGORA,
    log: () => {},
  })
  const pedir = async (corpo: unknown, auth = 'Bearer bom') => {
    const r = await handler(new Request('https://x/agente', {
      method: 'POST', headers: { Authorization: auth, apikey: 'k', 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    }))
    await Promise.all(trabalhos)
    return { status: r.status, json: await r.json() }
  }
  return { pedir, chamadas, passos, trocas }
}

Deno.test('sem sessão válida é 401', async () => {
  const { pedir } = cenario()
  assertEquals((await pedir({ action: 'capability' }, 'Bearer ruim')).status, 401)
})

Deno.test('capability segue o sinal de vida do motor', async () => {
  assertEquals((await cenario().pedir({ action: 'capability' })).json, { available: true })
  assertEquals((await cenario({}, { heartbeat: '2026-10-28T14:50:00Z' }).pedir({ action: 'capability' })).json, { available: false })
})

Deno.test('enviar guarda o turno, responde 202 e roda o turno depois', async () => {
  const c = cenario()
  const r = await c.pedir({ action: 'enviar', workspaceId: WS, texto: 'Ache empresas', clientRequestId: CRID })
  assertEquals(r.status, 202)
  assertEquals(r.json.turnoId, TURNO)
  assertEquals(c.chamadas, ['iniciar:Ache empresas', 'reservar', 'fechar:concluido'])
})

Deno.test('enviar recusa sem motor (503), pedido inválido (400) e conversa ocupada (409)', async () => {
  assertEquals((await cenario({}, { heartbeat: null }).pedir({ action: 'enviar', workspaceId: WS, texto: 'x', clientRequestId: CRID })).status, 503)
  assertEquals((await cenario().pedir({ action: 'enviar', workspaceId: 'x', texto: 'x', clientRequestId: CRID })).status, 400)
  assertEquals((await cenario().pedir({ action: 'enviar', workspaceId: WS, texto: '', clientRequestId: CRID })).status, 400)
  const ocupada = cenario({ iniciarTurno: () => Promise.reject(new ErroDoBanco('55006', 'busy')) })
  assertEquals((await ocupada.pedir({ action: 'enviar', workspaceId: WS, texto: 'x', clientRequestId: CRID })).status, 409)
})

Deno.test('o pedido repetido (idempotente) que já rodou não roda de novo', async () => {
  const c = cenario({ iniciarTurno: () => Promise.resolve({ conversaId: CONV, turnoId: TURNO, status: 'concluido' }) })
  assertEquals((await c.pedir({ action: 'enviar', workspaceId: WS, texto: 'x', clientRequestId: CRID })).status, 202)
  assertEquals(c.chamadas, [])
})

Deno.test('confirmar retoma o turno; cancelar só fecha', async () => {
  const c = cenario()
  assertEquals((await c.pedir({ action: 'confirmar', passoId: PASSO })).status, 202)
  assertEquals(c.chamadas.slice(0, 2), ['assumir:confirmar', 'reservar'])
  const d = cenario()
  assertEquals((await d.pedir({ action: 'cancelar', passoId: PASSO })).status, 200)
  assertEquals(d.chamadas, ['assumir:cancelar'])
  const alheio = cenario({ assumirPasso: () => Promise.reject(new ErroDoBanco('P0002', 'x')) })
  assertEquals((await alheio.pedir({ action: 'confirmar', passoId: PASSO })).status, 404)
})

Deno.test('escolha aceitar roda a ferramenta sem o modelo e marca a empresa no cartão', async () => {
  const c = cenario()
  const r = await c.pedir({ action: 'escolha', passoId: PASSO, escolha: 'aceitar', alvoId: DESC, clientRequestId: CRID })
  assertEquals(r.status, 202)
  assertEquals(c.chamadas[0], 'iniciar:Aceitar Acme como Conta-alvo')
  const cartao = (c.trocas[0] as { cartoes: { empresas: { estado: string; contaId: string }[] }[] }).cartoes[0].empresas[0]
  assertEquals([cartao.estado, cartao.contaId], ['aceita', CONTA])
})

Deno.test('escolha recusa empresa fora do cartão, já decidida, ou enriquecer sem Conta-alvo', async () => {
  const outra = '88888888-8888-4888-8888-888888888888'
  assertEquals((await cenario().pedir({ action: 'escolha', passoId: PASSO, escolha: 'aceitar', alvoId: outra, clientRequestId: CRID })).status, 404)
  assertEquals((await cenario().pedir({ action: 'escolha', passoId: PASSO, escolha: 'enriquecer', alvoId: DESC, clientRequestId: CRID })).status, 409)
  const decidida = cenario({}, { passo: { resultado: { cartoes: [{ tipo: 'empresas', empresas: [{ id: DESC, nome: 'Acme', estado: 'aceita' }] }] } } })
  assertEquals((await decidida.pedir({ action: 'escolha', passoId: PASSO, escolha: 'descartar', alvoId: DESC, clientRequestId: CRID })).status, 409)
})

Deno.test('atualizar fecha a busca pendente com o custo real', async () => {
  const c = cenario({}, { passo: { estado: 'rodando', externo: { runId: 'r' } } })
  const r = await c.pedir({ action: 'atualizar', passoId: PASSO })
  assertEquals(r.json, { pendente: false })
  assertEquals(c.passos[0], { passoId: PASSO, estado: 'ok', resultado: { cartoes: [] }, resumo: 'pronta', custo: 5, externo: null })
})

Deno.test('nenhum pedido ao banco leva o JWT dentro dos dados gravados', async () => {
  const c = cenario()
  await c.pedir({ action: 'enviar', workspaceId: WS, texto: 'x', clientRequestId: CRID })
  assert(!JSON.stringify(c.passos).includes('Bearer'))
})
