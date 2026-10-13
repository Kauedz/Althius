// Os passos do ICP F (logística e transporte). Quatro Sinais do Mapa de Mercado:
//   novo_cd_ou_filial             diff mensal da rede de filiais ATIVAS por CNPJ + reforço por notícia
//   troca_de_sede                 diff mensal do endereço da matriz por CNPJ
//   vaga_logistica                a cascata do A1 (handlers de `vagas.ts`, `empresa-linkedin.ts`...) com os termos de logística:
//                                 não tem passo próprio aqui; o teste dela está em `icp-f.test.ts`
//   crescimento_comex_embarcador  sem fonte (a lista anual do MDIC por CNPJ não é mais aberta): sem passos
//
// Fonte das filiais: o mapa de filiais por raiz de CNPJ (esquema e saída BRANCH_MAP publicados em 13/10/2026). A consulta de
// CNPJ devolve UM estabelecimento, nunca a lista de filiais: por isso ela serve ao endereço da sede e não às filiais. A
// BrasilAPI também é por estabelecimento; não há fonte aberta que liste filiais, então o passo das filiais não tem alternativa.
//
// Fotografias (`ctx.snapshots`), chaveadas pelo CNPJ da matriz (14 dígitos): a primeira rodada só grava a base; a segunda
// compara. Só dado da empresa: filiais por número de CNPJ; da sede, município, UF e marcas (hash) da rua e do CEP. Nunca o
// quadro societário, telefone, e-mail nem manchete de notícia (pode citar pessoa).
// Nomes dos handlers com o prefixo `logistica_`: o registro de passos é um só para todos os ICPs.
import { contemAlgum, LIMITES, normalizar, objetos, primeiroTexto, recortar } from '../../../signal-runner/adaptadores/comum.ts'
import type { ContaDoWorkspace, ContextoDoPasso, FontePublica, ImplDoPasso, Item, RegistroDePassos } from '../tipos.ts'
import { cnpjLimpo, dataIso, dentroDoPeriodo, nomeDaEmpresa, objeto, texto } from './comum.ts'
import { sinalDoFato } from './empresas.ts'
import { cnpjDaMatriz, enderecoDoItem, type EnderecoDaSede, formatarCnpj, mudancaDeSede, raizDoCnpj, tituloDoMunicipio } from './icp-f-dados.ts'

const FONTE = 'Receita Federal (dados abertos)'
/** Acima disto a fotografia guarda só a contagem de filiais ativas (a fotografia cabe em 20 mil caracteres). */
const MAX_FILIAIS_NA_FOTOGRAFIA = 900
const MAX_FILIAIS_NA_EVIDENCIA = 5
const MAX_CONSULTAS_BRASILAPI = 60

const num = (v: unknown, padrao: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao
}

const dataCurta = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** As matrizes das Contas com CNPJ, uma por raiz, na ordem das Contas. */
function matrizesDasContas(contas: ContaDoWorkspace[]): string[] {
  return [...new Set(contas.flatMap((c) => (cnpjDaMatriz(c.cnpj) ? [cnpjDaMatriz(c.cnpj)] : [])))]
}

const contasDaMatriz = (contas: ContaDoWorkspace[], matriz: string) => contas.filter((c) => cnpjDaMatriz(c.cnpj) === matriz)

const matrizesDaEntrada = (entrada: Item[]) =>
  entrada.flatMap((i) => (i.tipo === 'raiz_a_fotografar' && texto(i.cnpjMatriz) ? [texto(i.cnpjMatriz)] : []))

const agoraIso = (ctx: ContextoDoPasso) => new Date(ctx.agora).toISOString()

// ---------------------------------------------------------------------------------------------------------------------
// Comum aos dois diffs: quem fotografar nesta rodada.

/** As raízes desta rodada: as Contas sem fotografia primeiro e depois as de fotografia mais antiga (rodízio), até `porRodada`. */
const escolherRaizes: ImplDoPasso = {
  async executar(_entrada, ctx) {
    const porRodada = num(ctx.def.inputTemplate.porRodada, 35)
    const matrizes = matrizesDasContas(ctx.contas)
    if (!matrizes.length) return []
    const fotos = await ctx.snapshots.ler(matrizes)
    const idade = (m: string) => {
      const f = fotos.get(m)
      return f ? Date.parse(f.takenAt) : -Infinity
    }
    return matrizes
      .map((m, ordem) => ({ m, ordem }))
      .sort((a, b) => idade(a.m) - idade(b.m) || a.ordem - b.ordem)
      .slice(0, porRodada)
      .map(({ m }): Item => ({ tipo: 'raiz_a_fotografar', cnpjMatriz: m, raiz: raizDoCnpj(m) }))
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// F1 · novo_cd_ou_filial

interface FilialAtiva {
  cnpj: string
  uf: string
  cnae: string
  inicio: string | null
}

const filialDoItem = (v: unknown): FilialAtiva | null => {
  const o = objeto(v)
  const cnpj = cnpjLimpo(o.cnpj)
  return cnpj ? { cnpj, uf: texto(o.uf).toUpperCase(), cnae: texto(o.cnae), inicio: typeof o.inicio === 'string' ? o.inicio : null } : null
}

const mapaDeFiliais: ImplDoPasso = {
  itensCobrados: (entrada, ctx) => Math.min(matrizesDaEntrada(entrada).length, ctx.def.maxItems ?? Infinity),

  montarEntrada(entrada) {
    const cnpjs = matrizesDaEntrada(entrada)
    if (!cnpjs.length) return { pular: 'Nenhuma Conta com CNPJ para consultar.' }
    // `maxItems` deixa uma folga para o resumo gratuito que o actor entrega junto; `maxResults` é a cerca de cobrança.
    return { input: { cnpjs, maxResults: cnpjs.length }, maxItems: cnpjs.length + 1 }
  },

  normalizar(brutos, entrada, ctx) {
    const pedidas = new Set(matrizesDaEntrada(entrada))
    return objetos(brutos).flatMap((b): Item[] => {
      if (b.recordType !== 'BRANCH_MAP') return []
      const raiz = cnpjLimpo(b.cnpjMatrizCalculado) ? cnpjLimpo(b.cnpjMatrizCalculado).slice(0, 8) : texto(b.raiz).toUpperCase()
      const matriz = cnpjDaMatriz(`${raiz}000100`)
      if (!matriz || !pedidas.has(matriz)) return []
      const versao = objeto(b.versaoDosDados)
      const indice = [texto(versao.referenceMonth), texto(versao.snapshotMonth), texto(objeto(b.staleness).indexMonth)].find((m) => /^\d{4}-\d{2}$/.test(m)) ??
        new Date(ctx.agora).toISOString().slice(0, 7)
      const ativas = (Array.isArray(b.filiais) ? b.filiais : []).flatMap((f): Item[] => {
        const o = objeto(f)
        const cnpj = cnpjLimpo(o.cnpj)
        if (!cnpj || (texto(o.situacao).toUpperCase() !== 'ATIVA' && texto(o.situacaoCodigo) !== '02')) return []
        return [{ cnpj, uf: texto(o.uf).toUpperCase(), cnae: texto(o.cnaePrincipal), inicio: dataIso(o.dataInicio) }]
      })
      return [{ tipo: 'filiais_da_raiz', cnpjMatriz: matriz, raiz: raizDoCnpj(matriz), indice, ativas }]
    })
  },
}

const temArmazenagem = (f: FilialAtiva) => f.cnae.startsWith('5211')

function sinalDeFiliais(conta: ContaDoWorkspace, matriz: string, indice: string, novas: FilialAtiva[], antes: number, depois: number, ctx: ContextoDoPasso): Item {
  const ufs = [...new Set(novas.map((f) => f.uf).filter(Boolean))]
  const onde = ufs.length === 0 ? '' : ufs.length <= 5 ? ` em ${ufs.join(', ')}` : ` em ${ufs.length} estados`
  const armazens = novas.filter(temArmazenagem).length
  const cd = ' (possível centro de distribuição)'
  const frase = novas.length === 1
    ? `Abriu nova filial${armazens ? ` de armazenagem${cd}` : ''}${onde}`
    : `Abriu ${novas.length} novas filiais${armazens ? `, ${armazens} de armazenagem${cd}` : ''}${onde}`
  const lista = novas.slice(0, MAX_FILIAIS_NA_EVIDENCIA).map((f) => {
    const partes = [f.uf, f.cnae ? `CNAE ${f.cnae}` : '', f.inicio ? `início em ${dataCurta(f.inicio)}` : ''].filter(Boolean)
    return `${formatarCnpj(f.cnpj)}${partes.length ? ` (${partes.join(', ')})` : ''}`
  }).join('; ') + (novas.length > MAX_FILIAIS_NA_EVIDENCIA ? ` e mais ${novas.length - MAX_FILIAIS_NA_EVIDENCIA}` : '')
  const menor = novas.map((f) => f.cnpj).sort()[0]
  return sinalDoFato(conta, { nome: conta.name, cnpj: matriz }, {
    chave: `filiais|${indice}|${menor}|${novas.length}`,
    frase,
    quando: agoraIso(ctx),
    fonte: FONTE,
    evidencia: `Receita Federal, dados abertos de ${indice}: ${novas.length} ${novas.length === 1 ? 'nova filial ativa' : 'novas filiais ativas'} desde a rodada anterior: ${lista}. A rede passou de ${antes} para ${depois} filiais ativas.`,
  })
}

function sinalDeCrescimento(conta: ContaDoWorkspace, matriz: string, indice: string, antes: number, depois: number, ctx: ContextoDoPasso): Item {
  return sinalDoFato(conta, { nome: conta.name, cnpj: matriz }, {
    chave: `filiais|${indice}|${depois}`,
    frase: `A rede passou de ${antes} para ${depois} filiais ativas`,
    quando: agoraIso(ctx),
    fonte: FONTE,
    evidencia: `Receita Federal, dados abertos de ${indice}: a rede de filiais ativas passou de ${antes} para ${depois} desde a rodada anterior (rede grande demais para listar uma a uma).`,
  })
}

const novasFiliais: ImplDoPasso = {
  async executar(entrada, ctx) {
    const idadeMaxima = num(ctx.def.inputTemplate.idadeMaximaDias, 180)
    const mapas = entrada.filter((i) => i.tipo === 'filiais_da_raiz')
    const fotos = await ctx.snapshots.ler(mapas.map((m) => texto(m.cnpjMatriz)))
    const novasFotos: { chave: string; data: Record<string, unknown>; takenAt: string }[] = []
    const sinais: Item[] = []
    for (const m of mapas) {
      const matriz = texto(m.cnpjMatriz)
      const indice = texto(m.indice)
      const ativas = new Map<string, FilialAtiva>()
      for (const f of Array.isArray(m.ativas) ? m.ativas : []) {
        const filial = filialDoItem(f)
        if (filial) ativas.set(filial.cnpj, filial)
      }
      const cnpjs = [...ativas.keys()].sort()
      const grande = cnpjs.length > MAX_FILIAIS_NA_FOTOGRAFIA
      const base = fotos.get(matriz)?.data
      if (base) {
        const baseFiliais = new Set(Array.isArray(base.filiais) ? base.filiais.filter((c): c is string => typeof c === 'string') : [])
        const baseAtivas = num(base.ativas, 0)
        const contas = contasDaMatriz(ctx.contas, matriz)
        if (!grande && base.grande !== true) {
          const novas = cnpjs.filter((c) => !baseFiliais.has(c)).map((c) => ativas.get(c)!)
            .filter((f) => !f.inicio || dentroDoPeriodo(f.inicio, ctx.agora, idadeMaxima))
          if (novas.length) for (const conta of contas) sinais.push(sinalDeFiliais(conta, matriz, indice, novas, baseAtivas, cnpjs.length, ctx))
        } else if (cnpjs.length > baseAtivas) {
          for (const conta of contas) sinais.push(sinalDeCrescimento(conta, matriz, indice, baseAtivas, cnpjs.length, ctx))
        }
      }
      novasFotos.push({
        chave: matriz,
        data: { raiz: raizDoCnpj(matriz), filiais: grande ? [] : cnpjs, ativas: cnpjs.length, indice, ...(grande ? { grande: true } : {}) },
        takenAt: agoraIso(ctx),
      })
    }
    // A fotografia nova entra sempre (ela marca a vez da Conta no rodízio); na primeira rodada é só ela.
    await ctx.snapshots.gravar(novasFotos)
    return sinais
  },
}

// F1, reforço: a notícia de centro de distribuição das Contas que tiveram filial nova. Reforça a evidência; não filtra nem cria Sinal.

const FORMA_JURIDICA_NO_FIM = /\s+(s\.?\s?\/?\s?a\.?|ltda\.?|me|epp|eireli)\s*$/i
const nomeCurto = (nome: string) => nome.replace(FORMA_JURIDICA_NO_FIM, '').replace(/[\s,.-]+$/, '').trim()

function janelaDaNoticia(dias: number): string {
  return dias <= 1 ? '1d' : dias <= 7 ? '7d' : dias <= 30 ? '30d' : '1y'
}

function contasDoReforco(entrada: Item[], ctx: ContextoDoPasso) {
  const porConta = num(ctx.def.inputTemplate.porConta, 3)
  const maximo = Math.max(1, Math.floor((ctx.def.maxItems ?? 24) / porConta))
  const vistas = new Map<string, { contaId: string; nome: string }>()
  for (const i of entrada) {
    const contaId = texto(i.contaId)
    const nome = nomeCurto(texto(i.contaNome))
    if (contaId && nome && !vistas.has(contaId)) vistas.set(contaId, { contaId, nome })
  }
  return { porConta, contas: [...vistas.values()].slice(0, maximo) }
}

const consultaDaNoticia = (nome: string, termo: string) => `"${nome}" "${termo}"`

const noticiasDeCd: ImplDoPasso = {
  itensCobrados: (entrada, ctx) => {
    const { porConta, contas } = contasDoReforco(entrada, ctx)
    return contas.length * porConta
  },

  montarEntrada(entrada, ctx) {
    const { porConta, contas } = contasDoReforco(entrada, ctx)
    const termo = texto(ctx.def.inputTemplate.termo) || 'novo centro de distribuição'
    if (!contas.length) return { pular: 'Nenhuma Conta com filial nova para reforçar.' }
    return {
      input: {
        keywords: contas.map((c) => consultaDaNoticia(c.nome, termo)),
        maxArticles: porConta,
        timeframe: janelaDaNoticia(num(ctx.def.inputTemplate.janelaDias, 30)),
        region_language: texto(ctx.def.inputTemplate.regiao) || 'BR:pt-419',
        decodeUrls: false,
        extractDescriptions: false,
        extractImages: false,
      },
      maxItems: contas.length * porConta,
    }
  },

  normalizar(brutos, entrada, ctx) {
    const termos = Array.isArray(ctx.def.inputTemplate.termosConfirmacao)
      ? ctx.def.inputTemplate.termosConfirmacao.filter((t): t is string => typeof t === 'string')
      : ['centro de distribuicao', 'novo cd']
    const janela = num(ctx.def.inputTemplate.janelaDias, 30)
    const noticias = objetos(brutos).flatMap((b) => {
      const quando = dataIso(b.publishedAt) ?? dataIso(b.publishedTimestamp)
      const url = primeiroTexto(b, 'url')
      if (!quando || !/^https?:\/\//i.test(url) || !dentroDoPeriodo(quando, ctx.agora, janela)) return []
      return [{ quando, url, fonte: primeiroTexto(b, 'source'), texto: `${primeiroTexto(b, 'title')} ${primeiroTexto(b, 'description')}` }]
    })
    return entrada.map((item) => {
      const nome = nomeDaEmpresa(nomeCurto(texto(item.contaNome)))
      if (!nome) return item
      const achada = noticias
        .filter((n) => ` ${normalizar(n.texto)} `.includes(` ${nome} `) && contemAlgum(n.texto, termos))
        .sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))[0]
      if (!achada) return item
      // Nunca a manchete: ela pode citar pessoa. Só a fonte, a data e o link.
      const reforco = `Notícia recente cita centro de distribuição da empresa: ${achada.fonte || 'imprensa'}, ${dataCurta(achada.quando)}. ${achada.url}`
      return { ...item, evidence: recortar(`${texto(item.evidence)} ${reforco}`, LIMITES.evidencia) }
    })
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// F2 · troca_de_sede

const enderecoDaMatriz: ImplDoPasso = {
  itensCobrados: (entrada, ctx) => Math.min(matrizesDaEntrada(entrada).length, ctx.def.maxItems ?? Infinity),

  montarEntrada(entrada) {
    const cnpjs = matrizesDaEntrada(entrada)
    if (!cnpjs.length) return { pular: 'Nenhuma Conta com CNPJ para consultar.' }
    return { input: { mode: 'lookup', cnpjs }, maxItems: cnpjs.length }
  },

  // Do registro só entram o CNPJ e o endereço: o quadro societário, o telefone e o e-mail nunca são lidos.
  normalizar(brutos, entrada) {
    const pedidas = new Set(matrizesDaEntrada(entrada))
    const vistas = new Set<string>()
    return objetos(brutos).flatMap((b): Item[] => {
      const cnpj = cnpjLimpo(b.cnpj)
      const endereco = enderecoDoItem(b)
      if (!cnpj || !pedidas.has(cnpj) || vistas.has(cnpj) || !endereco) return []
      vistas.add(cnpj)
      return [{ tipo: 'sede', cnpjMatriz: cnpj, endereco }]
    })
  },
}

/** A BrasilAPI (`/api/cnpj/v1/{cnpj}`, aberta, sem custo): o endereço da matriz, no formato do registro acima. Nunca lê o `qsa`. */
export function brasilApiMatriz(fetchFn: typeof fetch = fetch): FontePublica {
  return {
    async buscar(entrada) {
      const itens: Item[] = []
      for (const cnpj of matrizesDaEntrada(entrada).slice(0, MAX_CONSULTAS_BRASILAPI)) {
        try {
          const r = await fetchFn(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
          if (!r.ok) {
            await r.body?.cancel()
            continue
          }
          const b = objeto(await r.json())
          itens.push({
            cnpj,
            endereco: { logradouro: texto(b.logradouro), numero: texto(b.numero), municipio: texto(b.municipio), uf: texto(b.uf), cep: texto(b.cep) },
          })
        } catch {
          // Esta consulta falhou; as outras seguem.
        }
      }
      return itens
    },
  }
}

const enderecoDaFotografia = (d: Record<string, unknown>): EnderecoDaSede | null => {
  const municipio = texto(d.municipio)
  const uf = texto(d.uf)
  return municipio && uf ? { municipio, uf, via: texto(d.via), cep: texto(d.cep) } : null
}

const lugar = (e: EnderecoDaSede) => `${tituloDoMunicipio(e.municipio)}/${e.uf}`

const mudancaDeSedeDaConta: ImplDoPasso = {
  async executar(entrada, ctx) {
    const sedes = entrada.filter((i) => i.tipo === 'sede')
    const fotos = await ctx.snapshots.ler(sedes.map((s) => texto(s.cnpjMatriz)))
    const hoje = agoraIso(ctx)
    const sinais: Item[] = []
    for (const s of sedes) {
      const matriz = texto(s.cnpjMatriz)
      const depois = enderecoDaFotografia(objeto(s.endereco))
      if (!depois) continue
      const anterior = fotos.get(matriz)
      const antes = anterior ? enderecoDaFotografia(anterior.data) : null
      const mudou = antes ? mudancaDeSede(antes, depois) : null
      if (antes && anterior && mudou) {
        const frase = mudou === 'endereco'
          ? `Mudou o endereço da sede, dentro de ${lugar(depois)}`
          : `Trocou a sede de ${lugar(antes)} para ${lugar(depois)}`
        const de = mudou === 'endereco' ? `dentro de ${lugar(depois)}` : `de ${lugar(antes)} para ${lugar(depois)}`
        for (const conta of contasDaMatriz(ctx.contas, matriz)) {
          sinais.push(sinalDoFato(conta, { nome: conta.name, cnpj: matriz }, {
            chave: `sede|${depois.uf}|${normalizar(depois.municipio).replace(/ /g, '-')}|${depois.via || depois.cep}|${hoje.slice(0, 7)}`,
            frase,
            quando: hoje,
            fonte: FONTE,
            evidencia: `Receita Federal: o endereço da matriz (CNPJ ${formatarCnpj(matriz)}) mudou entre as consultas de ${dataCurta(anterior.takenAt)} e ${dataCurta(hoje)}: ${de}.`,
          }))
        }
      }
    }
    // A fotografia nova entra sempre (marca a vez da Conta no rodízio); na primeira rodada é só ela.
    await ctx.snapshots.gravar(sedes.flatMap((s) => {
      const e = enderecoDaFotografia(objeto(s.endereco))
      return e ? [{ chave: texto(s.cnpjMatriz), data: { municipio: e.municipio, uf: e.uf, via: e.via, cep: e.cep }, takenAt: hoje }] : []
    }))
    return sinais
  },
}

export function passosDoIcp_f(fetchFn: typeof fetch = fetch): RegistroDePassos {
  return {
    passos: {
      logistica_escolher_raizes: escolherRaizes,
      logistica_filiais_da_raiz: mapaDeFiliais,
      logistica_novas_filiais: novasFiliais,
      logistica_noticias_de_cd: noticiasDeCd,
      logistica_endereco_da_matriz: enderecoDaMatriz,
      logistica_mudanca_de_sede: mudancaDeSedeDaConta,
    },
    fontes: { logistica_brasilapi_matriz: brasilApiMatriz(fetchFn) },
  }
}
