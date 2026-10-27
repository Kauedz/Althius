import { assert, assertEquals } from 'jsr:@std/assert@1'
import { CAMPOS_POR_TIPO, LIMITES_DO_PLANO, type PlanoDoSinal, tiposAceitosNoPlano, validarCriterios, validarPlano } from './index.ts'

const CONTA_A = 'a1000000-0000-4000-8000-000000000001'
const CONTA_B = 'a1000000-0000-4000-8000-000000000002'
const ACEITOS = ['vaga_linkedin', 'nova_lideranca', 'anuncio_meta']

function plano(parcial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    versao: 1,
    origem: 'briefing',
    escopo: { tipo: 'contas', contaIds: [CONTA_A, CONTA_B] },
    sinais: [{ tipo: 'vaga_linkedin', criterios: { funcoes: ['RevOps e GTM', 'SDR'], periodo: 'Últimos 30 dias' } }],
    explicacao: 'Acompanha vagas de RevOps nas Contas escolhidas.',
    maxEmpresasPorRodada: 50,
    ...parcial,
  }
}

function recusado(entrada: unknown, motivo: string) {
  const r = validarPlano(entrada, ACEITOS)
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.motivo.split(':')[0], motivo)
}

Deno.test('um Plano válido passa e volta limpo', () => {
  const r = validarPlano(plano({ explicacao: '  Acompanha   vagas.  ' }), ACEITOS)
  assert(r.ok)
  const esperado: PlanoDoSinal = {
    versao: 1,
    origem: 'briefing',
    escopo: { tipo: 'contas', contaIds: [CONTA_A, CONTA_B] },
    sinais: [{ tipo: 'vaga_linkedin', criterios: { funcoes: ['RevOps e GTM', 'SDR'], periodo: 'Últimos 30 dias' } }],
    explicacao: 'Acompanha vagas.',
    maxEmpresasPorRodada: 50,
  }
  assertEquals(r.plano, esperado)
})

Deno.test('o tipo precisa estar entre os aceitos: inexistente, em teste ou sem campos conhecidos são recusados', () => {
  recusado(plano({ sinais: [{ tipo: 'tipo_que_nao_existe', criterios: {} }] }), 'tipo_indisponivel')
  recusado(plano({ sinais: [{ tipo: 'vaga_indeed', criterios: {} }] }), 'tipo_indisponivel')
  recusado(plano({ sinais: [{ tipo: '__proto__', criterios: {} }] }), 'tipo_indisponivel')
  // O banco diz que está disponível, mas não se sabe o que o adaptador lê: o Plano não o aceita.
  assertEquals(tiposAceitosNoPlano(['vaga_linkedin', 'sem_adaptador_conhecido', 'vaga_linkedin']), ['vaga_linkedin'])
})

Deno.test('exatamente um Sinal por Plano (decidido pelo Kauê em 24/10/2026)', () => {
  const um = { tipo: 'vaga_linkedin', criterios: {} }
  recusado(plano({ sinais: [] }), 'sinais')
  recusado(plano({ sinais: [um, um] }), 'sinais')
  recusado(plano({ sinais: { tipo: 'vaga_linkedin' } }), 'sinais')
})

Deno.test('as Contas: de 1 a 500, uuid, sem repetir (decidido pelo Kauê em 24/10/2026)', () => {
  const contas = (n: number) => Array.from({ length: n }, (_, i) => `b0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`)
  assert(validarPlano(plano({ escopo: { tipo: 'contas', contaIds: contas(LIMITES_DO_PLANO.contasEscolhidasMax) } }), ACEITOS).ok)
  recusado(plano({ escopo: { tipo: 'contas', contaIds: contas(LIMITES_DO_PLANO.contasEscolhidasMax + 1) } }), 'contas')
  recusado(plano({ escopo: { tipo: 'contas', contaIds: [] } }), 'contas')
  recusado(plano({ escopo: { tipo: 'contas', contaIds: ['nao-e-uuid'] } }), 'contas')
  recusado(plano({ escopo: { tipo: 'contas', contaIds: [CONTA_A, CONTA_A.toUpperCase()] } }), 'contas')
})

Deno.test('o escopo mercado está previsto, mas não é oferecido', () => {
  recusado(plano({ escopo: { tipo: 'mercado' } }), 'escopo_nao_oferecido')
  recusado(plano({ escopo: { tipo: 'todas_as_contas' } }), 'escopo_nao_oferecido')
})

Deno.test('o máximo de empresas por Rodada é inteiro de 1 a 100 (decidido pelo Kauê em 24/10/2026)', () => {
  assert(validarPlano(plano({ maxEmpresasPorRodada: 1 }), ACEITOS).ok)
  assert(validarPlano(plano({ maxEmpresasPorRodada: 100 }), ACEITOS).ok)
  for (const invalido of [0, 101, 2.5, '50', null]) recusado(plano({ maxEmpresasPorRodada: invalido }), 'max_empresas')
})

Deno.test('versão, origem, chaves desconhecidas e explicação', () => {
  recusado(plano({ versao: 2 }), 'versao')
  recusado(plano({ origem: 'ia' }), 'origem')
  recusado(plano({ executar: true }), 'chave_desconhecida')
  recusado(plano({ explicacao: 'a'.repeat(LIMITES_DO_PLANO.explicacaoMax + 1) }), 'explicacao')
  assert(validarPlano(plano({ explicacao: 'a'.repeat(LIMITES_DO_PLANO.explicacaoMax) }), ACEITOS).ok)
  assert(validarPlano(plano({ origem: 'modelo', modeloId: 'rev-ops-1' }), ACEITOS).ok)
  assert(validarPlano(plano({ origem: 'formulario' }), ACEITOS).ok)
  recusado(plano({ modeloId: 'rev-ops-1' }), 'modelo')
  recusado('texto', 'plano')
  recusado(null, 'plano')
})

Deno.test('os critérios só levam os campos que o adaptador do tipo lê', () => {
  recusado(plano({ sinais: [{ tipo: 'anuncio_meta', criterios: { funcoes: ['SDR'] } }] }), 'campo_fora_do_tipo')
  recusado(plano({ sinais: [{ tipo: 'vaga_linkedin', criterios: { nota: 'Até 2 estrelas' } }] }), 'campo_fora_do_tipo')
  assert(validarPlano(plano({ sinais: [{ tipo: 'nova_lideranca', criterios: { cargos: ['CTO'], movimento: ['Chegada'], pessoas: 'Qualquer pessoa no cargo', periodo: 'Últimos 90 dias', localizacao: ['Brasil'] } }] }), ACEITOS).ok)
})

Deno.test('os limites de cargos são os da tela: 60 caracteres, até 10 Custom, sem repetir', () => {
  const dez = Array.from({ length: 10 }, (_, i) => `Cargo ${i + 1}`)
  assert(validarCriterios('vaga_linkedin', { funcoes: dez }).ok)
  // As opções prontas não contam no limite dos Custom.
  assert(validarCriterios('vaga_linkedin', { funcoes: [...dez, 'Agrônomo', 'Finanças'] }).ok)
  assertEquals(validarCriterios('vaga_linkedin', { funcoes: [...dez, 'Cargo 11'] }).ok, false)
  assertEquals(validarCriterios('vaga_linkedin', { funcoes: ['a'.repeat(61)] }).ok, false)
  assert(validarCriterios('vaga_linkedin', { funcoes: ['a'.repeat(60)] }).ok)
  assertEquals(validarCriterios('vaga_linkedin', { funcoes: ['SDR', '  sdr '] }).ok, false)
  assertEquals(validarCriterios('vaga_linkedin', { funcoes: ['Agrônomo', 'agronomo'] }).ok, false)
  assertEquals(validarCriterios('vaga_linkedin', { funcoes: [''] }).ok, false)
  assertEquals(validarCriterios('vaga_linkedin', { funcoes: 'SDR' }).ok, false)
})

Deno.test('opções fechadas: senioridade, período, localização, movimento, pessoas e nota', () => {
  assertEquals(validarCriterios('vaga_linkedin', { senioridade: 'Diretoria' }).ok, false)
  assertEquals(validarCriterios('vaga_linkedin', { periodo: 'Últimos 3 dias' }).ok, false)
  assertEquals(validarCriterios('vaga_linkedin', { localizacao: ['Atlântida'] }).ok, false)
  assertEquals(validarCriterios('vaga_linkedin', { localizacao: ['Brasil', 'Brasil'] }).ok, false)
  assertEquals(validarCriterios('nova_lideranca', { movimento: ['Demissão'] }).ok, false)
  assertEquals(validarCriterios('nova_lideranca', { pessoas: 'Qualquer um' }).ok, false)
  assertEquals(validarCriterios('avaliacoes_google_maps', { nota: 'Até 1 estrela' }).ok, false)
  assert(validarCriterios('avaliacoes_google_maps', { nota: 'Até 2 estrelas', periodo: 'Últimos 7 dias', palavras: 'fila, demora' }).ok)
})

Deno.test('palavras, nicho e texto Custom têm limite', () => {
  assertEquals(validarCriterios('vaga_linkedin', { palavras: 'a'.repeat(LIMITES_DO_PLANO.palavrasMax + 1) }).ok, false)
  assertEquals(validarCriterios('vaga_linkedin', { nicho: 'Nicho Com Espaço' }).ok, false)
  assertEquals(validarCriterios('vaga_linkedin', { nichoCustom: 'a'.repeat(61) }).ok, false)
  assert(validarCriterios('vaga_linkedin', { nicho: 'custom', nichoCustom: 'Óleo e gás' }).ok)
  assert(validarCriterios('vaga_linkedin', { nicho: 'logistica-e-transporte' }).ok)
})

Deno.test('os recortes prontos e escritos têm limites próprios e mantêm compatibilidade', () => {
  assert(validarCriterios('vaga_linkedin', { nichos: ['logistica-e-transporte'], nichosCustom: ['Seguros'] }).ok)
  assert(validarCriterios('vaga_indeed', { nichos: ['agro-b2b'], nichosCustom: ['Naval'] }).ok)
  assert(validarCriterios('vaga_linkedin', { nicho: 'custom', nichoCustom: 'Naval' }).ok)
  for (const nichos of [['desconhecido'], ['agro-b2b', 'agro-b2b'], [2]]) {
    assertEquals(validarCriterios('vaga_linkedin', { nichos }).ok, false)
  }
  for (const nichosCustom of [[''], ['x'.repeat(61)], ['Seguros', 'seguros'], [1], ['A', 'B', 'C', 'D', 'E', 'F']]) {
    assertEquals(validarCriterios('vaga_linkedin', { nichosCustom }).ok, false)
  }
})

Deno.test('todo tipo conhecido aceita critérios vazios', () => {
  for (const tipo of Object.keys(CAMPOS_POR_TIPO)) assert(validarCriterios(tipo, {}).ok, tipo)
})
