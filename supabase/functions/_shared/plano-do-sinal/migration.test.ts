// O Plano no código e no banco dizem o mesmo: os limites, os campos de cada tipo, as opções fechadas e as listas de
// cargos prontos. Lê as migrations e os adaptadores do signal-runner: precisa de --allow-read (o passo próprio do CI);
// sem a permissão, os testes que leem arquivos são ignorados.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { CAMPOS_POR_TIPO, CARGOS_PRONTOS, FUNCOES_PRONTAS, LIMITES_DO_PLANO, OPCOES } from './index.ts'

const MIGRATIONS = new URL('../../../migrations/', import.meta.url)
const ADAPTADORES = new URL('../../signal-runner/adaptadores/', import.meta.url)
const podeLer = (await Deno.permissions.query({ name: 'read', path: MIGRATIONS })).state === 'granted'

async function ler(pasta: URL, arquivo: string): Promise<string> {
  return await Deno.readTextFile(new URL(arquivo, pasta))
}

/** O corpo de uma função da migration do Plano, do `create function` ao `$$;` final. */
function corpoDa(sql: string, funcao: string): string {
  const inicio = sql.indexOf(`create function ${funcao}(`)
  assert(inicio >= 0, `a função ${funcao} não está na migration`)
  return sql.slice(inicio, sql.indexOf('\n$$;', inicio))
}

const strings = (trecho: string) => [...trecho.matchAll(/'([^']*)'/g)].map((m) => m[1])

Deno.test({
  name: 'os limites do banco são os do servidor',
  ignore: !podeLer,
  async fn() {
    const sql = await ler(MIGRATIONS, '20261116120000_briefing_e_plano_do_sinal.sql')
    const doBanco = new Map([...corpoDa(sql, 'private.signal_plan_limit').matchAll(/when '(\w+)' then (\d+)/g)].map((m) => [m[1], Number(m[2])]))
    const esperado = new Map(Object.entries({
      brief_max: LIMITES_DO_PLANO.briefingMax,
      explanation_max: LIMITES_DO_PLANO.explicacaoMax,
      plan_max_chars: LIMITES_DO_PLANO.planoMaxCaracteres,
      signals_per_plan: LIMITES_DO_PLANO.sinaisPorPlano,
      accounts_max: LIMITES_DO_PLANO.contasEscolhidasMax,
      per_round_min: LIMITES_DO_PLANO.empresasPorRodadaMin,
      per_round_max: LIMITES_DO_PLANO.empresasPorRodadaMax,
      custom_text_max: LIMITES_DO_PLANO.textoCustomMax,
      custom_roles_max: LIMITES_DO_PLANO.cargosCustomMax,
      list_items_max: LIMITES_DO_PLANO.itensDeListaMax,
      keywords_max: LIMITES_DO_PLANO.palavrasMax,
      seed_max: LIMITES_DO_PLANO.modeloIdMax,
      plans_per_day: LIMITES_DO_PLANO.planosPorDia,
    }))
    assertEquals([...doBanco].sort(), [...esperado].sort())
  },
})

Deno.test({
  name: 'os campos de cada tipo são os mesmos no banco e no servidor',
  ignore: !podeLer,
  async fn() {
    const sql = await ler(MIGRATIONS, '20261116120000_briefing_e_plano_do_sinal.sql')
    const doBanco = new Map(
      [...corpoDa(sql, 'private.signal_plan_criteria_keys').matchAll(/when '(\w+)' then array\[([^\]]*)\]/g)]
        .map((m) => [m[1], strings(m[2]).toSorted()]),
    )
    const doServidor = new Map(Object.entries(CAMPOS_POR_TIPO).map(([tipo, campos]) => [tipo, [...campos].toSorted()]))
    assertEquals([...doBanco].sort(), [...doServidor].sort())
  },
})

Deno.test({
  name: 'as opções fechadas e os cargos prontos são os mesmos no banco e no servidor',
  ignore: !podeLer,
  async fn() {
    const sql = await ler(MIGRATIONS, '20261116120000_briefing_e_plano_do_sinal.sql')
    const criterios = corpoDa(sql, 'private.validate_signal_plan_criteria')
    const lista = (itens: readonly string[]) => `array[${itens.map((i) => `'${i}'`).join(', ')}]`
    for (const campo of ['senioridade', 'periodo', 'pessoas', 'nota', 'movimento'] as const) {
      assert(criterios.includes(lista(OPCOES[campo])), `as opções de ${campo} divergem do banco`)
    }
    // A localização é a lista de países que o mercado já usa (`private.market_countries`).
    const mercado = await ler(MIGRATIONS, '20261114120000_vagas_no_mercado_enderecavel.sql')
    const paises = strings(mercado.slice(mercado.indexOf('create or replace function private.market_countries'), mercado.indexOf('create or replace function private.brazilian_states')))
    assertEquals(paises.filter(Boolean), [...OPCOES.localizacao])

    const prontos = corpoDa(sql, 'private.signal_plan_ready_titles')
    assertEquals(strings(prontos.slice(prontos.indexOf('unnest'))), [...CARGOS_PRONTOS])
    const sugeridas = mercado.slice(mercado.indexOf('create or replace function private.suggested_job_roles'), mercado.indexOf('create or replace function private.market_countries'))
    assertEquals(strings(sugeridas.slice(sugeridas.indexOf('unnest'))), [...FUNCOES_PRONTAS])
  },
})

Deno.test({
  name: 'cada campo de critério do Plano é lido por algum adaptador do signal-runner',
  ignore: !podeLer,
  async fn() {
    let fontes = ''
    for await (const arquivo of Deno.readDir(ADAPTADORES)) {
      if (arquivo.name.endsWith('.ts') && !arquivo.name.endsWith('.test.ts')) fontes += await ler(ADAPTADORES, arquivo.name)
    }
    const campos = new Set(Object.values(CAMPOS_POR_TIPO).flat())
    for (const campo of campos) assert(fontes.includes(`criterios.${campo}`), `nenhum adaptador lê criterios.${campo}`)
  },
})
