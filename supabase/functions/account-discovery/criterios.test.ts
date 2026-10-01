// Os filtros da busca e a sugestão que sai do ICP do Playbook. Textos e empresas fictícios.
import { assertEquals } from 'jsr:@std/assert@1'
import { cnaeValido, criteriosDoIcp, criteriosVazios, faixasDoTexto, faltaParaBuscar, normalizarCriterios } from './criterios.ts'
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

Deno.test('faixasDoTexto cobre intervalos, limites abertos e número solto', () => {
  assertEquals(faixasDoTexto('51-200 funcionários'), ['51-200'])
  assertEquals(faixasDoTexto('201 a 1000 funcionários'), ['201-500', '501-1000'])
  assertEquals(faixasDoTexto('de 50 a 200'), ['11-50', '51-200'])
  assertEquals(faixasDoTexto('mais de 1000'), ['501-1000', '1001-5000', '5001-10000', '10001+'])
  assertEquals(faixasDoTexto('acima de 10.000'), ['5001-10000', '10001+'])
  assertEquals(faixasDoTexto('1000+'), ['501-1000', '1001-5000', '5001-10000', '10001+'])
  assertEquals(faixasDoTexto('até 50'), ['1-10', '11-50'])
  assertEquals(faixasDoTexto('300 pessoas'), ['201-500'])
  assertEquals(faixasDoTexto('empresas médias'), [])
})

Deno.test('criteriosDoIcp lê os rótulos em "Rótulo: valores"', () => {
  const c = criteriosDoIcp({
    texto: [
      'ICP da Acme',
      'Setor: Software, Fintech',
      'Porte: 51-200 funcionários',
      'Região: SP, Minas Gerais, Brasil',
      'Tecnologias: AWS; Kubernetes',
      'Palavras-chave: dados, analytics',
      'Excluir: varejo, governo',
      'Observação: tanto faz',
    ].join('\n'),
  })
  assertEquals(c.fonte, 'linkedin')
  assertEquals(c.setores, ['Software', 'Fintech'])
  assertEquals(c.portes, ['51-200'])
  assertEquals(c.regioes, ['SP', 'Minas Gerais', 'Brasil'])
  assertEquals(c.tecnologias, ['AWS', 'Kubernetes'])
  assertEquals(c.palavrasChave, ['dados', 'analytics'])
  assertEquals(c.excluir, ['varejo', 'governo'])
})

Deno.test('criteriosDoIcp lê as linhas da planilha do setup, com as células separadas por barra', () => {
  const c = criteriosDoIcp({
    texto: [
      'ICP – Quem Buscamos',
      'Segmento | Logística | Indústria',
      'Tamanho da empresa | 201 a 500 | 501-1000',
      'Localização | Sul do Brasil | PR | SC | RS',
      'Stack | SAP',
      'Linha sem rótulo conhecido | qualquer coisa',
    ].join('\n'),
  })
  assertEquals(c.setores, ['Logística', 'Indústria'])
  assertEquals(c.portes, ['201-500', '501-1000'])
  assertEquals(c.regioes, ['Sul do Brasil', 'PR', 'SC', 'RS'])
  assertEquals(c.tecnologias, ['SAP'])
})

Deno.test('criteriosDoIcp lê as linhas estruturadas da seção e ignora o que não reconhece', () => {
  const c = criteriosDoIcp({
    linhas: [
      { segmento: 'Saúde', porte: 'mais de 1000', observacao: 'x' },
      { segmento: 'Educação', cnae: '8532-5/00' },
    ],
  })
  assertEquals(c.setores, ['Saúde', 'Educação'])
  assertEquals(c.portes, ['501-1000', '1001-5000', '5001-10000', '10001+'])
  assertEquals(c.cnaes, ['8532500'])
})

Deno.test('criteriosDoIcp: com CNAE e sem setor, a busca sugerida é a da Receita Federal', () => {
  const c = criteriosDoIcp({ texto: 'CNAE: 6201-5/01, 6202-3/00\nEstado: SP' })
  assertEquals(c.fonte, 'receita')
  assertEquals(c.cnaes, ['6201501', '6202300'])
  assertEquals(c.regioes, ['SP'])
})

Deno.test('criteriosDoIcp: um ICP sem nenhum rótulo conhecido não sugere nada', () => {
  assertEquals(criteriosDoIcp({ texto: 'Vendemos para empresas que querem crescer.' }), criteriosVazios())
  assertEquals(criteriosDoIcp({}), criteriosVazios())
})
