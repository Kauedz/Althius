// O formato que o harvestapi/linkedin-company-employees devolveu na execução real de 30/09/2026 (modo Short): as
// posições atuais em `currentPositions[]`, com o início em `startedOn`, e não em `currentPosition[].dateRange.start`
// como o README mostrava. Pessoas e empresa fictícias.
import { assertEquals } from 'jsr:@std/assert@1'
import type { ContaParaVarrer } from '../handler.ts'
import { entradasESaidas } from './entradas-e-saidas.ts'

const AGORA = Date.parse('2026-09-30T12:00:00Z')
const CONTA: ContaParaVarrer = {
  id: 'conta-1',
  name: 'Acme Logística S.A.',
  domain: 'acmelog.com.br',
  linkedinUrl: 'https://www.linkedin.com/company/acme-logistica',
}
const CRITERIOS = { cargos: [], movimento: ['Chegada'], pessoas: 'Qualquer pessoa no cargo', localizacao: ['Brasil'], periodo: 'Últimos 90 dias' }

const perfilCurto = (posicao: Record<string, unknown>) => ({
  id: 'ACoAAA-ficticio',
  linkedinUrl: 'https://www.linkedin.com/in/maria-exemplo',
  firstName: 'Maria',
  lastName: 'Exemplo',
  summary: 'Resumo',
  location: { linkedinText: 'São Paulo, Brasil' },
  currentPositions: [{
    companyId: '1001',
    companyLinkedinUrl: 'https://www.linkedin.com/company/acme-logistica',
    companyName: 'Acme Logística',
    title: 'Diretora de Operações',
    current: true,
    startedOn: { month: 8, year: 2026 },
    tenureAtCompany: { numYears: 0, numMonths: 1 },
    tenureAtPosition: { numYears: 0, numMonths: 1 },
    ...posicao,
  }],
  _meta: { pagination: { pageNumber: 1 } },
})

Deno.test('Entradas: o perfil curto com currentPositions e startedOn vira Sinal', () => {
  const [s, ...resto] = entradasESaidas.sinais([perfilCurto({})], CONTA, CRITERIOS, AGORA)
  assertEquals(resto, [])
  assertEquals(s.phrase, 'Entrada: Maria Exemplo chegou como Diretora de Operações')
  assertEquals(s.firedAt, '2026-08-01T00:00:00.000Z')
  assertEquals(s.eventKey, 'entrada|acme-logistica|maria-exemplo|2026-08')
})

Deno.test('Entradas: startedOn com o mês por extenso também serve; sem mês, antigo ou fora do cargo atual, não', () => {
  assertEquals(entradasESaidas.sinais([perfilCurto({ startedOn: { month: 'Aug', year: 2026 } })], CONTA, CRITERIOS, AGORA).length, 1)
  assertEquals(entradasESaidas.sinais([perfilCurto({ startedOn: { year: 2026 } })], CONTA, CRITERIOS, AGORA), [])
  assertEquals(entradasESaidas.sinais([perfilCurto({ startedOn: { month: 1, year: 2025 } })], CONTA, CRITERIOS, AGORA), [])
  assertEquals(entradasESaidas.sinais([perfilCurto({ current: false })], CONTA, CRITERIOS, AGORA), [])
})
