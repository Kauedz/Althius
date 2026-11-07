// Os filtros da busca: a forma e a limpeza do que chega. Textos e empresas fictícios.
import { assertEquals } from 'jsr:@std/assert@1'
import { cnaeValido, criteriosVazios, faltaParaBuscar, normalizarCriterios } from './criterios.ts'
import { ESTADOS, ehBrasil, localDoLinkedin, ufDe } from './regioes.ts'

Deno.test('ufDe lê sigla, nome e sigla no fim do local', () => {
  assertEquals(ufDe('SP'), 'SP')
  assertEquals(ufDe('sp'), 'SP')
  assertEquals(ufDe('São Paulo'), 'SP')
  assertEquals(ufDe('State of Sao Paulo'), 'SP')
  assertEquals(ufDe('Campinas, SP'), 'SP')
  assertEquals(ufDe('Campinas, São Paulo, Brasil'), 'SP')
  assertEquals(ufDe('Mato Grosso do Sul'), 'MS')
  assertEquals(ufDe('Mato Grosso'), 'MT')
  assertEquals(ufDe('Rio Grande do Norte'), 'RN')
  assertEquals(ufDe('Paraná'), 'PR')
  assertEquals(ufDe('Pará'), 'PA')
  assertEquals(ufDe('Distrito Federal'), 'DF')
})

Deno.test('ufDe não inventa estado: sigla em minúsculas no meio de uma frase e texto sem estado', () => {
  assertEquals(ufDe('vendemos para es empresas'), null)
  assertEquals(ufDe('Lisboa, Portugal'), null)
  assertEquals(ufDe(''), null)
  assertEquals(ufDe(null), null)
  assertEquals(Object.keys(ESTADOS).length, 27)
})

Deno.test('ehBrasil e o local que o LinkedIn entende', () => {
  assertEquals(ehBrasil('Brasil'), true)
  assertEquals(ehBrasil('brazil'), true)
  assertEquals(ehBrasil('BR'), true)
  assertEquals(ehBrasil('Portugal'), false)
  assertEquals(localDoLinkedin('SP'), 'São Paulo, Brazil')
  assertEquals(localDoLinkedin('São Paulo'), 'São Paulo, Brazil')
  assertEquals(localDoLinkedin('Campinas, SP'), 'Campinas, São Paulo, Brazil')
  assertEquals(localDoLinkedin('Brasil'), 'Brazil')
  assertEquals(localDoLinkedin('Curitiba'), 'Curitiba, Brazil')
  assertEquals(localDoLinkedin('Curitiba, Brazil'), 'Curitiba, Brazil')
})

Deno.test('normalizarCriterios limpa listas, porte e CNAE, e usa o LinkedIn por padrão', () => {
  const c = normalizarCriterios({
    fonte: 'qualquer',
    setores: ['  Software  ', 'software', '', 5, 'Saúde'],
    palavrasChave: 'dados, analytics;  IA',
    portes: ['51-200', '51-200', '1000', 'epp', 'DEMAIS'],
    regioes: ['SP', 'Brasil'],
    tecnologias: ['AWS'],
    excluir: ['varejo'],
    cnaes: ['6201-5/01', '123', 6201501, 'abc'],
  })
  assertEquals(c.fonte, 'linkedin')
  assertEquals(c.setores, ['Software', 'Saúde'])
  assertEquals(c.palavrasChave, ['dados', 'analytics', 'IA'])
  assertEquals(c.portes, ['51-200', 'EPP', 'DEMAIS'])
  assertEquals(c.cnaes, ['6201501'])
  assertEquals(normalizarCriterios({ fonte: 'receita' }).fonte, 'receita')
  assertEquals(normalizarCriterios(null), criteriosVazios())
  assertEquals(normalizarCriterios([1, 2]), criteriosVazios())
})

Deno.test('normalizarCriterios limita o tamanho das listas e dos termos', () => {
  const c = normalizarCriterios({ setores: Array.from({ length: 50 }, (_, i) => `setor ${i}`), palavrasChave: ['x'.repeat(500)] })
  assertEquals(c.setores.length, 20)
  assertEquals(c.palavrasChave[0].length, 80)
})

Deno.test('cnaeValido aceita a máscara e recusa o que não tem 7 dígitos', () => {
  assertEquals(cnaeValido('6201-5/01'), '6201501')
  assertEquals(cnaeValido(6201501), '6201501')
  assertEquals(cnaeValido('62015'), null)
  assertEquals(cnaeValido(null), null)
})

Deno.test('faltaParaBuscar diz o que falta em palavras do produto', () => {
  assertEquals(faltaParaBuscar(criteriosVazios()), 'Informe ao menos um setor ou uma palavra-chave.')
  assertEquals(faltaParaBuscar({ ...criteriosVazios(), setores: ['Software'] }), null)
  assertEquals(faltaParaBuscar({ ...criteriosVazios(), palavrasChave: ['dados'] }), null)
  assertEquals(
    faltaParaBuscar({ ...criteriosVazios(), fonte: 'receita' }),
    'Informe ao menos um CNAE de 7 dígitos para buscar na Receita Federal.',
  )
  assertEquals(faltaParaBuscar({ ...criteriosVazios(), fonte: 'receita', cnaes: ['6201501'] }), null)
})
