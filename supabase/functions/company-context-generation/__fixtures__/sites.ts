// Sites fictícios para avaliar a geração do Contexto da empresa (contexto-da-empresa, tickets 02 e 08). Cada caso traz
// as páginas como o leitor as encontraria e as expectativas que uma pessoa revisou: o que o texto PRECISA reconhecer e
// o que seria falha grave (confundir a empresa com os compradores, inventar evidência, criar restrição sem base).
// Os nomes, domínios e textos são inventados; nenhum é de empresa real.

import type { Conceito, Preparacao } from '../../account-discovery/preparacao.ts'

export interface CasoDeAvaliacao {
  id: string
  tipo: 'saas' | 'industria' | 'consultoria' | 'empresa_nova' | 'varios_icps' | 'site_insuficiente'
  dominio: string
  paginas: Record<string, string>
  esperado: {
    suficiente: boolean
    /** O que a Empresa precisa dizer que a empresa analisada vende. */
    oferta?: RegExp[]
    /** Companhias plausíveis que o ICP precisa reconhecer. */
    compradores?: RegExp[]
    /** Pessoas plausíveis nas Personas. */
    personas?: RegExp[]
    /** Falhas graves: nada disso pode aparecer. */
    proibido?: RegExp[]
    /** Quantos ICPs distintos o texto deve trazer (primário, secundário...). */
    icpsMinimos?: number
    /**
     * Filtros que o Mercado não pode aplicar a partir desse ICP (`conceito:valor`), por serem hipótese sem base ou dado
     * da empresa analisada tomado como dos compradores. Nenhum site dos casos dá funcionários, faturamento ou porte dos
     * compradores, então filtro numérico aplicado é sempre falha grave (conferido em `conferirFiltros`).
     */
    proibidoNosFiltros?: RegExp[]
  }
}

const pagina = (titulo: string, corpo: string, links: string[] = []) =>
  `<html><head><title>${titulo}</title><meta name="description" content="${titulo}"></head><body><nav>${
    links.map((l) => `<a href="${l}">${l}</a>`).join(' ')
  }</nav><main>${corpo}</main></body></html>`

export const CASOS: CasoDeAvaliacao[] = [
  {
    id: 'saas-de-cobranca',
    tipo: 'saas',
    dominio: 'cobrafacil.com.br',
    paginas: {
      'https://cobrafacil.com.br/': pagina(
        'CobraFácil — régua de cobrança automática',
        `<h1>Receba em dia sem planilha</h1><p>O CobraFácil é um software de régua de cobrança para empresas que vendem por
        assinatura ou boleto recorrente. Envia lembretes por e-mail e WhatsApp, gera segunda via e concilia pagamentos com o
        banco.</p><p>Planos mensais por número de cobranças. Teste grátis por 14 dias.</p>`,
        ['/produto', '/clientes', '/sobre', '/blog'],
      ),
      'https://cobrafacil.com.br/produto': pagina('Produto', `<p>Régua configurável, integração com ERPs e gateways,
        painel de inadimplência por carteira. Para equipes financeiras de escolas, academias, provedores de internet e
        empresas de software.</p>`),
      'https://cobrafacil.com.br/clientes': pagina('Clientes', `<p>Escolas de idiomas, redes de academias e provedores
        regionais de internet usam o CobraFácil para reduzir a inadimplência.</p>`),
      'https://cobrafacil.com.br/sobre': pagina('Sobre', '<p>Somos uma equipe de Belo Horizonte apaixonada por finanças.</p>'),
    },
    esperado: {
      suficiente: true,
      oferta: [/cobran[cç]a/i, /recorrente|assinatura|boleto/i],
      compradores: [/escola|academia|provedor/i],
      personas: [/financeir|cobran[cç]a|CFO|controller/i],
      proibido: [/\d+\s*clientes/i, /faturamento de R\$/i],
      // A equipe é de Belo Horizonte; os compradores não são só de Minas.
      proibidoNosFiltros: [/^(sede|atuacao):.*(Minas|MG|Belo Horizonte)/i],
    },
  },
  {
    id: 'industria-de-embalagens',
    tipo: 'industria',
    dominio: 'embalanorte.ind.br',
    paginas: {
      'https://embalanorte.ind.br/': pagina(
        'EmbalaNorte — embalagens de papelão ondulado',
        `<h1>Fabricante de caixas de papelão ondulado sob medida</h1><p>Produzimos caixas, bandejas e acessórios para
        indústrias de alimentos, bebidas e e-commerce. Fábrica própria em Joinville, entregas para Sul e Sudeste.</p>`,
        ['/produtos', '/segmentos', '/quem-somos'],
      ),
      'https://embalanorte.ind.br/produtos': pagina('Produtos', '<p>Caixas maleta, caixas com divisórias, bandejas para frutas, impressão em até 4 cores.</p>'),
      'https://embalanorte.ind.br/segmentos': pagina('Segmentos', '<p>Alimentos e bebidas, hortifrúti, autopeças e lojas virtuais.</p>'),
      'https://embalanorte.ind.br/quem-somos': pagina('Quem somos', '<p>Indústria familiar desde 1998, certificação FSC.</p>'),
    },
    esperado: {
      suficiente: true,
      oferta: [/papel[aã]o|embalage/i],
      compradores: [/aliment|bebida|e-?commerce|hortifr|autope/i],
      personas: [/compra|suprimento|log[ií]stic|produ[cç][aã]o/i],
      proibido: [/vende (software|SaaS)/i],
      // Joinville é a fábrica, não onde ficam os compradores.
      proibidoNosFiltros: [/^(sede|atuacao):.*(Joinville|Santa Catarina|SC)$/i],
    },
  },
  {
    id: 'consultoria-tributaria',
    tipo: 'consultoria',
    dominio: 'taxa-certa.com.br',
    paginas: {
      'https://taxa-certa.com.br/': pagina(
        'Taxa Certa Consultoria',
        `<h1>Recupere créditos tributários com segurança</h1><p>Consultoria tributária para empresas do lucro real e
        presumido: revisão fiscal, recuperação de PIS/COFINS e planejamento tributário. Honorários por êxito.</p>`,
        ['/servicos', '/cases'],
      ),
      'https://taxa-certa.com.br/servicos': pagina('Serviços', '<p>Diagnóstico fiscal, compensação de créditos, defesa em autuações.</p>'),
      'https://taxa-certa.com.br/cases': pagina('Cases', '<p>Uma rede varejista recuperou créditos de ICMS-ST após a revisão.</p>'),
    },
    esperado: {
      suficiente: true,
      oferta: [/tribut/i, /consultoria/i],
      compradores: [/lucro real|presumido|varej/i],
      personas: [/CFO|financeir|controller|fiscal|tribut/i],
      // O case cita "uma rede varejista": inventar o nome dela seria evidência falsa.
      proibido: [/Magazine|Casas Bahia|Renner|Carrefour/i],
    },
  },
  {
    id: 'empresa-nova',
    tipo: 'empresa_nova',
    dominio: 'agendaclin.app',
    paginas: {
      'https://agendaclin.app/': pagina(
        'AgendaClin — lançamento 2026',
        `<h1>A agenda online para clínicas que acabou de chegar</h1><p>Fundada em 2026. Agendamento online, confirmação
        por WhatsApp e prontuário simples para clínicas de fisioterapia, odontologia e psicologia. Estamos no beta com
        as primeiras clínicas parceiras.</p>`,
        ['/sobre'],
      ),
      'https://agendaclin.app/sobre': pagina('Sobre', '<p>Dois fundadores, ex-gestores de clínica, criaram a AgendaClin.</p>'),
    },
    esperado: {
      suficiente: true,
      oferta: [/agend/i],
      compradores: [/cl[ií]nica/i],
      personas: [/s[oó]ci|propriet|gestor|recep|administr/i],
      // A idade da empresa não restringe o ICP, e não há número de clientes no site.
      proibido: [/\d+\s*cl[ií]nicas (atendidas|clientes)/i, /apenas pequenas por ser nova/i],
      // Ser nova não restringe o porte dos compradores.
      proibidoNosFiltros: [/^excluir:.*(grande|enterprise)/i],
    },
  },
  {
    id: 'varios-icps',
    tipo: 'varios_icps',
    dominio: 'frotaviva.com.br',
    paginas: {
      'https://frotaviva.com.br/': pagina(
        'FrotaViva — telemetria e gestão de frotas',
        `<h1>Gestão de frota com telemetria</h1><p>Rastreamento, consumo de combustível e manutenção preventiva.</p>`,
        ['/solucoes/transportadoras', '/solucoes/agronegocio', '/solucoes/prefeituras', '/clientes'],
      ),
      'https://frotaviva.com.br/solucoes/transportadoras': pagina('Para transportadoras', '<p>Roteiros, jornada do motorista e custo por km para transportadoras de carga.</p>'),
      'https://frotaviva.com.br/solucoes/agronegocio': pagina('Para o agro', '<p>Máquinas e caminhões em fazendas e usinas, com cobertura offline.</p>'),
      'https://frotaviva.com.br/solucoes/prefeituras': pagina('Para prefeituras', '<p>Frota municipal com relatórios para prestação de contas e licitação.</p>'),
      'https://frotaviva.com.br/clientes': pagina('Clientes', '<p>Transportadoras, usinas de cana e municípios do interior paulista.</p>'),
    },
    esperado: {
      suficiente: true,
      oferta: [/frota|telemetria|rastreamento/i],
      compradores: [/transportador/i, /agro|usina|fazenda/i, /prefeitura|munic[ií]p|setor p[uú]blico/i],
      personas: [/frota|opera[cç][oõ]es|log[ií]stic|secret[aá]ri/i],
      icpsMinimos: 2,
    },
  },
  {
    id: 'site-insuficiente',
    tipo: 'site_insuficiente',
    dominio: 'emconstrucao.com.br',
    paginas: {
      'https://emconstrucao.com.br/': pagina('Em breve', '<h1>Em breve</h1><p>Nosso site está em construção. Volte logo!</p>'),
    },
    esperado: { suficiente: false },
  },
]

/** Um `fetch` que só conhece as páginas do caso: o resto é 404. */
export function fetchDoCaso(caso: CasoDeAvaliacao): typeof fetch {
  return ((entrada: string | URL | Request) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url
    const html = caso.paginas[url]
    return Promise.resolve(
      html
        ? new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        : new Response('não achou', { status: 404 }),
    )
  }) as typeof fetch
}

/**
 * A rubrica da spec, aplicada ao que dá para conferir automaticamente nos textos. A correspondência entre narrativa e
 * filtros fica em `conferirFiltros`; fatos vs. inferências e a coerência das personas, na revisão de uma pessoa, que
 * registra o resultado em `.scratch/contexto-da-empresa/validacao.md`.
 */
export function conferirRubrica(
  caso: CasoDeAvaliacao,
  resultado: { textos: { empresa: string; icp: string; personas: string } | null; falha: string | null },
): string[] {
  const problemas: string[] = []
  const { esperado } = caso
  if (!esperado.suficiente) {
    if (resultado.textos) problemas.push('gerou texto para um site insuficiente')
    if (resultado.falha !== 'site_insuficiente') problemas.push(`falha esperada site_insuficiente, veio ${resultado.falha}`)
    return problemas
  }
  if (!resultado.textos) return [`não gerou (${resultado.falha})`]
  const { empresa, icp, personas } = resultado.textos
  for (const re of esperado.oferta ?? []) if (!re.test(empresa)) problemas.push(`Empresa não reconhece a oferta ${re}`)
  for (const re of esperado.compradores ?? []) if (!re.test(icp)) problemas.push(`ICP não reconhece compradores ${re}`)
  for (const re of esperado.personas ?? []) if (!re.test(personas)) problemas.push(`Personas sem ${re}`)
  const tudo = `${empresa}\n${icp}\n${personas}`
  for (const re of esperado.proibido ?? []) if (re.test(tudo)) problemas.push(`${FALHA_GRAVE}: ${re}`)
  if (esperado.icpsMinimos && (icp.match(/ICP (prim[aá]rio|secund[aá]rio|terci[aá]rio)/gi)?.length ?? 0) < esperado.icpsMinimos) {
    problemas.push(`ICP com menos de ${esperado.icpsMinimos} perfis`)
  }
  return problemas
}

const CONCEITOS_NUMERICOS = new Set<Conceito>(['funcionarios', 'faturamento', 'porteCadastral'])

/** Problemas que impedem considerar a funcionalidade pronta (confundir, inventar, restrição sem base). */
export const FALHA_GRAVE = 'falha grave'
export const ehGrave = (problema: string): boolean => problema.startsWith(FALHA_GRAVE)

/**
 * A rubrica da correspondência entre narrativa e filtros: o ICP gerado vira filtros sem hipótese obrigatória, sem dado
 * da empresa analisada e sem número inventado; cada perfil do texto vira um recorte que o Mercado consegue buscar.
 */
export function conferirFiltros(caso: CasoDeAvaliacao, icp: string, preparacao: Preparacao): string[] {
  if (preparacao.estado !== 'pronta') return [`preparação ${preparacao.estado}`]
  const problemas: string[] = []
  const texto = icp.replace(/\s+/g, ' ')
  if (caso.esperado.icpsMinimos && preparacao.perfis.length < caso.esperado.icpsMinimos) {
    problemas.push(`filtros com menos de ${caso.esperado.icpsMinimos} recortes (vieram ${preparacao.perfis.length})`)
  }
  for (const perfil of preparacao.perfis) {
    if (!perfil.criterios.setores.length && !perfil.criterios.palavrasChave.length) {
      problemas.push(`${perfil.nome}: sem setor nem palavra-chave, o Mercado não busca esse recorte`)
    }
    for (const a of perfil.aplicados) {
      if (!texto.includes(a.trecho.replace(/\s+/g, ' '))) problemas.push(`${perfil.nome}: filtro ${a.conceito} sem trecho no ICP`)
      if (CONCEITOS_NUMERICOS.has(a.conceito)) problemas.push(`${FALHA_GRAVE}: ${perfil.nome} aplica ${a.conceito} "${a.valor}" sem base no site`)
      for (const re of caso.esperado.proibidoNosFiltros ?? []) {
        if (re.test(`${a.conceito}:${a.valor}`)) problemas.push(`${FALHA_GRAVE}: ${perfil.nome} aplica ${a.conceito} "${a.valor}" (${re})`)
      }
    }
  }
  return problemas
}
