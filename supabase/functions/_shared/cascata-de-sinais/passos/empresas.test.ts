import { assertEquals } from 'jsr:@std/assert@1'
import { casarFatosComContas, contaDaEmpresa, itemDeEmpresaComFatos } from './empresas.ts'
import type { ContaDoWorkspace, ContextoDoPasso } from '../tipos.ts'

const ALFA: ContaDoWorkspace = { id: 'c1', name: 'Alfa Indústria S.A.', domain: 'alfa.test', linkedinUrl: null, cnpj: '11.222.333/0001-81' }
const BETA: ContaDoWorkspace = { id: 'c2', name: 'Beta Logística', domain: 'beta.test', linkedinUrl: 'https://www.linkedin.com/company/beta-log', cnpj: null }
const fato = (chave: string) => ({ chave, frase: `Fato ${chave}`, quando: '2026-10-01T00:00:00Z', fonte: 'Fonte', evidencia: 'Evidência' })

function ctx(contas: ContaDoWorkspace[]): ContextoDoPasso {
  return { contas, memoria: new Map() } as unknown as ContextoDoPasso
}

Deno.test('o CNPJ decide a Conta quando as duas pontas o têm; sem CNPJ, vale o nome, o site ou o LinkedIn', () => {
  assertEquals(contaDaEmpresa([ALFA, BETA], { nome: 'Nome Diferente', cnpj: '11222333000181' })?.id, 'c1')
  assertEquals(contaDaEmpresa([ALFA, BETA], { nome: 'Beta Logística Ltda', linkedinUrl: 'https://linkedin.com/company/beta-log?x=1' })?.id, 'c2')
  assertEquals(contaDaEmpresa([ALFA, BETA], { nome: 'Alfa Indústria', site: 'https://www.alfa.test/contato' })?.id, 'c1')
  // CNPJ diferente nas duas pontas: não é a mesma empresa, mesmo com nome parecido.
  assertEquals(contaDaEmpresa([ALFA], { nome: 'Alfa Indústria', cnpj: '99888777000166' }), undefined)
  assertEquals(contaDaEmpresa([ALFA, BETA], { nome: 'Gama' }), undefined)
})

Deno.test('casar_fatos_com_contas: um Sinal por fato da Conta, os fatos repetidos contam uma vez e o resto é só contado', () => {
  const entrada = [
    itemDeEmpresaComFatos({ empresa: { nome: 'Alfa Indústria', cnpj: '11222333000181' }, fatos: [fato('a'), fato('a'), fato('b')] }),
    itemDeEmpresaComFatos({ empresa: { nome: 'Gama Ltda' }, fatos: [fato('c')] }),
    { tipo: 'lixo' },
  ]
  const c = ctx([ALFA, BETA])
  const saida = casarFatosComContas.executar!(entrada, c) as { contaId: string; eventKey: string; cnpjDaConta: string }[]
  assertEquals(saida.map((s) => [s.contaId, s.eventKey, s.cnpjDaConta]), [
    ['c1', 'alfa industria|a', '11222333000181'],
    ['c1', 'alfa industria|b', '11222333000181'],
  ])
  assertEquals([c.memoria.get('semConta'), c.memoria.get('semContaNomes')], [1, ['Gama Ltda']])
})

Deno.test('casar_fatos_com_contas: a amostra para validação leva até 5 CNPJs e razões sociais, e descarta nome com CPF', () => {
  const empresas = [
    ...Array.from({ length: 6 }, (_, i) => itemDeEmpresaComFatos({
      empresa: { nome: `EMPRESA ${i} LTDA`, cnpj: String(10_000_000_000_000 + i) },
      fatos: [fato('a')],
    })),
    itemDeEmpresaComFatos({ empresa: { nome: 'JOAO 123.456.789-09', cnpj: '99888777000166' }, fatos: [fato('z')] }),
  ]
  const c = ctx([])
  casarFatosComContas.executar!(empresas, c)
  assertEquals(c.memoria.get('semContaAmostra'), [0, 1, 2, 3, 4].map((i) => ({
    cnpj: String(10_000_000_000_000 + i), nome: `EMPRESA ${i} LTDA`,
  })))
})
