// Os passos do ICP H (agro B2B): a implementação do que o banco registra nas cascatas deste ICP (`signal_cascade_steps.handler`).
//   nova_cooperativa       (Conta)    cooperativas_abertas: cooperativa (natureza jurídica 214-3) com abertura recente na base
//                                     aberta do CNPJ -> casar_fatos_com_contas (passo comum) cruza com as Contas do Workspace
//   liberacao_plano_safra  (mercado)  noticias_plano_safra -> plano_safra_da_noticia: notícia de anúncio ou de liberação
//   calendario_de_safra    (mercado)  calendario_de_safra: tabela interna datada (no modelo do passo, no banco)
// CPR registrada e área no CAR não têm passos: o banco as registra como "sem fonte".
// Esquemas de entrada e de saída das fontes: os publicados pelos autores (leitura da API pública, 13/10/2026):
//   epicscrapers/brazil-cnpj-scraper   entrada uf (padrão DF!), cnae, municipio, naturezaJuridica, maxItems; saída em snake_case
//   johnatan029/cnpj-new-companies     entrada ufs, cnaes (prefixos), portes, mes, maxResults, maxRuntimeMs; saída NEW_COMPANY
//   data_xplorer/google-news-scraper-fast  entrada keywords, timeframe, region_language, maxArticles...; saída title, source, url, publishedAt
import { LIMITES, normalizar, objetos, primeiroTexto, recortar } from '../../../signal-runner/adaptadores/comum.ts'
import type { ContextoDoPasso, ImplDoPasso, Item, RegistroDePassos } from '../tipos.ts'
import { cnpjLimpo, dataIso, janelaDoPasso, listaDoPasso, texto } from './comum.ts'
import { type EmpresaComFatos, itemDeEmpresaComFatos } from './empresas.ts'
import { CNAES_AGRO, ehCnaeAgro } from './icp-h-cnae.ts'

const DIA_EM_MS = 86_400_000
const BRT_EM_MS = 3 * 3_600_000
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** A data e o mês de hoje no horário de Brasília. */
function hojeEmBrasilia(agora: number): { data: string; mes: number } {
  const d = new Date(agora - BRT_EM_MS)
  return { data: d.toISOString().slice(0, 10), mes: d.getUTCMonth() + 1 }
}

/** "2026-09-02" -> "02/09/2026". */
function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const meioDia = (data: string) => `${data}T12:00:00.000Z`

function nomeProprio(s: string): string {
  return s.toLowerCase().split(' ').filter(Boolean)
    .map((p, i) => (i > 0 && ['de', 'do', 'da', 'dos', 'das', 'e'].includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ')
}

function cnpjFormatado(c: string): string {
  return c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------------------------------------------------
// Nova cooperativa.

const FONTE_RECEITA = 'Receita Federal (dados abertos do CNPJ)'
const ITENS_DO_PASSO = 'h_itens_previstos'
const PORTES: Record<string, string> = { '01': 'micro empresa', '03': 'empresa de pequeno porte', '05': 'demais' }

interface Cooperativa {
  cnpj: string
  razao: string
  data: string
  natureza: string
  situacao: string
  matriz: string
  cnae: string
  cnaeDescricao: string
  uf: string
  municipio: string
  porte: string
}

function cooperativaDoItem(b: Record<string, unknown>, daReserva: boolean): Cooperativa | null {
  if (daReserva) {
    if (b.recordType !== 'NEW_COMPANY') return null
    return {
      cnpj: cnpjLimpo(b.cnpj), razao: texto(b.razaoSocial), data: texto(b.dataInicio).slice(0, 10), natureza: texto(b.naturezaJuridica),
      situacao: texto(b.situacao), matriz: texto(b.matrizFilial), cnae: texto(b.cnaePrincipal), cnaeDescricao: '', uf: texto(b.uf).toUpperCase(),
      municipio: '', porte: PORTES[texto(b.porte)] ?? texto(b.porte).toLowerCase(),
    }
  }
  return {
    cnpj: cnpjLimpo(b.cnpj), razao: texto(b.razao_social), data: texto(b.data_abertura).slice(0, 10), natureza: texto(b.natureza_juridica_codigo),
    situacao: texto(b.situacao_cadastral), matriz: texto(b.matriz_filial), cnae: texto(b.cnae_principal_codigo),
    cnaeDescricao: texto(b.cnae_principal_descricao), uf: texto(b.uf).toUpperCase(), municipio: texto(b.municipio), porte: texto(b.porte).toLowerCase(),
  }
}

function ufDoPedido(ctx: ContextoDoPasso): string {
  const uf = texto(ctx.criterios.uf).toUpperCase()
  return /^[A-Z]{2}$/.test(uf) ? uf : ''
}

const cooperativasAbertas: ImplDoPasso = {
  montarEntrada(_entrada, ctx, actorId) {
    const maximo = ctx.def.maxItems ?? 300
    const uf = ufDoPedido(ctx)
    if (actorId.startsWith('johnatan029~')) {
      // A alternativa cobra por empresa nova entregue, de qualquer natureza: pede menos para o pior caso caber no teto.
      const n = Math.max(1, Math.min(maximo, num(ctx.def.inputTemplate.maxItensDoFallback) || 100))
      ctx.memoria.set(ITENS_DO_PASSO, n)
      const cnaes = listaDoPasso(ctx, 'cnaes', 'cnaesAgro')
      return { input: { ufs: uf ? [uf] : [], cnaes: cnaes.length ? cnaes : CNAES_AGRO, portes: [], mes: '', maxResults: n, maxRuntimeMs: 120000 }, maxItems: n }
    }
    ctx.memoria.set(ITENS_DO_PASSO, maximo)
    // `uf` vazia é de propósito: o padrão do autor é DF. Só a natureza jurídica de cooperativa (214-3).
    return { input: { uf, naturezaJuridica: texto(ctx.def.inputTemplate.naturezaJuridica) || '2143', maxItems: maximo }, maxItems: maximo }
  },

  /** Quantos itens a tentativa em curso (principal ou alternativa) cobra: o que o `montarEntrada` dela pediu. */
  itensCobrados(_entrada, ctx) {
    return num(ctx.memoria.get(ITENS_DO_PASSO)) || ctx.def.estItems
  },

  normalizar(brutos, _entrada, ctx, actorId) {
    const dias = janelaDoPasso(ctx)
    const somenteAgro = ctx.criterios.somenteAgro !== undefined ? ctx.criterios.somenteAgro !== false : ctx.def.inputTemplate.somenteAgro !== false
    const gruposAgro = listaDoPasso(ctx, 'cnaes', 'cnaesAgro')
    const vistos = new Set<string>()
    const saida: Item[] = []
    for (const b of objetos(brutos)) {
      const c = cooperativaDoItem(b, actorId.startsWith('johnatan029~'))
      if (!c || !c.cnpj || !c.razao) continue
      // Só cooperativa (214-3), ativa e matriz: pessoa física (empresário individual) e o resto nem entram.
      if (c.natureza.replace(/\D/g, '') !== '2143') continue
      if (c.situacao && c.situacao.toUpperCase() !== 'ATIVA') continue
      if (c.matriz && c.matriz.toUpperCase() !== 'MATRIZ') continue
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.data)) continue
      const quando = Date.parse(meioDia(c.data))
      if (Number.isNaN(quando) || quando > ctx.agora || quando < ctx.agora - dias * DIA_EM_MS) continue
      if (somenteAgro && !ehCnaeAgro(c.cnae, gruposAgro.length ? gruposAgro : CNAES_AGRO)) continue
      if (vistos.has(c.cnpj)) continue
      vistos.add(c.cnpj)

      const lugar = c.uf ? ` (${c.municipio ? `${nomeProprio(c.municipio)}/` : ''}${c.uf})` : ''
      const atividade = c.cnae ? `; CNAE principal ${c.cnae}${c.cnaeDescricao ? ` - ${c.cnaeDescricao}` : ''}` : ''
      const ef: EmpresaComFatos = {
        empresa: { nome: c.razao, cnpj: c.cnpj, ...(c.cnae ? { cnae: c.cnae } : {}), ...(c.uf ? { uf: c.uf } : {}), ...(c.municipio ? { municipio: nomeProprio(c.municipio) } : {}), ...(c.porte ? { porte: c.porte } : {}) },
        fatos: [{
          chave: `cooperativa|${c.cnpj}|${c.data}`,
          frase: `Cooperativa aberta em ${dataBr(c.data)}${lugar}`,
          quando: meioDia(c.data),
          fonte: FONTE_RECEITA,
          evidencia: recortar(
            `${c.razao} (CNPJ ${cnpjFormatado(c.cnpj)}): cooperativa (natureza jurídica 214-3) com início de atividade em ${dataBr(c.data)}${atividade}${c.porte ? `; porte ${c.porte}` : ''}. ` +
              'Base aberta de CNPJ da Receita Federal, atualizada uma vez por mês: a abertura pode aparecer com até 30 dias de atraso.',
            LIMITES.evidencia,
          ),
        }],
      }
      saida.push(itemDeEmpresaComFatos(ef))
    }
    return saida
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// Plano Safra.

const ANUNCIO = /\b(anunc|lanc|apresent|divulg|detalh|revel)/
const LIBERACAO = /\b(liber|disponibiliz)/

const noticiasPlanoSafra: ImplDoPasso = {
  montarEntrada(_entrada, ctx) {
    const doModelo = Array.isArray(ctx.def.inputTemplate.mesesDeBusca) ? ctx.def.inputTemplate.mesesDeBusca.map(Number) : [5, 6, 7, 8, 9]
    if (!doModelo.includes(hojeEmBrasilia(ctx.agora).mes) && ctx.criterios.foraDaTemporada !== true) {
      return { pular: 'Fora da temporada do Plano Safra (maio a setembro): a busca volta em maio.' }
    }
    const termos = listaDoPasso(ctx, 'termos', 'termos')
    if (!termos.length) return { pular: 'Sem termo de busca para o Plano Safra.' }
    const dias = janelaDoPasso(ctx)
    const maximo = ctx.def.maxItems ?? 40
    return {
      input: {
        keywords: termos, topics: [], topicUrls: [], maxArticles: Math.max(1, Math.floor(maximo / termos.length)),
        timeframe: dias <= 1 ? '1d' : dias <= 7 ? '7d' : dias <= 30 ? '30d' : '1y', region_language: 'BR:pt-419',
        decodeUrls: false, extractDescriptions: false, extractImages: false, proxyConfiguration: { useApifyProxy: true },
      },
      maxItems: maximo,
    }
  },

  normalizar(brutos) {
    return objetos(brutos).flatMap((b): Item[] => {
      const titulo = texto(b.title)
      const publicadaEm = dataIso(b.publishedAt ?? b.publishedTimestamp)
      if (!titulo || !publicadaEm) return []
      return [{ tipo: 'noticia', titulo, veiculo: primeiroTexto(b, 'source', 'source.name', 'source.title'), url: texto(b.url), publicadaEm }]
    })
  },
}

/** "R$ 516 bilhões" como o título escreve, ou vazio. */
function valorCitado(titulo: string): string {
  const m = titulo.match(/R\$\s*(\d[\d.,]*\d|\d)\s*(bilh(?:ões|oes|ão|ao)|milh(?:ões|oes|ão|ao)|bi|mi)(?![\p{L}])/iu)
  return m ? `R$ ${m[1]} ${m[2]}` : ''
}

/** "2026/27" do título ("2026/2027" também); sem ano no título, do mês da notícia (o ano-safra vira em junho). */
function safraDaNoticia(titulo: string, publicadaEm: string): string {
  const m = titulo.match(/(20\d{2})\s*[/\-–]\s*(\d{2,4})/)
  if (m) return `${m[1]}/${m[2].slice(-2)}`
  const d = new Date(publicadaEm)
  const ano = d.getUTCFullYear()
  const inicio = d.getUTCMonth() + 1 >= 6 ? ano : ano - 1
  return `${inicio}/${String(inicio + 1).slice(-2)}`
}

interface GrupoDoPlano {
  safra: string
  programa: 'geral' | 'familiar'
  etapa: 'anuncio' | 'liberacao'
  noticias: { veiculo: string; url: string; em: string; valor: string }[]
}

const planoSafraDaNoticia: ImplDoPasso = {
  executar(entrada, ctx) {
    const dias = janelaDoPasso(ctx)
    const grupos = new Map<string, GrupoDoPlano>()
    for (const i of entrada) {
      if (i.tipo !== 'noticia') continue
      const titulo = texto(i.titulo)
      const em = texto(i.publicadaEm)
      const ts = Date.parse(em)
      if (!titulo || Number.isNaN(ts) || ts > ctx.agora + 3_600_000 || ts < ctx.agora - dias * DIA_EM_MS) continue
      const norm = normalizar(titulo)
      if (!` ${norm} `.includes(' plano safra ')) continue
      // Por palavra-chave do título: anúncio vale mais que liberação quando as duas aparecem ("anuncia a liberação...").
      const etapa = ANUNCIO.test(norm) ? 'anuncio' : LIBERACAO.test(norm) ? 'liberacao' : null
      if (!etapa) continue
      const programa = /\b(agricultura familiar|pronaf)\b/.test(norm) ? 'familiar' : 'geral'
      const safra = safraDaNoticia(titulo, em)
      const chave = `${safra}|${programa}|${etapa}`
      const g = grupos.get(chave) ?? { safra, programa, etapa, noticias: [] }
      g.noticias.push({ veiculo: texto(i.veiculo), url: texto(i.url), em, valor: valorCitado(titulo) })
      grupos.set(chave, g)
    }
    return [...grupos.values()].map((g): Item => {
      const ordenadas = [...g.noticias].sort((a, b) => Date.parse(a.em) - Date.parse(b.em))
      const primeira = ordenadas[0]
      const veiculos = [...new Set(ordenadas.map((n) => n.veiculo).filter(Boolean))]
      const valor = ordenadas.find((n) => n.valor)?.valor ?? ''
      const plano = g.programa === 'familiar' ? 'Plano Safra da Agricultura Familiar' : 'Plano Safra'
      const phrase = g.etapa === 'anuncio'
        ? `${plano} ${g.safra} foi anunciado${valor ? ` (${valor})` : ''}`
        : `Crédito do ${plano} ${g.safra} começou a ser liberado`
      const d1 = dataBr(primeira.em)
      const d2 = dataBr(ordenadas[ordenadas.length - 1].em)
      const n = ordenadas.length
      return {
        eventKey: recortar(`plano-safra|${g.safra}|${g.programa}|${g.etapa}`, LIMITES.chave),
        phrase: recortar(phrase, LIMITES.frase),
        firedAt: primeira.em,
        source: recortar(primeira.veiculo || 'Notícia', LIMITES.fonte),
        evidence: recortar(
          `${n} ${n === 1 ? 'notícia' : 'notícias'}${veiculos.length ? ` (${veiculos.join(', ')})` : ''} ${d1 === d2 ? `em ${d1}` : `entre ${d1} e ${d2}`} ` +
            `tratam ${g.etapa === 'anuncio' ? 'do anúncio' : 'da liberação do crédito'} do ${plano} ${g.safra}${valor ? `; valor citado no título: ${valor}` : ''}. ` +
            `Identificado pelas palavras-chave do título, sem ler o texto da notícia.${primeira.url ? ` Primeira notícia: ${primeira.url}` : ''}`,
          LIMITES.evidencia,
        ),
        payload: {
          safra: g.safra, programa: g.programa, etapa: g.etapa, noticias: n, veiculos, primeiraNoticiaEm: primeira.em,
          ...(primeira.url ? { link: primeira.url } : {}), ...(valor ? { valorCitado: valor } : {}),
        },
      }
    }).sort((a, b) => Date.parse(texto(b.firedAt)) - Date.parse(texto(a.firedAt))).slice(0, 6)
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// Calendário de safra: a tabela vem do modelo do passo (no banco), para revisar sem publicar código.
//   { id, tipo: 'divulgacao' | 'janela', titulo, safra, de, ate?, fonte, conferidoEm: 'AAAA-MM-DD' | null }
// divulgacao: Sinal quando a data acabou de passar (até `recenteDias`); janela: Sinal enquanto hoje está entre `de` e `ate`.

const calendarioDeSafra: ImplDoPasso = {
  executar(_entrada, ctx) {
    const eventos = Array.isArray(ctx.def.inputTemplate.eventos) ? ctx.def.inputTemplate.eventos : []
    const recente = num(ctx.def.inputTemplate.recenteDias) || 10
    const hoje = hojeEmBrasilia(ctx.agora).data
    const dias = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA_EM_MS)
    const saida: Item[] = []
    for (const bruto of eventos) {
      const e = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
      const id = texto(e.id)
      const de = texto(e.de)
      const ate = texto(e.ate)
      const titulo = texto(e.titulo)
      if (!id || !titulo || !/^\d{4}-\d{2}-\d{2}$/.test(de)) continue
      const tipo = texto(e.tipo)
      let vale = false
      if (tipo === 'divulgacao') vale = de <= hoje && dias(hoje, de) <= recente
      else if (tipo === 'janela') vale = /^\d{4}-\d{2}-\d{2}$/.test(ate) && de <= hoje && hoje <= ate
      if (!vale) continue
      const conferido = texto(e.conferidoEm)
      const origem = conferido
        ? `Tabela interna datada do produto, conferida em ${dataBr(conferido)} em fonte pública; critério revisável.`
        : 'Tabela interna datada do produto, não conferida em fonte pública; critério revisável.'
      const fonte = texto(e.fonte) || 'Calendário de safra'
      saida.push({
        eventKey: recortar(`calendario|${id}`, LIMITES.chave),
        phrase: recortar(
          tipo === 'divulgacao' ? `CONAB divulgou o ${titulo}` : `${titulo} aberta (de ${MESES[Number(de.slice(5, 7)) - 1]} a ${MESES[Number(ate.slice(5, 7)) - 1]})`,
          LIMITES.frase,
        ),
        firedAt: new Date(Math.min(Date.parse(meioDia(de)), ctx.agora)).toISOString(),
        source: recortar(fonte, LIMITES.fonte),
        evidence: recortar(
          tipo === 'divulgacao'
            ? `${titulo}, divulgado em ${dataBr(de)}. Fonte: ${fonte}. ${origem}`
            : `${titulo}: de ${dataBr(de)} a ${dataBr(ate)}. Fonte: ${fonte}. ${origem}`,
          LIMITES.evidencia,
        ),
        payload: { id, tipo, safra: texto(e.safra), de, ...(ate ? { ate } : {}), fonte, conferidoEm: conferido || null },
      })
    }
    return saida
  },
}

export function passosDoIcp_h(_fetchFn: typeof fetch = fetch): RegistroDePassos {
  return {
    passos: {
      cooperativas_abertas: cooperativasAbertas,
      noticias_plano_safra: noticiasPlanoSafra,
      plano_safra_da_noticia: planoSafraDaNoticia,
      calendario_de_safra: calendarioDeSafra,
    },
    fontes: {},
  }
}
