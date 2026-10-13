// ICP E (indústria: fornecedores B2B), fora a vaga (icp-e-vagas.test.ts): financiamento BNDES/Finep (dados abertos),
// expansão de planta (notícias), licença de instalação (Diário Oficial da União, mercado) e os dois Sinais sem fonte.
// Nada usa a rede: o CKAN do BNDES, a planilha da Finep e o Apify são falsos; os formatos de resposta são os conferidos
// em 13/10/2026 (BNDES e Finep, contra os servidores) e os esquemas publicados dos actors (notícias e DOU).
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { apifyFalso, type ComportamentoDoRun } from '../falso-apify.ts'
import { dbFalso } from '../db-falso.ts'
import { clienteAssincronoDoApify } from '../fonte-apify.ts'
import { rodarCascata } from '../motor.ts'
import type { CascataDef, ContaDoWorkspace, Llm, PassoDef } from '../tipos.ts'
import { MARCA_INTERNA } from '../../marca.ts'
import { registroDePassos } from './index.ts'
import { passosDoIcp_e } from './icp-e.ts'
import { empresaPorRegra } from './icp-e-noticias.ts'
import { serialDoExcel, xlsxFalso } from './icp-e-xlsx-falso.ts'

const AGORA = Date.parse('2026-10-13T12:00:00Z')
const dias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()
const TOKEN = 'apify_api_SEGREDO_DO_TESTE_0123456789'

const passo = (p: Partial<PassoDef> & Pick<PassoDef, 'ordem' | 'kind' | 'handler'>): PassoDef => ({
  actorId: null, fallbacks: [], inputTemplate: {}, priceModel: p.kind === 'actor' ? 'PAY_PER_EVENT' : p.kind === 'fonte_publica' ? 'FREE' : 'NONE',
  estFixedUsd: 0, estPerItemUsd: 0, estItems: 0, maxItems: null, ...p,
})

const cascata = (signalType: string, steps: PassoDef[], extra: Partial<CascataDef> = {}): CascataDef => ({
  id: `c-${signalType}`, signalType, icp: 'E', name: signalType, version: 1, state: 'available', semFonteMotivo: null, scope: 'conta',
  multiplier: 3, capUsd: 0.5, capCredits: null, cadenceHours: 168, maxAccounts: 200, steps, ...extra,
})

// As cascatas como a migração 20261013190000 as semeia (o pgTAP confere a semente; aqui os passos de código as executam).
const CNPJ_DA_CONTA = passo({
  ordem: 0, kind: 'actor', handler: 'cnpj_da_conta', actorId: 'johnatan029~cnpj-empresas-brasil-scraper',
  fallbacks: [{ kind: 'fonte_publica', source: 'brasilapi_cnpj' }], estFixedUsd: 0.00005, estPerItemUsd: 0.0015, estItems: 10, maxItems: 20,
})
const DEF_FINANCIAMENTO = () =>
  cascata('financiamento_bndes_finep', [
    passo({
      ordem: 1, kind: 'fonte_publica', handler: 'financiamentos_publicos', maxItems: 5, inputTemplate: { janelaDias: 90 },
      fallbacks: [{ kind: 'actor', actorId: 'nexgenwatch~brazil-bndes-financing-operations', priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.02, estPerItemUsd: 0.05 }],
    }),
    passo({ ordem: 2, kind: 'regra', handler: 'casar_fatos_com_contas' }),
  ], { capUsd: 0.3 })
const DEF_EXPANSAO = () =>
  cascata('expansao_de_planta', [
    passo({
      ordem: 1, kind: 'actor', handler: 'noticias_expansao_planta', actorId: 'data_xplorer~google-news-scraper-fast', estPerItemUsd: 0.004, estItems: 100, maxItems: 100,
      inputTemplate: { termos: ['expansão de fábrica', 'nova planta industrial', 'ampliação da fábrica', 'inaugura nova fábrica'], janelaDias: 7, regiao: 'BR:pt-419' },
    }),
    passo({ ordem: 2, kind: 'regra', handler: 'empresa_da_noticia_expansao', estFixedUsd: 0.002, inputTemplate: { janelaDias: 7 } }),
    passo({ ordem: 3, kind: 'regra', handler: 'casar_fatos_com_contas' }),
    { ...CNPJ_DA_CONTA, ordem: 4 },
  ])
const DEF_LICENCA_DOU = () =>
  cascata('licenca_instalacao_dou', [
    passo({
      ordem: 1, kind: 'actor', handler: 'licencas_dou', actorId: 'jenko_systems~diario-oficial-uniao-dou', estFixedUsd: 0.2, estPerItemUsd: 0.0001, estItems: 50, maxItems: 50,
      inputTemplate: { termo: '"licença de instalação"', secao: 'todos', janelaDias: 14 },
    }),
    passo({ ordem: 2, kind: 'regra', handler: 'licencas_de_instalacao_dou', inputTemplate: { janelaDias: 14 } }),
  ], { scope: 'mercado', capUsd: 0.3 })

const INTELBRAS: ContaDoWorkspace = { id: 'conta-intelbras', name: 'Intelbras S.A. Indústria de Telecomunicação Eletrônica', domain: 'intelbras.test', linkedinUrl: null, cnpj: '82.901.000/0001-27' }
const KATA: ContaDoWorkspace = { id: 'conta-kata', name: 'Kata Machines & Systems LTDA', domain: null, linkedinUrl: null, cnpj: null }
const WEG: ContaDoWorkspace = { id: 'conta-weg', name: 'WEG S.A.', domain: 'weg.test', linkedinUrl: null, cnpj: '84.429.695/0001-11' }
const RANDON: ContaDoWorkspace = { id: 'conta-randon', name: 'Randon Ltda', domain: null, linkedinUrl: null, cnpj: null }

const nunca: typeof fetch = () => Promise.reject(new Error('não devia usar a rede'))
const semApify = clienteAssincronoDoApify({ tokens: [TOKEN], fetchFn: nunca, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: () => {} })
const marcaLimpa = (x: unknown) => assert(!MARCA_INTERNA.test(JSON.stringify(x)), 'nada que o usuário lê cita fornecedor')

// ---------------------------------------------------------------------------------------------------------------------
// Financiamento BNDES e Finep.

const RECURSO_NAO_AUTOMATICAS = '6f56b78c-510f-44b6-8274-78a5b7e931f4'
const bndes = (extra: Record<string, unknown>) => ({
  cliente: 'EMPRESA TESTE LTDA', cnpj: '11.222.333/0001-81', descricao_do_projeto: 'IMPLANTACAO DE LINHA DE PRODUCAO                    ', uf: 'SP', municipio: 'SAO PAULO',
  numero_do_contrato: 1, data_da_contratacao: '2026-08-31T00:00:00', valor_contratado_reais: 1_000_000, produto: 'BNDES FINEM', instrumento_financeiro: 'PROGRAMA X',
  setor_bndes: 'INDUSTRIA', porte_do_cliente: 'GRANDE', situacao_do_contrato: 'ATIVO', ...extra,
})
const REGISTROS_BNDES = [
  bndes({ cliente: 'INTELBRAS S.A. INDUSTRIA DE TELECOMUNICACAO ELETRONICA', cnpj: '82.901.000/0001-27', numero_do_contrato: 24902131, valor_contratado_reais: 1_734_624.88, produto: 'BNDES MÁQUINAS E SERVIÇOS', instrumento_financeiro: 'PROGRAMA BNDES FUST', municipio: 'SEM MUNICÍPIO', uf: 'SC' }),
  bndes({ cliente: 'CONECT COPPER LAMINACAO LTDA', cnpj: '58.953.104/0001-09', numero_do_contrato: 26800161, valor_contratado_reais: 10_704_733, produto: 'BNDES MÁQUINAS E SERVIÇOS' }),
  ...[1, 2, 3, 4, 5].map((i) => bndes({ cliente: 'ROMI S.A.', cnpj: '56.720.428/0001-63', numero_do_contrato: 9000 + i, valor_contratado_reais: i * 1_000_000, data_da_contratacao: '2026-08-28T00:00:00' })),
  bndes({ cliente: 'PRODUTOR RURAL FULANO', cnpj: '***.123.456-**', numero_do_contrato: 77 }),
  bndes({ cliente: 'OUTRO PRODUTOR', cnpj: '123.456.789-09', numero_do_contrato: 78 }),
  bndes({ cliente: 'EMPRESA ZERADA LTDA', cnpj: '33.444.555/0001-66', numero_do_contrato: 79, valor_contratado_reais: 0 }),
  bndes({ cliente: 'EMPRESA ANTIGA LTDA', cnpj: '44.555.666/0001-77', numero_do_contrato: 80, data_da_contratacao: '2026-05-10T00:00:00' }),
  bndes({ cliente: 'MAIS ANTIGA LTDA', cnpj: '55.666.777/0001-88', numero_do_contrato: 81, data_da_contratacao: '2025-11-01T00:00:00' }),
]

/** O CKAN falso do BNDES e a planilha falsa da Finep; guarda cada endereço pedido. */
function publicos(opcoes: { bndes?: unknown[] | 'cai'; finep?: Uint8Array | 'cai' } = {}) {
  const pedidos: string[] = []
  const fetchFn = ((entrada: string | URL | Request) => {
    const url = new URL(String(entrada))
    pedidos.push(String(entrada))
    if (url.hostname === 'dadosabertos.bndes.gov.br') {
      if (opcoes.bndes === 'cai') return Promise.resolve(new Response('erro', { status: 500 }))
      if (url.pathname.endsWith('/package_show')) {
        return Promise.resolve(new Response(JSON.stringify({
          success: true,
          result: { resources: [
            { id: '612faa0b-b6be-4b2c-9317-da5dc2c0b901', name: 'Operações indiretas automáticas', format: 'CSV', datastore_active: true },
            { id: RECURSO_NAO_AUTOMATICAS, name: 'Operações não automáticas', format: 'CSV', datastore_active: true },
            { id: 'pdf', name: 'Dicionário de dados de operações não automáticas', format: 'PDF', datastore_active: false },
          ] },
        })))
      }
      if (url.pathname.endsWith('/datastore_search')) {
        const base = opcoes.bndes ?? REGISTROS_BNDES
        const limite = Number(url.searchParams.get('limit'))
        const inicio = Number(url.searchParams.get('offset') ?? 0)
        return Promise.resolve(new Response(JSON.stringify({ success: true, result: { records: (base as unknown[]).slice(inicio, inicio + limite), total: (base as unknown[]).length } })))
      }
    }
    if (url.hostname === 'download.finep.gov.br') {
      if (opcoes.finep === 'cai' || !opcoes.finep) return Promise.resolve(new Response('erro', { status: 503 }))
      return Promise.resolve(new Response(opcoes.finep as BodyInit, { status: 200, headers: { 'content-length': String(opcoes.finep.length) } }))
    }
    return Promise.reject(new Error(`endereço inesperado ${entrada}`))
  }) as typeof fetch
  return { fetchFn, pedidos }
}

const finepFalsa = () =>
  xlsxFalso([
    { nome: 'Guia_de_Leitura', cabecalho: ['Guia'], linhas: [['x']] },
    {
      nome: 'Projetos_Crédito_Direto', antes: ['Área de Planejamento - APLA', 'Projetos Crédito Direto', 'Posição: 02/10/2026'],
      cabecalho: ['Demanda', 'Contrato', 'Data Assinatura', 'Título', 'Proponente', 'CNPJ Proponente', 'Município Proponente', 'UF Proponente', 'Valor Finep', 'Status'],
      linhas: [
        ['Demanda Espontânea', '14.26.0001.00', serialDoExcel('2026-09-29'), 'Nova linha de beneficiamento', 'Construtora Marquise S.A.', '07.950.702/0001-85', 'FORTALEZA', 'CE', 76419000, 'Aguardando Registro'],
        ['Demanda Espontânea', '14.26.0002.00', serialDoExcel('2026-09-20'), 'Cancelado', 'Empresa Cancelada Ltda', '12.345.678/0001-95', 'SÃO PAULO', 'SP', 1000000, 'Cancelado'],
        ['Demanda Espontânea', '14.25.0003.00', serialDoExcel('2025-01-10'), 'Antigo', 'Empresa Antiga Ltda', '23.456.789/0001-06', 'SÃO PAULO', 'SP', 5000000, 'ENCERRADO'],
      ],
    },
    {
      nome: 'Projetos_Subvenção_Direta', antes: ['Projetos Subvenção Direta', 'Posição: 02/10/2026'],
      cabecalho: ['Instrumento', 'Contrato', 'Data Assinatura', 'Título', 'Proponente', 'CNPJ Proponente', 'Município Proponente', 'UF Proponente', 'Valor Finep', 'Status'],
      linhas: [
        ['Não Reembolsável a Empresas', '13.26.0099.00', serialDoExcel('2026-09-29'), 'Centro de usinagem 4.0', 'Kata Machines & Systems LTDA', '59.253.663/0001-60', 'SÃO PAULO', 'SP', 5022454.2, 'EM EXECUÇÃO'],
        ['Não Reembolsável a Empresas', '13.26.0100.00', serialDoExcel('2026-09-22'), 'Sem CNPJ', 'Pessoa sem CNPJ', '', 'SÃO PAULO', 'SP', 100000, 'EM EXECUÇÃO'],
      ],
    },
  ])

const rodarFinanciamento = (fetchFn: typeof fetch, contas: ContaDoWorkspace[], chave = 'k1', criterios: Record<string, unknown> = {}, banco = dbFalso(DEF_FINANCIAMENTO(), { contas })) =>
  rodarCascata({ db: banco.db, fonte: semApify, registro: registroDePassos(fetchFn), agora: () => AGORA, log: () => {} }, {
    workspaceId: 'ws-1', userId: 'u1', signalType: 'financiamento_bndes_finep', origem: 'conversa', chave, criterios,
  }).then((r) => ({ r, banco }))

Deno.test('financiamento: o BNDES e a Finep viram um Sinal por contrato da Conta, casando pelo CNPJ ou pelo nome', async () => {
  const p = publicos({ finep: await finepFalsa() })
  const { r, banco } = await rodarFinanciamento(p.fetchFn, [INTELBRAS, KATA])
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.custoUsd, 0)
  assertEquals(r.sinais.map((s) => [s.contaId, s.phrase]).sort(), [
    ['conta-intelbras', 'Financiamento BNDES contratado: R$ 1,7 mi (BNDES Máquinas e Serviços) em 31/08/2026'],
    ['conta-kata', 'Subvenção da Finep contratada: R$ 5 mi em 29/09/2026'],
  ])
  const intelbras = r.sinais.find((s) => s.contaId === 'conta-intelbras')!
  assert(intelbras.eventKey.endsWith('|bndes|24902131'), intelbras.eventKey)
  assertEquals([intelbras.firedAt, intelbras.source], ['2026-08-31T12:00:00.000Z', 'BNDES (dados abertos)'])
  assert(intelbras.evidence.includes('nº 24902131') && intelbras.evidence.includes('R$ 1.734.625') && intelbras.evidence.includes('IMPLANTACAO DE LINHA DE PRODUCAO'), intelbras.evidence)
  assert(!intelbras.evidence.includes('INTELBRAS'), 'a evidência não repete o nome do cliente')
  const kata = r.sinais.find((s) => s.contaId === 'conta-kata')!
  assert(kata.eventKey.endsWith('|finep|13.26.0099.00'), kata.eventKey)
  assertEquals([kata.firedAt, kata.source], ['2026-09-29T12:00:00.000Z', 'Finep (dados abertos)'])
  assert(kata.evidence.includes('Centro de usinagem 4.0') && kata.evidence.includes('SP'), kata.evidence)
  // Quem não é Conta só é contado: Conect, ROMI e Marquise (sem o cancelado, o antigo, o CPF e o valor zero).
  assertEquals(r.semConta, 3)
  assertEquals(banco.passos.map((x) => [x.ordem, x.handler, x.fim?.estado]), [[1, 'financiamentos_publicos', 'succeeded'], [2, 'casar_fatos_com_contas', 'succeeded']])
  marcaLimpa(r)
})

Deno.test('financiamento: o recurso do BNDES é achado pelo nome, a lista vem do mais novo para o mais antigo e para na janela', async () => {
  const p = publicos({ bndes: REGISTROS_BNDES })
  const { r } = await rodarFinanciamento(p.fetchFn, [INTELBRAS], 'k1', {}, dbFalso(DEF_FINANCIAMENTO(), { contas: [INTELBRAS] }))
  assertEquals(r.novos, 1)
  const buscas = p.pedidos.filter((u) => u.includes('datastore_search'))
  const q = new URL(buscas[0]).searchParams
  assertEquals([q.get('resource_id'), q.get('sort'), q.get('limit')], [RECURSO_NAO_AUTOMATICAS, 'data_da_contratacao desc', '500'])
  assert(p.pedidos[0].includes('package_show?id=operacoes-financiamento'))
  // Uma página só: o registro de maio (fora dos 90 dias) mostra que acabou a janela.
  assertEquals(buscas.length, 1)
  assert(!buscas.some((u) => u.includes('filters')), 'sem filtro por CNPJ na consulta (o portal bloqueia)')
})

Deno.test('financiamento: com páginas pequenas, pede a seguinte enquanto a janela não acabou', async () => {
  const p = publicos({ bndes: REGISTROS_BNDES })
  const { r } = await rodarFinanciamento(p.fetchFn, [INTELBRAS], 'k1', {}, dbFalso(
    cascata('financiamento_bndes_finep', [
      passo({ ordem: 1, kind: 'fonte_publica', handler: 'financiamentos_publicos', inputTemplate: { janelaDias: 90, porPagina: 4 } }),
      passo({ ordem: 2, kind: 'regra', handler: 'casar_fatos_com_contas' }),
    ]),
    { contas: [INTELBRAS] },
  ))
  assertEquals(r.novos, 1)
  const buscas = p.pedidos.filter((u) => u.includes('datastore_search')).map((u) => new URL(u).searchParams.get('offset'))
  assertEquals(buscas, ['0', '4', '8'], 'páginas de 4: a 3ª (offset 8) traz o registro de maio e encerra')
})

Deno.test('financiamento: no máximo 3 contratos por empresa (os maiores) e CPF ou CNPJ inválido é descartado', async () => {
  const { r } = await rodarFinanciamento(publicos().fetchFn, [{ id: 'conta-romi', name: 'ROMI S.A.', domain: null, linkedinUrl: null, cnpj: '56.720.428/0001-63' }])
  assertEquals(r.sinais.map((s) => s.eventKey.split('|').slice(-1)[0]).sort(), ['9003', '9004', '9005'])
  const tudo = JSON.stringify(r)
  assert(!tudo.includes('FULANO') && !tudo.includes('123.456.789') && !tudo.includes('***'), 'nada de pessoa física')
})

Deno.test('financiamento: a mesma rodada de novo (outra chave) não grava de novo', async () => {
  const p = publicos({ finep: await finepFalsa() })
  const banco = dbFalso(DEF_FINANCIAMENTO(), { contas: [INTELBRAS, KATA] })
  const a = await rodarFinanciamento(p.fetchFn, [INTELBRAS, KATA], 'a', {}, banco)
  const b = await rodarFinanciamento(p.fetchFn, [INTELBRAS, KATA], 'b', {}, banco)
  assertEquals([a.r.novos, a.r.repetidos, b.r.novos, b.r.repetidos], [2, 0, 0, 2])
})

Deno.test('financiamento: se o BNDES cai, a Finep segue; se as duas caem, a execução falha com mensagem neutra e sem custo', async () => {
  const soFinep = await rodarFinanciamento(publicos({ bndes: 'cai', finep: await finepFalsa() }).fetchFn, [INTELBRAS, KATA])
  assertEquals([soFinep.r.desfecho, soFinep.r.sinais.map((s) => s.contaId)], ['concluida', ['conta-kata']])
  const nenhuma = await rodarFinanciamento(publicos({ bndes: 'cai', finep: 'cai' }).fetchFn, [INTELBRAS, KATA])
  assertEquals([nenhuma.r.desfecho, nenhuma.r.mensagem], ['falhou', 'A fonte pública está indisponível agora.'])
  assertEquals(nenhuma.banco.sinais.length, 0)
  assertEquals(nenhuma.banco.fechamentos[0].custoUsd, 0)
  marcaLimpa(nenhuma.r)
})

Deno.test('financiamento: a janela do pedido (período) vale mais que a do modelo', async () => {
  const { r } = await rodarFinanciamento(publicos({ finep: await finepFalsa() }).fetchFn, [INTELBRAS, KATA], 'k1', { periodo: 'Últimos 30 dias' })
  assertEquals(r.sinais.map((s) => s.contaId), ['conta-kata'], 'o contrato do BNDES de 31/08 fica fora dos 30 dias')
})

Deno.test('financiamento: o actor alternativo (registrado, ainda não executado pelo motor) monta a entrada e lê a saída do esquema publicado', () => {
  const impl = passosDoIcp_e(nunca).passos.financiamentos_publicos
  const ctx = { agora: AGORA, criterios: {}, def: passo({ ordem: 1, kind: 'fonte_publica', handler: 'financiamentos_publicos', maxItems: 5, inputTemplate: { janelaDias: 60 } }), contas: [], memoria: new Map() } as never
  const montada = impl.montarEntrada!([], ctx, 'nexgenwatch~brazil-bndes-financing-operations')
  assertEquals(montada, { input: { fileKey: 'nao-automaticas', maxRecords: 5, fieldMatch: { contract_date: ['2026-10', '2026-09', '2026-08'] } }, maxItems: 5 })
  const saida = impl.normalizar!([
    { record_type: 'bndes_financing_operation', contract_number: '1247021', cnpj: '56.024.581/0001-56', client: 'MUNICIPIO X', project: 'PROGRAMA Y', uf: 'SP', municipality: 'RIBEIRAO PRETO', contract_date: '2026-09-02', value_contracted_brl: '9090000,0', product: 'BNDES FINEM' },
    { cnpj: '***.1-**', client: 'SEM CNPJ', contract_date: '2026-09-02', value_contracted_brl: '10,0', contract_number: '2' },
  ], [], ctx, 'nexgenwatch~brazil-bndes-financing-operations') as { empresa: { cnpj: string }; fatos: { chave: string; frase: string }[] }[]
  assertEquals(saida.length, 1)
  assertEquals(saida[0].empresa.cnpj, '56024581000156')
  assertEquals([saida[0].fatos[0].chave, saida[0].fatos[0].frase], ['bndes|1247021', 'Financiamento BNDES contratado: R$ 9,1 mi (BNDES Finem) em 02/09/2026'])
})

// ---------------------------------------------------------------------------------------------------------------------
// Expansão de planta.

const noticia = (title: string, source: string, publishedAt: string, extra: Record<string, unknown> = {}) => ({
  title: `${title} - ${source}`, source, url: `https://${source.toLowerCase().replace(/\W/g, '')}.test/${encodeURIComponent(title).slice(0, 20)}`, publishedAt, publishedTimestamp: Date.parse(publishedAt),
  description: '', metadata: { keyword: 'expansão de fábrica', sourceType: 'keyword', timeframe: '7d' }, ...extra,
})
const NOTICIAS = [
  noticia('WEG anuncia investimento de R$ 1 bilhão em expansão de fábrica em Jaraguá do Sul', 'Valor Econômico', dias(2)),
  noticia('WEG inaugura nova planta de motores', 'Folha', dias(3)),
  noticia('Expansão da fábrica da Randon em Caxias do Sul deve gerar 300 empregos', 'Pioneiro', dias(1)),
  noticia('Governo anuncia pacote para indústria e amplia crédito', 'G1', dias(1)),
  noticia('Maria Souza abre padaria no centro', 'Jornal Local', dias(1)),
  noticia('Alfa Metais anuncia expansão de fábrica em Betim', 'Estado de Minas', dias(20)),
  noticia('Empresa Fantasma amplia fábrica', 'Sem Data', 'não é data'),
]
const COMPANY_LOOKUP = [{ cnpj: '84429695000111', razaoSocial: 'WEG S.A.', porte: 'DEMAIS', cnaePrincipal: '2710402', cnaeDescricao: 'Fabricação de motores elétricos', endereco: { uf: 'SC' }, situacaoCadastral: 'ATIVA', socios: [{ nome: 'Fulano de Tal' }] }]

function llmFalso(responder: (usuario: string) => unknown | Error) {
  const chamadas: { sistema: string; usuario: string }[] = []
  const llm: Llm = {
    json: ({ sistema, usuario }) => {
      chamadas.push({ sistema, usuario })
      const r = responder(usuario)
      return r instanceof Error ? Promise.reject(r) : Promise.resolve({ json: r, custoUsd: 0.0004 })
    },
  }
  return { llm, chamadas }
}

function rodarExpansao(opcoes: { llm?: Llm; contas?: ContaDoWorkspace[]; itens?: unknown[]; porActor?: Record<string, ComportamentoDoRun> } = {}) {
  const porActor: Record<string, ComportamentoDoRun> = {
    'data_xplorer~google-news-scraper-fast': { itens: opcoes.itens ?? NOTICIAS, usageTotalUsd: 0.028 },
    'johnatan029~cnpj-empresas-brasil-scraper': { itens: COMPANY_LOOKUP, usageTotalUsd: 0.0016 },
    ...opcoes.porActor,
  }
  const fake = apifyFalso((_t, actorId) => porActor[actorId] ?? { itens: [], usageTotalUsd: 0 })
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: () => {} })
  const banco = dbFalso(DEF_EXPANSAO(), { contas: opcoes.contas ?? [WEG, RANDON] })
  const rodar = () =>
    rodarCascata({ db: banco.db, fonte, registro: registroDePassos(nunca), llm: opcoes.llm, agora: () => AGORA, log: () => {} }, {
      workspaceId: 'ws-1', userId: 'u1', signalType: 'expansao_de_planta', origem: 'conversa', chave: 'k1',
    })
  return { fake, banco, rodar }
}

Deno.test('expansão (regra de palavra-chave, sem modelo): a empresa da manchete casa com a Conta e vira um Sinal por mês', async () => {
  const c = rodarExpansao()
  const r = await c.rodar()
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.sinais.map((s) => [s.contaId, s.phrase]).sort(), [
    ['conta-randon', 'Notícia de expansão de planta de Randon'],
    ['conta-weg', 'Notícia de expansão de planta de WEG'],
  ])
  // Duas notícias da WEG no mesmo mês: um Sinal só, com as duas fontes na evidência.
  const weg = r.sinais.find((s) => s.contaId === 'conta-weg')!
  assert(weg.eventKey.endsWith('|expansao|2026-10'), weg.eventKey)
  assertEquals(weg.firedAt, dias(3))
  assert(weg.evidence.includes('Valor Econômico') && weg.evidence.includes('Folha') && weg.evidence.includes('https://'), weg.evidence)
  assert(weg.evidence.includes('regra de palavra-chave'), 'sem modelo, a evidência marca a regra')
  assert(weg.evidence.includes('Receita Federal: porte DEMAIS; CNAE 2710402'), weg.evidence)
  // A manchete não vai para o Sinal (pode trazer nome de pessoa); sócio nunca é lido.
  assert(!weg.evidence.includes('bilhão') && !JSON.stringify(r).includes('Fulano'))
  // Entrada do actor de notícias: esquema publicado, janela de 7 dias, Brasil.
  const posts = c.fake.requisicoes.filter((q) => q.metodo === 'POST')
  assertEquals(posts[0].corpo, {
    keywords: ['expansão de fábrica', 'nova planta industrial', 'ampliação da fábrica', 'inaugura nova fábrica'], maxArticles: 25, timeframe: '7d',
    region_language: 'BR:pt-419', decodeUrls: false, extractDescriptions: false, extractImages: false,
  })
  // O CNPJ da Conta com CNPJ vai à Receita (a Randon não tem).
  assertEquals(posts[1].corpo, { mode: 'lookup', cnpjs: ['84429695000111'] })
  assertEquals(r.semConta, 0)
  assertEquals(c.banco.passos.map((p) => [p.ordem, p.handler, p.fim?.estado]), [[1, 'noticias_expansao_planta', 'succeeded'], [2, 'empresa_da_noticia_expansao', 'succeeded'], [3, 'casar_fatos_com_contas', 'succeeded'], [4, 'cnpj_da_conta', 'succeeded']])
  marcaLimpa(r)
})

Deno.test('expansão (com modelo): o modelo extrai a empresa e o local, o custo dele soma ao da execução e a evidência marca a classificação', async () => {
  const { llm, chamadas } = llmFalso((usuario) => {
    const itens = usuario.split('\n').map((l) => JSON.parse(l) as { i: number; titulo: string })
    return {
      itens: itens.map((n) => ({
        i: n.i,
        empresa: n.titulo.startsWith('WEG') ? 'WEG' : n.titulo.includes('Randon') ? 'Randon' : n.titulo.startsWith('Governo') ? 'Dr. João Silva' : null,
        expansao: n.titulo.startsWith('WEG') || n.titulo.includes('Randon') || n.titulo.startsWith('Governo'),
        local: n.titulo.includes('Jaraguá') ? 'Jaraguá do Sul/SC' : null,
      })),
    }
  })
  const c = rodarExpansao({ llm })
  const r = await c.rodar()
  assertEquals(r.novos, 2)
  const weg = r.sinais.find((s) => s.contaId === 'conta-weg')!
  assertEquals(weg.phrase, 'Notícia de expansão de planta de WEG em Jaraguá do Sul/SC')
  assert(weg.evidence.includes('classificação automática'), weg.evidence)
  assertEquals(chamadas.length, 1, 'uma chamada por lote de manchetes')
  assert(!chamadas[0].usuario.includes('não é data') && !chamadas[0].usuario.includes('Alfa Metais'), 'só as notícias datadas e dentro da janela vão ao modelo')
  assert(chamadas[0].sistema.includes('pessoa física'), 'o pedido manda descartar pessoa física')
  // Custo real: notícias 0,028 + Receita 0,0016 + modelo 0,0004.
  assertEquals(r.custoUsd, 0.03)
  // O nome com título de pessoa que o modelo devolveu é descartado.
  assert(!JSON.stringify(r).includes('João Silva'))
})

Deno.test('expansão: se o modelo falha, o lote cai na regra de palavra-chave e a execução segue', async () => {
  const { llm } = llmFalso(() => new Error('modelo fora do ar'))
  const r = await rodarExpansao({ llm }).rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 2])
  assert(r.sinais.every((s) => s.evidence.includes('regra de palavra-chave')))
})

Deno.test('expansão: o modelo devolvendo lixo (ou empresa grande demais) não vira Sinal', async () => {
  const { llm } = llmFalso(() => ({ itens: [{ i: 0, empresa: 'http://x.test', expansao: true }, { i: 1, empresa: 'x'.repeat(200), expansao: true }, { i: 99, empresa: 'WEG', expansao: true }] }))
  const r = await rodarExpansao({ llm, itens: NOTICIAS.slice(0, 2) }).rodar()
  assertEquals([r.novos, r.sinais.length], [0, 0])
})

Deno.test('expansão: rodar de novo não grava de novo', async () => {
  const c = rodarExpansao()
  const a = await c.rodar()
  const b = await c.rodar()
  assertEquals([a.novos, b.novos, b.repetidos], [2, 0, 2])
})

Deno.test('expansão: sem notícia útil, a cascata termina sem Sinal e sem rodar a Receita', async () => {
  const c = rodarExpansao({ itens: [NOTICIAS[3], NOTICIAS[4]] })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 0])
  assertEquals(c.fake.requisicoes.filter((q) => q.metodo === 'POST').length, 1)
})

Deno.test('expansão: a empresa da notícia que não é Conta só é contada', async () => {
  const r = await rodarExpansao({ contas: [RANDON] }).rodar()
  assertEquals([r.novos, r.semConta, r.semContaNomes], [1, 1, ['WEG']])
})

Deno.test('a regra de palavra-chave acha a empresa na manchete e recusa o que não é empresa', () => {
  const casos: [string, string | null][] = [
    ['WEG anuncia investimento de R$ 1 bilhão em expansão de fábrica em Jaraguá do Sul - Valor', 'WEG'],
    ['Volkswagen vai investir R$ 2 bi na ampliação da fábrica de São Bernardo - Folha', 'Volkswagen'],
    ['Expansão da fábrica da Randon em Caxias do Sul deve gerar 300 empregos', 'Randon'],
    ['Expansão da Randon em Caxias do Sul deve gerar 300 empregos', null],
    ['Nova fábrica da BYD em Camaçari entra em operação', 'BYD'],
    ['Tupy amplia fábrica de blocos de motor em Joinville', 'Tupy'],
    ['Governo anuncia pacote para indústria e amplia crédito', null],
    ['Prefeitura amplia escola e inaugura nova unidade de saúde', null],
    ['Maria Souza abre padaria no centro', null],
    ['Indústria amplia fábrica e contrata', null],
    ['Dólar sobe e bolsa cai', null],
    ['expansão da fábrica fica para 2027', null],
  ]
  for (const [titulo, esperado] of casos) assertEquals(empresaPorRegra(titulo, ''), esperado, titulo)
})

// ---------------------------------------------------------------------------------------------------------------------
// Licença de instalação no Diário Oficial da União (mercado).

const dou = (extra: Record<string, unknown>) => ({
  data: '09/10/2026', secao: 'do3', tipo: 'Extrato de Licença', titulo: 'LICENÇA DE INSTALAÇÃO Nº 1234/2026', subtitulo: '',
  orgao: 'Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis', orgao_path: 'Ministério do Meio Ambiente/IBAMA',
  ementa: 'O IBAMA torna público que concedeu à EMPRESA ALFA LTDA, CNPJ 11.222.333/0001-81, Licença de Instalação nº 1234/2026 para a atividade de fábrica de cimento',
  edicao: '190', pagina: '120', termo_encontrado: '"licença de instalação"', url: 'https://www.in.gov.br/web/dou/-/licenca-de-instalacao-1234-2026', url_title: 'licenca-de-instalacao-1234-2026', ...extra,
})
const PUBLICACOES = [
  dou({}),
  dou({}),
  dou({
    titulo: 'LICENÇA DE INSTALAÇÃO Nº 55/2026', ementa: 'O IBAMA concedeu a FULANO DE TAL, CPF 123.456.789-09, Licença de Instalação nº 55/2026 para a atividade de criação',
    url: 'https://www.in.gov.br/web/dou/-/li-55', url_title: 'li-55',
  }),
  dou({ titulo: 'AVISO DE LICITAÇÃO', tipo: 'Aviso', ementa: 'Pregão eletrônico nº 90025/2026', url: 'https://www.in.gov.br/web/dou/-/aviso-1', url_title: 'aviso-1' }),
  dou({ data: '01/09/2026', url: 'https://www.in.gov.br/web/dou/-/li-antiga', url_title: 'li-antiga' }),
  dou({
    data: '12/10/2026', orgao: 'IBAMA', titulo: 'Licença de Instalação 77/2026', ementa: 'Concede Licença de Instalação 77/2026 ao empreendimento de linha de transmissão',
    url: 'https://www.in.gov.br/web/dou/-/li-77', url_title: 'li-77',
  }),
]

function rodarDou(itens: unknown[] = PUBLICACOES) {
  const fake = apifyFalso((_t, actorId) => actorId.startsWith('jenko_systems~') ? { itens, usageTotalUsd: 0.2051 } : { itens: [] })
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: () => {} })
  const banco = dbFalso(DEF_LICENCA_DOU(), { contas: [] })
  const rodar = (chave = 'k1') =>
    rodarCascata({ db: banco.db, fonte, registro: registroDePassos(nunca), agora: () => AGORA, log: () => {} }, {
      workspaceId: 'ws-1', userId: 'u1', signalType: 'licenca_instalacao_dou', origem: 'rotina', chave,
    })
  return { fake, banco, rodar }
}

Deno.test('licença de instalação no DOU: vira Sinal de mercado, só a publicação que traz a expressão, sem pessoa física', async () => {
  const c = rodarDou()
  const r = await c.rodar()
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.mercado.map((m) => m.phrase), [
    'Licença de instalação publicada no DOU por IBAMA em 12/10/2026',
    'Licença de instalação publicada no DOU por Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis (CNPJ 11.222.333/0001-81) em 09/10/2026',
  ])
  const [semCnpj, comCnpj] = r.mercado
  assertEquals(comCnpj.eventKey, 'licenca|licenca-de-instalacao-1234-2026')
  assertEquals(comCnpj.firedAt, '2026-10-09T12:00:00.000Z')
  assertEquals(comCnpj.source, 'Diário Oficial da União')
  assertEquals(comCnpj.payload, {
    orgao: 'Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis', tipo: 'Extrato de Licença', cnpj: '11222333000181',
    url: 'https://www.in.gov.br/web/dou/-/licenca-de-instalacao-1234-2026', publicadoEm: '2026-10-09',
  })
  assert(comCnpj.evidence.includes('fábrica de cimento'), comCnpj.evidence)
  assert(!('cnpj' in semCnpj.payload) && !semCnpj.evidence.includes('linha de transmissão'), 'sem CNPJ, o trecho da ementa não vai para a evidência')
  assert(!JSON.stringify(r).includes('FULANO') && !JSON.stringify(r).includes('123.456.789'), 'a licença de pessoa física é descartada')
  assertEquals(c.banco.sinais.length, 0, 'Sinal de mercado não vai para uma Conta')
  assertEquals(c.banco.mercado.length, 2)
  marcaLimpa(r)
})

Deno.test('licença de instalação: o monitor é o principal, a frase vai na seção 1, e ato de abril dispara a reserva', async () => {
  const def = DEF_LICENCA_DOU()
  def.capUsd = 0.8
  def.steps[0] = {
    ...def.steps[0],
    actorId: 'brasildados~dou-monitor',
    estFixedUsd: 0.1,
    estPerItemUsd: 0.01,
    estItems: 10,
    maxItems: 20,
    fallbacks: [{ kind: 'actor', actorId: 'jenko_systems~diario-oficial-uniao-dou', priceModel: 'PAY_PER_EVENT', estFixedUsd: 0.2, estPerItemUsd: 0.0001 }],
    inputTemplate: { termo: '"licença de instalação"', secao: 'do1', janelaDias: 14 },
  }
  const fake = apifyFalso((_t, actorId) => {
    if (actorId === 'brasildados~dou-monitor') {
      return {
        itens: [{
          data: '08/04/2026', secao: 'DO1', tipo: 'Resolução', titulo: 'Resolução da ANVISA', orgao: 'ANVISA',
          resumo: 'Registro de medicamento.', url: 'https://www.in.gov.br/web/dou/-/anvisa-abril',
        }],
        usageTotalUsd: 0.11,
      }
    }
    return {
      itens: [dou({
        data: '12/10/2026', ementa: '', resumo: 'O IBAMA concede Licença de Instalação 90/2026 à indústria de cimento',
        titulo: 'Extrato', url: 'https://www.in.gov.br/web/dou/-/li-90', url_title: 'li-90', orgao: 'IBAMA',
      })],
      usageTotalUsd: 0.2,
    }
  })
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: () => {} })
  const banco = dbFalso(def, { contas: [] })
  const r = await rodarCascata({ db: banco.db, fonte, registro: registroDePassos(nunca), agora: () => AGORA, log: () => {} }, {
    workspaceId: 'ws-1', userId: 'u1', signalType: 'licenca_instalacao_dou', origem: 'rotina', chave: 'k-dou',
  })
  const posts = fake.requisicoes.filter((q) => q.metodo === 'POST')
  assertEquals(posts.map((p) => p.caminho.split('/')[3]), ['brasildados~dou-monitor', 'jenko_systems~diario-oficial-uniao-dou'])
  assertEquals(posts[0].corpo, { q: ['licença de instalação'], s: 'DO1' })
  assertEquals(r.mercado.map((m) => m.eventKey), ['licenca|li-90'])
  assert(r.mercado[0].evidence.includes('Licença de Instalação') || r.mercado[0].phrase.includes('Licença de instalação'), JSON.stringify(r.mercado[0]))
  assert(!JSON.stringify(r).includes('medicamento'))
  marcaLimpa(r)
})

Deno.test('licença de instalação no DOU: a entrada do actor segue o esquema publicado e a janela de 14 dias', async () => {
  const c = rodarDou()
  await c.rodar()
  const post = c.fake.requisicoes.find((q) => q.metodo === 'POST')!
  assertEquals(post.corpo, { mode: 'busca', termo: '"licença de instalação"', secao: 'todos', data_inicio: '2026-09-29', data_fim: '2026-10-13', max_resultados: 50, texto_completo: false })
})

Deno.test('licença de instalação no DOU: rodar de novo não grava de novo; sem publicação útil, termina sem Sinal', async () => {
  const c = rodarDou()
  const a = await c.rodar('a')
  const b = await c.rodar('b')
  assertEquals([a.novos, b.novos, b.repetidos], [2, 0, 2])
  const vazio = await rodarDou([PUBLICACOES[3]]).rodar()
  assertEquals([vazio.desfecho, vazio.mercado.length], ['concluida', 0])
})

// ---------------------------------------------------------------------------------------------------------------------
// Os Sinais sem fonte.

Deno.test('licença estadual e importação de máquinas por empresa: sem fonte, o motivo sai em palavras do produto e nada é reservado', async () => {
  const motivos: Record<string, string> = {
    licenca_instalacao: 'As licenças de instalação dos órgãos ambientais estaduais saem em portais diferentes, sem dado aberto por CNPJ; só o que o Diário Oficial da União publica entra, como Sinal de mercado.',
    importacao_de_maquinas: 'O Comex Stat não abre a importação por CNPJ; a importação de máquinas (capítulos 84 e 85) aparece como Sinal de mercado em NCM nova na pauta e aumento de volume por porto.',
  }
  for (const [tipo, motivo] of Object.entries(motivos)) {
    const def = { ...cascata(tipo, []), state: 'sem_fonte' as const, semFonteMotivo: motivo }
    const banco = dbFalso(def, { contas: [] })
    const r = await rodarCascata({ db: banco.db, fonte: semApify, registro: registroDePassos(nunca), agora: () => AGORA, log: () => {} }, {
      workspaceId: 'ws-1', userId: 'u1', signalType: tipo, origem: 'conversa', chave: 'k1',
    })
    assertEquals([r.desfecho, r.mensagem, banco.aberturas.length], ['sem_fonte', motivo, 0])
    marcaLimpa(r)
  }
})
