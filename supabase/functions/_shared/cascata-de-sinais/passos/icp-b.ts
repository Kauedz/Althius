// Os passos do ICP B (contabilidade e tributário): quatro Sinais do Mapa de Mercado, todos sobre a base aberta de CNPJ da
// Receita Federal (mensal, com atraso de até ~30 dias: a evidência de cada Sinal avisa).
//   cnpj_novo                    (B1) empresa aberta no mês, casada com as Contas-alvo pelo CNPJ (ou nome); o resto só é contado
//   mudanca_de_porte_ou_regime   (B2) fotografia mensal do CNPJ de cada Conta (porte, Simples, MEI, regime) e a diferença
//   entrada_de_socio             (B3) fotografia mensal do quadro societário e a diferença
//   setor_afetado_cbs_ibs        (B4) Sinal de MERCADO: um setor da tabela interna (icp-b-cnae.ts), dimensionado por amostra
// Dado pessoal: o Sinal é da empresa. O quadro societário nunca chega a Sinal, evidência, chave nem fotografia com nome ou
// documento: guarda-se só a contagem e um código curto por sócio (hash truncado do CNPJ e do nome), que serve para ver se
// alguém entrou e não permite voltar ao nome. Razão social de empresário individual (nome de pessoa e CPF) é trocada por um
// texto neutro. Formatos de entrada e saída: esquemas publicados de cada fonte (leitura de 13/10/2026); o que não pôde ser
// conferido está no relatório da fatia.
import { createHash } from 'node:crypto'
import { LIMITES, normalizar, objetos, primeiroTexto, recortar } from '../../../signal-runner/adaptadores/comum.ts'
import { nomeDoMes } from '../comexstat.ts'
import type { ContextoDoPasso, FontePublica, ImplDoPasso, Item, RegistroDePassos } from '../tipos.ts'
import { cnpjLimpo, lista, objeto, texto } from './comum.ts'
import { itemDeEmpresaComFatos } from './empresas.ts'
import { CRITERIO_DA_TABELA, mascaraCnae, setorDoCnae, setorDoMes } from './icp-b-cnae.ts'

const FONTE_BASE_MENSAL = 'Receita Federal (base mensal de CNPJ)'
const FONTE_FOTOGRAFIA = 'Receita Federal (fotografia mensal)'
const FONTE_SETOR = 'Receita Federal (CNPJ) e critério interno de setores'
const AVISO_BASE_MENSAL =
  'A base da Receita é mensal e chega com até cerca de 30 dias de atraso: o fato pode ter ocorrido antes de aparecer aqui.'
const MAX_SOCIOS_NA_FOTOGRAFIA = 300
const NOME_NEUTRO = 'Empresário individual'

// ---------------------------------------------------------------------------------------------------------------------
// Pequenos auxiliares.

type Porte = 'ME' | 'EPP' | 'Demais'

/** O porte da Receita em três rótulos, qualquer que seja a forma que a fonte traga ("01", "MICRO EMPRESA", "EPP"...). */
export function porteCanonico(valor: unknown): Porte | null {
  const t = normalizar(typeof valor === 'number' ? String(valor) : valor)
  if (['01', '1', 'me', 'micro empresa', 'microempresa'].includes(t)) return 'ME'
  if (['03', '3', 'epp', 'empresa de pequeno porte', 'pequeno porte'].includes(t)) return 'EPP'
  if (['05', '5', 'demais', 'demais empresas'].includes(t)) return 'Demais'
  return null
}

const CODIGO_DO_PORTE: Record<Porte, string> = { ME: '01', EPP: '03', Demais: '05' }
const ROTULO_DA_BASE_ALTERNATIVA: Record<Porte, string> = { ME: 'micro_empresa', EPP: 'pequeno_porte', Demais: 'demais' }

const booleano = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** "AAAA-MM-DD" do fato em ISO ao meio-dia (UTC), ou nulo. */
function quandoDoFato(valor: unknown): string | null {
  const m = texto(valor).match(/^\d{4}-\d{2}-\d{2}/)
  if (!m) return null
  const iso = `${m[0]}T12:00:00.000Z`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

function cnpjFormatado(cnpj: string): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
}

function nomeDoMesIso(iso: string): string {
  return nomeDoMes(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)))
}

const inicioDoMes = (agora: number) => `${new Date(agora).toISOString().slice(0, 7)}-01T00:00:00.000Z`

/** Razão social que é nome de pessoa: empresário individual (natureza 2135) ou nome com CPF no fim. */
function pareceNomeDePessoa(razao: string, natureza: string): boolean {
  const n = normalizar(natureza)
  return !razao || n === '2135' || n.startsWith('empresario') || /\d{11}\b/.test(razao)
}

function listaDoPedido(ctx: ContextoDoPasso, ...chaves: string[]): string[] {
  for (const c of chaves) {
    const v = lista(ctx.criterios[c])
    if (v.length) return v
  }
  return []
}

const ufsDoPedido = (ctx: ContextoDoPasso) => listaDoPedido(ctx, 'ufs', 'uf').map((u) => u.toUpperCase()).filter((u) => /^[A-Z]{2}$/.test(u))
const cnaesDoPedido = (ctx: ContextoDoPasso) => listaDoPedido(ctx, 'cnaes', 'cnae').map((c) => c.replace(/\D/g, '')).filter((c) => c.length >= 2 && c.length <= 7)
const portesDoPedido = (ctx: ContextoDoPasso) => listaDoPedido(ctx, 'portes', 'porte').flatMap((p) => porteCanonico(p) ?? [])
const mesDoPedido = (ctx: ContextoDoPasso) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(texto(ctx.criterios.mes)) ? texto(ctx.criterios.mes) : '')

/** A janela de abertura: o mês pedido, ou desde o primeiro dia do mês anterior. */
function janelaDeAbertura(ctx: ContextoDoPasso): { de: string; ate: string } {
  const mes = mesDoPedido(ctx)
  if (mes) {
    const [a, m] = mes.split('-').map(Number)
    return { de: `${mes}-01`, ate: `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}` }
  }
  const d = new Date(ctx.agora)
  return { de: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10), ate: '' }
}

/** O código curto de um sócio: hash truncado do CNPJ e do nome. Serve só para ver se alguém entrou; não volta ao nome. */
export function idDoSocio(cnpj: string, nome: string): string {
  return createHash('sha256').update(`${cnpjLimpo(cnpj)}|${normalizar(nome)}`).digest('hex').slice(0, 12)
}

/** Os códigos dos sócios (ordenados, sem repetir) e a contagem, de uma lista de sócios de qualquer fonte; nenhum nome sai daqui. */
function codigosDosSocios(cnpj: string, lista_: unknown): { socios: number; ids: string[] | null } | null {
  if (!Array.isArray(lista_)) return null
  const nomes = lista_.map((s) => primeiroTexto(s, 'nome', 'nome_socio', 'nomeSocio')).filter(Boolean)
  return {
    socios: lista_.length,
    ids: lista_.length > MAX_SOCIOS_NA_FOTOGRAFIA ? null : [...new Set(nomes.map((n) => idDoSocio(cnpj, n)))].sort(),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// B1: CNPJ novo.

interface EmpresaNova {
  cnpj: string
  razao: string
  natureza: string
  inicio: string
  cnae: string
  uf: string
  porte: Porte | null
  baseDeReferencia: string
}

function itemDeEmpresaNova(e: EmpresaNova): Item | null {
  const quando = quandoDoFato(e.inicio)
  if (!e.cnpj || !quando) return null
  const nome = pareceNomeDePessoa(e.razao, e.natureza) ? NOME_NEUTRO : recortar(e.razao, 150)
  const partes = [
    `início de atividade em ${dataBr(quando)}`,
    e.cnae ? `CNAE ${mascaraCnae(e.cnae)}` : '',
    e.uf ? `UF ${e.uf}` : '',
    e.porte ? `porte ${e.porte}` : '',
  ].filter(Boolean)
  const referencia = e.baseDeReferencia ? ` Base de referência: ${e.baseDeReferencia}.` : ''
  return itemDeEmpresaComFatos({
    empresa: { nome, cnpj: e.cnpj, ...(e.cnae ? { cnae: e.cnae } : {}), ...(e.uf ? { uf: e.uf } : {}), ...(e.porte ? { porte: e.porte } : {}) },
    fatos: [{
      chave: `cnpj_novo|${e.cnpj}`,
      frase: `CNPJ aberto em ${dataBr(quando)}`,
      quando,
      fonte: FONTE_BASE_MENSAL,
      evidencia: recortar(`CNPJ ${cnpjFormatado(e.cnpj)}: ${partes.join('; ')}. ${AVISO_BASE_MENSAL}${referencia}`, LIMITES.evidencia),
    }],
  })
}

const cnpjNovosDaReceita: ImplDoPasso = {
  montarEntrada(_entrada, ctx, actorId) {
    const maximo = ctx.def.maxItems ?? 100
    const ufs = ufsDoPedido(ctx)
    const cnaes = cnaesDoPedido(ctx)
    const portes = portesDoPedido(ctx)
    if (actorId.startsWith('brazilayer~')) {
      const { de, ate } = janelaDeAbertura(ctx)
      return {
        input: {
          aberturaDe: de,
          ...(ate ? { aberturaAte: ate } : {}),
          ...(ufs.length ? { uf: ufs[0] } : {}),
          ...(cnaes.length ? { cnae: cnaes[0] } : {}),
          ...(portes.length ? { porte: ROTULO_DA_BASE_ALTERNATIVA[portes[0]] } : {}),
          comContato: false,
          maxResultados: maximo,
        },
        maxItems: maximo,
      }
    }
    if (actorId.startsWith('epicscrapers~')) {
      // A base geral não filtra por data: pede por UF e CNAE e o passo de saída fica só com o que abriu na janela.
      return {
        input: { uf: ufs[0] ?? 'SP', ...(cnaes.length ? { cnae: cnaes[0] } : {}), maxItems: maximo, pageSize: Math.min(maximo, 100) },
        maxItems: maximo,
      }
    }
    const mes = mesDoPedido(ctx)
    return {
      input: {
        ...(ufs.length ? { ufs } : {}),
        ...(cnaes.length ? { cnaes } : {}),
        ...(portes.length ? { portes: portes.map((p) => CODIGO_DO_PORTE[p]) } : {}),
        ...(mes ? { mes } : {}),
        maxResults: maximo,
      },
      maxItems: maximo,
    }
  },

  normalizar(brutos, _entrada, ctx, actorId) {
    const vistos = new Set<string>()
    const janela = janelaDeAbertura(ctx)
    return objetos(brutos).flatMap((b): Item[] => {
      let nova: EmpresaNova
      if (actorId.startsWith('brazilayer~')) {
        nova = {
          cnpj: cnpjLimpo(b.cnpj), razao: texto(b.razao_social), natureza: '', inicio: texto(b.data_abertura), cnae: texto(b.cnae).replace(/\D/g, ''),
          uf: texto(b.uf).toUpperCase(), porte: porteCanonico(b.porte), baseDeReferencia: '',
        }
      } else if (actorId.startsWith('epicscrapers~')) {
        const ativa = texto(b.situacao_cadastral).toUpperCase() === 'ATIVA'
        const matriz = texto(b.matriz_filial).toUpperCase() === 'MATRIZ'
        const inicio = texto(b.data_abertura)
        if (!ativa || !matriz || inicio.slice(0, 10) < janela.de || (janela.ate && inicio.slice(0, 10) > janela.ate)) return []
        nova = {
          cnpj: cnpjLimpo(b.cnpj), razao: texto(b.razao_social), natureza: texto(b.natureza_juridica_codigo), inicio, cnae: texto(b.cnae_principal_codigo).replace(/\D/g, ''),
          uf: texto(b.uf).toUpperCase(), porte: porteCanonico(b.porte), baseDeReferencia: '',
        }
      } else {
        // O resumo gratuito da execução vem junto no resultado: não é empresa.
        if (b.recordType !== 'NEW_COMPANY') return []
        const defasada = objeto(b.staleness).stale === true
        const mesIndice = texto(objeto(b.staleness).indexMonth)
        nova = {
          cnpj: cnpjLimpo(b.cnpj), razao: texto(b.razaoSocial), natureza: texto(b.naturezaJuridica), inicio: texto(b.dataInicio), cnae: texto(b.cnaePrincipal).replace(/\D/g, ''),
          uf: texto(b.uf).toUpperCase(), porte: porteCanonico(b.porte), baseDeReferencia: defasada && /^\d{4}-\d{2}$/.test(mesIndice) ? nomeDoMesIso(`${mesIndice}-01`) : '',
        }
      }
      if (vistos.has(nova.cnpj)) return []
      vistos.add(nova.cnpj)
      const item = itemDeEmpresaNova(nova)
      return item ? [item] : []
    })
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// B2 e B3: a fotografia mensal do CNPJ de cada Conta.

function cnpjsDasContas(ctx: ContextoDoPasso): string[] {
  return [...new Set(ctx.contas.map((c) => cnpjLimpo(c.cnpj)).filter(Boolean))]
}

/** O regime do último ano que a fonte informa ("LUCRO REAL" vira "Lucro real"); nulo sem informação. */
function regimeDoUltimoAno(valor: unknown): string | null {
  if (!Array.isArray(valor)) return null
  const anos = objetos(valor).filter((r) => texto(r.forma_de_tributacao || r.formaDeTributacao) && Number.isFinite(Number(r.ano)))
  if (!anos.length) return null
  const ultimo = anos.reduce((a, b) => (Number(b.ano) > Number(a.ano) ? b : a))
  const t = texto(ultimo.forma_de_tributacao || ultimo.formaDeTributacao).toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const receitaFotografia: ImplDoPasso = {
  itensCobrados: (_entrada, ctx) => Math.min(cnpjsDasContas(ctx).length, ctx.def.maxItems ?? 100),

  montarEntrada(_entrada, ctx) {
    const cnpjs = cnpjsDasContas(ctx).slice(0, ctx.def.maxItems ?? 100)
    if (!cnpjs.length) return { pular: 'Nenhuma Conta com CNPJ cadastrado.' }
    return { input: { mode: 'lookup', cnpjs }, maxItems: cnpjs.length }
  },

  normalizar(brutos, _entrada, ctx) {
    const doPedido = new Set(cnpjsDasContas(ctx))
    const comSocios = ctx.def.inputTemplate.socios === true
    return objetos(brutos).flatMap((b): Item[] => {
      const cnpj = cnpjLimpo(b.cnpj)
      if (!cnpj || !doPedido.has(cnpj)) return []
      const item: Item = {
        tipo: 'fotografia_cnpj',
        cnpj,
        porte: porteCanonico(primeiroTexto(b, 'porte', 'porteDescricao')),
        simples: booleano(b.opcaoSimples ?? b.opcao_pelo_simples ?? b.simples_nacional),
        mei: booleano(b.opcaoMei ?? b.opcao_pelo_mei ?? b.mei),
        regime: regimeDoUltimoAno(b.regimeTributario ?? b.regime_tributario),
      }
      if (comSocios) {
        const pronto = Array.isArray(b.sociosIds) ? { socios: b.sociosIds.length, ids: [...new Set(b.sociosIds.filter((i): i is string => typeof i === 'string'))].sort() } : null
        const c = pronto ?? codigosDosSocios(cnpj, b.socios ?? b.qsa)
        item.socios = c ? c.socios : null
        item.ids = c ? c.ids : null
      }
      return [item]
    })
  },
}

/** A BrasilAPI (`/api/cnpj/v1/{cnpj}`): aberta, sem custo; entrega a fotografia no formato dela, com os sócios já em código. */
function brasilApiFotografia(fetchFn: typeof fetch): FontePublica {
  return {
    async buscar(_entrada, ctx) {
      const comSocios = ctx.def.inputTemplate.socios === true
      const itens: Item[] = []
      for (const cnpj of cnpjsDasContas(ctx).slice(0, ctx.def.maxItems ?? 100)) {
        try {
          const r = await fetchFn(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
          if (!r.ok) {
            await r.body?.cancel()
            continue
          }
          const b = objeto(await r.json())
          const item: Item = {
            cnpj, porte: texto(b.porte), opcao_pelo_simples: b.opcao_pelo_simples ?? null, opcao_pelo_mei: b.opcao_pelo_mei ?? null,
            regime_tributario: Array.isArray(b.regime_tributario) ? b.regime_tributario : null,
          }
          if (comSocios) {
            const c = codigosDosSocios(cnpj, b.qsa)
            if (c?.ids) item.sociosIds = c.ids
          }
          itens.push(item)
        } catch {
          // Esta consulta falhou; as outras seguem.
        }
      }
      return itens
    },
  }
}

function fotografias(entrada: Item[]) {
  return entrada.filter((i) => i.tipo === 'fotografia_cnpj' && cnpjLimpo(i.cnpj))
}

const joinPartes = (partes: string[]) => {
  const juntas = partes.length <= 1 ? partes.join('') : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
  return juntas.charAt(0).toUpperCase() + juntas.slice(1)
}

const sim = (v: unknown) => (v === true ? 'sim' : 'não')

/** B2: porte, Simples, MEI e regime que mudaram desde a fotografia anterior (a de antes do mês corrente). */
const diffPorteRegime: ImplDoPasso = {
  async executar(entrada, ctx) {
    const fotos = fotografias(entrada)
    if (!fotos.length) return []
    const inicio = inicioDoMes(ctx.agora)
    const antes = await ctx.snapshots.ler(fotos.map((f) => String(f.cnpj)), inicio)
    const sinais: Item[] = []
    for (const f of fotos) {
      const cnpj = String(f.cnpj)
      const ant = antes.get(cnpj)
      const conta = ctx.contas.find((c) => cnpjLimpo(c.cnpj) === cnpj)
      if (!ant || !conta) continue
      const d = ant.data
      const partes: string[] = []
      const detalhes: string[] = []
      if (f.porte && d.porte && f.porte !== d.porte) {
        partes.push(`mudou de porte (de ${texto(d.porte)} para ${texto(f.porte)})`)
        detalhes.push(`porte ${texto(d.porte)} para ${texto(f.porte)}`)
      }
      if (typeof f.simples === 'boolean' && typeof d.simples === 'boolean' && f.simples !== d.simples) {
        partes.push(f.simples ? 'optou pelo Simples Nacional' : 'saiu do Simples Nacional')
        detalhes.push(`optante do Simples Nacional: ${sim(d.simples)} para ${sim(f.simples)}`)
      }
      if (typeof f.mei === 'boolean' && typeof d.mei === 'boolean' && f.mei !== d.mei) {
        partes.push(f.mei ? 'virou MEI' : 'deixou de ser MEI')
        detalhes.push(`MEI: ${sim(d.mei)} para ${sim(f.mei)}`)
      }
      if (f.regime && d.regime && f.regime !== d.regime) {
        partes.push(`regime tributário mudou de ${texto(d.regime)} para ${texto(f.regime)}`)
        detalhes.push(`regime ${texto(d.regime)} para ${texto(f.regime)}`)
      }
      if (!partes.length) continue
      const mes = inicio.slice(0, 7)
      sinais.push({
        contaId: conta.id,
        contaNome: conta.name,
        eventKey: recortar(`porte_regime|${cnpj}|${mes}`, LIMITES.chave),
        phrase: recortar(joinPartes(partes), LIMITES.frase),
        firedAt: new Date(ctx.agora).toISOString(),
        source: FONTE_FOTOGRAFIA,
        evidence: recortar(
          `Receita Federal, fotografia de ${nomeDoMesIso(ant.takenAt)} comparada com a de ${nomeDoMesIso(inicio)}: ${detalhes.join('; ')}. ${AVISO_BASE_MENSAL}`,
          LIMITES.evidencia,
        ),
      })
    }
    // A fotografia de agora fica no início do mês: repetir a rodada no mês refaz a mesma comparação, sem perder a base.
    const novas = fotos
      .filter((f) => f.porte || typeof f.simples === 'boolean' || typeof f.mei === 'boolean' || f.regime)
      .map((f) => ({ chave: String(f.cnpj), data: { porte: f.porte ?? null, simples: f.simples ?? null, mei: f.mei ?? null, regime: f.regime ?? null }, takenAt: inicio }))
    if (novas.length) await ctx.snapshots.gravar(novas)
    return sinais
  },
}

/** B3: sócio que não estava na fotografia anterior. A fotografia guarda só a contagem e os códigos curtos. */
const diffSocios: ImplDoPasso = {
  async executar(entrada, ctx) {
    const fotos = fotografias(entrada).filter((f) => Array.isArray(f.ids))
    if (!fotos.length) return []
    const inicio = inicioDoMes(ctx.agora)
    const antes = await ctx.snapshots.ler(fotos.map((f) => String(f.cnpj)), inicio)
    const sinais: Item[] = []
    for (const f of fotos) {
      const cnpj = String(f.cnpj)
      const ant = antes.get(cnpj)
      const conta = ctx.contas.find((c) => cnpjLimpo(c.cnpj) === cnpj)
      if (!ant || !conta || !Array.isArray(ant.data.ids)) continue
      const anteriores = new Set(ant.data.ids as unknown[])
      const entraram = (f.ids as string[]).filter((i) => !anteriores.has(i)).length
      if (!entraram) continue
      const de = typeof ant.data.socios === 'number' ? ant.data.socios : anteriores.size
      sinais.push({
        contaId: conta.id,
        contaNome: conta.name,
        eventKey: recortar(`entrada_socio|${cnpj}|${inicio.slice(0, 7)}`, LIMITES.chave),
        phrase: entraram === 1 ? 'Entrou sócio no quadro societário' : `Entraram ${entraram} sócios no quadro societário`,
        firedAt: new Date(ctx.agora).toISOString(),
        source: FONTE_FOTOGRAFIA,
        evidence: recortar(
          `Receita Federal, fotografia de ${nomeDoMesIso(ant.takenAt)} comparada com a de ${nomeDoMesIso(inicio)}: o quadro societário passou de ${de} para ${Number(f.socios)} sócios, com ${entraram} ${entraram === 1 ? 'entrada' : 'entradas'}. ${AVISO_BASE_MENSAL}`,
          LIMITES.evidencia,
        ),
      })
    }
    const novas = fotos.map((f) => ({ chave: String(f.cnpj), data: { socios: Number(f.socios), ids: f.ids as string[] }, takenAt: inicio }))
    if (novas.length) await ctx.snapshots.gravar(novas)
    return sinais
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// B4: setor mais afetado pela CBS/IBS (mercado).

/** O setor desta rodada: o CNAE do pedido que está na tabela, ou o do mês; e a UF do pedido (vazia = Brasil). */
function setorDaRodada(ctx: ContextoDoPasso) {
  const pedido = listaDoPedido(ctx, 'cnaes', 'cnae').map((c) => setorDoCnae(c)).find(Boolean)
  const d = new Date(ctx.agora)
  return { setor: pedido ?? setorDoMes(d.getUTCFullYear(), d.getUTCMonth() + 1), uf: ufsDoPedido(ctx)[0] ?? '' }
}

const receitaPorCnae: ImplDoPasso = {
  montarEntrada(_entrada, ctx, actorId) {
    const { setor, uf } = setorDaRodada(ctx)
    const maximo = ctx.def.maxItems ?? 100
    if (actorId.startsWith('brasildados~')) {
      return {
        input: { cnaes: [setor.cnae], ...(uf ? { uf: [uf] } : {}), situacaoCadastral: '02', maxResults: Math.min(maximo, 1000) },
        maxItems: maximo,
      }
    }
    return { input: { uf, cnae: setor.cnae, maxItems: maximo, pageSize: Math.min(maximo, 100) }, maxItems: maximo }
  },

  // A amostra vira só contagens: nenhum dado de empresa, contato ou sócio segue adiante.
  normalizar(brutos, _entrada, ctx, actorId) {
    const { setor, uf } = setorDaRodada(ctx)
    const limite = ctx.def.maxItems ?? 100
    const lista_ = objetos(brutos)
    const alternativa = actorId.startsWith('brasildados~')
    const ativas = lista_.filter((b) =>
      alternativa
        ? (texto(b.situacaoCadastral) === '02' || texto(b.situacaoCadastralDescricao).toLowerCase() === 'ativa') && b.matriz !== false
        : texto(b.situacao_cadastral).toUpperCase() === 'ATIVA' && texto(b.matriz_filial).toUpperCase() === 'MATRIZ'
    )
    const comDado = alternativa ? [] : ativas.filter((b) => typeof b.simples_nacional === 'boolean' && typeof b.mei === 'boolean')
    return [{
      tipo: 'setor_amostra',
      cnae: setor.cnae,
      uf,
      amostra: ativas.length,
      limite,
      atingiuLimite: lista_.length >= limite,
      foraDoSimplesMei: comDado.length ? comDado.filter((b) => b.simples_nacional === false && b.mei === false).length : null,
    }]
  },
}

const setorAfetadoCbsIbs: ImplDoPasso = {
  executar(entrada, ctx) {
    const mes = new Date(ctx.agora).toISOString().slice(0, 7)
    return entrada.flatMap((i): Item[] => {
      const setor = i.tipo === 'setor_amostra' ? setorDoCnae(i.cnae) : undefined
      const amostra = Number(i.amostra)
      if (!setor || !(amostra > 0)) return []
      const uf = texto(i.uf)
      const fora = typeof i.foraDoSimplesMei === 'number' ? i.foraDoSimplesMei : null
      const empresas = `${i.atingiuLimite === true ? 'ao menos ' : ''}${amostra} ${amostra === 1 && i.atingiuLimite !== true ? 'empresa ativa' : 'empresas ativas'} na amostra`
      const limite = Number(i.limite)
      return [{
        eventKey: recortar(`setor_cbs_ibs|${setor.cnae}|${uf || 'BR'}|${mes}`, LIMITES.chave),
        phrase: recortar(
          `Setor ${setor.impacto === 'alto' ? 'de alto impacto' : 'de impacto médio'} da CBS/IBS: ${setor.descricao} (CNAE ${mascaraCnae(setor.cnae)}) ${uf ? `em ${uf}` : 'no Brasil'}, ${empresas}${fora !== null ? ` (${fora} fora do Simples e do MEI)` : ''}`,
          LIMITES.frase,
        ),
        firedAt: new Date(ctx.agora).toISOString(),
        source: FONTE_SETOR,
        evidence: recortar(
          `Amostra da base de CNPJ da Receita Federal${uf ? ` em ${uf}` : ''}, limitada a ${limite} empresas: não é o total do setor. Setor escolhido por critério interno, revisável (não é lista oficial). ${setor.motivo} ${AVISO_BASE_MENSAL}`,
          LIMITES.evidencia,
        ),
        payload: {
          cnae: setor.cnae, descricao: setor.descricao, impacto: setor.impacto, uf: uf || null, amostra, limite,
          atingiuLimite: i.atingiuLimite === true, foraDoSimplesMei: fora, criterio: CRITERIO_DA_TABELA,
        },
      }]
    })
  },
}

export function passosDoIcp_b(fetchFn: typeof fetch = fetch): RegistroDePassos {
  return {
    passos: {
      cnpj_novos_da_receita: cnpjNovosDaReceita,
      receita_fotografia: receitaFotografia,
      diff_porte_regime: diffPorteRegime,
      diff_socios: diffSocios,
      receita_por_cnae: receitaPorCnae,
      setor_afetado_cbs_ibs: setorAfetadoCbsIbs,
    },
    fontes: { brasilapi_fotografia_cnpj: brasilApiFotografia(fetchFn) },
  }
}
