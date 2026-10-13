// O CNPJ da Conta na Receita Federal, para a evidência do Sinal levar o porte e o CNAE: johnatan029/cnpj-empresas-brasil-scraper
// em modo `lookup` (esquema publicado em 12/10/2026: `mode`, `cnpjs`; a entrada é CNPJ, não nome: o actor não casa empresa por
// nome, por isso o CNPJ vem da Conta) e, se ele falhar, a BrasilAPI (aberta, sem custo). Consulta só as Contas que têm o CNPJ.
// Nunca lê o quadro societário (nome de pessoa): só a razão social, o porte, o CNAE e a UF da empresa.
import { objetos, primeiroTexto, recortar, LIMITES } from '../../../signal-runner/adaptadores/comum.ts'
import type { FontePublica, ImplDoPasso, Item } from '../tipos.ts'
import { consultaDeCnpjs } from './cnpj-lotes.ts'
import { cnpjLimpo, objeto, texto } from './comum.ts'

/** Abaixo disto não começa a consulta: os Sinais já confirmados fecham a execução, e o CNPJ fica para a próxima rodada. */
const FOLGA_DO_CNPJ_MS = 20_000

interface DadosDaReceita {
  cnpj: string
  porte: string
  cnae: string
  cnaeDescricao: string
  uf: string
  situacao: string
}

function cnpjsDaEntrada(entrada: Item[]): string[] {
  return [...new Set(entrada.map((i) => cnpjLimpo(i.cnpjDaConta)).filter(Boolean))]
}

function frase({ porte, cnae, cnaeDescricao, uf, situacao }: DadosDaReceita): string {
  const partes = [
    porte ? `porte ${porte}` : '',
    cnae ? `CNAE ${cnae}${cnaeDescricao ? ` (${cnaeDescricao})` : ''}` : '',
    uf ? `UF ${uf}` : '',
    situacao ? `situação ${situacao.toLowerCase()}` : '',
  ].filter(Boolean)
  return partes.length ? `Receita Federal: ${partes.join('; ')}.` : ''
}

/** Junta o que a Receita disse à evidência de cada Sinal, pela Conta que tem o CNPJ. */
function acrescentar(entrada: Item[], dados: DadosDaReceita[]): Item[] {
  return entrada.map((i) => {
    const d = dados.find((x) => x.cnpj === cnpjLimpo(i.cnpjDaConta))
    const extra = d ? frase(d) : ''
    if (!extra) return i
    return { ...i, evidence: recortar(`${texto(i.evidence)} ${extra}`.trim(), LIMITES.evidencia) }
  })
}

export const cnpjDaConta: ImplDoPasso = {
  itensCobrados: (entrada) => cnpjsDaEntrada(entrada).length,

  montarEntrada(entrada, ctx) {
    const restante = ctx.pedido.prazoFinal === undefined ? Infinity : ctx.pedido.prazoFinal - ctx.agora
    if (restante < FOLGA_DO_CNPJ_MS) return { pular: 'O prazo da função está perto; a consulta de CNPJ fica para a próxima rodada.' }
    const cnpjs = cnpjsDaEntrada(entrada).slice(0, ctx.def.maxItems ?? 20)
    return consultaDeCnpjs(cnpjs, 'Nenhuma Conta com CNPJ cadastrado.')
  },

  normalizar(brutos, entrada) {
    const dados = objetos(brutos).flatMap((b): DadosDaReceita[] => {
      const cnpj = cnpjLimpo(b.cnpj)
      if (!cnpj) return []
      const endereco = objeto(b.endereco)
      return [{
        cnpj,
        porte: primeiroTexto(b, 'porte'),
        cnae: primeiroTexto(b, 'cnaePrincipal', 'cnae_fiscal'),
        cnaeDescricao: primeiroTexto(b, 'cnaeDescricao', 'cnae_fiscal_descricao'),
        uf: texto(endereco.uf) || primeiroTexto(b, 'uf'),
        situacao: primeiroTexto(b, 'situacaoCadastral', 'descricao_situacao_cadastral'),
      }]
    })
    return acrescentar(entrada, dados)
  },
}

/** A BrasilAPI (`/api/cnpj/v1/{cnpj}`): aberta, sem custo. Devolve itens no formato do passo, um por CNPJ achado. */
export function brasilApiCnpj(fetchFn: typeof fetch = fetch): FontePublica {
  return {
    async buscar(entrada) {
      const itens: Item[] = []
      for (const cnpj of cnpjsDaEntrada(entrada).slice(0, 20)) {
        try {
          const r = await fetchFn(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
          if (!r.ok) {
            await r.body?.cancel()
            continue
          }
          const b = objeto(await r.json())
          itens.push({
            cnpj,
            porte: texto(b.porte),
            cnae_fiscal: texto(b.cnae_fiscal),
            cnae_fiscal_descricao: texto(b.cnae_fiscal_descricao),
            uf: texto(b.uf),
            descricao_situacao_cadastral: texto(b.descricao_situacao_cadastral),
          })
        } catch {
          // Esta consulta falhou; as outras seguem.
        }
      }
      return itens
    },
  }
}
