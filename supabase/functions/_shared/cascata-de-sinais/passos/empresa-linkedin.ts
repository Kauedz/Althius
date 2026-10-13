// A página da empresa no LinkedIn (harvestapi/linkedin-company, esquema de entrada publicado em 12/10/2026: `companies`,
// URLs das páginas, e `searches`, nomes para o actor achar a página). Só consulta a empresa que já casa com uma Conta
// e ainda não tem a página nela: quem não é Conta, e quem já tem a página, não gasta. Saída: o resultado traz
// `linkedinUrl`, `website`, `employeeCount` e `name`; a empresa que o actor não devolveu segue como estava (o
// enriquecimento é um reforço, não um filtro).
import { mesmaEmpresa, objetos, primeiroTexto } from '../../../signal-runner/adaptadores/comum.ts'
import type { ContextoDoPasso, ImplDoPasso, Item } from '../tipos.ts'
import { candidataDoItem, itemDeCandidata, nomeDaEmpresa, paginaDoLinkedin, paginaLimpa } from './comum.ts'

/** Empresa que já é uma Conta e ainda não tem a página do LinkedIn nela: só essa vale o gasto. */
function paraEnriquecer(entrada: Item[], ctx: ContextoDoPasso) {
  return entrada.flatMap((i) => {
    const c = candidataDoItem(i)
    if (!c) return []
    const conta = ctx.contas.find((item) => mesmaEmpresa(item, c.empresa))
    if (!conta) return []
    const pagina = paginaDoLinkedin(c.empresa.linkedinUrl)
    const jaTemPagina = pagina && paginaDoLinkedin(conta.linkedinUrl) === pagina
    return jaTemPagina ? [] : [c]
  })
}

export const linkedinEmpresa: ImplDoPasso = {
  itensCobrados: (entrada, ctx) => paraEnriquecer(entrada, ctx).length,

  montarEntrada(entrada, ctx) {
    const alvo = paraEnriquecer(entrada, ctx).slice(0, ctx.def.maxItems ?? 50)
    if (!alvo.length) return { pular: 'Nenhuma Conta precisava da página da empresa.' }
    const companies = alvo.map((c) => paginaLimpa(c.empresa.linkedinUrl)).filter(Boolean)
    const searches = alvo.filter((c) => !paginaLimpa(c.empresa.linkedinUrl)).map((c) => c.empresa.nome)
    return { input: { ...(companies.length ? { companies } : {}), ...(searches.length ? { searches } : {}) }, maxItems: alvo.length }
  },

  normalizar(brutos, entrada) {
    const resultados = objetos(brutos).map((b) => ({
      pagina: paginaDoLinkedin(primeiroTexto(b, 'linkedinUrl')),
      universal: primeiroTexto(b, 'universalName').toLowerCase(),
      nome: nomeDaEmpresa(primeiroTexto(b, 'name')),
      linkedinUrl: paginaLimpa(primeiroTexto(b, 'linkedinUrl')),
      site: primeiroTexto(b, 'website').split('?')[0],
      funcionarios: typeof b.employeeCount === 'number' ? b.employeeCount : undefined,
    }))
    return entrada.map((item) => {
      const c = candidataDoItem(item)
      if (!c) return item
      const pagina = paginaDoLinkedin(c.empresa.linkedinUrl)
      const achado = resultados.find((r) =>
        (pagina && (r.pagina === pagina || r.universal === pagina)) || (!pagina && r.nome && r.nome === nomeDaEmpresa(c.empresa.nome))
      )
      if (!achado) return item
      return itemDeCandidata({
        ...c,
        empresa: {
          ...c.empresa,
          linkedinUrl: achado.linkedinUrl || c.empresa.linkedinUrl,
          site: achado.site || c.empresa.site,
          ...(achado.funcionarios !== undefined ? { funcionarios: achado.funcionarios } : {}),
        },
      })
    })
  },
}

export { mesmaEmpresa }
