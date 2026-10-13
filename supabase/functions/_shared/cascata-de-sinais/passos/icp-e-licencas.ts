// ICP E, Sinal de licença de instalação (parcial, de MERCADO): o Diário Oficial da União publica as licenças federais (IBAMA
// e afins); os órgãos ambientais estaduais (CETESB, FEAM, INEA...) têm portais distintos e ficam sem fonte. Actor
// jenko_systems/diario-oficial-uniao-dou (esquema de entrada publicado, leitura da API pública em 13/10/2026): `mode` ("busca"),
// `termo` (aspas = busca exata), `secao`, `data_inicio`/`data_fim` (AAAA-MM-DD), `max_resultados` (até 500), `texto_completo`.
// Saída (visão padrão do dataset): `data` ("dd/mm/aaaa"), `secao`, `tipo`, `titulo`, `subtitulo`, `orgao`, `orgao_path`,
// `ementa`, `edicao`, `pagina`, `termo_encontrado`, `url`, `url_title`. O Sinal vai para o feed do Workspace (sem Conta).
//
// Dado pessoal: licença que cita CPF é de pessoa física e é descartada; o trecho da ementa só entra na evidência quando traz
// o CNPJ da empresa licenciada, e o CNPJ vai para o `payload` (nunca o nome do licenciado).
import { objetos, primeiroTexto, recortar, LIMITES, normalizar } from '../../../signal-runner/adaptadores/comum.ts'
import type { ImplDoPasso, Item } from '../tipos.ts'
import { cnpjLimpo, dentroDoPeriodo, janelaDoPasso, texto } from './comum.ts'
import { dataBr } from './icp-e-formato.ts'

const MAX_SINAIS_POR_RODADA = 15
const CPF = /\bCPF\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/i
const CNPJ = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/

/** "09/10/2026" ou "2026-10-09" em ISO ao meio-dia UTC; nulo se não for data. */
function dataDoDou(valor: string): string | null {
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(valor)
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor)
  const [a, m, d] = br ? [br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : []
  if (!a) return null
  const ms = Date.UTC(Number(a), Number(m) - 1, Number(d), 12)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

const cnpjFormatado = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
const SECOES: Record<string, string> = { do1: 'Seção 1', do2: 'Seção 2', do3: 'Seção 3' }

export const licencasDou: ImplDoPasso = {
  montarEntrada(_entrada, ctx) {
    const dias = janelaDoPasso(ctx)
    const maximo = Math.min(ctx.def.maxItems ?? 50, 500)
    return {
      input: {
        mode: 'busca',
        termo: texto(ctx.def.inputTemplate.termo) || '"licença de instalação"',
        secao: texto(ctx.def.inputTemplate.secao) || 'todos',
        data_inicio: new Date(ctx.agora - dias * 86_400_000).toISOString().slice(0, 10),
        data_fim: new Date(ctx.agora).toISOString().slice(0, 10),
        max_resultados: maximo,
        texto_completo: false,
      },
      maxItems: maximo,
    }
  },

  normalizar(brutos) {
    return objetos(brutos).flatMap((b): Item[] => {
      const quando = dataDoDou(primeiroTexto(b, 'data'))
      const url = primeiroTexto(b, 'url')
      if (!quando || !url) return []
      return [{
        tipo: 'publicacao_dou', quando, url, slug: primeiroTexto(b, 'url_title') || url.split('/').pop() || url,
        titulo: primeiroTexto(b, 'titulo'), subtitulo: primeiroTexto(b, 'subtitulo'), tipoDoAto: primeiroTexto(b, 'tipo'),
        orgao: primeiroTexto(b, 'orgao'), ementa: primeiroTexto(b, 'ementa'), secao: primeiroTexto(b, 'secao'),
        edicao: primeiroTexto(b, 'edicao'), pagina: primeiroTexto(b, 'pagina'),
      }]
    })
  },
}

/** `licencas_de_instalacao_dou`: só a publicação que traz "licença de instalação", sem pessoa física, uma por endereço. */
export const licencasDeInstalacaoDou: ImplDoPasso = {
  executar(entrada, ctx) {
    const dias = janelaDoPasso(ctx)
    const vistas = new Set<string>()
    const sinais: { quando: string; item: Item }[] = []
    for (const i of entrada) {
      if (i.tipo !== 'publicacao_dou') continue
      const quando = texto(i.quando)
      const url = texto(i.url)
      if (!quando || !url || vistas.has(url) || !dentroDoPeriodo(quando, ctx.agora, dias)) continue
      const campos = [i.titulo, i.subtitulo, i.tipoDoAto, i.ementa].map(texto)
      if (!campos.some((c) => normalizar(c).includes('licenca de instalacao'))) continue
      if (campos.some((c) => CPF.test(c))) continue
      vistas.add(url)
      const orgao = recortar(texto(i.orgao) || 'órgão federal', 140)
      const ementa = texto(i.ementa)
      const cnpj = cnpjLimpo(CNPJ.exec(ementa)?.[1])
      const data = dataBr(quando)
      const secao = SECOES[texto(i.secao).toLowerCase()] ?? 'DOU'
      const local = [secao, texto(i.edicao) ? `edição ${texto(i.edicao)}` : '', texto(i.pagina) ? `página ${texto(i.pagina)}` : ''].filter(Boolean).join(', ')
      sinais.push({
        quando,
        item: {
          eventKey: recortar(`licenca|${texto(i.slug)}`, LIMITES.chave),
          phrase: recortar(`Licença de instalação publicada no DOU por ${orgao}${cnpj ? ` (CNPJ ${cnpjFormatado(cnpj)})` : ''} em ${data}`, LIMITES.frase),
          firedAt: quando,
          source: 'Diário Oficial da União',
          evidence: recortar(`Publicação de ${data} (${local}): ${texto(i.tipoDoAto) || 'ato'}.${cnpj ? ` ${recortar(ementa, 600)}` : ''}`, LIMITES.evidencia),
          payload: { orgao, tipo: texto(i.tipoDoAto), ...(cnpj ? { cnpj } : {}), url, publicadoEm: quando.slice(0, 10) },
        },
      })
    }
    return sinais.sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando)).slice(0, MAX_SINAIS_POR_RODADA).map((s) => s.item)
  },
}
