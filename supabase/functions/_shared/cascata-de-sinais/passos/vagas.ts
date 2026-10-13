// Os dois primeiros passos de uma cascata de vagas (ICP A1, E e F): a busca de vagas (actor) e a confirmação (regra
// interna). A busca fala com o actor pelo esquema de entrada publicado de cada um (leitura da API pública, 12/10/2026):
//   curious_coder/linkedin-jobs-scraper  urls, scrapeCompany, limitPerSource (a URL da busca leva keywords, location, f_TPR)
//   valig/linkedin-jobs-scraper          keywords, location, datePosted (r86400|r604800|r2592000), limit, titleInclude
//   zen-studio/gupy-jobs-scraper         searchTerm, sortBy, maxResults
// A confirmação mantém só a vaga com data dentro da janela e título com termo do tema, e junta as vagas por empresa.
import { contemAlgum, paisesDaLocalizacao, primeiroTexto, objetos } from '../../../signal-runner/adaptadores/comum.ts'
import type { ImplDoPasso, Item } from '../tipos.ts'
import {
  type Candidata,
  chaveDaEmpresa,
  dataIso,
  dentroDoPeriodo,
  itemDeCandidata,
  itemDeVaga,
  janelaDoPasso,
  listaDoPasso,
  vagaDoItem,
} from './comum.ts'

const MAX_BUSCAS = 4
const VAGAS_POR_EMPRESA = 3

function linkDaVagaDoLinkedin(item: Record<string, unknown>): string {
  const id = primeiroTexto(item, 'id')
  if (/^\d+$/.test(id)) return `https://www.linkedin.com/jobs/view/${id}`
  return primeiroTexto(item, 'link', 'url').split('?')[0]
}

export const linkedinVagas: ImplDoPasso = {
  montarEntrada(_entrada, ctx, actorId) {
    const termos = listaDoPasso(ctx, 'termos', 'termos')
    if (!termos.length) return { pular: 'Sem termo de busca para as vagas.' }
    const dias = janelaDoPasso(ctx)
    const maximo = ctx.def.maxItems ?? 100
    const pais = paisesDaLocalizacao(ctx.criterios.localizacao !== undefined ? ctx.criterios : { localizacao: [ctx.def.inputTemplate.pais === 'Brazil' ? 'Brasil' : String(ctx.def.inputTemplate.pais ?? 'Brasil')] })[0]
    if (actorId.startsWith('valig~')) {
      return {
        input: {
          keywords: termos[0],
          location: pais.nomeEmIngles,
          datePosted: dias <= 1 ? 'r86400' : dias <= 7 ? 'r604800' : 'r2592000',
          limit: maximo,
          titleInclude: termos,
        },
        maxItems: maximo,
      }
    }
    if (actorId.startsWith('zen-studio~')) {
      return { input: { searchTerm: termos[0], sortBy: 'newest', maxResults: maximo }, maxItems: maximo }
    }
    const urls = termos.slice(0, MAX_BUSCAS).map((termo) =>
      `https://www.linkedin.com/jobs/search/?${new URLSearchParams({ keywords: termo, location: pais.nomeEmIngles, f_TPR: `r${dias * 86_400}` })}`
    )
    return { input: { urls, scrapeCompany: false, limitPerSource: Math.ceil(maximo / urls.length) }, maxItems: maximo }
  },

  normalizar(brutos, _entrada, _ctx, actorId) {
    return objetos(brutos).flatMap((b) => {
      if (actorId.startsWith('zen-studio~')) {
        const titulo = primeiroTexto(b, 'name')
        const nome = primeiroTexto(b, 'careerPageName')
        if (!titulo || !nome) return []
        return [itemDeVaga({
          titulo,
          local: [primeiroTexto(b, 'city'), primeiroTexto(b, 'stateCode')].filter(Boolean).join(', '),
          descricao: primeiroTexto(b, 'descriptionPlainText'),
          nivel: '',
          link: primeiroTexto(b, 'jobUrl').split('?')[0],
          publicadaEm: dataIso(b.publishedDate) ?? dataIso(b.publishedAt),
          fonte: 'Gupy',
        }, { nome, linkedinUrl: primeiroTexto(b, 'companyLinkedin'), site: primeiroTexto(b, 'careerPageWebsite') })]
      }
      const valig = actorId.startsWith('valig~')
      const titulo = primeiroTexto(b, 'title')
      const nome = primeiroTexto(b, 'companyName')
      if (!titulo || !nome) return []
      return [itemDeVaga({
        titulo,
        local: primeiroTexto(b, 'location'),
        descricao: primeiroTexto(b, valig ? 'description' : 'descriptionText'),
        nivel: primeiroTexto(b, valig ? 'experienceLevel' : 'seniorityLevel'),
        link: valig ? primeiroTexto(b, 'url').split('?')[0] : linkDaVagaDoLinkedin(b),
        publicadaEm: valig ? dataIso(b.postedDate) : (dataIso(b.postedAtTimestamp) ?? dataIso(b.postedAt)),
        fonte: 'LinkedIn Vagas',
      }, {
        nome,
        linkedinUrl: primeiroTexto(b, valig ? 'companyUrl' : 'companyLinkedinUrl'),
        site: valig ? '' : primeiroTexto(b, 'companyWebsite'),
      })]
    })
  },
}

/** A confirmação: vaga dentro da janela, título com termo do tema; uma empresa por linha, com as vagas mais novas. */
export const confirmarVaga: ImplDoPasso = {
  executar(entrada, ctx) {
    const termos = listaDoPasso(ctx, 'termosConfirmacao', 'termosConfirmacao')
    const dias = janelaDoPasso(ctx)
    const porEmpresa = new Map<string, Candidata>()
    for (const item of entrada) {
      const v = vagaDoItem(item)
      if (!v) continue
      if (termos.length && !contemAlgum(v.vaga.titulo, termos)) continue
      if (v.vaga.publicadaEm && !dentroDoPeriodo(v.vaga.publicadaEm, ctx.agora, dias)) continue
      const chave = chaveDaEmpresa(v.empresa)
      const atual = porEmpresa.get(chave)
      if (!atual) {
        porEmpresa.set(chave, { chave, empresa: v.empresa, vagas: [v.vaga] })
        continue
      }
      // Fica o endereço do LinkedIn e o site que algum item trouxe.
      atual.empresa = {
        ...atual.empresa,
        linkedinUrl: atual.empresa.linkedinUrl || v.empresa.linkedinUrl,
        site: atual.empresa.site || v.empresa.site,
      }
      if (!atual.vagas.some((x) => x.titulo === v.vaga.titulo && x.link === v.vaga.link)) atual.vagas.push(v.vaga)
    }
    return [...porEmpresa.values()].map((c) => {
      c.vagas.sort((a, b) => Date.parse(b.publicadaEm ?? '1970-01-01') - Date.parse(a.publicadaEm ?? '1970-01-01'))
      return itemDeCandidata({ ...c, vagas: c.vagas.slice(0, VAGAS_POR_EMPRESA) })
    }) as Item[]
  },
}
