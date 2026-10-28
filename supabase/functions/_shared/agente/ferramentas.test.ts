import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { ferramentasDoAgente, type ServicosDoAgente } from './ferramentas.ts'
import type { ContextoDaFerramenta } from './registro.ts'

const ctx: ContextoDaFerramenta = {
  workspaceId: '11111111-1111-4111-8111-111111111111', userId: 'u', passoId: '22222222-2222-4222-8222-222222222222',
  authorization: 'Bearer x', apikey: 'k',
}
const RUN = '33333333-3333-4333-8333-333333333333'
const DESC = '44444444-4444-4444-8444-444444444444'
const CONTA = '55555555-5555-4555-8555-555555555555'

function servicos(over: Partial<ServicosDoAgente> & { runState?: string } = {}) {
  const rpcs: { nome: string; args: Record<string, unknown> }[] = []
  const funcoes: { nome: string; corpo: Record<string, unknown> }[] = []
  let t = 0
  const s: ServicosDoAgente = {
    rpc: (_c, nome, args) => {
      rpcs.push({ nome, args })
      if (nome === 'quote_account_discovery') return Promise.resolve([{ credits: 5, available: 100 }])
      if (nome === 'list_discovery_runs') {
        return Promise.resolve([{ id: RUN, state: over.runState ?? 'concluida', estimated_credits: 5, found: 2, added: 2, last_error: 'Fonte fora do ar' }])
      }
      if (nome === 'list_discovered_accounts') {
        return Promise.resolve([
          { id: DESC, run_id: RUN, state: 'nova', name: 'Acme Logística', domain: 'acme.com.br', sector: 'Logística', fit_level: 'alto',
            reasons: [{ criterio: 'setor', atende: true, texto: 'Setor combina: logística.' }], location: 'São Paulo, SP' },
          { id: 'outra', run_id: 'outra-busca', state: 'nova', name: 'Fora', fit_level: 'baixo', reasons: [] },
        ])
      }
      if (nome === 'accept_discovered_account') return Promise.resolve([{ target_account_id: CONTA, created: true, committee: 'liberado' }])
      if (nome === 'get_my_workspace_icp') return Promise.resolve({ version: 3, sector: 'Logística', companySize: '50-500', geography: 'SP', targetRoles: ['Diretor de Operações'] })
      return Promise.resolve(null)
    },
    funcao: (_c, nome, corpo) => {
      funcoes.push({ nome, corpo })
      if (corpo.action === 'criteria') return Promise.resolve({ temIcp: true, icpVersion: 3, criteria: { setores: ['logística'], regioes: ['SP'] } })
      if (corpo.action === 'search') return Promise.resolve({ runId: RUN, state: 'em_andamento' })
      if (corpo.action === 'comite-compra') {
        return Promise.resolve({ contactsAdded: 2, proposed: [{ nome: 'Ana Souza', cargo: 'Diretora de Operações', linkedinUrl: 'https://linkedin.com/in/ana' }, { nome: 'Rui', jaEncontrada: true }] })
      }
      if (corpo.action === 'cnpj-receita') {
        return Promise.resolve({ cnpjFormatado: '11.222.333/0001-81', razaoSocial: 'ACME LTDA', situacaoCadastral: 'ATIVA', cnaePrincipal: { codigo: '4930', descricao: 'Transporte' } })
      }
      return Promise.resolve({})
    },
    lerConta: () => Promise.resolve({ id: CONTA, nome: 'Acme Logística', dominio: 'acme.com.br', linkedinUrl: null }),
    esperar: () => { t += 4000; return Promise.resolve() },
    relogio: () => t,
    ...over,
  }
  return { s, rpcs, funcoes }
}

const pegar = (s: ServicosDoAgente, nome: string) => ferramentasDoAgente(s).find((f) => f.nome === nome)!

Deno.test('o registro tem as ferramentas da fatia 3a e do ICP (Fases 4 e 7), de Conta e de Sinal, cada uma com aprovação', () => {
  const nomes = ferramentasDoAgente(servicos().s).map((f) => `${f.nome}:${f.aprovacao}`)
  assertEquals(nomes, [
    'ler_icp:livre', 'montar_criterios_da_busca:livre', 'buscar_empresas:teto', 'aceitar_empresa:livre',
    'descartar_empresa:livre', 'enriquecer_comite:teto', 'consultar_receita:teto',
    'explicar_aderencia:livre', 'revelar_email:teto', 'listar_sinais:livre', 'ativar_sinal:sempre', 'ler_site_para_icp:livre', 'ler_icp_do_crm:livre',
    'salvar_icp:sempre',
  ])
})

Deno.test('buscar_empresas cota pelo banco e busca com a chave do passo e os critérios do ICP', async () => {
  const { s, funcoes, rpcs } = servicos()
  const f = pegar(s, 'buscar_empresas')
  assertEquals(await f.cotar(ctx, { quantidade: 30 }), 5)
  assertEquals(rpcs[0].args, { p_workspace_id: ctx.workspaceId, p_max_results: 30 })
  const r = await f.executar(ctx, { quantidade: 30, criterios: { regioes: ['RJ'] } })
  const busca = funcoes.find((x) => x.corpo.action === 'search')!
  assertEquals(busca.corpo.requestKey, `agente:${ctx.passoId}`)
  assertEquals(busca.corpo.maxResults, 30)
  assertEquals(busca.corpo.criteria, { setores: ['logística'], regioes: ['RJ'] })
  assertEquals(r.custo, 5)
  const empresas = (r.cartoes[0] as unknown as { empresas: { id: string; nivel: string; porques: { texto: string }[] }[] }).empresas
  assertEquals(empresas.length, 1, 'só as empresas desta busca')
  assertEquals([empresas[0].id, empresas[0].nivel, empresas[0].porques[0].texto], [DESC, 'alto', 'Setor combina: logística.'])
  assert(r.resumo.includes(`id ${DESC}`))
})

Deno.test('buscar_empresas recusa quantidade fora de 1..50 antes de cotar', async () => {
  const f = pegar(servicos().s, 'buscar_empresas')
  await assertRejects(() => f.cotar(ctx, { quantidade: 51 }))
})

Deno.test('a busca que não termina no turno fica pendente e se atualiza depois', async () => {
  const lenta = servicos({ runState: 'em_andamento' })
  const r = await pegar(lenta.s, 'buscar_empresas').executar(ctx, {})
  assertEquals(r.pendente, { externo: { runId: RUN } })
  assertEquals(await pegar(lenta.s, 'buscar_empresas').atualizar!(ctx, { runId: RUN }), null)
  const pronta = servicos()
  const depois = await pegar(pronta.s, 'buscar_empresas').atualizar!(ctx, { runId: RUN })
  assertEquals(depois?.custo, 5)
})

Deno.test('a busca que falhou vira erro com a mensagem do banco', async () => {
  await assertRejects(() => pegar(servicos({ runState: 'falhou' }).s, 'buscar_empresas').executar(ctx, {}), Error, 'Fonte fora do ar')
})

Deno.test('aceitar_empresa aceita pelo banco e devolve a Conta-alvo', async () => {
  const { s, rpcs } = servicos()
  const r = await pegar(s, 'aceitar_empresa').executar(ctx, { descobertaId: DESC })
  assertEquals(rpcs[0], { nome: 'accept_discovered_account', args: { p_id: DESC, p_url: null } })
  assert(r.resumo.includes(CONTA))
  await assertRejects(() => pegar(s, 'aceitar_empresa').executar(ctx, { descobertaId: 'inventado' }))
})

Deno.test('enriquecer_comite cota 10 e cobra só as pessoas novas', async () => {
  const { s, funcoes } = servicos()
  const f = pegar(s, 'enriquecer_comite')
  assertEquals(await f.cotar(ctx, { contaId: CONTA }), 10)
  const r = await f.executar(ctx, { contaId: CONTA })
  assertEquals(funcoes[0].corpo.companyName, 'Acme Logística')
  assertEquals(r.custo, 2)
  assertEquals((r.cartoes[0] as unknown as { pessoas: unknown[] }).pessoas.length, 2)
})

Deno.test('consultar_receita confere o CNPJ e devolve o cartão', async () => {
  const { s } = servicos()
  const f = pegar(s, 'consultar_receita')
  await assertRejects(() => f.executar(ctx, { contaId: CONTA, cnpj: '123' }), Error, '14 dígitos')
  const r = await f.executar(ctx, { contaId: CONTA, cnpj: '11.222.333/0001-81' })
  assertEquals(r.cartoes[0].tipo, 'receita')
  assertEquals((r.cartoes[0] as unknown as { razaoSocial: string }).razaoSocial, 'ACME LTDA')
  assertEquals(r.custo, 1)
})

Deno.test('ler_icp sem ICP avisa em vez de inventar', async () => {
  const { s } = servicos({ rpc: () => Promise.resolve({ version: null }) })
  const r = await pegar(s, 'ler_icp').executar(ctx, {})
  assertEquals(r.cartoes[0].tipo, 'aviso')
  assert(r.resumo.includes('ainda não tem ICP'))
})

const LEITURA = {
  oQueVende: 'Software de roteirização de frotas.', miniIcp: 'Transportadoras médias do Sul.', porQueCompram: 'Cortar custo de frete.',
  personas: ['Diretor de Operações'], setor: 'Logística, Transporte', porte: '51-200, 201-500', regiao: 'RS, SC, PR',
}

Deno.test('ler_site_para_icp lê o site pela icp-site-read e propõe os campos, sem salvar', async () => {
  const { s, funcoes, rpcs } = servicos({
    funcao: (_c, nome, corpo) => { funcoes.push({ nome, corpo }); return Promise.resolve({ leitura: LEITURA }) },
  })
  const f = pegar(s, 'ler_site_para_icp')
  assertEquals(f.aprovacao, 'livre')
  assertEquals(await f.cotar(ctx, { dominio: 'https://www.frota.com.br/' }), 0)
  const r = await f.executar(ctx, { dominio: 'https://www.frota.com.br/' })
  assertEquals(funcoes[0], { nome: 'icp-site-read', corpo: { workspaceId: ctx.workspaceId, dominio: 'https://www.frota.com.br/' } })
  assertEquals(r.cartoes[0], {
    tipo: 'icp_proposto', dominio: 'https://www.frota.com.br/', setor: 'Logística, Transporte', porte: '51-200, 201-500',
    geografia: 'RS, SC, PR', cargos: ['Diretor de Operações'], oQueVende: 'Software de roteirização de frotas.',
    miniIcp: 'Transportadoras médias do Sul.', porQueCompram: 'Cortar custo de frete.',
  })
  assert(r.resumo.includes('salvar_icp'))
  assertEquals(r.custo, 0)
  assert(!rpcs.some((x) => x.nome === 'save_my_workspace_icp_fields'))
})

Deno.test('ler_site_para_icp sem leitura avisa em vez de inventar', async () => {
  const { s } = servicos({ funcao: () => Promise.resolve({ leitura: null }) })
  const r = await pegar(s, 'ler_site_para_icp').executar(ctx, { dominio: 'frota.com.br' })
  assertEquals(r.cartoes[0].tipo, 'aviso')
  assertEquals(r.custo, 0)
})

Deno.test('ler_site_para_icp exige o domínio', async () => {
  const { s } = servicos()
  await assertRejects(() => pegar(s, 'ler_site_para_icp').executar(ctx, {}), Error, 'site')
})

Deno.test('salvar_icp sempre pergunta e salva setor, porte e geografia como nova versão', async () => {
  const { s, rpcs } = servicos({
    rpc: (_c, nome, args) => {
      rpcs.push({ nome, args })
      return Promise.resolve({ version: 4, sector: 'Logística', companySize: '51-200', geography: 'RS', targetRoles: [] })
    },
  })
  const f = pegar(s, 'salvar_icp')
  assertEquals(f.aprovacao, 'sempre')
  assertEquals(f.motivo, 'alteracao')
  assertEquals(await f.cotar(ctx, {}), 0)
  const r = await f.executar(ctx, { setor: ' Logística ', porte: '51-200', geografia: 'RS' })
  assertEquals(rpcs[0], {
    nome: 'save_my_workspace_icp_fields',
    args: { p_workspace_id: ctx.workspaceId, p_sector: 'Logística', p_company_size: '51-200', p_geography: 'RS' },
  })
  assertEquals(r.cartoes[0].tipo, 'icp')
  assertEquals(r.cartoes[0].versao, 4)
  assert(r.resumo.includes('versão 4'))
})

Deno.test('salvar_icp recusa porte fora da lista antes de chamar o banco', async () => {
  const { s, rpcs } = servicos()
  await assertRejects(() => pegar(s, 'salvar_icp').executar(ctx, { setor: 'Logística', porte: 'grande' }), Error, 'porte')
  assertEquals(rpcs.length, 0)
})
