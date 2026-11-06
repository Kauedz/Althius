// A avaliação de geração (contexto-da-empresa 02): os seis casos da spec passam pela leitura real do site, com o motor
// trocado por um falso. Aqui se confere o que não depende do modelo: quais páginas chegam ao motor, que o site
// insuficiente para antes de gastar e que a rubrica pega as falhas graves. A qualidade com o modelo de verdade roda em
// `scripts/avaliar-contexto-da-empresa.ts` e é revisada por uma pessoa (ticket 08).
import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { Llm } from '../_shared/cascata-de-sinais/tipos.ts'
import { gerar } from './handler.ts'
import { CASOS, conferirRubrica, fetchDoCaso } from './__fixtures__/sites.ts'

const WORKSPACE = '17000000-0000-4000-8000-000000000002'

function llmQueGuarda(registro: { usuario?: string; chamadas: number }): Llm {
  return {
    json: (a) => {
      registro.chamadas++
      registro.usuario = a.usuario
      return Promise.resolve({ json: { suficiente: false }, custoUsd: 0 })
    },
  }
}

Deno.test('avaliação: os seis tipos de caso da spec estão cobertos', () => {
  assertEquals(
    new Set(CASOS.map((c) => c.tipo)),
    new Set(['saas', 'industria', 'consultoria', 'empresa_nova', 'varios_icps', 'site_insuficiente']),
  )
})

for (const caso of CASOS) {
  Deno.test(`avaliação ${caso.id}: o motor recebe só as páginas do site, e site insuficiente não chega a ele`, async () => {
    const registro = { chamadas: 0 } as { usuario?: string; chamadas: number }
    const resultado = await gerar({ site: caso.dominio, workspaceId: WORKSPACE, llm: llmQueGuarda(registro), fetchFn: fetchDoCaso(caso) })

    if (!caso.esperado.suficiente) {
      assertEquals(registro.chamadas, 0)
      assertEquals(resultado.falha, 'site_insuficiente')
      assertEquals(conferirRubrica(caso, resultado), [])
      return
    }
    assertEquals(registro.chamadas, 1)
    const lidas = [...registro.usuario!.matchAll(/<pagina url="([^"]+)">/g)].map((m) => m[1])
    for (const url of lidas) assert(url in caso.paginas, url)
    // As páginas de oferta, soluções, clientes e casos que a home liga entram; blog não.
    assert(lidas.every((url) => !url.includes('/blog')))
    assertEquals(lidas.length, Object.keys(caso.paginas).length)
  })
}

Deno.test('rubrica: confundir empresa e compradores, inventar e perder um ICP são reprovados', () => {
  const saas = CASOS.find((c) => c.id === 'saas-de-cobranca')!
  assertEquals(
    conferirRubrica(saas, {
      falha: null,
      textos: {
        empresa: 'O CobraFácil vende régua de cobrança para receitas recorrentes por assinatura e boleto.',
        icp: 'ICP primário: escolas de idiomas e academias com mensalidade.',
        personas: 'Gerente financeiro — decide.',
      },
    }),
    [],
  )
  const confundida = conferirRubrica(saas, {
    falha: null,
    textos: { empresa: 'Rede de academias que atende 3.000 clientes.', icp: 'Alunos de academia.', personas: 'Personal trainer.' },
  })
  assert(confundida.some((p) => p.includes('oferta')))
  assert(confundida.some((p) => p.includes('falha grave')))

  const varios = CASOS.find((c) => c.tipo === 'varios_icps')!
  assert(
    conferirRubrica(varios, {
      falha: null,
      textos: { empresa: 'Telemetria de frota.', icp: 'ICP primário: transportadoras.', personas: 'Gerente de frota.' },
    }).some((p) => p.includes('menos de 2')),
  )
})
