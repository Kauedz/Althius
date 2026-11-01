import { assertEquals } from 'jsr:@std/assert@1'
import { briefingFalaDeLugar, paisesDoTexto } from './icp-nos-criterios.ts'

Deno.test('geografia do ICP vira países das opções do Plano: UF e região do Brasil viram Brasil', () => {
  assertEquals(paisesDoTexto('Sul do Brasil (Paraná, Santa Catarina e Rio Grande do Sul)'), ['Brasil'])
  assertEquals(paisesDoTexto('SP, RJ'), ['Brasil'])
  assertEquals(paisesDoTexto('Brasil e México'), ['Brasil', 'México'])
  assertEquals(paisesDoTexto('EUA'), ['Estados Unidos'])
  assertEquals(paisesDoTexto('Europa'), [])
  assertEquals(paisesDoTexto(''), [])
})

Deno.test('Briefing fala de lugar só quando cita país, estado ou palavra de lugar; preposições e siglas soltas não contam', () => {
  assertEquals(briefingFalaDeLugar('Quero saber quando empresas abrirem vagas de liderança comercial para o time.'), false)
  assertEquals(briefingFalaDeLugar('vagas de CTO em São Paulo'), true)
  assertEquals(briefingFalaDeLugar('vagas no México'), true)
  assertEquals(briefingFalaDeLugar('empresas da minha região'), true)
})
