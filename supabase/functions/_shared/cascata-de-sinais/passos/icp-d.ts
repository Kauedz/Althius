// Os passos do ICP D (energia e mercado livre): a implementação do que o banco registra nas cascatas deste ICP
// (`signal_cascade_steps.handler`). Cinco Sinais; quatro rodam, um não tem fonte:
//
//   cnae_eletrointensivo  (D1) cnpj_por_cnae → linkedin_empresa_por_cnae → fatos_cnae_eletrointensivo → casar_fatos_com_contas
//   grupo_a_cativo        (D2) cnpj_por_cnae → ccee_agentes (fonte aberta) → provavel_cativo → casar_fatos_com_contas (INFERÊNCIA)
//   nova_planta_filial    (D3) mapa_de_filiais → filiais_novas (fotografia) → noticias_de_expansao → casar_fatos_com_contas
//                              → gravar_fotografia_filiais
//   meta_esg_publicada    (D4) busca_esg → paginas_esg → confirmar_esg_no_site → confirmar_esg
//   vencimento_contrato_energia (D5) sem fonte: os contratos são privados; sem passos.
//
// Esquemas de entrada dos actors: os publicados em 13/10/2026 (epicscrapers/brazil-cnpj-scraper: cnae, uf, maxItems, pageSize;
// johnatan029/branch-network: cnpjs, maxResults; data_xplorer/google-news-scraper-fast: keyword, maxArticles, timeframe,
// region_language; scraperlink/google-search-results-serp-scraper: keyword (uma consulta por linha), limit, include_merged, gl, hl;
// apify/website-content-crawler: startUrls, crawlerType, maxCrawlDepth, maxCrawlPages). Os formatos de SAÍDA vêm da documentação de
// cada um: nenhum foi executado, então o campo de resposta que o código lê está marcado "não conferido numa execução real".
// Só dado da EMPRESA: nome de sócio, e-mail, telefone e título de notícia (pode citar pessoa) nunca passam adiante.
import { contemAlgum, LIMITES, mesmoDominio, normalizar, objetos, primeiroTexto, recortar } from '../../../signal-runner/adaptadores/comum.ts'
import { lerJson } from '../fonte-publica.ts'
import type { ContaDoWorkspace, ContextoDoPasso, FontePublica, ImplDoPasso, Item, RegistroDePassos } from '../tipos.ts'
import { cnpjLimpo, dataIso, dominio, lista, nomeDaEmpresa, objeto, paginaDoLinkedin, texto } from './comum.ts'
import { CRITERIO_CNAE_ELETROINTENSIVO, cnaeDoRodizio, cnaeEletrointensivo, cnaeLimpo } from './icp-d-cnae.ts'
import { contaDaEmpresa, empresaComFatosDoItem, lembrarAmostra, type EmpresaDoFato, type Fato, itemDeEmpresaComFatos } from './empresas.ts'

type Opcoes = { dormir?: (ms: number) => Promise<void>; esperaMs?: number }

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const limitar = (v: unknown, padrao: number, min: number, max: number) => Math.min(Math.max(Math.round(num(v)) || padrao, min), max)
const iso = (ms: number) => new Date(ms).toISOString()
const ano = (ms: number) => new Date(ms).getUTCFullYear()
const raizDoCnpj = (cnpj: unknown) => cnpjLimpo(cnpj).slice(0, 8)
const dataBr = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '')
const cnpjComMascara = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c)
const semAspas = (s: string) => s.replace(/["“”]/g, '').trim()

// ---------------------------------------------------------------------------------------------------------------------
// A empresa vista pela Receita (D1 e D2).

interface EmpresaReceita {
  cnpj: string
  razao: string
  fantasia: string
  cnae: string
  cnaeDescricao: string
  porte: string
  uf: string
  municipio: string
  linkedinUrl: string
  site: string
  naCcee?: boolean
  cceeMes?: string
  cceeConsumidores?: number
  /** A lista de consumidores livres não respondeu: o Sinal sai sem a exclusão, marcado. */
  listaIndisponivel?: boolean
}

function itemDeReceita(e: EmpresaReceita): Item {
  return { tipo: 'empresa_receita', ...e }
}

function receitaDoItem(i: Item): EmpresaReceita | null {
  if (i.tipo !== 'empresa_receita' || !cnpjLimpo(i.cnpj) || !texto(i.razao)) return null
  return {
    cnpj: cnpjLimpo(i.cnpj), razao: texto(i.razao), fantasia: texto(i.fantasia), cnae: texto(i.cnae), cnaeDescricao: texto(i.cnaeDescricao),
    porte: texto(i.porte), uf: texto(i.uf), municipio: texto(i.municipio), linkedinUrl: texto(i.linkedinUrl), site: texto(i.site),
    ...(i.listaIndisponivel === true ? { listaIndisponivel: true } : {}),
    ...(typeof i.naCcee === 'boolean' ? { naCcee: i.naCcee, cceeMes: texto(i.cceeMes), cceeConsumidores: num(i.cceeConsumidores) } : {}),
  }
}

/** A Conta que é a empresa da Receita (CNPJ, depois página, site ou nome; o nome fantasia vale se o da razão social não casa). */
function casarReceita(contas: ContaDoWorkspace[], e: EmpresaReceita): { conta: ContaDoWorkspace; nome: string } | undefined {
  const base = { cnpj: e.cnpj, linkedinUrl: e.linkedinUrl || undefined, site: e.site || undefined }
  const pelaRazao = contaDaEmpresa(contas, { nome: e.razao, ...base })
  if (pelaRazao) return { conta: pelaRazao, nome: e.razao }
  const pelaFantasia = e.fantasia ? contaDaEmpresa(contas, { nome: e.fantasia, ...base }) : undefined
  return pelaFantasia ? { conta: pelaFantasia, nome: e.fantasia } : undefined
}

function empresaDoFato(e: EmpresaReceita, nome: string): EmpresaDoFato {
  return {
    nome, cnpj: e.cnpj, ...(e.linkedinUrl ? { linkedinUrl: e.linkedinUrl } : {}), ...(e.site ? { site: e.site } : {}),
    ...(e.cnae ? { cnae: e.cnae } : {}), ...(e.uf ? { uf: e.uf } : {}), ...(e.municipio ? { municipio: e.municipio } : {}),
    ...(e.porte ? { porte: e.porte } : {}),
  }
}

/** A receita da Receita em uma frase curta (porte, UF), sem contato nem sócio. */
function dadosDaReceita(e: EmpresaReceita): string {
  return [e.porte ? `porte ${e.porte}` : '', e.uf ? `UF ${e.uf}` : ''].filter(Boolean).join('; ')
}

// D1 e D2, passo 1: a Receita por CNAE (e UF). O actor só aceita UMA subclasse e UMA UF por execução.
const cnpjPorCnae: ImplDoPasso = {
  itensCobrados: (_entrada, ctx) => ctx.def.maxItems ?? 100,

  montarEntrada(_entrada, ctx) {
    const pedido = ctx.criterios.cnae ?? ctx.def.inputTemplate.cnae
    const bruto = Array.isArray(pedido) ? pedido[0] : pedido
    let cnae: string
    if (texto(bruto)) {
      const tabela = cnaeEletrointensivo(bruto)
      if (!tabela) return { pular: 'O CNAE pedido não está na tabela de CNAEs eletrointensivos.' }
      cnae = tabela.codigo
    } else {
      cnae = cnaeDoRodizio(ctx.agora).codigo
    }
    const uf = texto(ctx.criterios.uf ?? ctx.def.inputTemplate.uf).toUpperCase()
    const maximo = ctx.def.maxItems ?? 100
    ctx.memoria.set('cnaeBuscado', cnae)
    // `uf` vazio busca o país todo (o padrão do actor é DF).
    return { input: { cnae, uf: /^[A-Z]{2}$/.test(uf) ? uf : '', maxItems: maximo, pageSize: Math.min(maximo, 100) }, maxItems: maximo }
  },

  normalizar(brutos, _entrada, ctx) {
    const buscado = texto(ctx.memoria.get('cnaeBuscado'))
    const vistos = new Set<string>()
    const saida: Item[] = []
    for (const b of objetos(brutos)) {
      const cnpj = cnpjLimpo(b.cnpj)
      const cnae = cnaeLimpo(b.cnae_principal_codigo)
      if (!cnpj || vistos.has(cnpj) || normalizar(b.situacao_cadastral) !== 'ativa') continue
      // Só a atividade principal vale (a busca do actor também traz quem tem o CNAE como atividade secundária).
      if (buscado ? cnae !== buscado : !cnaeEletrointensivo(cnae)) continue
      vistos.add(cnpj)
      // Do cadastro só o que é da empresa: nada de sócios (qsa), e-mail ou telefone.
      saida.push(itemDeReceita({
        cnpj, razao: texto(b.razao_social), fantasia: texto(b.nome_fantasia), cnae, cnaeDescricao: texto(b.cnae_principal_descricao),
        porte: texto(b.porte), uf: texto(b.uf), municipio: texto(b.municipio), linkedinUrl: '', site: '',
      }))
    }
    return saida
  },
}

// D1, passo 2: a página da empresa no LinkedIn, só para quem ainda não casou com uma Conta e pode casar pela página (a Conta
// não tem CNPJ e tem o endereço do LinkedIn). É um reforço: quem o actor não achou segue como estava.
function paraBuscarNoLinkedin(entrada: Item[], ctx: ContextoDoPasso): EmpresaReceita[] {
  const podeCasarPelaPagina = ctx.contas.some((c) => !cnpjLimpo(c.cnpj) && paginaDoLinkedin(c.linkedinUrl))
  if (!podeCasarPelaPagina) return []
  return entrada.flatMap((i) => {
    const e = receitaDoItem(i)
    return e && !e.linkedinUrl && !casarReceita(ctx.contas, e) ? [e] : []
  })
}

const linkedinEmpresaPorCnae: ImplDoPasso = {
  itensCobrados: (entrada, ctx) => Math.min(paraBuscarNoLinkedin(entrada, ctx).length, ctx.def.maxItems ?? 30),

  montarEntrada(entrada, ctx) {
    const alvo = paraBuscarNoLinkedin(entrada, ctx).slice(0, ctx.def.maxItems ?? 30)
    if (!alvo.length) return { pular: 'Nenhuma empresa precisava da página do LinkedIn.' }
    return { input: { searches: alvo.map((e) => e.razao) }, maxItems: alvo.length }
  },

  normalizar(brutos, entrada) {
    const achados = objetos(brutos).map((b) => ({
      nome: nomeDaEmpresa(primeiroTexto(b, 'name')),
      linkedinUrl: paginaDoLinkedin(primeiroTexto(b, 'linkedinUrl')) ? `https://www.linkedin.com/company/${paginaDoLinkedin(primeiroTexto(b, 'linkedinUrl'))}` : '',
      site: primeiroTexto(b, 'website').split('?')[0],
    }))
    return entrada.map((i) => {
      const e = receitaDoItem(i)
      if (!e || e.linkedinUrl) return i
      const a = achados.find((x) => x.nome && (x.nome === nomeDaEmpresa(e.razao) || (e.fantasia && x.nome === nomeDaEmpresa(e.fantasia))))
      return a ? itemDeReceita({ ...e, linkedinUrl: a.linkedinUrl || e.linkedinUrl, site: a.site || e.site }) : i
    })
  },
}

// D1, passo 3: a empresa de CNAE da tabela que é Conta vira o fato "atua em setor eletrointensivo".
const fatosCnaeEletrointensivo: ImplDoPasso = {
  executar(entrada, ctx) {
    const saida: Item[] = []
    for (const i of entrada) {
      const e = receitaDoItem(i)
      if (!e) continue
      const casada = casarReceita(ctx.contas, e)
      if (!casada) {
        lembrarAmostra(ctx, [{ cnpj: e.cnpj, nome: e.razao || e.fantasia }])
        continue
      }
      const t = cnaeEletrointensivo(e.cnae)
      if (!t) continue
      const fato: Fato = {
        chave: `cnae_eletrointensivo|${t.codigo}`,
        frase: `Atua em setor eletrointensivo: ${t.descricao} (CNAE ${t.codigo})`,
        quando: iso(ctx.agora),
        fonte: 'Receita Federal (CNAE)',
        evidencia: `${CRITERIO_CNAE_ELETROINTENSIVO} Receita Federal: CNAE principal ${t.codigo} (${t.descricao}); setor ${t.setor}${dadosDaReceita(e) ? `; ${dadosDaReceita(e)}` : ''}; situação ATIVA.`,
      }
      saida.push(itemDeEmpresaComFatos({ empresa: empresaDoFato(e, casada.nome), fatos: [fato] }))
    }
    return saida
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// D2. Grupo A ainda cativo: a lista de agentes da CCEE (dados abertos, sem custo) tira quem já está no mercado livre.
// A busca CKAN e, se ela não responder, o CSV do mesmo recurso. A cópia do mês dispensa a rede. Sem as duas e sem cópia
// recente, o Sinal fica marcado de que a exclusão não foi feita.

const CLASSES_PADRAO = ['Consumidor Livre', 'Consumidor Especial']
const FONTE_DA_LISTA = 'consumidores_livres'
const CHAVE_DA_LISTA = 'lista'

function celulasCsv(linha: string, sep: string): string[] {
  const saida: string[] = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (aspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"'
          i++
        } else aspas = false
      } else atual += c
    } else if (c === '"') aspas = true
    else if (c === sep) {
      saida.push(atual)
      atual = ''
    } else atual += c
  }
  saida.push(atual)
  return saida
}

function tabelaCsv(corpo: string): string[][] {
  const limpo = corpo.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const linhas = limpo.split('\n').filter((l) => l.trim().length > 0)
  if (!linhas.length) return []
  const virgulas = linhas[0].match(/,/g)?.length ?? 0
  const pontos = linhas[0].match(/;/g)?.length ?? 0
  const sep = pontos > virgulas ? ';' : ','
  return linhas.map((l) => celulasCsv(l, sep).map((c) => c.trim()))
}

/** O CSV oficial do mesmo recurso, no portal. Só quando o id do recurso é o identificador publicado. */
function urlDoArquivo(base: URL): URL | null {
  const id = base.searchParams.get('resource_id') ?? ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  return new URL(`https://${base.host}/datastore/dump/${id}?bom=True`)
}

function listaDoCsv(corpo: string, classes: string[]): { raizes: Set<string>; mes: string } {
  const tabela = tabelaCsv(corpo)
  const cabecalho = (tabela[0] ?? []).map((c) => c.toUpperCase())
  const iCnpj = cabecalho.indexOf('CNPJ')
  const iClasse = cabecalho.indexOf('CLASSE_AGENTE')
  const iMes = cabecalho.indexOf('MES_REFERENCIA')
  if (iCnpj < 0 || iClasse < 0 || iMes < 0) throw new Error('O arquivo da lista não tem as colunas da lista de agentes.')
  const aceitas = new Set(classes.map((c) => c.toLowerCase()))
  const porMes = new Map<string, Set<string>>()
  for (const linha of tabela.slice(1)) {
    const classe = (linha[iClasse] ?? '').toLowerCase()
    const mes = linha[iMes] ?? ''
    if (!aceitas.has(classe) || !/^\d{6}$/.test(mes)) continue
    const raiz = raizDoCnpj(linha[iCnpj])
    const doMes = porMes.get(mes) ?? new Set<string>()
    if (raiz) doMes.add(raiz)
    porMes.set(mes, doMes)
  }
  const mes = [...porMes.keys()].sort().at(-1)
  if (!mes) throw new Error('O arquivo da lista não informou o mês de referência.')
  return { raizes: porMes.get(mes) ?? new Set(), mes }
}

function listaDaCopia(bruto: unknown): { raizes: Set<string>; mes: string } | null {
  if (!bruto || typeof bruto !== 'object') return null
  const o = bruto as { raizes?: unknown; mes?: unknown }
  if (!Array.isArray(o.raizes) || typeof o.mes !== 'string' || !/^\d{6}$/.test(o.mes)) return null
  const raizes = new Set(o.raizes.filter((r): r is string => typeof r === 'string' && /^\d{8}$/.test(r)))
  return { raizes, mes: o.mes }
}

/** URL https do modelo do passo. `null` se o texto não for https (a reserva opcional simplesmente não entra). */
function urlHttps(valor: unknown): URL | null {
  try {
    const u = new URL(texto(valor))
    return u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

export function cceeAgentes(fetchFn: typeof fetch = fetch, opcoes: Opcoes = {}): FontePublica {
  const ler = async (url: URL) => {
    const j = objeto(await lerJson(url.toString(), { fetchFn, repeticoes: 2, esperaMs: opcoes.esperaMs ?? 2_000, dormir: opcoes.dormir }))
    if (j.success !== true) throw new Error('A lista da CCEE respondeu sem sucesso.')
    return objeto(j.result)
  }
  const lerLista = async (base: URL, classes: string[], tamanho: number, maxPaginas: number) => {
    const meses = new URL(base)
    meses.searchParams.set('fields', 'MES_REFERENCIA')
    meses.searchParams.set('distinct', 'true')
    meses.searchParams.set('limit', '100')
    const resultadoMeses = await ler(meses)
    const referencias = (Array.isArray(resultadoMeses.records) ? resultadoMeses.records as unknown[] : [])
      .map((r) => texto(objeto(r).MES_REFERENCIA)).filter((m) => /^\d{6}$/.test(m)).sort()
    const mes = referencias.at(-1)
    if (!mes) throw new Error('A lista da CCEE não informou o mês de referência.')

    const raizes = new Set<string>()
    let lidos = 0
    for (let pagina = 0; pagina < maxPaginas; pagina++) {
      const u = new URL(base)
      u.searchParams.set('filters', JSON.stringify({ CLASSE_AGENTE: classes, MES_REFERENCIA: mes }))
      u.searchParams.set('fields', 'CNPJ')
      u.searchParams.set('limit', String(tamanho))
      u.searchParams.set('offset', String(pagina * tamanho))
      const r = await ler(u)
      const registros = Array.isArray(r.records) ? r.records as unknown[] : []
      const total = num(r.total)
      // Lista maior do que o modelo deixa ler: a exclusão ficaria incompleta e afirmaria "cativo" a quem não é.
      if (pagina === 0 && total > tamanho * maxPaginas) throw new Error(`A lista da CCEE tem ${total} agentes e o limite de leitura é ${tamanho * maxPaginas}.`)
      for (const reg of registros) {
        const raiz = raizDoCnpj(objeto(reg).CNPJ)
        if (raiz) raizes.add(raiz)
      }
      lidos += registros.length
      if (!registros.length || lidos >= total) break
    }
    return { raizes, mes }
  }
  const aplicar = (candidatas: EmpresaReceita[], listaPronta: { raizes: Set<string>; mes: string }) =>
    candidatas.map((e) => itemDeReceita({
      ...e,
      naCcee: listaPronta.raizes.has(raizDoCnpj(e.cnpj)),
      cceeMes: listaPronta.mes,
      cceeConsumidores: listaPronta.raizes.size,
    }))
  const guardar = async (ctx: ContextoDoPasso, listaPronta: { raizes: Set<string>; mes: string }) => {
    if (!ctx.cacheFonte) return
    const referencia = `${listaPronta.mes.slice(0, 4)}-${listaPronta.mes.slice(4)}`
    await ctx.cacheFonte.gravar(FONTE_DA_LISTA, CHAVE_DA_LISTA, referencia, {
      raizes: [...listaPronta.raizes],
      mes: listaPronta.mes,
    })
  }
  const lerArquivo = async (url: URL) => {
    const resposta = await fetchFn(url.toString())
    if (!resposta.ok) {
      await resposta.body?.cancel()
      throw new Error('O arquivo da lista não respondeu.')
    }
    return await resposta.text()
  }
  return {
    async buscar(entrada, ctx) {
      // Só vale ler a lista se alguma empresa achada é Conta: o resto não vira Sinal, mas entra na amostra da validação.
      const empresas = entrada.flatMap((i) => {
        const e = receitaDoItem(i)
        return e ? [e] : []
      })
      const candidatas = empresas.filter((e) => casarReceita(ctx.contas, e))
      lembrarAmostra(ctx, empresas.filter((e) => !casarReceita(ctx.contas, e)).map((e) => ({ cnpj: e.cnpj, nome: e.razao || e.fantasia })))
      if (!candidatas.length) return []

      const copiada = listaDaCopia(await ctx.cacheFonte?.ler(FONTE_DA_LISTA, CHAVE_DA_LISTA, null))
      if (copiada) return aplicar(candidatas, copiada)

      // A URL é a do modelo do passo (configurável no banco); nunca vem do pedido. `urlReserva` é opcional.
      const tpl = ctx.def.inputTemplate
      const base = urlHttps(tpl.url)
      if (!base) throw new Error('A fonte da lista de agentes precisa ser https.')
      const reserva = urlHttps(tpl.urlReserva)
      const classes = lista(tpl.classes).length ? lista(tpl.classes) : CLASSES_PADRAO
      const tamanho = limitar(tpl.tamanhoDaPagina, 5000, 1, 32_000)
      const maxPaginas = limitar(tpl.maxPaginas, 8, 1, 20)

      const bases = reserva && reserva.href !== base.href ? [base, reserva] : [base]
      for (const url of bases) {
        try {
          const listaPronta = await lerLista(url, classes, tamanho, maxPaginas)
          await guardar(ctx, listaPronta)
          return aplicar(candidatas, listaPronta)
        } catch (e) {
          // Lista incompleta não vira "cativo" e não cai no arquivo: o arquivo seria a lista inteira, e o teste
          // de limite precisa continuar falhando a execução.
          if (e instanceof Error && e.message.includes('limite de leitura')) throw e
        }
        const arquivo = urlDoArquivo(url)
        if (!arquivo) continue
        try {
          const listaPronta = listaDoCsv(await lerArquivo(arquivo), classes)
          await guardar(ctx, listaPronta)
          return aplicar(candidatas, listaPronta)
        } catch {
          // Bloqueio ou arquivo ilegível: tenta a reserva.
        }
      }
      return candidatas.map((e) => itemDeReceita({ ...e, listaIndisponivel: true }))
    },
  }
}

// D2, passo 3: ativa, do porte que o modelo aceita e fora da lista de consumidores livres da CCEE = "provável cativo".
const provavelCativo: ImplDoPasso = {
  executar(entrada, ctx) {
    const portes = (lista(ctx.def.inputTemplate.portes).length ? lista(ctx.def.inputTemplate.portes) : ['DEMAIS']).map(normalizar)
    const saida: Item[] = []
    for (const i of entrada) {
      const e = receitaDoItem(i)
      if (!e || !portes.includes(normalizar(e.porte))) continue
      const casada = casarReceita(ctx.contas, e)
      if (!casada) continue
      const t = cnaeEletrointensivo(e.cnae)
      const atividade = `CNAE ${e.cnae}${t ? ` (${t.descricao})` : ''}`
      const fato: Fato | null = e.listaIndisponivel
        ? {
          chave: `grupo_a_cativo|${ano(ctx.agora)}|sem_lista`,
          frase: `A lista pública de consumidores livres não foi consultada; ${atividade}, porte ${e.porte}. Quem já está no mercado livre não foi excluído`,
          quando: iso(ctx.agora),
          fonte: 'Receita Federal (lista de consumidores livres indisponível)',
          evidencia: `Sem a exclusão da lista de consumidores livres e especiais: a lista pública não respondeu nesta rodada. Receita Federal: ${atividade}; ${dadosDaReceita(e)}. Este registro não afirma que a empresa está no mercado cativo nem no mercado livre.`,
        }
        : e.naCcee === false
        ? {
          chave: `grupo_a_cativo|${ano(ctx.agora)}`,
          frase: `Provável consumidor ainda cativo do Grupo A: ${atividade}, porte ${e.porte}, fora da lista de consumidores livres da CCEE (inferido, não confirmado)`,
          quando: iso(ctx.agora),
          fonte: 'Receita Federal e lista de agentes da CCEE (dados abertos)',
          evidencia: `Inferido, não confirmado. Receita Federal: ${atividade}; ${dadosDaReceita(e)}. O CNPJ (pela raiz) não consta entre os ${e.cceeConsumidores ?? 0} consumidores livres e especiais da lista de agentes da CCEE (referência ${e.cceeMes}). A ausência na lista indica provável contrato no mercado cativo, mas pode haver outro CNPJ do grupo no mercado livre ou consumo abaixo do Grupo A; confirme com a empresa.`,
        }
        : null
      if (!fato) continue
      saida.push(itemDeEmpresaComFatos({ empresa: empresaDoFato(e, casada.nome), fatos: [fato] }))
    }
    return saida
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// D3. Nova planta ou filial: o mapa de filiais por raiz de CNPJ (fotografia mensal da Receita), comparado com a rodada anterior.

interface Filial {
  cnpj: string
  uf: string
  cnae: string
  situacao: string
  inicio: string
}

const MAX_ORDENS_NA_FOTOGRAFIA = 2500

/** As 4 posições da ordem do estabelecimento (depois da raiz de 8). */
const ordemDaFilial = (cnpj: string) => cnpj.slice(8, 12)

function raizesDasContas(ctx: ContextoDoPasso, maximo: number): string[] {
  return [...new Set(ctx.contas.map((c) => raizDoCnpj(c.cnpj)).filter(Boolean))].slice(0, maximo)
}

const mapaDeFiliais: ImplDoPasso = {
  itensCobrados: (_entrada, ctx) => raizesDasContas(ctx, ctx.def.maxItems ?? 40).length,

  montarEntrada(_entrada, ctx) {
    const raizes = raizesDasContas(ctx, ctx.def.maxItems ?? 40)
    if (!raizes.length) return { pular: 'Nenhuma Conta com CNPJ cadastrado.' }
    return { input: { cnpjs: raizes, maxResults: raizes.length }, maxItems: raizes.length }
  },

  normalizar(brutos) {
    return objetos(brutos).flatMap((b): Item[] => {
      const raiz = texto(b.raiz).replace(/[^0-9A-Za-z]/g, '').toUpperCase()
      if (b.recordType !== 'BRANCH_MAP' || raiz.length !== 8) return []
      const versao = objeto(b.versaoDosDados)
      const filiais = (Array.isArray(b.filiais) ? b.filiais : []).flatMap((f): Filial[] => {
        const o = objeto(f)
        const cnpj = cnpjLimpo(o.cnpj)
        return cnpj ? [{ cnpj, uf: texto(o.uf), cnae: texto(o.cnaePrincipal), situacao: texto(o.situacao).toUpperCase(), inicio: texto(o.dataInicio) }] : []
      })
      return [{
        tipo: 'mapa_filiais', raiz, filiais, total: num(b.totalFiliais) || filiais.length, ativas: num(b.filiaisAtivas),
        mes: texto(versao.referenceMonth) || texto(versao.snapshotMonth),
      }]
    })
  },
}

type Fotografia = { chave: string; data: Record<string, unknown>; takenAt: string }

const filiaisNovas: ImplDoPasso = {
  async executar(entrada, ctx) {
    const mapas = entrada.filter((i) => i.tipo === 'mapa_filiais')
    const anteriores = await ctx.snapshots.ler(mapas.map((m) => texto(m.raiz)))
    const gravarJa: Fotografia[] = []
    const pendentes: Fotografia[] = []
    const saida: Item[] = []
    for (const m of mapas) {
      const raiz = texto(m.raiz)
      const filiais = (Array.isArray(m.filiais) ? m.filiais : []) as Filial[]
      const todas = [...new Set(filiais.map((f) => ordemDaFilial(f.cnpj)))].sort()
      const foto: Fotografia = {
        chave: raiz, takenAt: iso(ctx.agora),
        data: { mes: texto(m.mes), ordens: todas.slice(0, MAX_ORDENS_NA_FOTOGRAFIA), total: num(m.total), ativas: num(m.ativas), truncado: todas.length > MAX_ORDENS_NA_FOTOGRAFIA },
      }
      const antes = anteriores.get(raiz)?.data
      // Sem fotografia anterior (ou truncada) não há base para dizer o que é novo: só grava.
      if (!antes || !Array.isArray(antes.ordens) || antes.truncado === true) {
        gravarJa.push(foto)
        continue
      }
      const jaTinha = new Set((antes.ordens as unknown[]).map(texto))
      const novas = filiais.filter((f) => f.situacao === 'ATIVA' && !jaTinha.has(ordemDaFilial(f.cnpj)))
        .sort((a, b) => b.inicio.localeCompare(a.inicio) || a.cnpj.localeCompare(b.cnpj)).slice(0, 10)
      const contas = ctx.contas.filter((c) => raizDoCnpj(c.cnpj) === raiz)
      if (!novas.length || !contas.length) {
        gravarJa.push(foto)
        continue
      }
      const mesAntes = texto(antes.mes)
      const entre = mesAntes && texto(m.mes) ? `a fotografia de ${mesAntes} e a de ${texto(m.mes)}` : 'as duas últimas fotografias'
      for (const conta of contas) {
        const fatos = novas.map((f): Fato => {
          const inicio = dataBr(f.inicio)
          return {
            chave: `filial|${f.cnpj}`,
            frase: `Abriu nova filial${f.uf ? ` em ${f.uf}` : ''}${inicio ? ` (início em ${inicio})` : ''}`,
            quando: iso(ctx.agora),
            fonte: 'Receita Federal (rede de filiais)',
            evidencia: `Receita Federal, dados abertos: a filial ${cnpjComMascara(f.cnpj)} (${[f.uf ? `UF ${f.uf}` : '', f.cnae ? `CNAE principal ${f.cnae}` : '', 'ativa'].filter(Boolean).join(', ')}) apareceu na rede de filiais entre ${entre}. A rede passou de ${num(antes.total)} para ${num(m.total)} filiais (${num(m.ativas)} ativas).`,
          }
        })
        saida.push(itemDeEmpresaComFatos({ empresa: { nome: conta.name, cnpj: cnpjLimpo(conta.cnpj) }, fatos }))
      }
      pendentes.push(foto)
    }
    if (gravarJa.length) await ctx.snapshots.gravar(gravarJa)
    // A fotografia de quem tem filial nova só avança depois do Sinal gravado (último passo): se a cascata parar antes, a
    // próxima rodada acha a filial de novo.
    ctx.memoria.set('fotografiasPendentes', pendentes)
    return saida
  },
}

const gravarFotografiaFiliais: ImplDoPasso = {
  async executar(entrada, ctx) {
    const pendentes = ctx.memoria.get('fotografiasPendentes')
    if (Array.isArray(pendentes) && pendentes.length) {
      await ctx.snapshots.gravar(pendentes as Fotografia[])
      ctx.memoria.set('fotografiasPendentes', [])
    }
    return entrada
  },
}

const TERMOS_DE_EXPANSAO = [
  'filial', 'filiais', 'nova unidade', 'novas unidades', 'nova planta', 'nova fabrica', 'fabrica', 'planta', 'centro de distribuicao', 'inaugura',
  'inaugurou', 'inauguracao', 'unidade',
]

// D3, passo 3: o reforço. Uma busca de notícias do último mês com o nome das empresas que ganharam filial; a notícia que cita a
// empresa e uma nova unidade entra na evidência (fonte, data e link; o título pode citar pessoa e não é copiado). Nunca filtra.
const noticiasDeExpansao: ImplDoPasso = {
  itensCobrados: (_entrada, ctx) => ctx.def.maxItems ?? 10,

  montarEntrada(entrada, ctx) {
    const nomes = entrada.flatMap((i) => {
      const e = empresaComFatosDoItem(i)
      return e ? [{ nome: semAspas(e.empresa.nome), fatos: e.fatos.length }] : []
    }).sort((a, b) => b.fatos - a.fatos).slice(0, 5).map((n) => n.nome).filter(Boolean)
    if (!nomes.length) return { pular: 'Nenhuma empresa com filial nova para buscar notícias.' }
    const timeframe = texto(ctx.def.inputTemplate.timeframe)
    const regiao = texto(ctx.def.inputTemplate.regiao)
    const maximo = ctx.def.maxItems ?? 10
    return {
      input: {
        keyword: `(${nomes.map((n) => `"${n}"`).join(' OR ')}) (filial OR "nova unidade" OR "nova planta" OR "nova fábrica" OR "centro de distribuição")`,
        maxArticles: maximo,
        timeframe: ['1h', '1d', '1w', '1m', '1y'].includes(timeframe) ? timeframe : '1m',
        region_language: /^[A-Z]{2}:[a-z]{2}(-\d+)?$/.test(regiao) ? regiao : 'BR:pt-419',
      },
      maxItems: maximo,
    }
  },

  normalizar(brutos, entrada) {
    const artigos = objetos(brutos)
    return entrada.map((i) => {
      const e = empresaComFatosDoItem(i)
      if (!e) return i
      const nome = nomeDaEmpresa(e.empresa.nome)
      const citam = artigos.filter((a) => nome && contemAlgum(primeiroTexto(a, 'title'), [nome]) && contemAlgum(primeiroTexto(a, 'title'), TERMOS_DE_EXPANSAO))
      if (!citam.length) return i
      const fontes = [...new Set(citam.map((a) => {
        const data = dataBr(dataIso(a.publishedAt) ?? '')
        return [primeiroTexto(a, 'source', 'source.name'), data].filter(Boolean).join(', ')
      }).filter(Boolean))].slice(0, 3)
      const reforco = ` Reforço: ${citam.length} notícia${citam.length > 1 ? 's' : ''} do último mês ${citam.length > 1 ? 'citam' : 'cita'} a empresa e uma nova unidade (${fontes.join('; ')}${primeiroTexto(citam[0], 'url') ? `; ${primeiroTexto(citam[0], 'url')}` : ''}).`
      return itemDeEmpresaComFatos({ ...e, fatos: e.fatos.map((f) => ({ ...f, evidencia: recortar(`${f.evidencia}${reforco}`, LIMITES.evidencia) })) })
    })
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// D4. Meta ESG publicada: busca por empresa → só páginas do próprio site → leitura da página → confirmação por palavra-chave.

const TERMOS_DE_META = [
  'net zero', 'neutralidade de carbono', 'carbono neutro', 'emissões líquidas zero', 'metas de redução de emissões', 'meta de redução de emissões', 'SBTi',
  'Science Based Targets', 'RE100', 'metas climáticas',
]
const TERMOS_DE_RELATORIO = ['relatório de sustentabilidade', 'relatório ESG', 'relatório integrado']

const termosDe = (ctx: ContextoDoPasso, chave: string, padrao: string[]) => (lista(ctx.def.inputTemplate[chave]).length ? lista(ctx.def.inputTemplate[chave]) : padrao)

const EMPRESAS_POR_LOTE_ESG = 10
const PRAZO_DO_LOTE_ESG_S = 35
const CHAVE_DO_CURSOR_ESG = 'busca-esg'

interface PlanoEsg {
  lotes: { contas: ContaDoWorkspace[] }[]
  inicio: number
  assinatura: string
  total: number
  prazo: number
}

function consultasDasContas(contas: ContaDoWorkspace[], ctx: ContextoDoPasso): { query: string; conta: ContaDoWorkspace; tema: 'meta' | 'relatorio' }[] {
  const consultas = lista(ctx.def.inputTemplate.consultas).length ? lista(ctx.def.inputTemplate.consultas) : ['relatório de sustentabilidade', 'net zero']
  return contas.flatMap((conta) =>
    consultas.map((c) => ({
      query: `"${semAspas(conta.name)}" "${semAspas(c)}"`, conta, tema: contemAlgum(c, ['net zero', 'meta', 'metas', 'neutralidade']) ? 'meta' as const : 'relatorio' as const,
    }))
  )
}

function contasOrdenadas(ctx: ContextoDoPasso): ContaDoWorkspace[] {
  return [...ctx.contas].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** O plano desta rodada: a partir de onde a anterior parou, em lotes de 10 empresas. Lista de Contas diferente recomeça. */
async function planoDaBuscaEsg(ctx: ContextoDoPasso): Promise<PlanoEsg | null> {
  const todas = contasOrdenadas(ctx)
  if (!todas.length) return null
  const porLote = limitar(ctx.criterios.empresasPorLote ?? ctx.def.inputTemplate.empresasPorLote, EMPRESAS_POR_LOTE_ESG, 1, 50)
  const prazo = limitar(ctx.criterios.prazoSegundos ?? ctx.def.inputTemplate.prazoSegundos, PRAZO_DO_LOTE_ESG_S, 10, 90)
  const assinatura = todas.map((c) => c.id).join('\n')
  let inicio = 0
  try {
    const foto = await ctx.snapshots.ler([CHAVE_DO_CURSOR_ESG])
    const data = foto.get(CHAVE_DO_CURSOR_ESG)?.data
    const indice = Number(data?.indice)
    if (data?.assinatura === assinatura && Number.isInteger(indice) && indice >= 0 && indice < todas.length) inicio = indice
  } catch {
    inicio = 0
  }
  const lotes: { contas: ContaDoWorkspace[] }[] = []
  for (let i = inicio; i < todas.length; i += porLote) lotes.push({ contas: todas.slice(i, i + porLote) })
  return { lotes, inicio, assinatura, total: todas.length, prazo }
}

function consultasEsg(ctx: ContextoDoPasso): { query: string; conta: ContaDoWorkspace; tema: 'meta' | 'relatorio' }[] {
  const plano = ctx.memoria.get('planoEsg') as PlanoEsg | undefined
  const contas = plano ? plano.lotes.flatMap((l) => l.contas) : contasOrdenadas(ctx)
  return consultasDasContas(contas, ctx)
}

function entradaDoLote(contas: ContaDoWorkspace[], ctx: ContextoDoPasso, prazo: number) {
  const consultas = consultasDasContas(contas, ctx)
  return {
    input: { keyword: consultas.map((c) => c.query).join('\n'), limit: '10', include_merged: false, gl: 'BR', hl: 'pt' },
    maxItems: consultas.length,
    timeoutSegundos: prazo,
  }
}

const buscaEsg: ImplDoPasso = {
  itensCobrados: (_entrada, ctx) => consultasEsg(ctx).length,

  async montarEntrada(_entrada, ctx) {
    const plano = await planoDaBuscaEsg(ctx)
    if (!plano) return { pular: 'Nenhuma Conta para buscar.' }
    ctx.memoria.set('planoEsg', plano)
    const lotes = plano.lotes.map((l) => entradaDoLote(l.contas, ctx, plano.prazo))
    return lotes.length === 1 ? lotes[0] : { lotes, parcial: true }
  },

  async normalizar(brutos, _entrada, ctx) {
    const plano = ctx.memoria.get('planoEsg') as PlanoEsg | undefined
    const porConsulta = new Map(consultasEsg(ctx).map((c) => [c.query, c]))
    const saida = objetos(brutos).flatMap((linha) => {
      const consulta = porConsulta.get(texto(linha.query))
      if (!consulta) return []
      return objetos(Array.isArray(linha.results) ? linha.results : []).flatMap((r): Item[] => {
        const url = texto(r.url)
        return url ? [{ tipo: 'esg_resultado', contaId: consulta.conta.id, tema: consulta.tema, url, titulo: texto(r.title), descricao: texto(r.description) }] : []
      })
    })
    if (plano) {
      const concluidos = Number(ctx.memoria.get('lotesConcluidos') ?? plano.lotes.length)
      let indice = plano.inicio
      for (let i = 0; i < concluidos && i < plano.lotes.length; i++) indice += plano.lotes[i].contas.length
      if (indice >= plano.total) indice = 0
      try {
        await ctx.snapshots.gravar([{ chave: CHAVE_DO_CURSOR_ESG, data: { indice, assinatura: plano.assinatura, total: plano.total } }])
      } catch {
        // Sem o cursor, a próxima rodada recomeça do início.
      }
    }
    return saida
  },
}

function chaveDaUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return ''
  }
}

const ROTULOS_GENERICOS = new Set(['com', 'br', 'net', 'org', 'io', 'app', 'gov', 'edu', 'www'])
/** O que pode grudar na marca num domínio próprio (`natura` + `eco` = naturaeco.com). */
const SUFIXOS_DE_MARCA = new Set(['eco', 'group', 'grupo', 'brasil', 'holding', 'global', 'latam', 'sa', 'inc', 'co'])

function rotulosDoHost(host: string): string[] {
  return host.split('.').filter((r) => r && !ROTULOS_GENERICOS.has(r))
}

function marcasDaConta(conta: ContaDoWorkspace): string[] {
  const nome = nomeDaEmpresa(conta.name)
  const marcas = new Set<string>()
  const primeira = nome.split(' ')[0] ?? ''
  const compacto = nome.replace(/ /g, '')
  if (primeira.length >= 5) marcas.add(primeira)
  if (compacto.length >= 5) marcas.add(compacto)
  const site = dominio(conta.domain)
  const doSite = site.split('.')[0] ?? ''
  if (doSite.length >= 4 && !ROTULOS_GENERICOS.has(doSite)) marcas.add(doSite)
  return [...marcas]
}

function rotuloDaMarca(rotulo: string, marca: string): boolean {
  if (rotulo === marca) return true
  if (!rotulo.startsWith(marca)) return false
  return SUFIXOS_DE_MARCA.has(rotulo.slice(marca.length))
}

/** Página do site da Conta: o domínio cadastrado, um subdomínio, ou um domínio da marca (rótulo igual ou com sufixo conhecido). */
function ehDoSiteDaConta(conta: ContaDoWorkspace, url: string): boolean {
  const host = dominio(url)
  if (!host) return false
  const site = dominio(conta.domain)
  if (site && mesmoDominio(host, site)) return true
  const marcas = marcasDaConta(conta)
  return rotulosDoHost(host).some((rotulo) => marcas.some((marca) => rotuloDaMarca(rotulo, marca)))
}

const paginasEsg: ImplDoPasso = {
  executar(entrada, ctx) {
    const relevantes = [...termosDe(ctx, 'termosMeta', TERMOS_DE_META), ...termosDe(ctx, 'termosRelatorio', TERMOS_DE_RELATORIO)]
    const maximo = limitar(ctx.def.inputTemplate.maxPaginas, 20, 1, 100)
    const porConta = new Map<string, Item[]>()
    const vistas = new Set<string>()
    for (const i of entrada) {
      const conta = ctx.contas.find((c) => c.id === texto(i.contaId))
      const url = texto(i.url)
      if (i.tipo !== 'esg_resultado' || !conta || !ehDoSiteDaConta(conta, url)) continue
      // Relatório em PDF o rastreador de páginas não lê: não vale pagar por ele.
      if (/\.pdf($|[?#])/i.test(url) || !contemAlgum(`${texto(i.titulo)} ${texto(i.descricao)}`, relevantes)) continue
      const chave = `${conta.id}|${chaveDaUrl(url)}`
      if (vistas.has(chave)) continue
      vistas.add(chave)
      porConta.set(conta.id, [...(porConta.get(conta.id) ?? []), { tipo: 'esg_pagina', contaId: conta.id, contaNome: conta.name, url, tema: texto(i.tema) }])
    }
    return ctx.contas.flatMap((c) =>
      [...(porConta.get(c.id) ?? [])].sort((a, b) => Number(b.tema === 'meta') - Number(a.tema === 'meta')).slice(0, 2)
    ).slice(0, maximo)
  },
}

const confirmarEsgNoSite: ImplDoPasso = {
  itensCobrados: (entrada, ctx) => Math.min(entrada.filter((i) => i.tipo === 'esg_pagina').length, ctx.def.maxItems ?? 20),

  montarEntrada(entrada, ctx) {
    const paginas = entrada.filter((i) => i.tipo === 'esg_pagina').slice(0, ctx.def.maxItems ?? 20)
    if (!paginas.length) return { pular: 'Nenhuma página do próprio site para confirmar.' }
    return {
      input: {
        startUrls: paginas.map((p) => ({ url: texto(p.url) })), crawlerType: 'cheerio', maxCrawlDepth: 0, maxCrawlPages: paginas.length,
        maxResults: paginas.length, saveMarkdown: false, respectRobotsTxtFile: true, proxyConfiguration: { useApifyProxy: true },
      },
      maxItems: paginas.length,
    }
  },

  normalizar(brutos, entrada) {
    const lidas = objetos(brutos).map((b) => ({ chave: chaveDaUrl(primeiroTexto(b, 'crawl.loadedUrl', 'url')), texto: texto(b.text).slice(0, 200_000) }))
    return entrada.flatMap((i): Item[] => {
      const lida = i.tipo === 'esg_pagina' ? lidas.find((l) => l.chave && l.chave === chaveDaUrl(texto(i.url))) : undefined
      return lida ? [{ ...i, tipo: 'esg_pagina_lida', texto: lida.texto }] : []
    })
  },
}

const confirmarEsg: ImplDoPasso = {
  executar(entrada, ctx) {
    const termos = termosDe(ctx, 'termosMeta', TERMOS_DE_META)
    const sinais = new Map<string, Item>()
    for (const i of entrada) {
      const conta = ctx.contas.find((c) => c.id === texto(i.contaId))
      if (i.tipo !== 'esg_pagina_lida' || !conta) continue
      const achados = termos.filter((t) => contemAlgum(i.texto, [t]))
      if (!achados.length) continue
      const eventKey = recortar(`${nomeDaEmpresa(conta.name)}|meta_esg|${ano(ctx.agora)}`, LIMITES.chave)
      if (sinais.has(eventKey)) continue
      let onde = texto(i.url)
      try {
        const u = new URL(texto(i.url))
        onde = `${u.hostname}${u.pathname}`
      } catch { /* fica a URL como veio */ }
      sinais.set(eventKey, {
        contaId: conta.id,
        contaNome: conta.name,
        eventKey,
        phrase: recortar(`Publicou meta ESG no próprio site: ${achados.slice(0, 3).join(', ')}`, LIMITES.frase),
        firedAt: iso(ctx.agora),
        source: 'Site da empresa',
        evidence: recortar(
          `Página da própria empresa (${onde}) menciona ${achados.join(', ')}; confirmado por palavra-chave no texto da página, sem leitura por modelo. Busca de origem: ${texto(i.tema) === 'meta' ? 'meta de clima' : 'relatório de sustentabilidade'}.`,
          LIMITES.evidencia,
        ),
      })
    }
    return [...sinais.values()]
  },
}

export function passosDoIcp_d(fetchFn: typeof fetch = fetch, opcoes: Opcoes = {}): RegistroDePassos {
  return {
    passos: {
      cnpj_por_cnae: cnpjPorCnae,
      linkedin_empresa_por_cnae: linkedinEmpresaPorCnae,
      fatos_cnae_eletrointensivo: fatosCnaeEletrointensivo,
      provavel_cativo: provavelCativo,
      mapa_de_filiais: mapaDeFiliais,
      filiais_novas: filiaisNovas,
      noticias_de_expansao: noticiasDeExpansao,
      gravar_fotografia_filiais: gravarFotografiaFiliais,
      busca_esg: buscaEsg,
      paginas_esg: paginasEsg,
      confirmar_esg_no_site: confirmarEsgNoSite,
      confirmar_esg: confirmarEsg,
    },
    fontes: { ccee_agentes: cceeAgentes(fetchFn, opcoes) },
  }
}
