// O percurso inteiro do Contexto da empresa (contexto-da-empresa, ticket 08), pelos módulos de verdade, com o site, a IA
// e o fornecedor trocados por respostas controladas: site → os três textos → filtros do Mercado ligados ao texto →
// ajustes que não tocam o contexto → busca por perfis → Aderência explicada contra o contexto usado → o mesmo contexto
// para as quatro Especialidades. A vigência, as permissões e a concorrência são do banco (pgTAP
// `geracao_do_contexto_pelo_site.sql`, `contexto_da_empresa.sql`); aqui o "banco" só guarda a versão vigente.
// Empresas fictícias (o caso `varios-icps` dos sites de avaliação).
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1'
import type { Llm } from '../_shared/cascata-de-sinais/tipos.ts'
import { contextoDaEmpresa, ESPECIALIDADES } from '../_shared/orquestracao.ts'
import { avaliarAderencia, type ContextoDaBusca } from '../account-fit-explanation/explicacao.ts'
import type { Apify } from '../signal-scan/handler.ts'
import { createHandler as criarBusca, type Db as DbDaBusca, type RegistroPorPerfis } from '../account-discovery/handler.ts'
import { ACTOR_LINKEDIN_EMPRESAS, ACTOR_RECEITA } from '../account-discovery/normalizar.ts'
import { gerar } from './handler.ts'
import { CASOS, conferirRubrica, fetchDoCaso } from './__fixtures__/sites.ts'

const WS = '18000000-0000-4000-8000-000000000008'
const CASO = CASOS.find((c) => c.id === 'varios-icps')!

const EMPRESA = `A FrotaViva vende uma plataforma de gestão de frotas com telemetria.

O que vende
- Rastreamento, consumo de combustível e manutenção preventiva.
- Roteiros, jornada do motorista e custo por km.

Problemas que resolve
- Custo por km sem controle e manutenção corretiva cara.`

const ICP = `ICP primário: transportadoras de carga
- Transportadoras rodoviárias com 51 a 200 funcionários, sede em São Paulo.
- Precisam controlar a jornada do motorista e o custo por km.

ICP secundário: usinas e fazendas do agronegócio
- Usinas de cana com máquinas e caminhões próprios, no interior paulista.
- Sugestão a confirmar: grupos com faturamento acima de R$ 50 milhões.

ICP terciário: prefeituras com frota municipal
- Prefeituras do interior que prestam contas da frota.

Exclusões
- Locadoras de veículos de passeio.`

const PERSONAS = `Gerente de frota ou de operações logísticas — decide
- Responde pelo custo por km e pela disponibilidade dos veículos.

Secretário(a) de administração municipal — decide na prefeitura
- Precisa de relatórios para prestação de contas e licitação.`

/** O motor da geração: os três textos, como a IA devolveria. */
const motorDaGeracao: Llm = {
  json: () => Promise.resolve({ json: { suficiente: true, empresa: EMPRESA, icp: ICP, personas: PERSONAS }, custoUsd: 0.02 }),
}

/** O motor da preparação: critérios com o trecho de onde saíram, e dois que a IA inventou (o servidor descarta). */
const INTERPRETACAO = {
  perfis: [
    {
      nome: 'ICP primário',
      criterios: [
        { conceito: 'setor', valor: 'Transportadoras rodoviárias', trecho: 'Transportadoras rodoviárias com 51 a 200 funcionários, sede em São Paulo.' },
        { conceito: 'funcionarios', min: 51, max: 200, trecho: 'Transportadoras rodoviárias com 51 a 200 funcionários, sede em São Paulo.' },
        { conceito: 'sede', valor: 'São Paulo', trecho: 'Transportadoras rodoviárias com 51 a 200 funcionários, sede em São Paulo.' },
        // Inventado: o texto não fala do Rio de Janeiro.
        { conceito: 'sede', valor: 'Rio de Janeiro', trecho: 'sede no Rio de Janeiro' },
      ],
    },
    {
      nome: 'ICP secundário',
      criterios: [
        { conceito: 'setor', valor: 'Usinas de cana', trecho: 'Usinas de cana com máquinas e caminhões próprios, no interior paulista.' },
        { conceito: 'atuacao', valor: 'interior paulista', trecho: 'Usinas de cana com máquinas e caminhões próprios, no interior paulista.' },
        // Hipótese do texto: não vira filtro obrigatório, fica a verificar.
        { conceito: 'faturamento', min: 50, unidade: 'milhao', trecho: 'grupos com faturamento acima de R$ 50 milhões' },
        // Inventado: o texto não dá número de funcionários para o agro.
        { conceito: 'funcionarios', min: 500, trecho: 'Usinas de cana com máquinas e caminhões próprios, no interior paulista.' },
      ],
    },
    {
      nome: 'ICP terciário',
      criterios: [{ conceito: 'palavraChave', valor: 'Prefeituras', trecho: 'Prefeituras do interior que prestam contas da frota.' }],
    },
  ],
  exclusoes: [{ conceito: 'excluir', valor: 'Locadoras de veículos de passeio', trecho: 'Locadoras de veículos de passeio.' }],
}

const motorDaPreparacao: Llm = { json: () => Promise.resolve({ json: INTERPRETACAO, custoUsd: 0.001 }) }

const empresaNaFonte = (nome: string, setor: string, estado: string, funcionarios: number) => ({
  id: nome,
  universalName: nome.toLowerCase().replace(/\s+/g, '-'),
  linkedinUrl: `https://www.linkedin.com/company/${nome.toLowerCase().replace(/\s+/g, '-')}/`,
  name: nome,
  website: `https://${nome.toLowerCase().replace(/\s+/g, '')}.test`,
  employeeCount: funcionarios,
  description: `${setor} em ${estado}.`,
  locations: [{ country: 'BR', headquarter: true, parsed: { countryCode: 'BR', state: estado, city: estado } }],
  industries: [{ name: setor }],
})

type Perfil = RegistroPorPerfis['perfis'][number]

/** O Workspace do percurso: a versão vigente do contexto e o que a busca registrou e gravou. */
function workspace(opcoes: { fonte?: 'responde' | 'vazia' | 'falha' } = {}) {
  const banco = {
    vigente: null as null | { versao: number; empresa: string; icp: string; personas: string },
    registros: [] as RegistroPorPerfis[],
    gravadas: [] as Parameters<DbDaBusca['gravarCandidatas']>[1][],
    encerramentos: [] as Parameters<DbDaBusca['encerrar']>[0][],
    chamadasDaFonte: [] as Record<string, unknown>[],
  }
  const espera: Promise<unknown>[] = []
  const db: DbDaBusca = {
    userFromJwt: () => Promise.resolve({ userId: 'admin-1' }),
    lerContexto: () => Promise.resolve({ versao: banco.vigente?.versao ?? null, icp: banco.vigente?.icp ?? '' }),
    actoresDeBusca: () =>
      Promise.resolve([
        { actorId: ACTOR_LINKEDIN_EMPRESAS, state: 'available', version: 'v3', maxCostUsd: 0.6 },
        { actorId: ACTOR_RECEITA, state: 'available', version: 'v1', maxCostUsd: 1 },
      ]),
    iniciar: (a) => (
      banco.registros.push(a.criterios as RegistroPorPerfis),
        Promise.resolve({ runId: crypto.randomUUID(), outcome: 'go', state: 'em_andamento', actorVersion: 'v3' })
    ),
    gravarCandidatas: (_runId, candidatas) => (banco.gravadas.push(candidatas), Promise.resolve({ added: candidatas.length, duplicates: 0, ignored: 0 })),
    gravarCusto: () => Promise.resolve(),
    encerrar: (a) => (banco.encerramentos.push(a), Promise.resolve()),
  }
  const apify: Apify = {
    run: (a) => {
      const input = a.input as Record<string, unknown>
      banco.chamadasDaFonte.push(input)
      if (opcoes.fonte === 'falha') return Promise.reject(new Error('fornecedor fora do ar'))
      if (opcoes.fonte === 'vazia') return Promise.resolve({ runId: 'apify', items: [] })
      const query = String(input.searchQuery)
      const itens = query.includes('Transportadoras')
        ? [empresaNaFonte('Rota Sul Cargas', 'Transportadoras rodoviárias', 'São Paulo', 120)]
        : query.includes('Usinas')
        ? [empresaNaFonte('Usina Boa Safra', 'Usinas de cana', 'São Paulo', 900)]
        : [empresaNaFonte('Rota Sul Cargas', 'Transportadoras rodoviárias', 'São Paulo', 120)]
      return Promise.resolve({ runId: 'apify', items: itens })
    },
  }
  const busca = criarBusca({ db, llm: motorDaPreparacao, apify, appOrigin: 'https://app.test', waitUntil: (t) => espera.push(t), log: () => {} })
  async function pedir(corpo: Record<string, unknown>) {
    const res = await busca(new Request('https://fn.test/account-discovery', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt', apikey: 'chave', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: WS, ...corpo }),
    }))
    await Promise.all(espera.splice(0))
    return { status: res.status, corpo: await res.json() }
  }
  return { banco, pedir }
}

/** O contexto que a Aderência lê do registro da busca (como `get_discovery_fit_explanation_input`). */
function contextoDoRegistro(registro: RegistroPorPerfis): ContextoDaBusca {
  return {
    versao: registro.contexto.versao,
    perfis: registro.perfis.map((p) => ({
      nome: p.nome ?? '',
      aplicados: p.aplicados ?? [],
      pendentes: (p.pendentes ?? []).map((x) => ({ ...x, motivo: String(x.motivo) })),
    })),
  }
}

Deno.test('percurso: do site aos resultados de Mercado e aos Agentes, sempre o mesmo contexto vigente', async () => {
  const { banco, pedir } = workspace()

  // 1. O site vira os três textos, sem nada inventado (rubrica do caso), e a primeira geração fica vigente.
  const gerado = await gerar({ site: CASO.dominio, workspaceId: WS, llm: motorDaGeracao, fetchFn: fetchDoCaso(CASO) })
  assertEquals(gerado.falha, null)
  assertEquals(conferirRubrica(CASO, gerado), [])
  assert(gerado.fontes.length > 1)
  banco.vigente = { versao: 1, ...gerado.textos! }

  // 2. Mercado prepara um recorte por perfil, cada filtro ligado ao trecho; o inventado cai e a hipótese fica pendente.
  const { status, corpo: preparacao } = await pedir({ action: 'prepare' })
  assertEquals(status, 200)
  assertEquals(preparacao.estado, 'pronta')
  assertEquals(preparacao.contextoVersao, 1)
  const [primario, secundario, terciario] = preparacao.perfis as Perfil[]
  assertEquals(preparacao.perfis.map((p: Perfil) => p.nome), ['ICP primário', 'ICP secundário', 'ICP terciário'])
  for (const p of preparacao.perfis as Perfil[]) {
    for (const c of [...(p.aplicados ?? []), ...(p.pendentes ?? [])]) assert(ICP.replace(/\s+/g, ' ').includes(c.trecho), c.trecho)
    // A exclusão vale para todos os perfis.
    assertEquals(p.criterios.excluir, ['Locadoras de veículos de passeio'])
  }
  assertEquals(primario.criterios.regioes, ['SP'])
  assertEquals(primario.criterios.portes, ['51-200'])
  assertEquals(primario.pendentes, [])
  // As conjunções não se misturam: o agro não herda o porte nem a sede das transportadoras.
  assertEquals(secundario.criterios.setores, ['Usinas de cana'])
  assertEquals(secundario.criterios.portes, [])
  assertEquals(secundario.criterios.regioes, [])
  // A hipótese de faturamento e a atuação ficam a verificar; o número que a IA inventou não vira faixa: fica pendente
  // como "o texto não determina", à vista e sem filtrar.
  assertEquals(
    secundario.pendentes!.map((p) => [p.conceito, p.motivo]),
    [['atuacao', 'sem_suporte_na_fonte'], ['faturamento', 'sem_suporte_na_fonte'], ['funcionarios', 'ambiguo']],
  )
  assertEquals(terciario.criterios.palavrasChave, ['Prefeituras'])
  assertFalse(JSON.stringify(preparacao).includes('Rio de Janeiro'))

  // 3. Um ajuste na tela (tirar o terciário e a sede do primário) vale só para esta busca: o contexto não muda.
  const salvoAntes = structuredClone(banco.vigente)
  const ajustados = [
    { ...primario, criterios: { ...primario.criterios, regioes: [] } },
    secundario,
  ]
  const busca = await pedir({ action: 'search', perfis: ajustados, contextoVersao: 1, maxResults: 50 })
  assertEquals(busca.status, 202)
  assertEquals(banco.vigente, salvoAntes)
  assertEquals(banco.chamadasDaFonte.length, 2)
  assertEquals(banco.chamadasDaFonte[0].locations, undefined)

  // 4. A busca registra a versão do contexto e os filtros usados; a candidata do agro traz o pendente "a verificar".
  const [registro] = banco.registros
  assertEquals(registro.origem, 'contexto_da_empresa')
  assertEquals(registro.contexto, { versao: 1 })
  assertEquals(registro.perfis.map((p) => p.nome), ['ICP primário', 'ICP secundário'])
  assertEquals(banco.encerramentos.map((e) => e.success), [true])
  const usina = banco.gravadas[0].find((c) => c.name === 'Usina Boa Safra')!
  assert(usina.reasons.some((m) => m.criterio === 'pendente' && m.texto.includes('R$ 50 mi')), JSON.stringify(usina.reasons))

  // 5. A Aderência não é confirmada com requisito sem verificar, e é explicada contra o contexto que a busca usou.
  const aderencia = avaliarAderencia({ reasons: usina.reasons, contexto: contextoDoRegistro(registro) })
  assertEquals(aderencia.situacao, 'nao_confirmada')
  assert(aderencia.criterios.aVerificar.length >= 2)
  assertEquals(aderencia.contexto?.versao, 1)
  assertEquals(aderencia.contexto?.perfis, ['ICP secundário'])
  assert(aderencia.contexto!.trechos.every((t) => ICP.includes(t)))

  // 6. As quatro Especialidades recebem os mesmos três textos, com a versão.
  for (const especialidade of Object.keys(ESPECIALIDADES)) {
    const instrucao = contextoDaEmpresa({ version: 1, empresa: EMPRESA, icp: ICP, personas: PERSONAS }, especialidade)
    assert(instrucao.includes('versão 1'), especialidade)
    for (const texto of [EMPRESA, ICP, PERSONAS]) assert(instrucao.includes(texto), `${especialidade}: ${texto.slice(0, 20)}`)
    assertFalse(instrucao.toLowerCase().includes('playbook'))
  }
})

Deno.test('percurso: depois de uma edição salva, os filtros da versão anterior não rodam e a nova versão prepara de novo', async () => {
  const { banco, pedir } = workspace()
  banco.vigente = { versao: 1, empresa: EMPRESA, icp: ICP, personas: PERSONAS }
  const { corpo: antiga } = await pedir({ action: 'prepare' })

  // O Administrador salva uma edição: versão 2.
  banco.vigente = { ...banco.vigente, versao: 2, icp: ICP.replace('51 a 200', '51 a 500') }
  const recusada = await pedir({ action: 'search', perfis: antiga.perfis, contextoVersao: 1 })
  assertEquals(recusada.status, 409)
  assertEquals(recusada.corpo.code, 'contexto_mudou')
  assertEquals(banco.chamadasDaFonte.length, 0)

  const { corpo: nova } = await pedir({ action: 'prepare' })
  assertEquals(nova.contextoVersao, 2)
  // O motor falso repete o trecho antigo, que já não está no texto: o servidor não o aceita.
  assertFalse(nova.perfis.some((p: Perfil) => p.aplicados?.some((a) => a.trecho.includes('51 a 200'))))
})

Deno.test('percurso: sem contexto, falha de tradução, busca vazia e fonte fora do ar são resultados distintos', async () => {
  // Sem contexto vigente (onboarding pulado ou site insuficiente): Mercado leva às Configurações e não busca.
  const semContexto = workspace()
  const insuficiente = CASOS.find((c) => c.tipo === 'site_insuficiente')!
  const leitura = await gerar({ site: insuficiente.dominio, workspaceId: WS, llm: motorDaGeracao, fetchFn: fetchDoCaso(insuficiente) })
  assertEquals(leitura.falha, 'site_insuficiente')
  assertEquals(leitura.textos, null)
  const vazio = await semContexto.pedir({ action: 'prepare' })
  assertEquals(vazio.corpo.estado, 'sem_contexto')
  assert(vazio.corpo.mensagem.includes('Configurações'))

  // A IA falha ao traduzir: é falha, e não diz nada sobre o mercado.
  const falhaDaIa = criarBusca({
    db: { lerContexto: () => Promise.resolve({ versao: 1, icp: ICP }), userFromJwt: () => Promise.resolve({ userId: 'a' }) } as unknown as DbDaBusca,
    llm: { json: () => Promise.reject(new Error('motor fora do ar')) },
    apify: {} as Apify,
    appOrigin: 'https://app.test',
    waitUntil: () => {},
    log: () => {},
  })
  const res = await falhaDaIa(new Request('https://fn.test/account-discovery', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt', apikey: 'chave', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'prepare', workspaceId: WS }),
  }))
  const corpoDaFalha = await res.json()
  assertEquals(corpoDaFalha.estado, 'falha_traducao')
  assert(corpoDaFalha.mensagem.includes('não diz nada sobre o mercado'))

  // Busca vazia: sucesso com zero empresas. Fonte fora do ar: falha da busca.
  for (const [fonte, sucesso] of [['vazia', true], ['falha', false]] as const) {
    const { banco, pedir } = workspace({ fonte })
    banco.vigente = { versao: 1, empresa: EMPRESA, icp: ICP, personas: PERSONAS }
    const { corpo } = await pedir({ action: 'prepare' })
    await pedir({ action: 'search', perfis: corpo.perfis.slice(0, 2), contextoVersao: 1 })
    assertEquals(banco.encerramentos.map((e) => e.success), [sucesso], fonte)
    if (sucesso) assertEquals(banco.gravadas.flat(), [])
    else assert(banco.encerramentos[0].error, 'a falha da fonte tem motivo')
  }
})
