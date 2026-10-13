// O adaptador do banco: cada operação chama a função certa com os parâmetros certos e traduz a resposta.
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { type ClienteRpc, criarDbDaCascata } from './db.ts'

function rpcFalso(respostas: Record<string, unknown>, erro?: { code?: string; message: string }) {
  const chamadas: { nome: string; args?: Record<string, unknown> }[] = []
  const admin: ClienteRpc = {
    rpc: (nome, args) => {
      chamadas.push({ nome, args })
      return Promise.resolve({ data: respostas[nome] ?? null, error: erro ?? null })
    },
  }
  return { admin, chamadas }
}

Deno.test('abrir chama begin_cascade_run e devolve o desfecho com a execução, os créditos e o teto', async () => {
  const { admin, chamadas } = rpcFalso({ begin_cascade_run: [{ outcome: 'go', run_id: 'run-1', reservation_id: 'res-1', est_credits: 4, cap_usd: '0.5' }] })
  const r = await criarDbDaCascata(admin).abrir({
    workspaceId: 'ws', userId: 'u', signalType: 'vaga_comex', origem: 'monitor', monitorId: 'm', chave: 'k', estimativaUsd: 0.3, tetoCreditos: 2, permitirTeste: false,
  })
  assertEquals(r, { outcome: 'go', runId: 'run-1', estCredits: 4, capUsd: 0.5 })
  assertEquals(chamadas[0], {
    nome: 'begin_cascade_run',
    args: { p_workspace_id: 'ws', p_user_id: 'u', p_signal_type: 'vaga_comex', p_origin: 'monitor', p_monitor_id: 'm', p_key: 'k', p_est_usd: 0.3, p_cap_credits: 2, p_allow_testing: false },
  })
})

Deno.test('fechar manda o custo real e os contadores e devolve os créditos cobrados', async () => {
  const { admin, chamadas } = rpcFalso({ finish_cascade_run: [{ credits_charged: 2, outcome: 'succeeded' }] })
  const r = await criarDbDaCascata(admin).fechar({ runId: 'run-1', estado: 'succeeded', custoUsd: 0.25, casados: 3, novos: 2, repetidos: 1, erroAmigavel: null })
  assertEquals(r, { creditosCobrados: 2 })
  assertEquals(chamadas[0].args, { p_run_id: 'run-1', p_state: 'succeeded', p_real_cost_usd: 0.25, p_matched: 3, p_signals_new: 2, p_signals_repeated: 1, p_friendly_error: null })
})

Deno.test('o rastro do passo: abre e fecha com run id, conta usada, custo, status e erro real', async () => {
  const { admin, chamadas } = rpcFalso({ start_cascade_step: 'passo-1' })
  const db = criarDbDaCascata(admin)
  const id = await db.abrirPasso({ runId: 'run-1', ordem: 2, tentativa: 1, handler: 'linkedin_empresa', kind: 'actor', actorId: 'harvestapi~linkedin-company', itensEntrada: 7 })
  await db.fecharPasso({ passoId: id, estado: 'failed', apifyRunId: 'abc', build: '0.0.44', tokenIndex: 1, itensSaida: 0, custoUsd: 0.001, statusHttp: 402, erroReal: 'Insufficient credit' })
  assertEquals(id, 'passo-1')
  assertEquals(chamadas[1], {
    nome: 'finish_cascade_step',
    args: { p_step_id: 'passo-1', p_state: 'failed', p_apify_run_id: 'abc', p_build: '0.0.44', p_token_index: 1, p_items_out: 0, p_cost_usd: 0.001, p_http_status: 402, p_real_error: 'Insufficient credit' },
  })
})

Deno.test('gravarSinal usa o record_signal de sempre e diz se o Sinal é novo', async () => {
  const { admin, chamadas } = rpcFalso({ record_signal: true })
  const novo = await criarDbDaCascata(admin).gravarSinal({
    workspaceId: 'ws', contaId: 'c', monitorId: null, signalType: 'vaga_comex',
    sinal: { contaId: 'c', contaNome: 'Alfa', eventKey: 'vaga|alfa|analista|2026', phrase: 'Abriu vaga', firedAt: '2026-10-12T10:00:00Z', source: 'LinkedIn Vagas', evidence: 'x' },
  })
  assertEquals(novo, true)
  assertEquals(chamadas[0].nome, 'record_signal')
  assertEquals(chamadas[0].args?.p_target_account_id, 'c')
  assertEquals(chamadas[0].args?.p_monitor_id, null)
})

Deno.test('a definição, a configuração e as Contas vêm do banco; o erro do banco vira exceção com o nome da função', async () => {
  const def = { id: 'c1', signalType: 'vaga_comex', steps: [{ ordem: 1 }] }
  const ok = rpcFalso({
    signal_cascade_for_type: def,
    signal_cascade_settings: [{ usd_per_credit: '0.30', daily_credit_cap: 50 }],
    signal_cascade_accounts: [{ id: 'c', name: 'Alfa', domain: null, linkedinUrl: null, cnpj: '1' }],
  })
  const db = criarDbDaCascata(ok.admin)
  assertEquals((await db.definicao('vaga_comex'))?.steps.length, 1)
  assertEquals(await db.configuracao(), { usdPorCredito: 0.3, limiteDiario: 50 })
  assertEquals((await db.contas('ws', null, 100)).length, 1)
  assertEquals(await criarDbDaCascata(rpcFalso({}).admin).definicao('nada'), null)
  const ruim = rpcFalso({}, { code: '42501', message: 'permission denied' })
  await assertRejects(() => criarDbDaCascata(ruim.admin).definicao('x'), Error, 'signal_cascade_for_type: 42501 permission denied')
})
