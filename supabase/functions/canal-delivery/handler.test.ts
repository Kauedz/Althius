import { assertEquals } from 'jsr:@std/assert@1'
import { createCanalSimulado } from '../_shared/canal/index.ts'
import { createHandler, type Db, type Entrega } from './handler.ts'

const RUN = '59000000-0000-0000-0000-000000000007'
const SEGREDO = 'segredo-interno'

function dbDeAvisos(
  reivindicar: Db['claimAvisos'],
  confirmar: () => Promise<void>,
  liberar: () => Promise<void>,
): Db {
  return {
    claimAvisos: reivindicar,
    confirmarAvisos: confirmar,
    liberarAvisos: liberar,
    reservarEntrega: async () => null,
    confirmarEntrega: async () => {},
    falharEntrega: async () => 'nada',
  }
}

function montar(entrega: Entrega | null) {
  const adaptador = createCanalSimulado()
  const chamadas: string[] = []
  const db: Db = {
    claimAvisos: async () => null,
    confirmarAvisos: async () => {},
    liberarAvisos: async () => {},
    reservarEntrega: async () => entrega,
    confirmarEntrega: async () => { chamadas.push('confirmada') },
    falharEntrega: async (_run, erro) => { chamadas.push(`falhou:${erro}`); return 'nova_tentativa' },
  }
  return {
    adaptador,
    chamadas,
    handler: createHandler({ db, adaptador, segredoInterno: SEGREDO, log: () => {} }),
  }
}

const pedido = (segredo = SEGREDO) => new Request('https://exemplo.test', {
  method: 'POST', headers: { 'x-whatsapp-delivery-secret': segredo, 'Content-Type': 'application/json' }, body: JSON.stringify({ run_id: RUN }),
})

Deno.test('entrega a resposta ao telefone verificado e confirma depois do simulador', async () => {
  const m = montar({ status: 'succeeded', codigoDoErro: null, resposta: 'Temos 42 Créditos.', telefone: '+5511999990007', dentroDaJanela: true })
  const resposta = await m.handler(pedido())
  assertEquals(resposta.status, 200)
  assertEquals(m.adaptador.envios, [{ tipo: 'texto', para: '5511999990007', texto: 'Temos 42 Créditos.' }])
  assertEquals(m.chamadas, ['confirmada'])
})

Deno.test('falha da execução entrega uma mensagem clara sem fingir uma resposta', async () => {
  const m = montar({ status: 'failed', codigoDoErro: 'insufficient_credits', resposta: null, telefone: '5511999990007', dentroDaJanela: true })
  await m.handler(pedido())
  assertEquals(m.adaptador.envios[0], {
    tipo: 'texto', para: '5511999990007',
    texto: 'Não foi possível responder: o Workspace está sem Créditos para este pedido, ou você chegou ao seu limite do mês. Avise o Administrador.',
  })
  assertEquals(m.chamadas, ['confirmada'])
})

Deno.test('sem reserva de entrega não envia mensagem', async () => {
  const m = montar(null)
  await m.handler(pedido())
  assertEquals(m.adaptador.envios, [])
})

Deno.test('fora da janela envia template sem conteúdo e deixa a resposta pendente para próxima entrada', async () => {
  const m = montar({ status: 'succeeded', codigoDoErro: null, resposta: 'Temos 42 Créditos.', telefone: '5511999990007', dentroDaJanela: false })
  await m.handler(pedido())
  assertEquals(m.adaptador.envios, [{
    tipo: 'template', para: '5511999990007', nome: 'althius_pedido_concluido', idioma: 'pt_BR', parametros: [], categoria: 'utilidade',
  }])
  assertEquals(m.chamadas, ['confirmada'])
})

Deno.test('a entrega exige segredo interno válido', async () => {
  const m = montar({ status: 'succeeded', codigoDoErro: null, resposta: 'Olá.', telefone: '5511999990007', dentroDaJanela: true })
  assertEquals((await m.handler(pedido('segredo-incorreto'))).status, 401)
  assertEquals(m.adaptador.envios, [])
})

Deno.test('agrupa avisos opt-in numa mensagem de serviço', async () => {
  const adaptador = createCanalSimulado()
  const chamadas: string[] = []
  const handler = createHandler({
    db: dbDeAvisos(
      async () => ({ telefone: '+5511999990007', resumo: 'Uma Aprovação espera.\nUma Rotina terminou.', dentroDaJanela: true, quantidade: 2 }),
      async () => { chamadas.push('confirmados') },
      async () => { chamadas.push('liberados') },
    ),
    adaptador,
    segredoInterno: SEGREDO,
  })
  const response = await handler(new Request('https://exemplo.test', {
    method: 'POST', headers: { 'x-whatsapp-delivery-secret': SEGREDO, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notice_user_id: '59000000-0000-0000-0000-000000000007' }),
  }))
  assertEquals(response.status, 200)
  assertEquals(adaptador.envios, [{ tipo: 'texto', para: '5511999990007', texto: 'Uma Aprovação espera.\nUma Rotina terminou.' }])
  assertEquals(chamadas, ['confirmados'])
})

Deno.test('aviso fora da janela usa template sem conteúdo e falha libera a fila', async () => {
  const adaptador = createCanalSimulado()
  const chamadas: string[] = []
  const templates: unknown[] = []
  adaptador.enviarTemplate = async (template) => { templates.push(template); throw new Error('simulador offline') }
  const handler = createHandler({
    db: dbDeAvisos(
      async () => ({ telefone: '5511999990007', resumo: 'Há uma Aprovação esperando.', dentroDaJanela: false, quantidade: 1 }),
      async () => { chamadas.push('confirmados') },
      async () => { chamadas.push('liberados') },
    ),
    adaptador,
    segredoInterno: SEGREDO,
  })
  const response = await handler(new Request('https://exemplo.test', {
    method: 'POST', headers: { 'x-whatsapp-delivery-secret': SEGREDO, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notice_user_id: '59000000-0000-0000-0000-000000000007' }),
  }))
  assertEquals(response.status, 502)
  assertEquals(templates, [{ para: '5511999990007', nome: 'althius_aviso_proativo', idioma: 'pt_BR', parametros: [], categoria: 'utilidade' }])
  assertEquals(chamadas, ['liberados'])
})
