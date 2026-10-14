// A nota final e o decaimento dos Sinais. Os números têm de ser os do banco (`private.discovery_signal_decay`,
// `private.discovery_note` e `private.discovery_level`, migração 20261018130000): o teste de pgTAP confere os mesmos pontos.
import { assert, assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1'
import { MAPA_DE_SINAIS } from '../_shared/mapa-de-sinais.ts'
import {
  compararCandidatas,
  CORTE_ALTO,
  CORTE_MEDIO,
  decaimentoDoSinal,
  DIAS_ATE_ZERO,
  DIAS_DE_PESO_CHEIO,
  nivelDaNota,
  notaFinal,
  PESO_DO_SINAL,
  PESO_PADRAO_DO_SINAL,
  pesoDoSinal,
  TETO_DOS_SINAIS,
} from './pontuacao.ts'

const AGORA = Date.parse('2026-10-14T12:00:00Z')
const diasAtras = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()

Deno.test('o decaimento: peso cheio até 30 dias, zero aos 90, linear entre os dois', () => {
  assertEquals(decaimentoDoSinal(0), 1)
  assertEquals(decaimentoDoSinal(-1), 1)
  assertEquals(decaimentoDoSinal(30), 1)
  assertEquals(decaimentoDoSinal(60), 0.5)
  assertEquals(decaimentoDoSinal(75), 0.25)
  assertEquals(decaimentoDoSinal(90), 0)
  assertEquals(decaimentoDoSinal(200), 0)
  assertAlmostEquals(decaimentoDoSinal(45), 0.75, 1e-9)
})

Deno.test('as constantes são as do banco', () => {
  assertEquals([DIAS_DE_PESO_CHEIO, DIAS_ATE_ZERO, TETO_DOS_SINAIS, CORTE_ALTO, CORTE_MEDIO], [30, 90, 60, 75, 45])
  assertEquals(PESO_PADRAO_DO_SINAL, 20)
})

Deno.test('o peso depende do tipo; o que não está na tabela pesa o padrão', () => {
  assertEquals(pesoDoSinal('financiamento_bndes_finep'), 40)
  assertEquals(pesoDoSinal('vaga_comex'), 30)
  assertEquals(pesoDoSinal('renovacao_de_apolice'), 15)
  assertEquals(pesoDoSinal('um_tipo_novo'), PESO_PADRAO_DO_SINAL)
  for (const [tipo, peso] of Object.entries(PESO_DO_SINAL)) {
    assert([15, 30, 40].includes(peso), `${tipo} pesa ${peso}, fora das três faixas`)
    assert(/^[a-z][a-z0-9_]+$/.test(tipo))
  }
})

Deno.test('a nota é o Encaixe ICP mais os Sinais com decaimento (o mesmo caso do pgTAP: 40 + 35 + 15 = 90)', () => {
  const nota = notaFinal(40, [
    { tipo: 'nova_filial_icp_g', peso: 35, disparadoEm: diasAtras(10) },
    { tipo: 'expansao_de_planta', peso: 30, disparadoEm: diasAtras(60) },
  ], AGORA)
  assertEquals(nota, 90)
})

Deno.test('só Sinal: o peso do tipo; Sinal de mais de 90 dias não pesa; os Sinais somam no máximo 60', () => {
  assertEquals(notaFinal(0, [{ tipo: 'financiamento_bndes_finep', disparadoEm: diasAtras(1) }], AGORA), 40)
  assertEquals(notaFinal(10, [{ tipo: 'nova_filial_icp_g', peso: 40, disparadoEm: diasAtras(100) }], AGORA), 10)
  const muitos = Array.from({ length: 4 }, () => ({ tipo: 'nova_filial_icp_g', disparadoEm: diasAtras(0) }))
  assertEquals(notaFinal(0, muitos, AGORA), TETO_DOS_SINAIS)
  assertEquals(notaFinal(30, muitos, AGORA), 90)
})

Deno.test('o nível: 75 alto, 45 médio, o resto baixo; sem Encaixe nem Sinal, sem dado', () => {
  assertEquals(nivelDaNota(75, false), 'alto')
  assertEquals(nivelDaNota(74.9, false), 'medio')
  assertEquals(nivelDaNota(45, false), 'medio')
  assertEquals(nivelDaNota(44.9, false), 'baixo')
  assertEquals(nivelDaNota(0, false), 'sem_dado')
  assertEquals(nivelDaNota(0, true), 'baixo')
})

Deno.test('a ordem: a maior nota e, no empate, o Sinal mais recente (e quem não tem Sinal por último)', () => {
  const lista = [
    { nome: 'Dez', nota: 10, ultimoSinalEm: null },
    { nome: 'Antiga', nota: 35, ultimoSinalEm: diasAtras(5) },
    { nome: 'Recente', nota: 35, ultimoSinalEm: diasAtras(1) },
    { nome: 'Noventa', nota: 90, ultimoSinalEm: diasAtras(10) },
    { nome: 'DezComSinal', nota: 10, ultimoSinalEm: diasAtras(100) },
  ]
  assertEquals(lista.sort(compararCandidatas).map((c) => c.nome), ['Noventa', 'Recente', 'Antiga', 'DezComSinal', 'Dez'])
})

Deno.test('todo Sinal do Mapa de Mercado tem peso próprio (nenhum cai no padrão por esquecimento)', () => {
  for (const m of Object.values(MAPA_DE_SINAIS)) {
    for (const tipo of m.sinais) assert(tipo in PESO_DO_SINAL, `${tipo} está no Mapa e não tem peso em PESO_DO_SINAL`)
  }
})

// A curva e os cortes também estão no banco. Lê a migração: precisa de --allow-read (o passo próprio do CI); sem a
// permissão, o teste é ignorado.
const MIGRACAO = new URL('../../migrations/20261018130000_nota_e_lista_da_descoberta.sql', import.meta.url)
const podeLer = (await Deno.permissions.query({ name: 'read', path: MIGRACAO })).state === 'granted'

Deno.test({
  name: 'o banco usa os mesmos números: 30 e 90 dias, teto de 60 e cortes 75 e 45',
  ignore: !podeLer,
  async fn() {
    const sql = await Deno.readTextFile(MIGRACAO)
    assert(sql.includes(`/ 86400.0 <= ${DIAS_DE_PESO_CHEIO} then 1`), 'peso cheio até os dias da constante')
    assert(sql.includes(`/ 86400.0 >= ${DIAS_ATE_ZERO} then 0`), 'zero a partir dos dias da constante')
    assert(sql.includes(`(${DIAS_ATE_ZERO} - extract(epoch from (p_now - p_fired_at)) / 86400.0) / ${DIAS_ATE_ZERO - DIAS_DE_PESO_CHEIO}.0`), 'reta entre os dois')
    assert(sql.includes(`least(${TETO_DOS_SINAIS}::numeric`), 'teto dos Sinais')
    assert(sql.includes(`p_note >= ${CORTE_ALTO} then 'alto'`), 'corte do alto')
    assert(sql.includes(`p_note >= ${CORTE_MEDIO} then 'medio'`), 'corte do médio')
    assert(sql.includes(`coalesce(p_weight, ${PESO_PADRAO_DO_SINAL})`) || (await Deno.readTextFile(new URL('../../migrations/20261018110000_resolucao_do_sinal_em_conta_ou_candidata.sql', import.meta.url))).includes(`coalesce(p_weight, ${PESO_PADRAO_DO_SINAL})`), 'peso padrão')
  },
})
