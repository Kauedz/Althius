// ICP F: as funções puras de dados da empresa (CNPJ da matriz e endereço da sede). Vetores de CNPJ conferidos com a regra do
// dígito verificador (módulo 11; no formato alfanumérico, valor = código ASCII − 48) e com os exemplos publicados.
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1'
import { cnpjDaMatriz, enderecoDoItem, formatarCnpj, hashCurto, mudancaDeSede, tituloDoMunicipio } from './icp-f-dados.ts'

Deno.test('o CNPJ da matriz é a raiz, 0001 e os dígitos verificadores (numérico e alfanumérico)', () => {
  assertEquals(cnpjDaMatriz('47.960.950/0001-21'), '47960950000121')
  assertEquals(cnpjDaMatriz('34848473000246'), '34848473000165', 'uma filial aponta para a matriz da mesma raiz')
  assertEquals(cnpjDaMatriz('00000000000191'), '00000000000191')
  assertEquals(cnpjDaMatriz('12abc34501de35'), '12ABC345000188', 'a raiz alfanumérica vale em maiúsculas')
})

Deno.test('o CNPJ da matriz é vazio para o que não é CNPJ', () => {
  assertEquals([cnpjDaMatriz(''), cnpjDaMatriz(null), cnpjDaMatriz('123'), cnpjDaMatriz('47.960.950/0001')], ['', '', '', ''])
})

Deno.test('o CNPJ formatado leva a máscara', () => {
  assertEquals(formatarCnpj('34848473000246'), '34.848.473/0002-46')
})

Deno.test('o endereço da sede guarda município, UF e só a marca (hash) da rua e do CEP, nunca o texto', () => {
  const e = enderecoDoItem({ cnpj: '47960950000121', endereco: { logradouro: 'AVENIDA DOUTOR CHUCRI ZAIDAN', numero: '1240', municipio: 'SAO PAULO', uf: 'sp', cep: '04711130', bairro: 'VILA SAO FRANCISCO' } })!
  assertEquals([e.municipio, e.uf], ['SAO PAULO', 'SP'])
  assert(e.via.length > 0 && e.cep.length > 0)
  const guardado = JSON.stringify(e)
  assert(!/chucri|zaidan|1240|04711130|francisco/i.test(guardado), guardado)
})

Deno.test('o endereço sem município e UF não serve', () => {
  assertEquals(enderecoDoItem({ cnpj: '1', endereco: { logradouro: 'RUA A' } }), null)
  assertEquals(enderecoDoItem({ cnpj: '1' }), null)
})

const sede = (extra: Record<string, unknown> = {}) =>
  enderecoDoItem({ cnpj: '47960950000121', endereco: { logradouro: 'AVENIDA PAULISTA', numero: '1000', municipio: 'SAO PAULO', uf: 'SP', cep: '01310100', ...extra } })!

Deno.test('mudança de sede: outro município ou UF, outra rua ou número; o mesmo endereço escrito de outro jeito não conta', () => {
  assertEquals(mudancaDeSede(sede(), sede()), null)
  assertEquals(mudancaDeSede(sede(), sede({ municipio: 'BARUERI' })), 'municipio')
  assertEquals(mudancaDeSede(sede(), sede({ uf: 'RJ', municipio: 'RIO DE JANEIRO' })), 'uf')
  assertEquals(mudancaDeSede(sede(), sede({ numero: '2000' })), 'endereco')
  assertEquals(mudancaDeSede(sede(), sede({ logradouro: 'RUA AUGUSTA' })), 'endereco')
  // O tipo do logradouro escrito por extenso, abreviado ou ausente, e a caixa e o acento, são o mesmo endereço.
  assertEquals(mudancaDeSede(sede(), sede({ logradouro: 'Av. Paulista' })), null)
  assertEquals(mudancaDeSede(sede(), sede({ logradouro: 'PAULISTA' })), null)
  assertEquals(mudancaDeSede(sede({ municipio: 'SÃO PAULO' }), sede()), null)
})

Deno.test('mudança de sede: sem rua num dos lados, só município, UF e CEP decidem', () => {
  const semRua = (extra: Record<string, unknown> = {}) => sede({ logradouro: '', numero: '', ...extra })
  assertEquals(mudancaDeSede(sede(), semRua()), null)
  assertEquals(mudancaDeSede(sede(), semRua({ municipio: 'BARUERI' })), 'municipio')
  assertEquals(mudancaDeSede(sede(), semRua({ cep: '06454000' })), 'endereco')
})

Deno.test('o hash é estável e distingue textos', () => {
  assertEquals(hashCurto('abc'), hashCurto('abc'))
  assertNotEquals(hashCurto('abc'), hashCurto('abd'))
})

Deno.test('o município aparece em português ("SAO PAULO" vira "Sao Paulo", com as preposições em minúsculas)', () => {
  assertEquals(tituloDoMunicipio('SANTANA DE PARNAIBA'), 'Santana de Parnaiba')
  assertEquals(tituloDoMunicipio('RIO DE JANEIRO'), 'Rio de Janeiro')
})
