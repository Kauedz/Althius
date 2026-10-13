// ICP E, vaga de engenharia ou manutenção: a MESMA cascata do A1 (vagas, confirmação, empresa, casamento, Receita) com os
// termos da indústria, só por modelo de entrada e pela chave `termosConfirmacao`; nenhum código novo. O teste roda o motor
// com os passos reais e um Apify falso (nunca a rede), como `vaga-comex.test.ts`.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { apifyFalso, type ComportamentoDoRun } from '../falso-apify.ts'
import { dbFalso } from '../db-falso.ts'
import { clienteAssincronoDoApify } from '../fonte-apify.ts'
import { cascataVagaComex } from '../fixtures.ts'
import { rodarCascata } from '../motor.ts'
import type { CascataDef, ContaDoWorkspace } from '../tipos.ts'
import { MARCA_INTERNA } from '../../marca.ts'
import { registroDePassos } from './index.ts'

const AGORA = Date.parse('2026-10-13T12:00:00Z')
const TOKEN = 'apify_api_SEGREDO_DO_TESTE_0123456789'
const dias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString().slice(0, 10)

/** A cascata como a migração 20261013190000 a semeia: os passos do A1 com os termos de E. */
export const TERMOS_DE_BUSCA = ['engenheiro de manutenção', 'PCM', 'engenheiro de processos', 'supervisor de manutenção']
export const TERMOS_DE_CONFIRMACAO = [
  'engenheiro de manutencao', 'engenheira de manutencao', 'engenheiro a de manutencao', 'engenharia de manutencao', 'pcm',
  'planejador de manutencao', 'planejadora de manutencao', 'supervisor de manutencao', 'coordenador de manutencao', 'gerente de manutencao',
  'engenheiro de processos', 'engenheira de processos', 'engenheiro a de processos', 'engenharia de processos',
]
function cascataE(): CascataDef {
  const base = cascataVagaComex()
  return {
    ...base, id: 'cascata-e1', signalType: 'vaga_engenharia_manutencao', icp: 'E', name: 'Vaga de engenharia ou manutenção',
    steps: base.steps.map((p) =>
      p.ordem === 1
        ? { ...p, inputTemplate: { ...p.inputTemplate, termos: TERMOS_DE_BUSCA } }
        : p.ordem === 2
        ? { ...p, inputTemplate: { termosConfirmacao: TERMOS_DE_CONFIRMACAO, janelaDias: 7 } }
        : p
    ),
  }
}

const ALFA: ContaDoWorkspace = { id: 'conta-alfa', name: 'Alfa Metalúrgica S.A.', domain: 'alfa.test', linkedinUrl: 'https://www.linkedin.com/company/alfa-metalurgica', cnpj: '11.222.333/0001-81' }
const BETA: ContaDoWorkspace = { id: 'conta-beta', name: 'Beta Plásticos', domain: 'beta.test', linkedinUrl: null, cnpj: null }

const vaga = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, companyName: 'Alfa Metalúrgica', location: 'Joinville, SC', companyLinkedinUrl: 'https://www.linkedin.com/company/alfa-metalurgica?trk=x',
  postedAt: dias(2), descriptionText: 'Planta industrial.', seniorityLevel: 'Associate', ...extra,
})
const VAGAS = [
  vaga('1', 'Engenheiro(a) de Manutenção Pleno'),
  vaga('2', 'Analista de PCM', { postedAt: dias(3) }),
  vaga('3', 'Engenheiro de Processos', { companyName: 'Beta Plásticos', companyLinkedinUrl: 'https://www.linkedin.com/company/beta-plasticos', postedAt: dias(1) }),
  vaga('4', 'Técnico de Manutenção'),
  vaga('5', 'Auxiliar de Produção'),
  vaga('6', 'Engenheiro de Manutenção Sênior', { postedAt: dias(20) }),
  vaga('7', 'Coordenador de Manutenção', { companyName: 'Gama Fundição', companyLinkedinUrl: 'https://www.linkedin.com/company/gama-fundicao' }),
  vaga('8', 'Analista de Comércio Exterior'),
]
const COMPANY = [{ name: 'Beta Plásticos', universalName: 'beta-plasticos', linkedinUrl: 'https://www.linkedin.com/company/beta-plasticos', website: 'https://beta.test/', employeeCount: 120 },
  { name: 'Gama Fundição', universalName: 'gama-fundicao', linkedinUrl: 'https://www.linkedin.com/company/gama-fundicao', website: 'https://gama.test', employeeCount: 300 }]
const CNPJ = [{ cnpj: '11222333000181', razaoSocial: 'ALFA METALURGICA S/A', porte: 'DEMAIS', cnaePrincipal: '2599399', cnaeDescricao: 'Fabricação de produtos de metal', endereco: { uf: 'SC' }, situacaoCadastral: 'ATIVA', socios: [{ nome: 'Fulano de Tal' }] }]

function cenario(porActor: Record<string, ComportamentoDoRun>, contas = [ALFA, BETA]) {
  const fake = apifyFalso((_t, actorId) => porActor[actorId] ?? { itens: [], usageTotalUsd: 0 })
  const fonte = clienteAssincronoDoApify({ tokens: [TOKEN], fetchFn: fake.fetchFn, dormir: () => Promise.resolve(), esperaDoCustoMs: 0, log: () => {} })
  const banco = dbFalso(cascataE(), { contas })
  const nunca: typeof fetch = () => Promise.reject(new Error('não devia usar a rede'))
  const rodar = (criterios: Record<string, unknown> = {}) =>
    rodarCascata({ db: banco.db, fonte, registro: registroDePassos(nunca), agora: () => AGORA, log: () => {} }, {
      workspaceId: 'ws-1', userId: 'u1', signalType: 'vaga_engenharia_manutencao', origem: 'conversa', chave: 'k1', criterios,
    })
  return { fake, banco, rodar }
}

Deno.test('E: a vaga de engenharia ou manutenção de uma Conta vira Sinal pela mesma cascata do A1, com os termos da indústria', async () => {
  const c = cenario({
    'curious_coder~linkedin-jobs-scraper': { itens: VAGAS, usageTotalUsd: 0.0152 },
    'harvestapi~linkedin-company': { itens: COMPANY, usageTotalUsd: 0.008 },
    'johnatan029~cnpj-empresas-brasil-scraper': { itens: CNPJ, usageTotalUsd: 0.0016 },
  })
  const r = await c.rodar()
  assertEquals(r.desfecho, 'concluida')
  assertEquals(r.sinais.map((s) => [s.contaId, s.phrase]).sort(), [
    ['conta-alfa', 'Abriu vaga de Analista de PCM em Joinville, SC'],
    ['conta-alfa', 'Abriu vaga de Engenheiro(a) de Manutenção Pleno em Joinville, SC'],
    ['conta-beta', 'Abriu vaga de Engenheiro de Processos em Joinville, SC'],
  ].sort())
  assertEquals(r.semConta, 1, 'a Gama Fundição não é Conta do Workspace')
  // A busca usa os termos de E (a URL da busca leva a palavra-chave e a janela de 7 dias).
  const busca = c.fake.requisicoes.find((q) => q.metodo === 'POST')!.corpo as { urls: string[] }
  assertEquals(busca.urls.map((u) => new URL(u).searchParams.get('keywords')), TERMOS_DE_BUSCA)
  assert(busca.urls.every((u) => u.includes('f_TPR=r604800')))
  // A Receita entra na evidência, sem sócio.
  assert(r.sinais.filter((s) => s.contaId === 'conta-alfa').every((s) => s.evidence.includes('Receita Federal: porte DEMAIS; CNAE 2599399')))
  assert(!JSON.stringify(r).includes('Fulano'))
  assert(!MARCA_INTERNA.test(JSON.stringify(r)))
})

Deno.test('E: técnico de manutenção, vaga com mais de 7 dias e vaga de comex não viram Sinal', async () => {
  const c = cenario({ 'curious_coder~linkedin-jobs-scraper': { itens: [VAGAS[3], VAGAS[4], VAGAS[5], VAGAS[7]], usageTotalUsd: 0.008 } })
  const r = await c.rodar()
  assertEquals([r.desfecho, r.novos], ['concluida', 0])
  assertEquals(c.fake.requisicoes.filter((q) => q.metodo === 'POST').length, 1, 'nada confirmado: o resto não roda')
})

Deno.test('E: os termos de confirmação do pedido valem mais que os do modelo', async () => {
  const c = cenario({
    'curious_coder~linkedin-jobs-scraper': { itens: [VAGAS[0], VAGAS[3]], usageTotalUsd: 0.004 },
    'johnatan029~cnpj-empresas-brasil-scraper': { itens: CNPJ, usageTotalUsd: 0.0016 },
  }, [ALFA])
  const r = await c.rodar({ termosConfirmacao: ['tecnico de manutencao'] })
  assertEquals(r.sinais.map((s) => s.phrase), ['Abriu vaga de Técnico de Manutenção em Joinville, SC'])
})

Deno.test('E: a mesma vaga, em outra rodada, não cria o Sinal duas vezes', async () => {
  const c = cenario({
    'curious_coder~linkedin-jobs-scraper': { itens: [VAGAS[0]], usageTotalUsd: 0.002 },
    'johnatan029~cnpj-empresas-brasil-scraper': { itens: CNPJ, usageTotalUsd: 0.0016 },
  }, [ALFA])
  const a = await c.rodar()
  const b = await c.rodar()
  assertEquals([a.novos, a.repetidos, b.novos, b.repetidos], [1, 0, 0, 1])
})
