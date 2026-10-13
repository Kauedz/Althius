// ICP B (contabilidade e tributário): CNPJ novo (B1), mudança de porte ou regime (B2), entrada de sócio (B3) e setor mais
// afetado pela CBS/IBS (B4), de ponta a ponta: o motor, os passos reais e o cliente do Apify contra um Apify falso, mais a
// BrasilAPI falsa (nunca a rede). Os formatos de resposta são os publicados de cada fonte (leitura de 13/10/2026): o
// que não pôde ser conferido está no relatório da fatia.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { MARCA_INTERNA } from '../../marca.ts'
import { dbFalso } from '../db-falso.ts'
import { apifyFalso, type ComportamentoDoRun } from '../falso-apify.ts'
import { clienteAssincronoDoApify } from '../fonte-apify.ts'
import { estimativaDaCascata, rodarCascata } from '../motor.ts'
import type { AlternativaDoPasso, CascataDef, ContaDoWorkspace, PassoDef } from '../tipos.ts'
import { passosDoIcp_b, idDoSocio } from './icp-b.ts'
import { registroDePassos } from './index.ts'
import { setorDoMes } from './icp-b-cnae.ts'

const AGORA = Date.parse('2026-10-13T12:00:00Z')
const TOKEN = 'apify_api_PRIMEIRO_SEGREDO_0123456789'

const ALFA: ContaDoWorkspace = { id: 'conta-alfa', name: 'Alfa Contábil Ltda', domain: 'alfa.test', linkedinUrl: null, cnpj: '11.222.333/0001-81' }
const BETA: ContaDoWorkspace = { id: 'conta-beta', name: 'Beta Serviços', domain: 'beta.test', linkedinUrl: null, cnpj: null }

const REGRA: Omit<PassoDef, 'ordem' | 'handler'> = {
  kind: 'regra', actorId: null, fallbacks: [], inputTemplate: {}, priceModel: 'NONE', estFixedUsd: 0, estPerItemUsd: 0, estItems: 0, maxItems: null,
}
const actor = (ordem: number, handler: string, actorId: string, fallbacks: AlternativaDoPasso[], preco: [number, number], itens: number, extra: Partial<PassoDef> = {}): PassoDef => ({
  ordem, kind: 'actor', handler, actorId, fallbacks, inputTemplate: {}, priceModel: 'PAY_PER_EVENT', estFixedUsd: preco[0], estPerItemUsd: preco[1], estItems: itens, maxItems: itens, ...extra,
})
const alt = (actorId: string, fixo: number, item: number): AlternativaDoPasso => ({ kind: 'actor', actorId, priceModel: 'PAY_PER_EVENT', estFixedUsd: fixo, estPerItemUsd: item })

const cascata = (signalType: string, scope: 'conta' | 'mercado', capUsd: number, maxAccounts: number, steps: PassoDef[]): CascataDef => ({
  id: `c-${signalType}`, signalType, icp: 'B', name: signalType, version: 1, state: 'available', semFonteMotivo: null, scope,
  multiplier: 3, capUsd, capCredits: null, cadenceHours: 720, maxAccounts, steps,
})

// As cascatas como a migração as registra.
const DEF_B1 = cascata('cnpj_novo', 'conta', 0.5, 200, [
  actor(1, 'cnpj_novos_da_receita', 'johnatan029~cnpj-new-companies', [alt('brazilayer~brazilian-new-companies', 0, 0.002), alt('epicscrapers~brazil-cnpj-scraper', 0.00005, 0.0009)], [0.00005, 0.004], 100),
  { ordem: 2, handler: 'casar_fatos_com_contas', ...REGRA },
])
const FALLBACK_LOOKUP: AlternativaDoPasso[] = [{ kind: 'fonte_publica', source: 'brasilapi_fotografia_cnpj' }]
const DEF_B2 = cascata('mudanca_de_porte_ou_regime', 'conta', 0.25, 100, [
  actor(1, 'receita_fotografia', 'johnatan029~cnpj-empresas-brasil-scraper', FALLBACK_LOOKUP, [0.00005, 0.0015], 100),
  { ordem: 2, handler: 'diff_porte_regime', ...REGRA },
])
const DEF_B3 = cascata('entrada_de_socio', 'conta', 0.25, 100, [
  actor(1, 'receita_fotografia', 'johnatan029~cnpj-empresas-brasil-scraper', FALLBACK_LOOKUP, [0.00005, 0.0015], 100, { inputTemplate: { socios: true } }),
  { ordem: 2, handler: 'diff_socios', ...REGRA },
])
const FALLBACK_B4 = alt('brasildados~cnpj-lead-scraper-search', 0.1, 0.01)
const DEF_B4 = (cap = 0.15) => cascata('setor_afetado_cbs_ibs', 'mercado', cap, 200, [
  actor(1, 'receita_por_cnae', 'epicscrapers~brazil-cnpj-scraper', [FALLBACK_B4], [0.00005, 0.0009], 100),
  { ordem: 2, handler: 'setor_afetado_cbs_ibs', ...REGRA },
])

function cenario(def: CascataDef, porActor: Record<string, ComportamentoDoRun>, opcoes: { contas?: ContaDoWorkspace[]; brasilapi?: (url: string) => Response; fotografias?: Record<string, { takenAt: string; data: Record<string, unknown> }[]> } = {}) {
  const fake = apifyFalso((_token, actorId) => porActor[actorId] ?? { itens: [], usageTotalUsd: 0 })
  const logs: unknown[] = []
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: (c) => logs.push(c) })
  const brasilapi: string[] = []
  const fetchPublico = ((entrada: string | URL | Request) => {
    brasilapi.push(String(entrada))
    return Promise.resolve(opcoes.brasilapi ? opcoes.brasilapi(String(entrada)) : new Response('{}', { status: 404 }))
  }) as typeof fetch
  const banco = dbFalso(def, { contas: opcoes.contas ?? [ALFA, BETA], fotografias: opcoes.fotografias })
  const rodar = (extra: Record<string, unknown> = {}) =>
    rodarCascata({ db: banco.db, fonte, registro: registroDePassos(fetchPublico), agora: () => AGORA, log: (c) => logs.push(c) }, {
      workspaceId: 'ws-1', userId: 'user-1', signalType: def.signalType, origem: 'conversa', chave: 'k1', ...extra,
    })
  const posts = () => fake.requisicoes.filter((q) => q.metodo === 'POST')
  return { fake, banco, rodar, logs, brasilapi, posts }
}

const FALHA: ComportamentoDoRun = { estados: ['FAILED'], mensagem: 'boom', usageTotalUsd: 0 }
const ALFA_CNPJ = '11222333000181'

// ---------------------------------------------------------------------------------------------------------------------
// B1: CNPJ novo.

const nova = (cnpj: string, razao: string, inicio: string, extra: Record<string, unknown> = {}) => ({
  recordType: 'NEW_COMPANY', cnpj, cnpjFormatado: cnpj, razaoSocial: razao, dataInicio: inicio, cnaePrincipal: '6920601', uf: 'SP', municipioCodigo: '7107',
  porte: '01', naturezaJuridica: '2062', capitalSocial: '100,00', matrizFilial: 'matriz', situacao: 'ATIVA',
  versaoDosDados: { snapshotMonth: '2026-10', referenceMonth: '2026-09' }, staleness: { indexMonth: '2026-09', expectedMonth: '2026-09', stale: false }, ...extra,
})
const RESUMO = { recordType: 'RUN_SUMMARY', recordsWritten: 3, report: { totalNovasNoMes: 1000 } }

Deno.test('B1: o CNPJ novo de uma Conta vira Sinal "CNPJ aberto em", com o aviso de base mensal; o resto só é contado, sem nome de pessoa', async () => {
  const c = cenario(DEF_B1, {
    'johnatan029~cnpj-new-companies': {
      itens: [
        nova(ALFA_CNPJ, 'ALFA CONTABIL LTDA', '2026-09-14'),
        nova('99888777000166', 'GAMA SERVICOS LTDA', '2026-09-20'),
        nova('12345678000195', 'JOSE DA SILVA 12345678901', '2026-09-02', { naturezaJuridica: '2135' }),
        RESUMO,
      ],
      usageTotalUsd: 0.0124,
    },
  })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos, r.semConta], ['concluida', 1, 2])
  assertEquals(r.sinais.length, 1)
  const s = r.sinais[0]
  assertEquals([s.contaId, s.phrase, s.firedAt, s.source], ['conta-alfa', 'CNPJ aberto em 14/09/2026', '2026-09-14T12:00:00.000Z', 'Receita Federal (base mensal de CNPJ)'])
  assert(s.eventKey.endsWith('|cnpj_novo|11222333000181'), s.eventKey)
  assert(s.evidence.includes('11.222.333/0001-81') && s.evidence.includes('6920-6/01') && s.evidence.includes('ME'), s.evidence)
  assert(/mensal/.test(s.evidence) && /30 dias/.test(s.evidence), 'a evidência avisa do atraso da base mensal')
  // O empresário individual não tem nome nem CPF na resposta ao usuário.
  assertEquals(r.semContaNomes, ['GAMA SERVICOS LTDA', 'Empresário individual'])
  const tudo = JSON.stringify(r)
  assert(!tudo.includes('JOSE DA SILVA') && !tudo.includes('12345678901'), 'nome e CPF do empresário individual nunca saem')
  assert(!MARCA_INTERNA.test(tudo))
  // Entrada do actor: só o limite, sem filtros que ninguém pediu; o resumo gratuito não vira empresa.
  assertEquals(c.posts()[0].corpo, { maxResults: 100 })
  assertEquals(r.custoUsd, 0.0124)
  assertEquals(c.banco.passos.map((p) => [p.ordem, p.fim?.estado]), [[1, 'succeeded'], [2, 'succeeded']])
})

Deno.test('B1: os filtros do pedido (UF, CNAE, porte, mês) vão para o actor no formato dele', async () => {
  const c = cenario(DEF_B1, { 'johnatan029~cnpj-new-companies': { itens: [RESUMO], usageTotalUsd: 0 } })
  const r = await c.rodar({ criterios: { uf: ['SP', 'MG'], cnae: ['69'], porte: ['ME', 'EPP'], mes: '2026-09' } })
  assertEquals(c.posts()[0].corpo, { ufs: ['SP', 'MG'], cnaes: ['69'], portes: ['01', '03'], mes: '2026-09', maxResults: 100 })
  assertEquals([r.desfecho, r.novos], ['concluida', 0])
})

Deno.test('B1: repetir a rodada não grava o Sinal de novo (a chave é a empresa e o CNPJ)', async () => {
  const c = cenario(DEF_B1, { 'johnatan029~cnpj-new-companies': { itens: [nova(ALFA_CNPJ, 'ALFA CONTABIL LTDA', '2026-09-14')], usageTotalUsd: 0.004 } })
  const a = await c.rodar({ chave: 'a' })
  const b = await c.rodar({ chave: 'b' })
  assertEquals([a.novos, a.repetidos, b.novos, b.repetidos], [1, 0, 0, 1])
})

Deno.test('B1: sem o actor principal, a base mensal alternativa assume e nenhum contato (telefone, e-mail) chega ao Sinal', async () => {
  const c = cenario(DEF_B1, {
    'johnatan029~cnpj-new-companies': FALHA,
    'brazilayer~brazilian-new-companies': {
      itens: [{ razao_social: 'ALFA CONTABIL LTDA', nome_fantasia: 'ALFA', cnpj: ALFA_CNPJ, municipio: 'SAO PAULO', uf: 'SP', telefone: '1140040015', email: 'contato@alfa.test', cnae: '6920601', porte: 'micro_empresa', capital_social: 1000, data_abertura: '2026-09-14' }],
      usageTotalUsd: 0.002,
    },
  })
  const r = await c.rodar({ criterios: { mes: '2026-09', uf: ['SP'], cnae: ['69'], porte: ['ME'] } })
  assertEquals([r.desfecho, r.novos], ['concluida', 1])
  assertEquals(r.sinais[0].phrase, 'CNPJ aberto em 14/09/2026')
  assertEquals(c.posts()[1].corpo, { aberturaDe: '2026-09-01', aberturaAte: '2026-09-30', uf: 'SP', cnae: '69', porte: 'micro_empresa', comContato: false, maxResultados: 100 })
  const tudo = JSON.stringify(r)
  assert(!tudo.includes('1140040015') && !tudo.includes('contato@alfa.test'))
  assertEquals(c.banco.passos.filter((p) => p.ordem === 1).map((p) => [p.tentativa, p.fim?.estado]), [[1, 'failed'], [2, 'succeeded']])
})

Deno.test('B1: sem filtros, a base alternativa pede desde o primeiro dia do mês anterior', async () => {
  const c = cenario(DEF_B1, { 'johnatan029~cnpj-new-companies': FALHA, 'brazilayer~brazilian-new-companies': { itens: [], usageTotalUsd: 0 } })
  await c.rodar()
  assertEquals(c.posts()[1].corpo, { aberturaDe: '2026-09-01', comContato: false, maxResultados: 100 })
})

Deno.test('B1: a última alternativa (base geral) só entrega matriz ativa aberta na janela, e nenhum dado de sócio passa', async () => {
  const geral = (extra: Record<string, unknown>) => ({
    cnpj: ALFA_CNPJ, razao_social: 'ALFA CONTABIL LTDA', data_abertura: '2026-09-14', cnae_principal_codigo: '6920601', uf: 'SP', porte: 'MICRO EMPRESA',
    natureza_juridica_codigo: '2062', situacao_cadastral: 'ATIVA', matriz_filial: 'MATRIZ', email: 'x@y.test', qsa: [{ nome_socio: 'FULANO DE TAL' }], ...extra,
  })
  const c = cenario(DEF_B1, {
    'johnatan029~cnpj-new-companies': FALHA,
    'brazilayer~brazilian-new-companies': FALHA,
    'epicscrapers~brazil-cnpj-scraper': {
      itens: [geral({}), geral({ cnpj: '99888777000166', data_abertura: '2015-01-01' }), geral({ cnpj: '99888777000167', matriz_filial: 'FILIAL' }), geral({ cnpj: '99888777000168', situacao_cadastral: 'BAIXADA' })],
      usageTotalUsd: 0.004,
    },
  })
  const r = await c.rodar({ criterios: { uf: ['SP'], cnae: ['6920601'], mes: '2026-09' } })
  assertEquals([r.desfecho, r.novos, r.semConta], ['concluida', 1, 0])
  assertEquals(c.posts()[2].corpo, { uf: 'SP', cnae: '6920601', maxItems: 100, pageSize: 100 })
  const tudo = JSON.stringify(r)
  assert(!tudo.includes('FULANO') && !tudo.includes('x@y.test'))
})

Deno.test('B1: sem Conta no Workspace a busca nem começa, e o pior caso cabe no teto', async () => {
  const c = cenario(DEF_B1, {}, { contas: [] })
  const r = await c.rodar()
  assertEquals(r.desfecho, 'sem_contas')
  assertEquals(c.posts().length, 0)
  assert(estimativaDaCascata(DEF_B1) <= DEF_B1.capUsd, 'estimativa abaixo do teto')
})

// ---------------------------------------------------------------------------------------------------------------------
// B2 e B3: fotografia mensal por CNPJ e diferença.

const SOCIOS = [
  { nome: 'FULANO DE TAL', documento: '***123456**', dataEntrada: '2020-01-01', qualificacao: '49' },
  { nome: 'BELTRANA DA SILVA', documento: '***654321**', dataEntrada: '2022-05-10', qualificacao: '22' },
]
const lookup = (extra: Record<string, unknown> = {}) => ({
  cnpj: ALFA_CNPJ, razaoSocial: 'ALFA CONTABIL LTDA', porte: 'DEMAIS', opcaoSimples: false, opcaoMei: false, socios: SOCIOS, ...extra,
})
const INICIO_DO_MES = '2026-10-01T00:00:00.000Z'
const foto = (data: Record<string, unknown>) => ({ [ALFA_CNPJ]: [{ takenAt: '2026-09-01T00:00:00.000Z', data }] })

Deno.test('B2: a primeira rodada só grava a base (sem Sinal) e consulta só as Contas com CNPJ', async () => {
  const c = cenario(DEF_B2, { 'johnatan029~cnpj-empresas-brasil-scraper': { itens: [lookup()], usageTotalUsd: 0.0016 } })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos, r.sinais.length], ['concluida', 0, 0])
  assertEquals(c.posts()[0].corpo, { mode: 'lookup', cnpjs: [ALFA_CNPJ] })
  assertEquals(c.banco.gravadas, [{ chave: ALFA_CNPJ, data: { porte: 'Demais', simples: false, mei: false, regime: null }, takenAt: INICIO_DO_MES }])
  assert(!JSON.stringify(c.banco.gravadas).includes('FULANO'), 'a fotografia de porte e regime nem lê sócio')
})

Deno.test('B2: o porte e o Simples que mudaram desde a fotografia do mês anterior viram um Sinal da Conta', async () => {
  const c = cenario(DEF_B2, { 'johnatan029~cnpj-empresas-brasil-scraper': { itens: [lookup()], usageTotalUsd: 0.0016 } }, {
    fotografias: foto({ porte: 'EPP', simples: true, mei: false, regime: null }),
  })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 1])
  const s = r.sinais[0]
  assertEquals([s.contaId, s.phrase], ['conta-alfa', 'Mudou de porte (de EPP para Demais) e saiu do Simples Nacional'])
  assertEquals(s.eventKey, 'porte_regime|11222333000181|2026-10')
  assertEquals(s.source, 'Receita Federal (fotografia mensal)')
  assert(s.evidence.includes('set/2026') && s.evidence.includes('out/2026') && /mensal/.test(s.evidence), s.evidence)
  // Grava a fotografia de agora, no início do mês: repetir a rodada no mês refaz a mesma comparação.
  assertEquals(c.banco.gravadas[0].takenAt, INICIO_DO_MES)
  assertEquals(c.banco.gravadas[0].data, { porte: 'Demais', simples: false, mei: false, regime: null })
})

Deno.test('B2: virar MEI e deixar o MEI, optar pelo Simples e mudar o regime também; campo que falta num dos lados não gera Sinal', async () => {
  const dados = (item: Record<string, unknown>, antes: Record<string, unknown>) =>
    cenario(DEF_B2, { 'johnatan029~cnpj-empresas-brasil-scraper': { itens: [lookup(item)], usageTotalUsd: 0.0016 } }, { fotografias: foto(antes) })
  const a = await dados({ porte: 'ME', opcaoSimples: true, opcaoMei: false }, { porte: 'ME', simples: true, mei: true, regime: null }).rodar()
  assertEquals(a.sinais[0].phrase, 'Deixou de ser MEI')
  const b = await dados({ porte: 'ME', opcaoSimples: true, opcaoMei: true }, { porte: 'ME', simples: false, mei: false, regime: null }).rodar()
  assertEquals(b.sinais[0].phrase, 'Optou pelo Simples Nacional e virou MEI')
  const sem = await dados({ porte: 'ME', opcaoSimples: null, opcaoMei: null }, { porte: 'ME', simples: true, mei: false, regime: null }).rodar()
  assertEquals(sem.sinais.length, 0, 'sem a informação agora, não há o que comparar')
  const igual = await dados({ porte: 'DEMAIS' }, { porte: 'Demais', simples: false, mei: false, regime: null }).rodar()
  assertEquals([igual.desfecho, igual.sinais.length], ['concluida', 0])
})

Deno.test('B2: sem o actor, a BrasilAPI dá a fotografia (porte, Simples, MEI e o regime do último ano) e nenhum nome de sócio é lido', async () => {
  const c = cenario(DEF_B2, { 'johnatan029~cnpj-empresas-brasil-scraper': FALHA }, {
    fotografias: foto({ porte: 'Demais', simples: false, mei: false, regime: 'Lucro presumido' }),
    brasilapi: () =>
      new Response(JSON.stringify({
        razao_social: 'ALFA CONTABIL LTDA', porte: 'DEMAIS', opcao_pelo_simples: false, opcao_pelo_mei: false,
        regime_tributario: [{ ano: 2024, forma_de_tributacao: 'LUCRO PRESUMIDO' }, { ano: 2025, forma_de_tributacao: 'LUCRO REAL' }],
        qsa: [{ nome_socio: 'BELTRANO DE TAL', cnpj_cpf_do_socio: '***111111**', data_entrada_sociedade: '2020-01-01' }],
      })),
  })
  const r = await c.rodar()
  assertEquals(r.sinais[0].phrase, 'Regime tributário mudou de Lucro presumido para Lucro real')
  assertEquals(c.brasilapi, ['https://brasilapi.com.br/api/cnpj/v1/11222333000181'])
  assert(!JSON.stringify([r, c.banco.gravadas]).includes('BELTRANO'))
  assertEquals(c.banco.passos.filter((p) => p.ordem === 1).map((p) => [p.tentativa, p.fim?.estado]), [[1, 'failed'], [2, 'succeeded']])
})

Deno.test('B2 e B3: sem Conta com CNPJ a consulta é pulada e não custa nada', async () => {
  for (const def of [DEF_B2, DEF_B3]) {
    const c = cenario(def, {}, { contas: [BETA] })
    const r = await c.rodar()
    assertEquals([r.desfecho, r.sinais.length], ['concluida', 0])
    assertEquals(c.banco.passos.find((p) => p.ordem === 1)?.fim?.estado, 'skipped')
    assertEquals(c.posts().length, 0)
  }
})

Deno.test('B2 e B3: o pior caso (100 CNPJs) cabe no teto da cascata', () => {
  for (const def of [DEF_B2, DEF_B3]) assert(estimativaDaCascata(def) <= def.capUsd, `${def.signalType}: ${estimativaDaCascata(def)}`)
})

Deno.test('B3: a primeira rodada grava só contagem e códigos curtos dos sócios, nunca nome nem CPF', async () => {
  const c = cenario(DEF_B3, { 'johnatan029~cnpj-empresas-brasil-scraper': { itens: [lookup()], usageTotalUsd: 0.0016 } })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.sinais.length], ['concluida', 0])
  assertEquals(c.banco.gravadas.length, 1)
  const { data, takenAt, chave } = c.banco.gravadas[0]
  assertEquals([chave, takenAt, data.socios], [ALFA_CNPJ, INICIO_DO_MES, 2])
  const ids = data.ids as string[]
  assertEquals(ids, [idDoSocio(ALFA_CNPJ, 'FULANO DE TAL'), idDoSocio(ALFA_CNPJ, 'BELTRANA DA SILVA')].sort())
  assert(ids.every((i) => /^[0-9a-f]{12}$/.test(i)))
  const tudo = JSON.stringify([c.banco.gravadas, r])
  assert(!/FULANO|BELTRANA|\*\*\*/.test(tudo), 'nada de nome nem documento mascarado')
})

Deno.test('B3: o sócio novo desde a fotografia anterior vira "Entrou sócio", sem nome na frase nem na evidência', async () => {
  const antes = { socios: 1, ids: [idDoSocio(ALFA_CNPJ, 'FULANO DE TAL')] }
  const c = cenario(DEF_B3, { 'johnatan029~cnpj-empresas-brasil-scraper': { itens: [lookup()], usageTotalUsd: 0.0016 } }, { fotografias: foto(antes) })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 1])
  const s = r.sinais[0]
  assertEquals([s.contaId, s.phrase, s.eventKey], ['conta-alfa', 'Entrou sócio no quadro societário', 'entrada_socio|11222333000181|2026-10'])
  assert(s.evidence.includes('de 1 para 2 sócios') && s.evidence.includes('set/2026') && /mensal/.test(s.evidence), s.evidence)
  assert(!/FULANO|BELTRANA|\*\*\*/.test(JSON.stringify([r, c.banco.gravadas])))
  // A mesma rodada de novo (outra chave) compara com a mesma base e não duplica.
  const de_novo = await c.rodar({ chave: 'k2' })
  assertEquals([de_novo.novos, de_novo.repetidos], [0, 1])
})

Deno.test('B3: dois sócios novos, e troca de sócio com a mesma contagem, contam como entrada; saída de sócio não', async () => {
  const dois = cenario(DEF_B3, { 'johnatan029~cnpj-empresas-brasil-scraper': { itens: [lookup()], usageTotalUsd: 0.0016 } }, { fotografias: foto({ socios: 0, ids: [] }) })
  assertEquals((await dois.rodar()).sinais[0].phrase, 'Entraram 2 sócios no quadro societário')
  const troca = cenario(DEF_B3, { 'johnatan029~cnpj-empresas-brasil-scraper': { itens: [lookup()], usageTotalUsd: 0.0016 } }, {
    fotografias: foto({ socios: 2, ids: [idDoSocio(ALFA_CNPJ, 'FULANO DE TAL'), idDoSocio(ALFA_CNPJ, 'OUTRO SOCIO')].sort() }),
  })
  const t = await troca.rodar()
  assertEquals(t.sinais[0].phrase, 'Entrou sócio no quadro societário')
  assert(t.sinais[0].evidence.includes('de 2 para 2 sócios'), t.sinais[0].evidence)
  const saiu = cenario(DEF_B3, { 'johnatan029~cnpj-empresas-brasil-scraper': { itens: [lookup({ socios: [SOCIOS[0]] })], usageTotalUsd: 0.0016 } }, {
    fotografias: foto({ socios: 2, ids: [idDoSocio(ALFA_CNPJ, 'FULANO DE TAL'), idDoSocio(ALFA_CNPJ, 'BELTRANA DA SILVA')].sort() }),
  })
  assertEquals((await saiu.rodar()).sinais.length, 0)
})

Deno.test('B3: a fonte sem quadro societário não gera Sinal nem apaga a base anterior', async () => {
  const c = cenario(DEF_B3, { 'johnatan029~cnpj-empresas-brasil-scraper': { itens: [lookup({ socios: null })], usageTotalUsd: 0.0016 } }, { fotografias: foto({ socios: 1, ids: ['aaaaaaaaaaaa'] }) })
  const r = await c.rodar()
  assertEquals([r.sinais.length, c.banco.gravadas.length], [0, 0])
})

Deno.test('B3: a BrasilAPI como alternativa entrega o mesmo código de sócio que o actor (a troca de fonte não inventa entrada)', async () => {
  const c = cenario(DEF_B3, { 'johnatan029~cnpj-empresas-brasil-scraper': FALHA }, {
    fotografias: foto({ socios: 2, ids: [idDoSocio(ALFA_CNPJ, 'FULANO DE TAL'), idDoSocio(ALFA_CNPJ, 'BELTRANA DA SILVA')].sort() }),
    brasilapi: () =>
      new Response(JSON.stringify({
        porte: 'DEMAIS',
        qsa: [{ nome_socio: 'Fulano de Tal', cnpj_cpf_do_socio: '***123456**', data_entrada_sociedade: '2020-01-01' }, { nome_socio: 'BELTRANA DA SILVA', cnpj_cpf_do_socio: '***654321**', data_entrada_sociedade: '2022-05-10' }],
      })),
  })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.sinais.length], ['concluida', 0])
  assertEquals(c.banco.gravadas[0].data.ids, [idDoSocio(ALFA_CNPJ, 'FULANO DE TAL'), idDoSocio(ALFA_CNPJ, 'BELTRANA DA SILVA')].sort())
  assert(!/FULANO|Fulano|BELTRANA|\*\*\*/.test(JSON.stringify([r, c.banco.gravadas])))
})

// ---------------------------------------------------------------------------------------------------------------------
// B4: setor mais afetado pela CBS/IBS (mercado).

const emp = (extra: Record<string, unknown> = {}) => ({
  cnpj: '99888777000166', razao_social: 'EMPRESA TESTE LTDA', situacao_cadastral: 'ATIVA', matriz_filial: 'MATRIZ', simples_nacional: false, mei: false,
  cnae_principal_codigo: '6920601', uf: 'SP', email: 'x@y.test', qsa: [{ nome_socio: 'FULANO DE TAL' }], ...extra,
})

Deno.test('B4: a amostra do CNAE vira um Sinal de mercado com o tamanho e quantas ficam fora do Simples e do MEI, sem dado de empresa nem de sócio', async () => {
  const c = cenario(DEF_B4(), {
    'epicscrapers~brazil-cnpj-scraper': {
      itens: [emp(), emp(), emp({ simples_nacional: true }), emp({ mei: true }), emp({ situacao_cadastral: 'BAIXADA' }), emp({ matriz_filial: 'FILIAL' })],
      usageTotalUsd: 0.0059,
    },
  }, { contas: [] })
  const r = await c.rodar({ criterios: { cnae: ['6920-6/01'], uf: ['SP'] } })
  assertEquals([r.desfecho, r.novos, r.sinais.length, r.mercado.length], ['concluida', 1, 0, 1])
  assertEquals(c.posts()[0].corpo, { uf: 'SP', cnae: '6920601', maxItems: 100, pageSize: 100 })
  const m = r.mercado[0]
  assertEquals(m.eventKey, 'setor_cbs_ibs|6920601|SP|2026-10')
  assertEquals(m.phrase, 'Setor de alto impacto da CBS/IBS: Atividades de contabilidade (CNAE 6920-6/01) em SP, 4 empresas ativas na amostra (2 fora do Simples e do MEI)')
  assertEquals(m.firedAt, '2026-10-13T12:00:00.000Z')
  assertEquals(m.payload, { cnae: '6920601', descricao: 'Atividades de contabilidade', impacto: 'alto', uf: 'SP', amostra: 4, limite: 100, atingiuLimite: false, foraDoSimplesMei: 2, criterio: 'interno-revisavel' })
  assert(/critério interno/i.test(m.evidence) && /Hipótese de trabalho/.test(m.evidence) && /mensal/.test(m.evidence), m.evidence)
  const tudo = JSON.stringify(r)
  assert(!tudo.includes('FULANO') && !tudo.includes('x@y.test') && !tudo.includes('99888777000166'))
  assert(!MARCA_INTERNA.test(tudo))
  assertEquals(c.banco.mercado.length, 1)
  assertEquals(c.banco.sinais.length, 0)
})

Deno.test('B4: amostra cheia diz "ao menos"; sem pedido, o setor do mês é o da tabela; CNAE fora da tabela é ignorado; sem UF, o Brasil', async () => {
  const cheia = Array.from({ length: 100 }, () => emp())
  const c = cenario(DEF_B4(), { 'epicscrapers~brazil-cnpj-scraper': { itens: cheia, usageTotalUsd: 0.09 } }, { contas: [] })
  const r = await c.rodar({ criterios: { cnae: ['0000000'] } })
  const esperado = setorDoMes(2026, 10)
  assertEquals(c.posts()[0].corpo, { uf: '', cnae: esperado.cnae, maxItems: 100, pageSize: 100 })
  assert(r.mercado[0].phrase.includes('no Brasil, ao menos 100 empresas ativas na amostra'), r.mercado[0].phrase)
  assertEquals(r.mercado[0].eventKey, `setor_cbs_ibs|${esperado.cnae}|BR|2026-10`)
  assertEquals(r.mercado[0].payload.atingiuLimite, true)
})

Deno.test('B4: CNAE sem empresa ativa na amostra não gera Sinal', async () => {
  const c = cenario(DEF_B4(), { 'epicscrapers~brazil-cnpj-scraper': { itens: [emp({ situacao_cadastral: 'BAIXADA' })], usageTotalUsd: 0.001 } }, { contas: [] })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.mercado.length], ['concluida', 0])
})

Deno.test('B4: a alternativa mais cara não cabe no teto padrão (o motor a barra); com teto maior ela roda e a amostra sai sem o dado do Simples', async () => {
  const bruto = (extra: Record<string, unknown> = {}) => ({
    cnpj: '99888777000166', razaoSocial: 'EMPRESA TESTE LTDA', matriz: true, situacaoCadastral: '02', porte: '05', uf: 'SP', cnaePrincipal: { codigo: '6920-6/01', descricao: 'Atividades de contabilidade' },
    email: 'x@y.test', socios: [{ nome: 'FULANO DE TAL', documento: '***1**' }], ...extra,
  })
  const preso = cenario(DEF_B4(0.15), { 'epicscrapers~brazil-cnpj-scraper': FALHA, 'brasildados~cnpj-lead-scraper-search': { itens: [bruto()], usageTotalUsd: 0.11 } }, { contas: [] })
  const a = await preso.rodar({ criterios: { cnae: ['6920601'], uf: ['SP'] } })
  assertEquals(a.desfecho, 'abortada')
  assertEquals(preso.banco.passos.map((p) => p.fim?.estado), ['failed', 'aborted_cap'])

  const livre = cenario(DEF_B4(2), { 'epicscrapers~brazil-cnpj-scraper': FALHA, 'brasildados~cnpj-lead-scraper-search': { itens: [bruto(), bruto({ situacaoCadastral: '08' })], usageTotalUsd: 0.12 } }, { contas: [] })
  const b = await livre.rodar({ criterios: { cnae: ['6920601'], uf: ['SP'] } })
  assertEquals(livre.posts()[1].corpo, { cnaes: ['6920601'], uf: ['SP'], situacaoCadastral: '02', maxResults: 100 })
  assertEquals(b.mercado[0].phrase, 'Setor de alto impacto da CBS/IBS: Atividades de contabilidade (CNAE 6920-6/01) em SP, 1 empresa ativa na amostra')
  assertEquals(b.mercado[0].payload.foraDoSimplesMei, null)
  assert(!JSON.stringify(b).includes('FULANO') && !JSON.stringify(b).includes('x@y.test'))
})

Deno.test('B4: o pior caso de cada cascata de Conta ou de mercado cabe no teto com a alternativa barata', () => {
  assert(estimativaDaCascata(DEF_B4()) <= 0.15)
  assertEquals(estimativaDaCascata(DEF_B4()), 0.09005)
})

Deno.test('o registro do ICP B traz os handlers e a fonte pública que as cascatas usam', () => {
  const r = passosDoIcp_b(fetch)
  assertEquals(Object.keys(r.passos).sort(), ['cnpj_novos_da_receita', 'diff_porte_regime', 'diff_socios', 'receita_fotografia', 'receita_por_cnae', 'setor_afetado_cbs_ibs'])
  assertEquals(Object.keys(r.fontes), ['brasilapi_fotografia_cnpj'])
})
