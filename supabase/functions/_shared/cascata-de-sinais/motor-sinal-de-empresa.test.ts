// A empresa que o passo de casamento não achou entre as Contas (sinal-candidata-e-descoberta): o passo guarda o Sinal dela
// na memória da execução e o motor o entrega ao banco, que decide se é Conta (CNPJ, depois domínio) ou candidata da Caixa
// de Descobertas. Isso não muda os créditos, o desfecho nem a contagem de Sinais novos da execução.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { pesoDoSinal } from '../../account-discovery/pontuacao.ts'
import { cascataDeTeste, dbFalso } from './db-falso.ts'
import { rodarCascata } from './motor.ts'
import { MAX_EMPRESAS_SEM_CONTA } from './passos/comum.ts'
import { casarComContas } from './passos/casar-com-contas.ts'
import { casarFatosComContas, itemDeEmpresaComFatos, type EmpresaComFatos } from './passos/empresas.ts'
import type { ClienteDaFonte, ContaDoWorkspace, ContextoDoPasso, DbDaCascata, Item, PedidoDeCascata, RegistroDePassos } from './tipos.ts'

const ALFA: ContaDoWorkspace = { id: 'conta-alfa', name: 'Alfa Importadora', domain: 'alfa.test', linkedinUrl: null, cnpj: '11.222.333/0001-81' }
const AGORA = Date.parse('2026-10-13T12:00:00Z')

const fato = (chave: string, frase: string) => ({ chave, frase, quando: '2026-10-12T10:00:00Z', fonte: 'Diário Oficial', evidencia: `Ato ${chave}` })
const EMPRESAS: EmpresaComFatos[] = [
  { empresa: { nome: 'Alfa Importadora S.A.', cnpj: '11222333000181' }, fatos: [fato('filial-1', 'Abriu filial em Campinas')] },
  { empresa: { nome: 'Gama Logística Ltda', cnpj: '47960950000121', site: 'https://gama.test', uf: 'SP', municipio: 'Campinas' },
    fatos: [fato('filial-2', 'Abriu filial em Recife'), fato('filial-3', 'Abriu filial em Natal')] },
  { empresa: { nome: 'Sem Identidade Ltda' }, fatos: [fato('filial-4', 'Abriu filial em Belém')] },
]

const registro = (empresas: () => EmpresaComFatos[]): RegistroDePassos => ({
  passos: {
    gerar: {
      montarEntrada: () => ({ input: { q: 'x' }, maxItems: 10 }),
      normalizar: () => empresas().map(itemDeEmpresaComFatos),
    },
    dedupe: { executar: (entrada) => entrada },
    enriquecer: { montarEntrada: (entrada) => ({ input: { n: entrada.length }, maxItems: 10 }), normalizar: (_b, entrada) => entrada },
    sinalizar: casarFatosComContas,
  },
  fontes: {},
})

const fonte: ClienteDaFonte = {
  rodar: (args) => Promise.resolve({ apifyRunId: `run-${args.actorId}`, build: '1.0.0', tokenIndex: 0, custoUsd: 0.01, items: [{ n: 1 }] }),
}

const pedido = (extra: Partial<PedidoDeCascata> = {}): PedidoDeCascata => ({
  workspaceId: 'ws-1', userId: 'user-1', signalType: 'teste_em_cascata', origem: 'monitor', monitorId: 'mon-1', chave: 'chave-1',
  contas: [ALFA], ...extra,
})

Deno.test('a empresa que não é Conta vai ao banco como Sinal de empresa, uma vez por fato, com o peso do tipo', async () => {
  const banco = dbFalso(cascataDeTeste(), { contas: [ALFA] })
  const r = await rodarCascata({ db: banco.db, fonte, registro: registro(() => EMPRESAS), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.novos, 1, 'só o Sinal da Conta conta como novo')
  assertEquals(r.sinais.map((s) => s.contaId), ['conta-alfa'])
  assertEquals(r.semConta, 2)
  assertEquals(banco.empresas.length, 2, 'a empresa sem CNPJ nem site não vai: o banco não a deduplicaria')
  assertEquals(banco.empresas.map((e) => e.sinal.eventKey.split('|').at(-1)), ['filial-2', 'filial-3'])
  const [primeiro] = banco.empresas
  assertEquals(primeiro.sinal.empresa, { nome: 'Gama Logística Ltda', cnpj: '47960950000121', site: 'https://gama.test', uf: 'SP', municipio: 'Campinas' })
  assertEquals([primeiro.signalType, primeiro.monitorId, primeiro.peso], ['teste_em_cascata', 'mon-1', pesoDoSinal('teste_em_cascata')])
  assertEquals(primeiro.sinal.phrase, 'Abriu filial em Recife')
  assertEquals(banco.fechamentos[0].novos, 1, 'o fechamento e os créditos não mudam')
})

Deno.test('o Sinal de empresa respeita o tipo genérico do Monitoramento e o peso dele', async () => {
  const banco = dbFalso(cascataDeTeste(), { contas: [ALFA] })
  await rodarCascata({ db: banco.db, fonte, registro: registro(() => EMPRESAS), agora: () => AGORA, log: () => {} },
    pedido({ signalType: 'teste_em_cascata', registrarComo: 'novo_escritorio' }))
  assertEquals(banco.empresas.map((e) => [e.signalType, e.peso]), [['novo_escritorio', 40], ['novo_escritorio', 40]])
})

Deno.test('um problema ao gravar a empresa não derruba a execução, os créditos nem o Sinal da Conta', async () => {
  const logs: Record<string, unknown>[] = []
  const banco = dbFalso(cascataDeTeste(), { contas: [ALFA], sinalDeEmpresa: () => new Error('o banco recusou') })
  const r = await rodarCascata({ db: banco.db, fonte, registro: registro(() => EMPRESAS), agora: () => AGORA, log: (c) => logs.push(c) }, pedido())
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.novos, 1)
  assertEquals(banco.fechamentos[0].estado, 'succeeded')
  assertEquals(logs.filter((l) => l.outcome === 'record_company_signal_failed').length, 2)
})

Deno.test('uma execução leva no máximo 50 empresas diferentes ao banco', async () => {
  const muitas: EmpresaComFatos[] = Array.from({ length: MAX_EMPRESAS_SEM_CONTA + 10 }, (_, i) => ({
    empresa: { nome: `Empresa ${i}`, site: `https://empresa${i}.test` },
    fatos: [fato(`f-${i}`, `Abriu filial ${i}`)],
  }))
  const banco = dbFalso(cascataDeTeste(), { contas: [ALFA] })
  await rodarCascata({ db: banco.db, fonte, registro: registro(() => muitas), agora: () => AGORA, log: () => {} }, pedido())
  assertEquals(banco.empresas.length, MAX_EMPRESAS_SEM_CONTA)
})

Deno.test('a cascata de mercado leva o peso do tipo ao Sinal de mercado', async () => {
  const chamadas: { signalType: string; peso?: number }[] = []
  const banco = dbFalso(cascataDeTeste({ scope: 'mercado', signalType: 'licenca_instalacao_dou' }))
  const db: DbDaCascata = {
    ...banco.db,
    gravarSinalDeMercado: (a) => (chamadas.push({ signalType: a.signalType, peso: a.peso }), banco.db.gravarSinalDeMercado(a)),
  }
  const mercado: RegistroDePassos = {
    passos: {
      gerar: { montarEntrada: () => ({ input: {}, maxItems: 5 }), normalizar: () => [{ n: 1 }] },
      dedupe: { executar: (entrada) => entrada },
      enriquecer: { montarEntrada: () => ({ input: {}, maxItems: 5 }), normalizar: (_b, entrada) => entrada },
      sinalizar: {
        executar: (): Item[] => [{
          eventKey: 'lic|1', phrase: 'Licença de instalação publicada no DOU', firedAt: '2026-10-12T10:00:00Z', source: 'Diário Oficial da União',
          evidence: 'Ato', payload: { cnpj: '47960950000121' },
        }],
      },
    },
    fontes: {},
  }
  const r = await rodarCascata({ db, fonte, registro: mercado, agora: () => AGORA, log: () => {} },
    pedido({ signalType: 'licenca_instalacao_dou', contas: undefined, monitorId: null }))
  assertEquals(r.novos, 1)
  assertEquals(chamadas, [{ signalType: 'licenca_instalacao_dou', peso: 40 }])
})

Deno.test('no casamento de vagas, a empresa sem Conta e com site guarda o Sinal da vaga; sem site, só conta', () => {
  const memoria = new Map<string, unknown>()
  const ctx = { contas: [ALFA], agora: AGORA, memoria } as unknown as ContextoDoPasso
  const vaga = (titulo: string) => ({ titulo, local: 'Campinas, SP', descricao: '', nivel: '', link: 'https://v.test/1', publicadaEm: '2026-10-11T00:00:00Z', fonte: 'LinkedIn' })
  const entrada: Item[] = [
    { tipo: 'empresa', chave: 'a', empresa: { nome: 'Alfa Importadora', linkedinUrl: '', site: 'https://alfa.test' }, vagas: [vaga('Analista de Comex')] },
    { tipo: 'empresa', chave: 'g', empresa: { nome: 'Gama Logística', linkedinUrl: '', site: 'https://www.gama.test/carreiras' }, vagas: [vaga('Analista de Comex'), vaga('Despachante')] },
    { tipo: 'empresa', chave: 'x', empresa: { nome: 'Sem Site Ltda', linkedinUrl: 'https://www.linkedin.com/company/sem-site', site: '' }, vagas: [vaga('Analista de Comex')] },
  ]
  const saida = casarComContas.executar!(entrada, ctx) as Item[]
  assertEquals(saida.map((s) => s.contaId), ['conta-alfa'])
  assertEquals(memoria.get('semConta'), 2)
  const guardados = memoria.get('sinaisDeEmpresas') as { empresa: { nome: string; site?: string }; phrase: string; eventKey: string }[]
  assertEquals(guardados.map((g) => g.empresa.nome), ['Gama Logística', 'Gama Logística'])
  assertEquals(guardados[0].empresa.site, 'https://www.gama.test/carreiras')
  assertEquals(guardados.map((g) => g.phrase), ['Abriu vaga de Analista de Comex em Campinas, SP', 'Abriu vaga de Despachante em Campinas, SP'])
  assert(guardados.every((g) => g.eventKey.startsWith('vaga|gama logistica|')), guardados[0].eventKey)
})
