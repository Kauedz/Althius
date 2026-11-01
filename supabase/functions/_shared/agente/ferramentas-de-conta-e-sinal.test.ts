import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { ferramentasDeContaESinal, CREDITOS_DO_EMAIL, CREDITOS_DO_TELEFONE } from './ferramentas-de-conta-e-sinal.ts'
import type { ServicosDoAgente } from './ferramentas.ts'
import { type ContextoDaFerramenta, type Ferramenta, portao } from './registro.ts'

const ctx: ContextoDaFerramenta = {
  workspaceId: '11111111-1111-4111-8111-111111111111', userId: 'u', passoId: '22222222-2222-4222-8222-222222222222',
  authorization: 'Bearer x', apikey: 'k',
}
const DESCOBERTA = '33333333-3333-4333-8333-333333333333'
const CONTATO = '44444444-4444-4444-8444-444444444444'
const SINAL = '55555555-5555-4555-8555-555555555555'

type Chamada = { nome: string; corpo: Record<string, unknown> }

function servicos(opcoes: { funcao?: (c: Chamada) => Record<string, unknown>; rpc?: (c: Chamada) => unknown } = {}) {
  const funcoes: Chamada[] = []
  const rpcs: Chamada[] = []
  const s: ServicosDoAgente = {
    rpc: (_c, nome, args) => { rpcs.push({ nome, corpo: args }); return Promise.resolve(opcoes.rpc?.({ nome, corpo: args }) ?? null) },
    funcao: (_c, nome, corpo) => { funcoes.push({ nome, corpo }); return Promise.resolve(opcoes.funcao?.({ nome, corpo }) ?? {}) },
    lerConta: () => Promise.resolve(null),
  }
  const lista = ferramentasDeContaESinal(s)
  const pegar = (n: string): Ferramenta => lista.find((f) => f.nome === n)!
  return { s, funcoes, rpcs, lista, pegar }
}

Deno.test('as ferramentas de Conta e Sinal declaram custo e aprovação: ativar um Sinal sempre pergunta', () => {
  const { lista } = servicos()
  assertEquals(lista.map((f) => `${f.nome}:${f.aprovacao}`), [
    'explicar_aderencia:livre', 'revelar_email:teto', 'revelar_telefone:teto', 'listar_sinais:livre', 'ativar_sinal:sempre',
  ])
  const ativar = lista.find((f) => f.nome === 'ativar_sinal')!
  assertEquals(portao(ativar, 0, 0, 50).estado, 'aguardar')
  assert(ativar.explicacao?.includes('Teto do Sinal'))
})

Deno.test('explicar_aderencia chama account-fit-explanation com o id da Descoberta e não cobra', async () => {
  const { pegar, funcoes } = servicos({
    funcao: () => ({ explicacao: 'Setor e porte batem com o ICP; a região não.', origem: 'regra', nivel: 'medio', pontuacao: 62 }),
  })
  const f = pegar('explicar_aderencia')
  assertEquals(await f.cotar(ctx, { descobertaId: DESCOBERTA }), 0)
  const r = await f.executar(ctx, { descobertaId: DESCOBERTA })
  assertEquals(funcoes, [{ nome: 'account-fit-explanation', corpo: { discoveredAccountId: DESCOBERTA } }])
  assertEquals(r.custo, 0)
  assert(r.resumo.includes('Setor e porte batem'))
  assertEquals(r.cartoes, [{ tipo: 'aviso', texto: 'Aderência média (62): Setor e porte batem com o ICP; a região não.', descobertaId: DESCOBERTA }])
})

Deno.test('explicar_aderencia recusa um id que não é de Descoberta sem chamar a função', async () => {
  const { pegar, funcoes } = servicos()
  await assertRejects(() => pegar('explicar_aderencia').executar(ctx, { descobertaId: 'acme' }))
  assertEquals(funcoes.length, 0)
})

Deno.test('revelar_email cota 2 créditos, só pede e-mail e conta o que o banco debitou', async () => {
  const { pegar, funcoes } = servicos({ funcao: () => ({ sucesso: true, canal: 'email', valor: 'ana@acme.com.br', creditosDebitados: 2 }) })
  const f = pegar('revelar_email')
  assertEquals(CREDITOS_DO_EMAIL, 2)
  assertEquals(await f.cotar(ctx, { contatoId: CONTATO }), 2)
  const r = await f.executar(ctx, { contatoId: CONTATO })
  assertEquals(funcoes[0], {
    nome: 'account-enrichment', corpo: { action: 'revelar-contato', workspaceId: ctx.workspaceId, contactId: CONTATO, canal: 'email' },
  })
  assertEquals(r.custo, 2)
  assertEquals(r.cartoes, [{ tipo: 'aviso', texto: 'E-mail encontrado: ana@acme.com.br (2 créditos).' }])
})

Deno.test('revelar_email: já conhecido ou não achado não cobra', async () => {
  const ja = servicos({ funcao: () => ({ sucesso: true, valor: 'ana@acme.com.br', creditosDebitados: 0, jaExistia: true }) })
  const r1 = await ja.pegar('revelar_email').executar(ctx, { contatoId: CONTATO })
  assertEquals(r1.custo, 0)
  assertEquals(r1.cartoes[0].texto, 'O Contato já tinha o e-mail ana@acme.com.br; nada foi cobrado.')
  const nada = servicos({ funcao: () => ({ sucesso: false, valor: null, creditosDebitados: 0 }) })
  const r2 = await nada.pegar('revelar_email').executar(ctx, { contatoId: CONTATO })
  assertEquals(r2.custo, 0)
  assertEquals(r2.cartoes[0].texto, 'Não achei o e-mail deste Contato; nada foi cobrado.')
})

Deno.test('revelar_telefone cota 5 créditos, pede o canal telefone e conta o que o banco debitou', async () => {
  const { pegar, funcoes } = servicos({ funcao: () => ({ sucesso: true, canal: 'telefone', valor: '+5511912345678', creditosDebitados: 5 }) })
  const f = pegar('revelar_telefone')
  assertEquals(CREDITOS_DO_TELEFONE, 5)
  assertEquals(await f.cotar(ctx, { contatoId: CONTATO }), 5)
  const r = await f.executar(ctx, { contatoId: CONTATO })
  assertEquals(funcoes[0], {
    nome: 'account-enrichment', corpo: { action: 'revelar-contato', workspaceId: ctx.workspaceId, contactId: CONTATO, canal: 'telefone' },
  })
  assertEquals(r.custo, 5)
  assertEquals(r.cartoes, [{ tipo: 'aviso', texto: 'Telefone encontrado: +5511912345678 (5 créditos).' }])
})

Deno.test('revelar_telefone: não achado ou já conhecido não cobra', async () => {
  const nada = servicos({ funcao: () => ({ sucesso: false, valor: null, creditosDebitados: 0 }) })
  const r1 = await nada.pegar('revelar_telefone').executar(ctx, { contatoId: CONTATO })
  assertEquals(r1.custo, 0)
  assertEquals(r1.cartoes[0].texto, 'Não achei o telefone deste Contato; nada foi cobrado.')
  const ja = servicos({ funcao: () => ({ sucesso: true, valor: '+5511912345678', creditosDebitados: 0, jaExistia: true }) })
  const r2 = await ja.pegar('revelar_telefone').executar(ctx, { contatoId: CONTATO })
  assertEquals(r2.custo, 0)
  assertEquals(r2.cartoes[0].texto, 'O Contato já tinha o telefone +5511912345678; nada foi cobrado.')
})

Deno.test('revelar_telefone respeita o teto de 50 créditos da conversa', async () => {
  const { pegar, funcoes } = servicos()
  const f = pegar('revelar_telefone')
  const custo = await f.cotar(ctx, { contatoId: CONTATO })
  assertEquals(portao(f, custo, 45, 50).estado, 'rodar')
  assertEquals(portao(f, custo, 46, 50), { estado: 'aguardar', motivo: 'teto' })
  await assertRejects(() => f.executar(ctx, { contatoId: 'acme' }))
  assertEquals(funcoes.length, 0)
})

const MONITORES = [
  { id: SINAL, name: 'Vagas de logística', state: 'pausado', signal_type: 'vagas' },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Rodada de investimento', state: 'ativo', signal_type: 'investimento' },
]

Deno.test('listar_sinais mostra nome, estado e id dos Sinais do Workspace', async () => {
  const { pegar, rpcs } = servicos({ rpc: () => MONITORES })
  const r = await pegar('listar_sinais').executar(ctx, {})
  assertEquals(rpcs[0], { nome: 'list_signal_monitors', corpo: { p_workspace_id: ctx.workspaceId } })
  assert(r.resumo.includes(`Vagas de logística [id ${SINAL}, pausado]`))
  assertEquals(r.custo, 0)
})

Deno.test('ativar_sinal confere a prévia da Rodada e só então liga o Sinal', async () => {
  const { pegar, rpcs } = servicos({
    rpc: ({ nome }) => nome === 'list_signal_monitors' ? MONITORES : nome === 'quote_signal_run' ? [{ ate_creditos: 12, bloqueio: null }] : null,
  })
  const f = pegar('ativar_sinal')
  assertEquals(await f.cotar(ctx, { sinalId: SINAL }), 0)
  const r = await f.executar(ctx, { sinalId: SINAL })
  assertEquals(rpcs.map((x) => x.nome), ['list_signal_monitors', 'quote_signal_run', 'set_signal_monitor_state'])
  assertEquals(rpcs[1].corpo, { p_workspace_id: ctx.workspaceId, p_monitor_id: SINAL })
  assertEquals(rpcs[2].corpo, { p_id: SINAL, p_state: 'ativo' })
  assertEquals(r.custo, 0)
  assertEquals(r.cartoes, [{ tipo: 'aviso', texto: 'Sinal "Vagas de logística" ativado. Cada Rodada custa até 12 créditos, dentro do Teto do Sinal.' }])
})

Deno.test('ativar_sinal não liga quando a prévia tem bloqueio, nem um Sinal que não é do Workspace', async () => {
  const bloq = servicos({
    rpc: ({ nome }) => nome === 'list_signal_monitors' ? MONITORES : nome === 'quote_signal_run' ? [{ ate_creditos: 12, bloqueio: 'sem_creditos' }] : null,
  })
  await assertRejects(() => bloq.pegar('ativar_sinal').executar(ctx, { sinalId: SINAL }), Error, 'créditos')
  assert(!bloq.rpcs.some((x) => x.nome === 'set_signal_monitor_state'))

  const outro = servicos({ rpc: ({ nome }) => nome === 'list_signal_monitors' ? MONITORES : null })
  await assertRejects(() => outro.pegar('ativar_sinal').executar(ctx, { sinalId: '77777777-7777-4777-8777-777777777777' }), Error, 'Não encontrei')
  assert(!outro.rpcs.some((x) => x.nome === 'set_signal_monitor_state'))
})

Deno.test('ativar_sinal num Sinal já ativo não chama nada que muda', async () => {
  const { pegar, rpcs } = servicos({ rpc: ({ nome }) => nome === 'list_signal_monitors' ? MONITORES : null })
  const r = await pegar('ativar_sinal').executar(ctx, { sinalId: '66666666-6666-4666-8666-666666666666' })
  assertEquals(rpcs.map((x) => x.nome), ['list_signal_monitors'])
  assertEquals(r.cartoes[0].texto, 'O Sinal "Rodada de investimento" já está ativo.')
})
