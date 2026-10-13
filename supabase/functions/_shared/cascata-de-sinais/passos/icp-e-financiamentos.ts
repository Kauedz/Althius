// ICP E, Sinal de financiamento do BNDES ou da Finep: duas fontes públicas abertas (sem custo de fonte), um fato por contrato,
// casadas com as Contas por `casar_fatos_com_contas` (CNPJ primeiro). Só dado da empresa: nunca o nome de uma pessoa.
//
// BNDES (conferido contra o servidor em 13/10/2026): portal de dados abertos (CKAN), conjunto `operacoes-financiamento`,
// recurso CSV "Operações não automáticas" (datastore ativo; atualização mensal, o dado vai até o fim do mês anterior).
//   GET /api/3/action/package_show?id=operacoes-financiamento   -> result.resources[{ id, name, format, datastore_active }]
//   GET /api/3/action/datastore_search?resource_id=…&sort=data_da_contratacao desc&limit=…&offset=…&fields=…
//     -> result.records[{ cliente, cnpj ("00.000.000/0000-00"), data_da_contratacao ("2026-08-31T00:00:00"),
//        valor_contratado_reais, numero_do_contrato, produto, instrumento_financeiro, descricao_do_projeto, uf, municipio,
//        setor_bndes, porte_do_cliente, situacao_do_contrato }]
//   O portal responde 403 a `filters` com CNPJ e a `datastore_search_sql`: a fonte pede a janela por data e filtra aqui.
//   As operações automáticas (indiretas) vêm com CNPJ MASCARADO ("**.*91.521/0001-**"): não servem para casar por CNPJ e
//   ficam de fora (casar só por nome daria homônimo).
// Finep (conferido em 13/10/2026): https://download.finep.gov.br/Contratacao.xlsx (atualizado a cada poucos dias), abas
//   "Projetos_Crédito_Direto" e "Projetos_Subvenção_Direta" com `Contrato`, `Data Assinatura` (série do Excel), `Título`,
//   `Proponente`, `CNPJ Proponente`, `UF Proponente`, `Valor Finep` e `Status`.
import { normalizar, objetos, recortar } from '../../../signal-runner/adaptadores/comum.ts'
import { lerJson } from '../fonte-publica.ts'
import type { ContextoDoPasso, FontePublica, ImplDoPasso, Item } from '../tipos.ts'
import { cnpjLimpo, janelaDoPasso, texto } from './comum.ts'
import { type EmpresaComFatos, type Fato, itemDeEmpresaComFatos } from './empresas.ts'
import { excelParaIso, lerAbasDoXlsx } from './icp-e-xlsx.ts'
import { dataBr, legivel, reais } from './icp-e-formato.ts'

const URL_BNDES = 'https://dadosabertos.bndes.gov.br/api/3/action'
const CONJUNTO_BNDES = 'operacoes-financiamento'
const URL_FINEP = 'https://download.finep.gov.br/Contratacao.xlsx'
const ABAS_FINEP = [
  { nome: 'projetos credito direto', rotulo: 'Financiamento da Finep contratado' },
  { nome: 'projetos subvencao direta', rotulo: 'Subvenção da Finep contratada' },
]
const POR_EMPRESA = 3
const MAXIMO_DA_PLANILHA = 40_000_000
const DIA_MS = 86_400_000

const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = texto(v).replace(/\s/g, '')
  // "9090000,0" (decimal com vírgula) ou "5022454.2" (ponto): só um dos dois formatos por vez.
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : 0
}

/** A data do contrato ("2026-08-31T00:00:00" ou "2026-08-31") em ISO ao meio-dia UTC; nulo se não for data. */
function meioDia(valor: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto(valor))
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

interface Contrato {
  cnpj: string
  nome: string
  uf: string
  municipio: string
  porte: string
  fato: Fato
  valor: number
}

function agrupar(contratos: Contrato[]): EmpresaComFatos[] {
  const porCnpj = new Map<string, Contrato[]>()
  for (const c of contratos) porCnpj.set(c.cnpj, [...(porCnpj.get(c.cnpj) ?? []), c])
  return [...porCnpj.values()].map((lista) => {
    const maiores = lista.sort((a, b) => b.valor - a.valor).slice(0, POR_EMPRESA)
    const p = maiores[0]
    return {
      empresa: { nome: p.nome, cnpj: p.cnpj, ...(p.uf ? { uf: p.uf } : {}), ...(p.municipio ? { municipio: p.municipio } : {}), ...(p.porte ? { porte: p.porte } : {}) },
      fatos: maiores.map((c) => c.fato),
    }
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// BNDES.

/** Uma operação do BNDES (do portal ou da cópia dela que o actor alternativo entrega) como contrato; nulo se não vale. */
function contratoDoBndes(o: Record<string, unknown>, desde: number, agora: number): Contrato | null {
  const cnpj = cnpjLimpo(o.cnpj)
  const quando = meioDia(o.data_da_contratacao ?? o.contract_date)
  const valor = num(o.valor_contratado_reais ?? o.value_contracted_brl)
  const nome = texto(o.cliente ?? o.client)
  if (!cnpj || !quando || valor <= 0 || !nome) return null
  const ms = Date.parse(quando)
  if (ms < desde || ms > agora + DIA_MS) return null
  const situacao = normalizar(o.situacao_do_contrato)
  if (situacao && /cancel|liquid|rescind/.test(situacao)) return null
  const numero = texto(o.numero_do_contrato ?? o.contract_number)
  const produto = legivel(texto(o.produto ?? o.product)) || 'financiamento'
  const instrumento = legivel(texto(o.instrumento_financeiro ?? o.financial_instrument))
  const projeto = recortar(texto(o.descricao_do_projeto ?? o.project), 220)
  const uf = texto(o.uf).toUpperCase()
  const municipio = legivel(texto(o.municipio ?? o.municipality))
  const porte = legivel(texto(o.porte_do_cliente))
  const setor = legivel(texto(o.setor_bndes ?? o.cnae_sector))
  const data = dataBr(quando)
  const detalhes = [setor ? `setor ${setor}` : '', porte ? `porte ${porte}` : '', [municipio, uf].filter(Boolean).join('/')].filter(Boolean).join('; ')
  return {
    cnpj, nome, uf, municipio: municipio === 'Sem Município' ? '' : municipio, porte, valor,
    fato: {
      chave: `bndes|${numero || `${quando.slice(0, 10)}|${Math.round(valor)}`}`,
      frase: `Financiamento BNDES contratado: ${reais(valor)} (${produto}) em ${data}`,
      quando,
      fonte: 'BNDES (dados abertos)',
      evidencia: `Operação não automática${numero ? ` nº ${numero}` : ''} contratada em ${data}: ${reais(valor, true)}`
        + ` (${[produto, instrumento].filter(Boolean).join('; ')}).${detalhes ? ` ${detalhes[0].toUpperCase()}${detalhes.slice(1)}.` : ''}${projeto ? ` Projeto: ${projeto}.` : ''}`,
    },
  }
}

type OpcoesDeLeitura = { dormir?: (ms: number) => Promise<void> }

export function bndesOperacoes(fetchFn: typeof fetch = fetch, opcoes: OpcoesDeLeitura = {}): FontePublica {
  const ler = (url: string) => lerJson(url, { fetchFn, repeticoes: 1, esperaMs: 1000, dormir: opcoes.dormir })
  return {
    async buscar(_entrada, ctx) {
      const dias = janelaDoPasso(ctx)
      const desde = ctx.agora - dias * DIA_MS
      const porPagina = Math.min(Math.max(Number(ctx.def.inputTemplate.porPagina) || 500, 1), 1000)
      // O recurso é achado pelo nome (os identificadores podem mudar quando o BNDES republica o arquivo).
      const pacote = await ler(`${URL_BNDES}/package_show?${new URLSearchParams({ id: CONJUNTO_BNDES })}`) as { result?: { resources?: unknown[] } }
      const recurso = objetos(pacote.result?.resources ?? []).find((r) =>
        /nao automaticas/.test(normalizar(r.name)) && !/indiretas/.test(normalizar(r.name)) && texto(r.format).toUpperCase() === 'CSV' && r.datastore_active !== false
      )
      const recursoId = texto(recurso?.id) || texto(ctx.def.inputTemplate.recursoId)
      if (!recursoId) throw new Error('O portal do BNDES não lista o arquivo de operações não automáticas.')
      const contratos: Contrato[] = []
      for (let pagina = 0; pagina < 6; pagina++) {
        const corpo = await ler(`${URL_BNDES}/datastore_search?${new URLSearchParams({
          resource_id: recursoId,
          sort: 'data_da_contratacao desc',
          limit: String(porPagina),
          offset: String(pagina * porPagina),
          fields: 'cliente,cnpj,data_da_contratacao,valor_contratado_reais,numero_do_contrato,produto,instrumento_financeiro,descricao_do_projeto,uf,municipio,setor_bndes,porte_do_cliente,situacao_do_contrato',
        })}`) as { result?: { records?: unknown[] } }
        const registros = objetos(corpo.result?.records ?? [])
        let acabouAJanela = false
        for (const o of registros) {
          const quando = meioDia(o.data_da_contratacao)
          if (quando && Date.parse(quando) < desde) acabouAJanela = true
          const c = contratoDoBndes(o, desde, ctx.agora)
          if (c) contratos.push(c)
        }
        if (acabouAJanela || registros.length < porPagina) break
      }
      return agrupar(contratos).map(itemDeEmpresaComFatos)
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Finep.

export function finepContratos(fetchFn: typeof fetch = fetch): FontePublica {
  return {
    async buscar(_entrada, ctx) {
      const desde = ctx.agora - janelaDoPasso(ctx) * DIA_MS
      const url = texto(ctx.def.inputTemplate.urlFinep) || URL_FINEP
      const controle = new AbortController()
      const relogio = setTimeout(() => controle.abort(), 60_000)
      let bytes: Uint8Array
      try {
        const r = await fetchFn(url, { signal: controle.signal })
        if (!r.ok) {
          await r.body?.cancel()
          throw new Error(`A planilha da Finep respondeu HTTP ${r.status}.`)
        }
        if (Number(r.headers.get('content-length') ?? 0) > MAXIMO_DA_PLANILHA) {
          await r.body?.cancel()
          throw new Error('A planilha da Finep está maior que o esperado.')
        }
        bytes = new Uint8Array(await r.arrayBuffer())
      } finally {
        clearTimeout(relogio)
      }
      const abas = await lerAbasDoXlsx(bytes, ABAS_FINEP.map((a) => a.nome))
      const contratos: Contrato[] = []
      for (const aba of ABAS_FINEP) {
        for (const l of abas.get(aba.nome) ?? []) {
          const cnpj = cnpjLimpo(l['CNPJ Proponente'])
          const quando = excelParaIso(l['Data Assinatura'] ?? '')
          const valor = num(l['Valor Finep'])
          const nome = texto(l.Proponente)
          if (!cnpj || !quando || valor <= 0 || !nome) continue
          if (Date.parse(quando) < desde || Date.parse(quando) > ctx.agora + DIA_MS) continue
          if (/cancel|rescind/.test(normalizar(l.Status))) continue
          const contrato = texto(l.Contrato)
          const titulo = recortar(texto(l['Título']), 220)
          const uf = texto(l['UF Proponente']).toUpperCase()
          const municipio = legivel(texto(l['Município Proponente']))
          const data = dataBr(quando)
          contratos.push({
            cnpj, nome, uf, municipio, porte: '', valor,
            fato: {
              chave: `finep|${contrato || `${quando.slice(0, 10)}|${Math.round(valor)}`}`,
              frase: `${aba.rotulo}: ${reais(valor)} em ${data}`,
              quando,
              fonte: 'Finep (dados abertos)',
              evidencia: `${aba.rotulo.replace(' contratado', '').replace(' contratada', '')}${contrato ? `, contrato ${contrato}` : ''}, assinado em ${data}: ${reais(valor, true)}.`
                + `${[municipio, uf].filter(Boolean).length ? ` ${[municipio, uf].filter(Boolean).join('/')}.` : ''}${titulo ? ` Projeto: ${titulo}.` : ''}`,
            },
          })
        }
      }
      return agrupar(contratos).map(itemDeEmpresaComFatos)
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// As duas juntas: um Sinal, uma reserva de crédito, e a queda de uma fonte não derruba a outra.

/** Junta as empresas das duas fontes pelo CNPJ (os fatos de uma mesma empresa ficam num item só). */
function juntar(grupos: Item[][]): Item[] {
  const porCnpj = new Map<string, { empresa: Item; fatos: unknown[] }>()
  for (const item of grupos.flat()) {
    const cnpj = cnpjLimpo((item.empresa as Record<string, unknown> | undefined)?.cnpj)
    const atual = porCnpj.get(cnpj)
    if (atual) atual.fatos.push(...(item.fatos as unknown[]))
    else porCnpj.set(cnpj, { empresa: item.empresa as Item, fatos: [...(item.fatos as unknown[])] })
  }
  return [...porCnpj.values()].map((v) => ({ tipo: 'empresa_com_fatos', empresa: v.empresa, fatos: v.fatos }))
}

export function financiamentosPublicos(fetchFn: typeof fetch = fetch, opcoes: OpcoesDeLeitura = {}): FontePublica {
  const bndes = bndesOperacoes(fetchFn, opcoes)
  const finep = finepContratos(fetchFn)
  return {
    async buscar(entrada, ctx) {
      const [a, b] = await Promise.allSettled([bndes.buscar(entrada, ctx), finep.buscar(entrada, ctx)])
      if (a.status === 'rejected' && b.status === 'rejected') throw a.reason
      // O que uma fonte disse sobre a outra queda fica na memória da execução (o rastro técnico mostra o passo inteiro).
      ctx.memoria.set('fontesComFalha', [a.status === 'rejected' ? 'bndes' : '', b.status === 'rejected' ? 'finep' : ''].filter(Boolean))
      return juntar([a.status === 'fulfilled' ? a.value : [], b.status === 'fulfilled' ? b.value : []])
    },
  }
}

/**
 * O actor alternativo do BNDES (registrado na cascata como alternativa do passo; o motor ainda só executa alternativas em
 * passo de actor, então isto fica pronto para quando ele aceitar alternativa de actor em fonte pública). O actor lê o
 * mesmo arquivo do portal, do mais antigo para o mais novo, e filtra por texto em colunas: pedimos só os meses da janela.
 * Cobra por registro entregue, por isso o teto baixo (`maxItems` do passo).
 */
export const financiamentosPublicosAlternativa: Pick<ImplDoPasso, 'montarEntrada' | 'normalizar'> = {
  montarEntrada(_entrada, ctx: ContextoDoPasso) {
    const desde = ctx.agora - janelaDoPasso(ctx) * DIA_MS
    // Os meses da janela, do mais novo para o mais antigo ("2026-10", "2026-09"...).
    const meses: string[] = []
    const fim = new Date(ctx.agora)
    const inicio = new Date(desde)
    let a = fim.getUTCFullYear()
    let m = fim.getUTCMonth()
    while (a * 12 + m >= inicio.getUTCFullYear() * 12 + inicio.getUTCMonth()) {
      meses.push(`${a}-${String(m + 1).padStart(2, '0')}`)
      if (--m < 0) {
        m = 11
        a--
      }
    }
    const maximo = Math.min(ctx.def.maxItems ?? 5, 20)
    return { input: { fileKey: 'nao-automaticas', maxRecords: maximo, fieldMatch: { contract_date: meses } }, maxItems: maximo }
  },
  normalizar(brutos, _entrada, ctx) {
    const desde = ctx.agora - janelaDoPasso(ctx) * DIA_MS
    const contratos = objetos(brutos).flatMap((o) => {
      const c = contratoDoBndes({ ...o, cnpj: o.cnpj, data_da_contratacao: o.contract_date }, desde, ctx.agora)
      return c ? [c] : []
    })
    return agrupar(contratos).map(itemDeEmpresaComFatos)
  },
}
