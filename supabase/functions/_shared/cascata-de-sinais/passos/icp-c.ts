// Os passos do ICP C (jurídico empresarial). O banco registra QUAIS passos formam cada cascata; aqui está COMO cada um roda.
//   processos_publicos    (C1) contas com CNPJ → resumo de processos por CNPJ (actor) → salto de processos trabalhistas e
//                              tributários contra a fotografia anterior. SÓ contagens por CNPJ: nada de parte, advogado ou CPF.
//   mudanca_regulatoria   (C2) Diário Oficial da União por palavra-chave (actor) → setores (CNAE) afetados → Sinal de MERCADO.
//   recuperacao_judicial  (C3) notícias de recuperação judicial ou falência (actor) → nome da empresa → casa com as Contas do
//                              Workspace → confirma no resumo de processos do CNPJ da Conta.
//   impacto_reforma_cnae  (C4) tabela interna CNAE → impacto + amostra de empresas ativas do CNAE (actor) → Sinal de MERCADO.
// Esquemas de entrada e saída dos actors: lidos na API pública da Apify Store em 13/10/2026 (ver a migração).
// Fica DESLIGADO o actor de processos individuais (traz partes, inclusive pessoa física): ver as decisões da migração.
import { contemAlgum, LIMITES, mesmaEmpresa, nomeDaEmpresa, normalizar, objetos, primeiroTexto, recortar } from '../../../signal-runner/adaptadores/comum.ts'
import type { ContextoDoPasso, ImplDoPasso, Item, Llm, RegistroDePassos } from '../tipos.ts'
import { cnpjLimpo, dataIso, dentroDoPeriodo, janelaDoPasso, listaDoPasso, objeto, texto } from './comum.ts'
import { type EmpresaDoFato, type Fato, itemDeEmpresaComFatos } from './empresas.ts'
import {
  IMPACTO_DA_REFORMA, type ImpactoDoSetor, SETOR_DA_REFORMA, classificarPorPalavras, divisaoDoCnae, impactoDaDivisao,
} from './icp-c-cnae.ts'

const DIA = 86_400_000
const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const arredondar = (n: number) => Math.round(n * 1e6) / 1e6
/** AAAA-MM-DD... → DD/MM/AAAA. */
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const limiar = (ctx: ContextoDoPasso, chave: string, padrao: number): number => {
  const v = Number(ctx.criterios[chave] ?? ctx.def.inputTemplate[chave])
  return Number.isFinite(v) && v > 0 ? v : padrao
}

// ---------------------------------------------------------------------------------------------------------------------
// C1 · Processos públicos

const SOMENTE_CPF_NO_NOME = /\d{11}$/

/** A contagem trabalhista e tributária de um resumo. Cada mapa de `distribuicao` repete os mesmos processos por uma dimensão:
 * não se somam dimensões; fica a maior que identifica o tipo (menor limite seguro). */
export function contarTrabalhistaETributario(distribuicao: unknown): { trabalhista: number; tributario: number } {
  const d = objeto(distribuicao)
  const soma = (mapa: string, serve: (chave: string) => boolean) =>
    Object.entries(objeto(d[mapa])).reduce((s, [k, v]) => (serve(normalizar(k)) ? s + Math.max(num(v), 0) : s), 0)
  const trabalhista = Math.max(
    soma('porTipoTribunal', (k) => k.includes('trabalh')),
    soma('porNomeTribunal', (k) => /^(trt\d*|tst)(\s|$)/.test(k)),
    soma('porAssuntoCnjAbrangente', (k) => k.includes('direito do trabalho')),
  )
  const tributario = Math.max(
    soma('porTipoTribunal', (k) => k.includes('tribut')),
    soma('porTipoProcedimentoCnj', (k) => k.includes('execucao fiscal')),
    soma('porTipo', (k) => k.includes('execucao fiscal')),
  )
  return { trabalhista, tributario }
}

/** Quantos processos de recuperação judicial ou falência o resumo mostra (a maior dimensão). */
function processosDeRecuperacao(distribuicao: unknown): number {
  const d = objeto(distribuicao)
  return Math.max(0, ...['porTipoProcedimentoCnj', 'porTipo', 'porAssuntoCnj', 'porAssuntoCnjAbrangente'].map((mapa) =>
    Object.entries(objeto(d[mapa])).reduce((s, [k, v]) => {
      const n = normalizar(k)
      return n.includes('recuperacao judicial') || n.includes('falencia') ? s + Math.max(num(v), 0) : s
    }, 0)
  ))
}

const cnpjsDoPasso = (entrada: Item[], tipo: string) =>
  [...new Set(entrada.filter((i) => i.tipo === tipo).map((i) => cnpjLimpo(i.cnpj)).filter(Boolean))]

const cnpjsParaProcessos: ImplDoPasso = {
  async executar(_entrada, ctx) {
    const maximo = Math.min(limiar(ctx, 'maxCnpjs', 10), Number(ctx.def.inputTemplate.maxCnpjs ?? 10))
    const porCnpj = new Map<string, { id: string; name: string }>()
    let puladas = 0
    for (const c of ctx.contas) {
      const cnpj = cnpjLimpo(c.cnpj)
      // Razão social de empresário individual é nome de pessoa seguido do CPF: a conta é da pessoa, não da empresa.
      if (!cnpj || SOMENTE_CPF_NO_NOME.test(c.name.trim())) {
        puladas++
        continue
      }
      if (!porCnpj.has(cnpj)) porCnpj.set(cnpj, { id: c.id, name: c.name })
    }
    ctx.memoria.set('puladasSemCnpj', puladas)
    const fotos = await ctx.snapshots.ler([...porCnpj.keys()])
    const quando = (cnpj: string) => (fotos.has(cnpj) ? Date.parse(fotos.get(cnpj)!.takenAt) : -Infinity)
    return [...porCnpj]
      .sort((a, b) => quando(a[0]) - quando(b[0]))
      .slice(0, maximo)
      .map(([cnpj, c]): Item => ({ tipo: 'conta_cnpj', contaId: c.id, contaNome: c.name, cnpj }))
  },
}

const processosPorCnpj: ImplDoPasso = {
  itensCobrados: (entrada, ctx) => Math.min(cnpjsDoPasso(entrada, 'conta_cnpj').length, ctx.def.maxItems ?? 10),

  montarEntrada(entrada, ctx) {
    const cnpjs = cnpjsDoPasso(entrada, 'conta_cnpj').slice(0, ctx.def.maxItems ?? 10)
    if (!cnpjs.length) return { pular: 'Nenhuma Conta com CNPJ cadastrado.' }
    return { input: { cnpjs }, maxItems: cnpjs.length }
  },

  // Só os campos do resumo agregado entram (CNPJ, total e contagens): parte, advogado ou processo individual que viesse
  // junto nunca é lido.
  normalizar(brutos, entrada) {
    const contas = new Map(entrada.filter((i) => i.tipo === 'conta_cnpj').map((i) => [cnpjLimpo(i.cnpj), i]))
    return objetos(brutos).flatMap((b): Item[] => {
      const cnpj = cnpjLimpo(b.cnpj)
      const conta = contas.get(cnpj)
      if (!cnpj || !conta || b.encontrado === false || typeof b.totalProcessos !== 'number' || !Number.isFinite(b.totalProcessos)) return []
      const { trabalhista, tributario } = contarTrabalhistaETributario(b.distribuicao)
      return [{ tipo: 'processos_cnpj', cnpj, contaId: conta.contaId, contaNome: conta.contaNome, total: b.totalProcessos, trabalhista, tributario }]
    })
  },
}

const saltosDeProcessos: ImplDoPasso = {
  async executar(entrada, ctx) {
    const linhas = entrada.filter((i) => i.tipo === 'processos_cnpj')
    const minimo = Math.max(1, Math.round(limiar(ctx, 'limiarNovos', 3)))
    const janela = limiar(ctx, 'janelaDias', 90)
    const fotos = await ctx.snapshots.ler(linhas.map((l) => texto(l.cnpj)))
    const agoraIso = new Date(ctx.agora).toISOString()
    const sinais: Item[] = []
    for (const l of linhas) {
      const cnpj = texto(l.cnpj)
      const antes = fotos.get(cnpj)
      const idade = antes ? (ctx.agora - Date.parse(antes.takenAt)) / DIA : Infinity
      // A primeira rodada (ou uma base velha demais para ser "em 90 dias") só grava a fotografia.
      if (antes && idade <= janela) {
        const [t0, r0] = [num(antes.data.trabalhista), num(antes.data.tributario)]
        const [t1, r1] = [num(l.trabalhista), num(l.tributario)]
        const salto = t1 + r1 - (t0 + r0)
        if (salto >= minimo) {
          const dias = Math.max(1, Math.round(idade))
          const sinal = (n: number) => (n > 0 ? `+${n}` : String(n))
          sinais.push({
            contaId: texto(l.contaId),
            contaNome: texto(l.contaNome),
            eventKey: recortar(`processos|${cnpj}|${agoraIso.slice(0, 7)}`, LIMITES.chave),
            phrase: recortar(`Processos trabalhistas e tributários subiram de ${t0 + r0} para ${t1 + r1} (+${salto}) em ${dias} dias`, LIMITES.frase),
            firedAt: agoraIso,
            source: 'Tribunais (processos públicos, agregados por CNPJ)',
            evidence: recortar(
              `Consulta de ${br(agoraIso)}, últimos 3 anos como réu: ${t1} trabalhistas (${sinal(t1 - t0)}), ${r1} tributários (${sinal(r1 - r0)}), ` +
                `${num(l.total)} no total. Comparada à consulta de ${br(antes.takenAt)}. Contagem agregada por CNPJ, sem partes nem advogados.`,
              LIMITES.evidencia,
            ),
          })
        }
      }
    }
    await ctx.snapshots.gravar(linhas.map((l) => ({
      chave: texto(l.cnpj), takenAt: agoraIso, data: { total: num(l.total), trabalhista: num(l.trabalhista), tributario: num(l.tributario) },
    })))
    return sinais
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// C2 · Mudança regulatória (DOU)

/** "08/10/2026" → ISO ao meio-dia UTC; nulo se não for data. */
function dataDoDou(v: unknown): string | null {
  const m = texto(v).match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? dataIso(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`) : dataIso(v)
}

/** CPF (com ou sem máscara) que apareça num texto do Diário Oficial nunca segue adiante. */
const semCpf = (t: string) => t.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\*{3}\.?\d{3}\.?\d{3}-?\*{2}/g, '[cpf omitido]')

/** Os termos desta busca, para a regra do passo seguinte (o modelo dela pode não repetir a lista). */
const TERMOS_DOU = 'termosDou'

function termosDoDou(ctx: ContextoDoPasso): string[] {
  const doPasso = listaDoPasso(ctx, 'termos', 'termos')
  if (doPasso.length) return doPasso
  const guardados = ctx.memoria.get(TERMOS_DOU)
  return Array.isArray(guardados) ? guardados.filter((t): t is string => typeof t === 'string' && t.length > 0) : []
}

const douPublicacoes: ImplDoPasso = {
  montarEntrada(_entrada, ctx, actorId) {
    const termos = listaDoPasso(ctx, 'termos', 'termos')
    if (!termos.length) return { pular: 'Sem termo de busca no Diário Oficial.' }
    ctx.memoria.set(TERMOS_DOU, termos)
    const maximo = ctx.def.maxItems ?? 50
    // O monitor da Seção 1 olha cerca de 3 dias e casa palavra solta: a frase exata fica no normalizar.
    if (actorId.startsWith('brasildados~')) return { input: { q: termos.slice(0, 30), s: 'DO1' }, maxItems: maximo }
    return {
      input: { mode: 'monitorar', termos, secao: 'do1', dias: janelaDoPasso(ctx), max_resultados: maximo, texto_completo: false },
      maxItems: maximo,
    }
  },

  normalizar(brutos, _entrada, ctx) {
    const termos = termosDoDou(ctx)
    const janela = janelaDoPasso(ctx)
    const vistas = new Set<string>()
    return objetos(brutos).flatMap((b): Item[] => {
      const url = primeiroTexto(b, 'url')
      const data = dataDoDou(b.data)
      const titulo = semCpf(primeiroTexto(b, 'titulo'))
      const tipoAto = primeiroTexto(b, 'tipo')
      const ementa = semCpf(primeiroTexto(b, 'ementa', 'resumo'))
      if (!data || !titulo || (url && vistas.has(url))) return []
      // A palavra achada pela fonte não prova a frase: o texto do ato tem de trazer o termo, dentro da janela.
      if (termos.length && !contemAlgum(`${titulo} ${ementa} ${tipoAto}`, termos)) return []
      if (!dentroDoPeriodo(data, ctx.agora, janela)) return []
      if (url) vistas.add(url)
      const hierarquia = Array.isArray(b.hierarquia) ? b.hierarquia.filter((x): x is string => typeof x === 'string') : []
      return [{
        tipo: 'publicacao_dou', titulo, tipoAto, url, data,
        orgao: primeiroTexto(b, 'orgao') || hierarquia.at(-1) || '', ementa,
        secao: primeiroTexto(b, 'secao'), termo: primeiroTexto(b, 'termo_encontrado', 'termoBuscado'),
      }]
    })
  },

  /** Fora da frase ou da data não serve. Data dd/mm/aaaa dentro da janela pedida confere, mesmo que a fonte só cubra uns 3 dias. */
  confereConsulta: (_brutos, saida) => saida.length > 0,
}

// Ato de pessoal cita nome de pessoa: fica fora antes de qualquer classificação e nunca vai ao modelo.
const ATO_DE_PESSOAL = /\b(nomeia|nomear|nomeacao|exonera|exoneracao|designa|designacao|aposenta\w*|dispensa|promove)\b/

interface Classificada {
  setores: { setor: string; divisoes: string[] }[]
  divisoes: string[] | 'todas'
  por: 'modelo' | 'regra'
}

function classificarDouPorRegra(p: Item): Classificada | null {
  const c = classificarPorPalavras(`${texto(p.titulo)} ${texto(p.orgao)} ${texto(p.ementa)}`)
  if (!c.reforma && !c.setores.length) return null
  const setores = c.reforma ? [{ setor: SETOR_DA_REFORMA, divisoes: [] as string[] }, ...c.setores] : c.setores
  return { setores, divisoes: c.reforma ? 'todas' : [...new Set(c.setores.flatMap((s) => s.divisoes))], por: 'regra' }
}

const SISTEMA_DOU =
  'Você classifica atos da Seção 1 do Diário Oficial da União quanto ao efeito sobre setores econômicos brasileiros (divisões do CNAE, 2 dígitos). ' +
  'Responda SOMENTE JSON: {"itens":[{"i":<número da linha>,"relevante":true|false,"divisoesCnae":["35"],"setor":"nome curto do setor"}]}. ' +
  'Relevante é só o ato normativo que muda regras para empresas (tributo, regulação setorial). Use divisoesCnae vazio quando atinge todos os setores. Nunca cite nome de pessoa.'

async function classificarDouComModelo(pubs: Item[], llm: Llm, ctx: ContextoDoPasso): Promise<Map<number, Classificada>> {
  const linhas = pubs.map((p, i) => `${i}|${texto(p.tipoAto)}|${texto(p.orgao)}|${texto(p.titulo)}|${recortar(texto(p.ementa), 300)}`)
  const r = await llm.json({ sistema: SISTEMA_DOU, usuario: linhas.join('\n'), maxTokens: 1200 })
  ctx.custo.adicionar(r.custoUsd)
  const saida = new Map<number, Classificada>()
  const itens = objeto(r.json).itens
  if (!Array.isArray(itens)) throw new Error('classificação sem lista de itens')
  for (const it of itens) {
    const o = objeto(it)
    const i = Number(o.i)
    if (!Number.isInteger(i) || i < 0 || i >= pubs.length || o.relevante !== true) continue
    const divisoes = [...new Set((Array.isArray(o.divisoesCnae) ? o.divisoesCnae : []).map(texto).filter((d) => /^(0[1-9]|[1-9]\d)$/.test(d)))].slice(0, 8)
    const setor = recortar(texto(o.setor), 80) || (divisoes.length ? `CNAE ${divisoes.join(', ')}` : SETOR_DA_REFORMA)
    saida.set(i, { setores: [{ setor, divisoes }], divisoes: divisoes.length ? divisoes : 'todas', por: 'modelo' })
  }
  return saida
}

const MAX_SINAIS_DOU = 10

const classificarMudanca: ImplDoPasso = {
  async executar(entrada, ctx) {
    const janela = janelaDoPasso(ctx)
    const termos = termosDoDou(ctx)
    const pubs = entrada.filter((i) => {
      if (i.tipo !== 'publicacao_dou' || Date.parse(texto(i.data)) < ctx.agora - janela * DIA) return false
      const corpo = `${texto(i.tipoAto)} ${texto(i.titulo)} ${texto(i.ementa)}`
      if (ATO_DE_PESSOAL.test(normalizar(corpo))) return false
      return !termos.length || contemAlgum(corpo, termos)
    })
    let porModelo: Map<number, Classificada> | null = null
    if (ctx.llm && pubs.length) {
      try {
        porModelo = await classificarDouComModelo(pubs, ctx.llm, ctx)
      } catch {
        porModelo = null // o modelo falhou: a regra de palavras-chave assume
      }
    }
    const sinais: Item[] = []
    pubs.forEach((p, i) => {
      const c = porModelo ? porModelo.get(i) : classificarDouPorRegra(p)
      if (!c) return
      const data = texto(p.data)
      const orgao = texto(p.orgao)
      const orgaoCurto = orgao.split('/').at(-1)?.trim() || orgao
      const setores = c.setores.map((s) => s.setor).join('; ')
      const divTexto = c.divisoes === 'todas' ? 'todos' : c.divisoes.join(', ')
      const ementa = recortar(texto(p.ementa) || texto(p.titulo), 110)
      const slug = texto(p.url).split('/').filter(Boolean).at(-1)?.toLowerCase() || normalizar(`${texto(p.titulo)} ${data}`).replace(/ /g, '-')
      sinais.push({
        eventKey: recortar(`dou|${slug}`, LIMITES.chave),
        phrase: recortar(`${texto(p.tipoAto) || 'Ato'} (${orgaoCurto}, ${br(data)}): ${ementa} Afeta: ${setores}.`, LIMITES.frase),
        firedAt: data,
        source: 'Diário Oficial da União',
        evidence: recortar(
          `${texto(p.tipoAto) || 'Ato'} publicado em ${br(data)} na Seção 1 do Diário Oficial da União por ${orgao || 'órgão não informado'}. ` +
            `${recortar(texto(p.ementa), 400)} Setores afetados (CNAE): ${divTexto}. ` +
            `Classificação ${c.por === 'modelo' ? 'automática por modelo de linguagem' : 'por palavras-chave (tabela interna)'}. Link: ${texto(p.url)}`,
          LIMITES.evidencia,
        ),
        payload: {
          orgao, tipo: texto(p.tipoAto), titulo: texto(p.titulo), url: texto(p.url), secao: texto(p.secao), termo: texto(p.termo),
          setores: c.setores.map((s) => s.setor), divisoesCnae: c.divisoes, classificadoPor: c.por,
        },
      })
    })
    return sinais.sort((a, b) => Date.parse(texto(b.firedAt)) - Date.parse(texto(a.firedAt))).slice(0, MAX_SINAIS_DOU)
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// C3 · Recuperação judicial

const noticiasRecuperacao: ImplDoPasso = {
  montarEntrada(_entrada, ctx) {
    const consulta = texto(ctx.criterios.consulta) || texto(ctx.def.inputTemplate.consulta)
    if (!consulta) return { pular: 'Sem consulta de notícias.' }
    const dias = janelaDoPasso(ctx)
    const maximo = ctx.def.maxItems ?? 40
    return {
      input: {
        keywords: [consulta], timeframe: dias <= 1 ? '1d' : dias <= 7 ? '7d' : '30d', region_language: 'BR:pt-419', maxArticles: maximo,
        extractImages: false, extractDescriptions: false, decodeUrls: false,
      },
      maxItems: maximo,
    }
  },

  normalizar(brutos) {
    return objetos(brutos).flatMap((b): Item[] => {
      const titulo = primeiroTexto(b, 'title')
      if (!titulo) return []
      return [{ tipo: 'noticia', titulo, fonte: primeiroTexto(b, 'source'), url: primeiroTexto(b, 'url'), publicadaEm: dataIso(b.publishedAt) ?? dataIso(b.publishedTimestamp) }]
    })
  },
}

/** Sem acento e em minúsculas, do mesmo tamanho do original (para achar o nome na manchete original). */
const semAcento = (s: string) => s.replace(/[À-ÿ]/g, (c) => c.normalize('NFD')[0]).toLowerCase()

const NEGATIVA = /\b(nega|negou|rejeita|rejeitou|arquiva|arquivou|encerra|encerrou|sai d|saiu d|supera|superou|fim d|homologa|homologou|aprova|aprovou|revoga|revogou|suspende|suspendeu|cancela|cancelou|indefere|indeferiu|extingue|extinguiu)\b/
const PESSOA_FISICA = /produtor(a)? rural|pessoa fisica|empresario individual|\bmei\b|espolio|\bcpf\b|microempreendedor/
const SUJEITO_GENERICO = /^(justica|tribunal|juiz|juiza|stj|stf|governo|banco central|pedido|empresas|empresa|mais|numero|brasil|setor|onda)\b/
const MARCADOR_DE_EMPRESA = new Set([
  'ltda', 'sa', 's', 'me', 'epp', 'eireli', 'cia', 'companhia', 'grupo', 'holding', 'participacoes', 'industria', 'industrias', 'comercio', 'construtora',
  'incorporadora', 'transportes', 'transportadora', 'logistica', 'agro', 'agroindustrial', 'energia', 'telecom', 'banco', 'varejo', 'rede', 'cooperativa',
  'frigorifico', 'usina', 'metalurgica', 'siderurgica', 'mineradora', 'farmaceutica', 'distribuidora', 'engenharia', 'empreendimentos', 'servicos',
])
const VERBO_DE_ENTRADA = /^(.{2,80}?)\s+(pede|pediu|pedem|entra|entrou|entram|ingressa|ingressou|solicita|solicitou|protocola|protocolou|requer|requereu|obtem|obteve|tem|teve|vai|consegue|conseguiu)\b/
const SUJEITO_DEPOIS = /\b(?:decreta|decretou|aceita|aceitou|defere|deferiu|autoriza|autorizou)\s+(?:a |o )?(?:pedido de )?(?:recuperacao judicial|falencia)\s+d[aeo]s?\s+(.{2,80})$/

function temMarcador(nome: string): boolean {
  return normalizar(nome).split(' ').some((p) => MARCADOR_DE_EMPRESA.has(p))
}

/** Tira "- Fonte" do fim da manchete do Google Notícias. */
const semFonte = (t: string) => t.replace(/\s+[-–|]\s+[^-–|]{2,60}$/, '').trim()

/** A empresa e o fato de uma manchete, pela regra; nulo se não for uma entrada em recuperação judicial ou falência. */
export function empresaDaManchete(titulo: string): { nome: string; fato: 'recuperacao_judicial' | 'falencia' } | null {
  const original = semFonte(titulo)
  const t = semAcento(original)
  const fato = t.includes('recuperacao judicial') ? 'recuperacao_judicial' : t.includes('falencia') ? 'falencia' : null
  if (!fato || NEGATIVA.test(t) || PESSOA_FISICA.test(t)) return null
  let nome = ''
  const a = t.match(SUJEITO_DEPOIS)
  if (a) nome = original.slice(t.length - a[1].length)
  else {
    const b = t.match(VERBO_DE_ENTRADA)
    if (b && !SUJEITO_GENERICO.test(b[1])) nome = original.slice(0, b[1].length)
  }
  nome = nome.replace(/^["'“‘\s]+|["'”’\s.,;:]+$/g, '').trim()
  return nome.length >= 2 && nome.length <= 80 ? { nome, fato } : null
}

const SISTEMA_RJ =
  'Você lê manchetes de notícias brasileiras e extrai a EMPRESA (pessoa jurídica) que acabou de entrar com pedido de recuperação judicial ou de falência, ou teve a falência decretada. ' +
  'Responda SOMENTE JSON: {"itens":[{"i":<número da linha>,"empresa":"nome da empresa","fato":"recuperacao_judicial"|"falencia"|"nenhum","pessoaJuridica":true|false}]}. ' +
  'Use "nenhum" para pedido negado, plano aprovado, saída da recuperação ou qualquer notícia que não seja a entrada. Pessoa física, produtor rural e empresário individual: pessoaJuridica false.'

const empresasEmRecuperacao: ImplDoPasso = {
  async executar(entrada, ctx) {
    const janela = janelaDoPasso(ctx)
    const noticias = entrada
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.tipo === 'noticia' && texto(n.publicadaEm) && Date.parse(texto(n.publicadaEm)) >= ctx.agora - janela * DIA)
      .filter(({ n }) => !PESSOA_FISICA.test(semAcento(texto(n.titulo))))

    type Achado = { n: Item; nome: string; fato: 'recuperacao_judicial' | 'falencia'; pj: boolean }
    const achados: Achado[] = []
    let feito = false
    if (ctx.llm && noticias.length) {
      try {
        const r = await ctx.llm.json({
          sistema: SISTEMA_RJ, maxTokens: 1200,
          usuario: noticias.map(({ n, i }) => `${i}|${semFonte(texto(n.titulo))}`).join('\n'),
        })
        ctx.custo.adicionar(r.custoUsd)
        const itens = objeto(r.json).itens
        if (!Array.isArray(itens)) throw new Error('extração sem lista de itens')
        const porIndice = new Map(noticias.map(({ n, i }) => [i, n]))
        for (const it of itens) {
          const o = objeto(it)
          const n = porIndice.get(Number(o.i))
          const fato = texto(o.fato)
          const nome = recortar(texto(o.empresa), 80)
          if (!n || !nome || o.pessoaJuridica !== true || (fato !== 'recuperacao_judicial' && fato !== 'falencia')) continue
          achados.push({ n, nome, fato, pj: true })
        }
        feito = true
      } catch {
        achados.length = 0 // o modelo falhou: a regra assume
      }
    }
    if (!feito) {
      for (const { n } of noticias) {
        const e = empresaDaManchete(texto(n.titulo))
        if (e) achados.push({ n, ...e, pj: false })
      }
    }

    const porEmpresa = new Map<string, { empresa: EmpresaDoFato; fatos: Map<string, Fato> }>()
    for (const a of achados) {
      const ehConta = ctx.contas.some((c) => mesmaEmpresa(c, { nome: a.nome }))
      // Na regra, só segue a empresa que é Conta ou que tem forma de empresa no nome: nome solto pode ser de pessoa física.
      if (!a.pj && !ehConta && !temMarcador(a.nome)) continue
      const quando = texto(a.n.publicadaEm)
      const chave = nomeDaEmpresa(a.nome)
      const e = porEmpresa.get(chave) ?? { empresa: { nome: a.nome }, fatos: new Map<string, Fato>() }
      const fatoChave = `${a.fato}|${quando.slice(0, 4)}`
      if (!e.fatos.has(fatoChave)) {
        e.fatos.set(fatoChave, {
          chave: fatoChave,
          frase: a.fato === 'recuperacao_judicial'
            ? `Entrou em recuperação judicial, segundo a imprensa (${br(quando)})`
            : `Teve falência ou pedido de falência noticiado (${br(quando)})`,
          quando,
          fonte: texto(a.n.fonte) ? `Notícia em ${texto(a.n.fonte)}` : 'Notícia na imprensa',
          evidencia: `Notícia de ${br(quando)}${texto(a.n.fonte) ? ` em ${texto(a.n.fonte)}` : ''} sobre ${a.fato === 'recuperacao_judicial' ? 'recuperação judicial' : 'falência'} da empresa. ` +
            `A relação de cliente ou fornecedor do prospect não é pública: o Sinal vale para a empresa que é Conta do Workspace.${texto(a.n.url) ? ` Link: ${texto(a.n.url)}` : ''}`,
        })
      }
      porEmpresa.set(chave, e)
    }
    return [...porEmpresa.values()].map((e) => itemDeEmpresaComFatos({ empresa: e.empresa, fatos: [...e.fatos.values()] }))
  },
}

const confirmarRecuperacao: ImplDoPasso = {
  itensCobrados: (entrada, ctx) => Math.min(cnpjsDaConta(entrada).length, ctx.def.maxItems ?? 5),

  montarEntrada(entrada, ctx) {
    const cnpjs = cnpjsDaConta(entrada).slice(0, ctx.def.maxItems ?? 5)
    if (!cnpjs.length) return { pular: 'Nenhuma Conta com CNPJ para confirmar.' }
    return { input: { cnpjs }, maxItems: cnpjs.length }
  },

  // A confirmação só acrescenta à evidência; o Sinal já vale pela notícia (um passo final que esvaziasse a lista não
  // desfaria os Sinais já confirmados pelo motor).
  normalizar(brutos, entrada) {
    const porCnpj = new Map<string, { total: number; rj: number }>()
    for (const b of objetos(brutos)) {
      const cnpj = cnpjLimpo(b.cnpj)
      if (cnpj && b.encontrado !== false && typeof b.totalProcessos === 'number') {
        porCnpj.set(cnpj, { total: b.totalProcessos, rj: processosDeRecuperacao(b.distribuicao) })
      }
    }
    return entrada.map((i) => {
      const r = porCnpj.get(cnpjLimpo(i.cnpjDaConta))
      if (!r) return i
      const extra = r.rj > 0
        ? `Confirmado nos processos públicos do CNPJ: ${r.rj} processo${r.rj === 1 ? '' : 's'} de recuperação judicial ou falência nos últimos 3 anos (${r.total} no total).`
        : `Confirmação: não apareceu nos processos públicos agregados do CNPJ (a consulta cobre 3 anos como réu e pode não listar um pedido recente; ${r.total} no total).`
      return { ...i, evidence: recortar(`${texto(i.evidence)} ${extra}`, LIMITES.evidencia) }
    })
  },
}

function cnpjsDaConta(entrada: Item[]): string[] {
  return [...new Set(entrada.map((i) => cnpjLimpo(i.cnpjDaConta)).filter(Boolean))]
}

// ---------------------------------------------------------------------------------------------------------------------
// C4 · Impacto da reforma tributária no CNAE (mercado)

const RANK = { alto: 0, medio: 1, baixo: 2 } as const
const anoDe = (ms: number) => new Date(ms).getUTCFullYear()

function setorDoCnae(cnae: string): ImpactoDoSetor & { cnae: string } {
  const divisao = divisaoDoCnae(cnae)
  const t = impactoDaDivisao(divisao)
  return {
    ...(t ?? { divisao, setor: `CNAE ${divisao}`, impacto: 'medio' as const, tipo: 'regime_geral' as const, motivo: 'setor fora da tabela interna: leitura geral da reforma', cnaeRepresentativo: cnae }),
    cnae,
  }
}

const setorDaReforma: ImplDoPasso = {
  async executar(_entrada, ctx) {
    const pedido = texto(ctx.criterios.cnae).replace(/\D/g, '')
    let alvo: (ImpactoDoSetor & { cnae: string }) | null = null
    if (pedido.length === 7) alvo = setorDoCnae(pedido)
    else {
      const ordenados = [...IMPACTO_DA_REFORMA].sort((a, b) => RANK[a.impacto] - RANK[b.impacto])
      const fotos = await ctx.snapshots.ler(ordenados.map((i) => `cnae:${i.divisao}`))
      const proximo = ordenados.find((i) => {
        const f = fotos.get(`cnae:${i.divisao}`)
        return !f || anoDe(Date.parse(f.takenAt)) !== anoDe(ctx.agora)
      })
      if (proximo) alvo = { ...proximo, cnae: proximo.cnaeRepresentativo }
    }
    if (!alvo) return []
    const { tipo: tipoDeMudanca, ...resto } = alvo
    return [{ ...resto, tipo: 'setor_reforma', tipoDeMudanca }]
  },
}

const MAX_AMOSTRA = 5

const empresasPorCnae: ImplDoPasso = {
  itensCobrados: (_e, ctx) => ctx.def.maxItems ?? 20,

  montarEntrada(entrada, ctx) {
    const setor = entrada.find((i) => i.tipo === 'setor_reforma')
    if (!setor) return { pular: 'Nenhum setor escolhido.' }
    const maximo = ctx.def.maxItems ?? 20
    return { input: { cnae: texto(setor.cnae), uf: texto(ctx.criterios.uf).toUpperCase().slice(0, 2), pageSize: maximo, maxItems: maximo }, maxItems: maximo }
  },

  // A amostra leva só dado da empresa (razão social, CNPJ, UF, porte); empresário individual, MEI e razão social com CPF
  // ficam fora, e sócios, e-mails e telefones nunca são lidos.
  normalizar(brutos, entrada) {
    const setor = entrada.find((i) => i.tipo === 'setor_reforma')
    if (!setor) return []
    const amostra = objetos(brutos).flatMap((b) => {
      const razao = primeiroTexto(b, 'razao_social')
      const cnpj = cnpjLimpo(b.cnpj)
      if (!razao || !cnpj || normalizar(primeiroTexto(b, 'situacao_cadastral')) !== 'ativa') return []
      if (primeiroTexto(b, 'natureza_juridica_codigo') === '2135' || b.mei === true || SOMENTE_CPF_NO_NOME.test(razao)) return []
      return [{ razaoSocial: razao, cnpj, uf: primeiroTexto(b, 'uf'), porte: primeiroTexto(b, 'porte') }]
    }).slice(0, MAX_AMOSTRA)
    return [{ ...setor, tipo: 'amostra_cnae', amostra }]
  },
}

const sinalImpactoReforma: ImplDoPasso = {
  async executar(entrada, ctx) {
    const agoraIso = new Date(ctx.agora).toISOString()
    const ano = anoDe(ctx.agora)
    const sinais: Item[] = []
    const fotos: { chave: string; data: Record<string, unknown>; takenAt: string }[] = []
    for (const i of entrada.filter((x) => x.tipo === 'amostra_cnae')) {
      const amostra = Array.isArray(i.amostra) ? i.amostra : []
      const [divisao, setor, impacto] = [texto(i.divisao), texto(i.setor), texto(i.impacto)]
      sinais.push({
        eventKey: `reforma|${divisao}|${ano}`,
        phrase: recortar(`Reforma tributária: ${setor} (CNAE ${divisao}) tem impacto ${impacto}, pois ${texto(i.motivo)}`, LIMITES.frase),
        firedAt: agoraIso,
        source: 'EC 132/2023 e LC 214/2025 (tabela interna)',
        evidence: recortar(
          `Classificação interna do setor (CNAE ${divisao}): ${texto(i.motivo)}. Base: EC 132/2023 e LC 214/2025, com transição de CBS e IBS até 2033; é uma leitura do produto e deve ser validada por especialista. ` +
            (amostra.length ? `Empresas ativas do CNAE ${texto(i.cnae)} (amostra): ${amostra.length}.` : `Amostra de empresas do CNAE ${texto(i.cnae)} indisponível nesta rodada.`),
          LIMITES.evidencia,
        ),
        payload: { divisao, cnae: texto(i.cnae), setor, impacto, tipoDeMudanca: texto(i.tipoDeMudanca), amostra },
      })
      fotos.push({ chave: `cnae:${divisao}`, takenAt: agoraIso, data: { ano, impacto } })
    }
    if (fotos.length) await ctx.snapshots.gravar(fotos)
    return sinais
  },
}

export function passosDoIcp_c(_fetchFn: typeof fetch = fetch): RegistroDePassos {
  return {
    passos: {
      jur_cnpjs_para_processos: cnpjsParaProcessos,
      jur_processos_por_cnpj: processosPorCnpj,
      jur_saltos_de_processos: saltosDeProcessos,
      jur_dou_publicacoes: douPublicacoes,
      jur_classificar_mudanca: classificarMudanca,
      jur_noticias_recuperacao: noticiasRecuperacao,
      jur_empresas_em_recuperacao: empresasEmRecuperacao,
      jur_confirmar_recuperacao: confirmarRecuperacao,
      jur_setor_da_reforma: setorDaReforma,
      jur_empresas_por_cnae: empresasPorCnae,
      jur_sinal_impacto_reforma: sinalImpactoReforma,
    },
    fontes: {},
  }
}
