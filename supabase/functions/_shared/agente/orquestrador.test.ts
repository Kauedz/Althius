import { assert, assertEquals } from 'jsr:@std/assert@1'
import { ErroDoAgente, type ModeloDoAgente } from './modelo.ts'
import { type BancoDoAgente, executarEscolha, executarTurno, type TurnoReservado } from './orquestrador.ts'
import type { Ferramenta, ResultadoDaFerramenta } from './registro.ts'

const JWT = 'Bearer eyJhbGciOiJIUzI1NiJ9.segredo-do-usuario.assinatura-qualquer'

function bancoFalso() {
  const chamadas: { metodo: string; args: Record<string, unknown> }[] = []
  let n = 0
  const banco: BancoDoAgente = {
    gravarPasso: (a) => { chamadas.push({ metodo: 'gravarPasso', args: a }); return Promise.resolve(`passo-${++n}`) },
    atualizarPasso: (a) => { chamadas.push({ metodo: 'atualizarPasso', args: a }); return Promise.resolve() },
    fecharTurno: (a) => { chamadas.push({ metodo: 'fecharTurno', args: a }); return Promise.resolve() },
  }
  return { banco, chamadas, fechamento: () => chamadas.filter((c) => c.metodo === 'fecharTurno').at(-1)?.args }
}

function modeloFalso(respostas: (string | Error)[]): ModeloDoAgente & { pedidos: string[] } {
  const pedidos: string[] = []
  return {
    pedidos,
    responder: (_s, u) => {
      pedidos.push(u)
      const r = respostas.shift()
      if (r instanceof Error) return Promise.reject(r)
      return Promise.resolve(r ?? '{"chamadas":[],"resposta":"fim"}')
    },
  }
}

function ferramenta(nome: string, extra: Partial<Ferramenta> = {}, resultado?: Partial<ResultadoDaFerramenta>): Ferramenta & { vistos: unknown[] } {
  const vistos: unknown[] = []
  return {
    vistos,
    nome,
    descricao: nome,
    esquema: {},
    aprovacao: 'livre',
    titulo: () => `Rodar ${nome}`,
    cotar: () => Promise.resolve(0),
    executar: (ctx, entrada) => {
      vistos.push({ ctx, entrada })
      return Promise.resolve({ resumo: `${nome} feito`, cartoes: [{ tipo: 'aviso', texto: 'ok' }], custo: 0, ...resultado })
    },
    ...extra,
  }
}

const turno = (extra: Partial<TurnoReservado> = {}): TurnoReservado => ({
  turnoId: 'turno-1', conversaId: 'conversa-1', workspaceId: 'ws-1', userId: 'user-1', pedido: 'Ache empresas',
  gastos: 0, teto: 50, retomar: null, passosFeitos: [], historico: [], ...extra,
})

const sessao = { authorization: JWT, apikey: 'chave-publica' }

Deno.test('(a) sem chamadas, a resposta do modelo fecha o turno', async () => {
  const { banco, fechamento } = bancoFalso()
  await executarTurno(turno(), { banco, modelo: modeloFalso(['{"chamadas":[],"resposta":"Olá!"}']), ferramentas: [], sessao })
  assertEquals(fechamento(), { turnoId: 'turno-1', status: 'concluido', resposta: 'Olá!' })
})

Deno.test('(b) a ferramenta livre roda, vira passo ok e o resultado volta ao modelo', async () => {
  const { banco, chamadas, fechamento } = bancoFalso()
  const icp = ferramenta('ler_icp', {}, { custo: 0 })
  const modelo = modeloFalso(['{"plano":"ler","chamadas":[{"ferramenta":"ler_icp","entrada":{}}],"resposta":""}', '{"chamadas":[],"resposta":"Li o ICP."}'])
  await executarTurno(turno(), { banco, modelo, ferramentas: [icp], sessao })
  assertEquals(chamadas[0], { metodo: 'gravarPasso', args: { turnoId: 'turno-1', ferramenta: 'ler_icp', titulo: 'Rodar ler_icp', estado: 'rodando', entrada: {} } })
  assertEquals(chamadas[1].args.estado, 'ok')
  assert(modelo.pedidos[1].includes('ler_icp (ok): ler_icp feito'))
  assertEquals(fechamento()?.resposta, 'Li o ICP.')
})

Deno.test('(c) acima do teto, o turno para com o cartão de confirmação e nada roda', async () => {
  const { banco, chamadas, fechamento } = bancoFalso()
  const busca = ferramenta('buscar_empresas', { aprovacao: 'teto', cotar: () => Promise.resolve(10) })
  const modelo = modeloFalso(['{"chamadas":[{"ferramenta":"buscar_empresas","entrada":{"quantidade":50}}],"resposta":"Vou buscar."}'])
  await executarTurno(turno({ gastos: 45 }), { banco, modelo, ferramentas: [busca], sessao })
  assertEquals(busca.vistos.length, 0)
  assertEquals(chamadas[0].args.estado, 'aguardando_confirmacao')
  assertEquals(chamadas[0].args.motivo, 'teto')
  const cartao = (chamadas[1].args.resultado as { cartoes: { tipo: string; custo: number }[] }).cartoes[0]
  assertEquals([cartao.tipo, cartao.custo], ['confirmacao', 10])
  assertEquals(fechamento()?.status, 'aguardando')
})

Deno.test('(c2) a ferramenta "sempre" pede confirmação mesmo sem custo (mensagem a prospect)', async () => {
  const { banco, chamadas, fechamento } = bancoFalso()
  const envio = ferramenta('gerar_sequencia', { aprovacao: 'sempre' })
  await executarTurno(turno(), {
    banco, modelo: modeloFalso(['{"chamadas":[{"ferramenta":"gerar_sequencia","entrada":{}}],"resposta":""}']), ferramentas: [envio], sessao,
  })
  assertEquals(envio.vistos.length, 0)
  assertEquals(chamadas[0].args.motivo, 'prospect')
  assertEquals(fechamento()?.status, 'aguardando')
})

Deno.test('(d) o erro de uma ferramenta vira passo com erro e o turno segue', async () => {
  const { banco, chamadas, fechamento } = bancoFalso()
  const quebrada = ferramenta('consultar_receita', { executar: () => Promise.reject(new Error(`falhou com ${JWT}`)) })
  const modelo = modeloFalso(['{"chamadas":[{"ferramenta":"consultar_receita","entrada":{"cnpj":"1"}}],"resposta":""}', '{"chamadas":[],"resposta":"A Receita não respondeu."}'])
  await executarTurno(turno(), { banco, modelo, ferramentas: [quebrada], sessao })
  const erro = chamadas.find((c) => c.args.estado === 'erro')
  assert(erro)
  assert(!String(erro.args.erro).includes('segredo-do-usuario'))
  assertEquals(fechamento()?.status, 'concluido')
})

Deno.test('(e) JSON inválido ganha uma segunda chance; na segunda, falha com model_invalid_output', async () => {
  const um = bancoFalso()
  await executarTurno(turno(), { banco: um.banco, modelo: modeloFalso(['não é json', '{"chamadas":[],"resposta":"ok"}']), ferramentas: [], sessao })
  assertEquals(um.fechamento()?.status, 'concluido')
  const dois = bancoFalso()
  await executarTurno(turno(), { banco: dois.banco, modelo: modeloFalso(['nada', 'nada de novo']), ferramentas: [], sessao })
  assertEquals([dois.fechamento()?.status, dois.fechamento()?.errorCode], ['falhou', 'model_invalid_output'])
})

Deno.test('(e2) o modelo fora do ar fecha o turno com o código dele', async () => {
  const { banco, fechamento } = bancoFalso()
  await executarTurno(turno(), { banco, modelo: modeloFalso([new ErroDoAgente('model_timeout')]), ferramentas: [], sessao })
  assertEquals([fechamento()?.status, fechamento()?.errorCode], ['falhou', 'model_timeout'])
})

Deno.test('(f) o JWT chega só ao contexto da ferramenta, nunca ao banco nem ao modelo', async () => {
  const { banco, chamadas } = bancoFalso()
  const icp = ferramenta('ler_icp')
  const modelo = modeloFalso(['{"chamadas":[{"ferramenta":"ler_icp","entrada":{}}],"resposta":""}'])
  await executarTurno(turno(), { banco, modelo, ferramentas: [icp], sessao })
  assertEquals((icp.vistos[0] as { ctx: { authorization: string } }).ctx.authorization, JWT)
  assert(!JSON.stringify(chamadas).includes('segredo-do-usuario'))
  assert(!modelo.pedidos.join('\n').includes('segredo-do-usuario'))
})

Deno.test('ferramenta desconhecida não vira passo e o modelo é avisado', async () => {
  const { banco, chamadas } = bancoFalso()
  const modelo = modeloFalso(['{"chamadas":[{"ferramenta":"inventada","entrada":{}}],"resposta":""}', '{"chamadas":[],"resposta":"ok"}'])
  await executarTurno(turno(), { banco, modelo, ferramentas: [], sessao })
  assertEquals(chamadas.filter((c) => c.metodo === 'gravarPasso').length, 0)
  assert(modelo.pedidos[1].includes('não existe'))
})

Deno.test('o passo confirmado retoma sem passar pelo portão, e o custo entra no gasto', async () => {
  const { banco, chamadas } = bancoFalso()
  const busca = ferramenta('buscar_empresas', { aprovacao: 'teto', cotar: () => Promise.resolve(10) }, { custo: 10 })
  const modelo = modeloFalso(['{"chamadas":[],"resposta":"Achei as empresas."}'])
  await executarTurno(
    turno({ gastos: 45, retomar: { passoId: 'passo-confirmado', ferramenta: 'buscar_empresas', entrada: { quantidade: 50 } } }),
    { banco, modelo, ferramentas: [busca], sessao },
  )
  assertEquals(busca.vistos.length, 1)
  assertEquals(chamadas[0].args, {
    passoId: 'passo-confirmado', estado: 'ok', resultado: { cartoes: [{ tipo: 'aviso', texto: 'ok' }] }, resumo: 'buscar_empresas feito', custo: 10,
  })
  assert(modelo.pedidos[0].includes('Gasto desta conversa: 55 de 50 créditos.'))
})

Deno.test('a tarefa longa deixa o passo rodando com o externo', async () => {
  const { banco, chamadas } = bancoFalso()
  const busca = ferramenta('buscar_empresas', {}, { pendente: { externo: { runId: 'r1' } }, resumo: 'A busca segue.' })
  await executarTurno(turno(), {
    banco, modelo: modeloFalso(['{"chamadas":[{"ferramenta":"buscar_empresas","entrada":{}}],"resposta":""}']), ferramentas: [busca], sessao,
  })
  assertEquals(chamadas[1].args.estado, 'rodando')
  assertEquals(chamadas[1].args.externo, { runId: 'r1' })
})

Deno.test('no máximo 6 rodadas', async () => {
  const { banco, fechamento } = bancoFalso()
  const icp = ferramenta('ler_icp')
  const sempre = '{"chamadas":[{"ferramenta":"ler_icp","entrada":{}}],"resposta":"Ainda lendo."}'
  const modelo = modeloFalso(Array(10).fill(sempre))
  await executarTurno(turno(), { banco, modelo, ferramentas: [icp], sessao })
  assertEquals(modelo.pedidos.length, 6)
  assertEquals(fechamento()?.resposta, 'Ainda lendo.')
})

Deno.test('a escolha de um cartão roda a ferramenta sem o modelo e fecha com o resumo', async () => {
  const { banco, fechamento } = bancoFalso()
  const aceitar = ferramenta('aceitar_empresa', {}, { resumo: 'Acme virou Conta-alvo.' })
  const r = await executarEscolha(turno(), { banco, ferramentas: [aceitar], sessao }, { ferramenta: 'aceitar_empresa', entrada: { descobertaId: 'd1' } })
  assertEquals(r.status, 'ok')
  assertEquals(fechamento()?.resposta, 'Acme virou Conta-alvo.')
})

Deno.test('a escolha acima do teto também para no cartão de confirmação', async () => {
  const { banco, fechamento } = bancoFalso()
  const comite = ferramenta('enriquecer_comite', { aprovacao: 'teto', cotar: () => Promise.resolve(10) })
  const r = await executarEscolha(turno({ gastos: 48 }), { banco, ferramentas: [comite], sessao }, { ferramenta: 'enriquecer_comite', entrada: {} })
  assertEquals(r.status, 'aguardando')
  assertEquals(comite.vistos.length, 0)
  assertEquals(fechamento()?.status, 'aguardando')
})
