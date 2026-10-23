// Os campos de critério que cada Sinal de Conta lê de verdade, lidos nos adaptadores do `signal-runner`
// (`signal-runner/adaptadores/`). Os critérios do Plano têm o mesmo formato dos de um Monitoramento (as chaves e os
// textos do formulário de `paginas/sinais/catalogo.ts`), então o Plano vira o `criteria` do Monitoramento sem tradução.
//
// Esta lista diz QUAIS campos cada tipo lê. Quais tipos o Plano aceita não está aqui: vem do banco (actors `available`
// de `private.signal_actors`), e só vale o tipo que também tem os campos descritos aqui. A migration repete as chaves em
// `private.signal_plan_criteria_keys` e as opções abaixo em `private.validate_signal_plan`, e um teste confere os dois.
import { LIMITES_DO_PLANO } from './limites.ts'

export type CampoDoPlano =
  | 'funcoes'
  | 'cargos'
  | 'senioridade'
  | 'localizacao'
  | 'periodo'
  | 'palavras'
  | 'movimento'
  | 'pessoas'
  | 'nota'
  | 'nicho'
  | 'nichoCustom'

export type Criterios = Record<string, string | string[]>

// Uma linha por tipo: o teste da migration lê este bloco.
export const CAMPOS_POR_TIPO: Readonly<Record<string, readonly CampoDoPlano[]>> = {
  vaga_linkedin: ['funcoes', 'senioridade', 'localizacao', 'periodo', 'palavras', 'nicho', 'nichoCustom'],
  vaga_indeed: ['funcoes', 'senioridade', 'localizacao', 'periodo', 'palavras', 'nicho', 'nichoCustom'],
  mudanca_de_emprego: ['cargos', 'movimento', 'periodo'],
  nova_lideranca: ['cargos', 'movimento', 'pessoas', 'localizacao', 'periodo'],
  entradas_e_saidas: ['cargos', 'movimento', 'pessoas', 'localizacao', 'periodo'],
  anuncio_de_movimentacao: ['cargos', 'movimento', 'pessoas', 'periodo'],
  anuncio_linkedin: ['localizacao', 'periodo', 'palavras'],
  anuncio_meta: ['localizacao', 'periodo', 'palavras'],
  anuncio_google: ['localizacao', 'periodo'],
  avaliacoes_google_maps: ['nota', 'periodo', 'palavras'],
  crescimento_de_equipes: [],
  publicacao_da_empresa: ['periodo'],
}

/** Como a pessoa lê cada tipo (os mesmos nomes dos cards de Sinais). */
export const ROTULO_DO_TIPO: Readonly<Record<string, string>> = {
  vaga_linkedin: 'Abertura de vagas',
  vaga_indeed: 'Vagas no Indeed',
  mudanca_de_emprego: 'Promoções',
  nova_lideranca: 'Nova liderança',
  entradas_e_saidas: 'Novas contratações',
  anuncio_de_movimentacao: 'Anúncio público de movimentação',
  anuncio_linkedin: 'Anunciando no LinkedIn',
  anuncio_meta: 'Anunciando na Meta',
  anuncio_google: 'Anunciando no Google',
  avaliacoes_google_maps: 'Avaliações no Google Maps',
  crescimento_de_equipes: 'Crescimento ou redução de equipes',
  publicacao_da_empresa: 'Publicações da empresa',
}

/** Uma frase do que cada tipo acompanha, para o pedido à IA. */
export const FRASE_DO_TIPO: Readonly<Record<string, string>> = {
  vaga_linkedin: 'a empresa abre vagas nas funções escolhidas',
  vaga_indeed: 'a empresa publica vagas nas funções escolhidas no Indeed',
  mudanca_de_emprego: 'um Contato da Conta é promovido, chega ou muda de empresa',
  nova_lideranca: 'chega uma nova liderança (diretor, gerente, head) na Conta',
  entradas_e_saidas: 'entram pessoas novas nos cargos escolhidos na Conta',
  anuncio_de_movimentacao: 'alguém da empresa anuncia no LinkedIn um novo cargo, uma promoção ou uma chegada',
  anuncio_linkedin: 'a empresa começa uma campanha de anúncios no LinkedIn',
  anuncio_meta: 'a empresa começa a anunciar no Facebook e no Instagram',
  anuncio_google: 'a empresa começa a anunciar no Google',
  avaliacoes_google_maps: 'a empresa recebe avaliações ruins no Google Maps',
  crescimento_de_equipes: 'o quadro de pessoas da empresa cresce',
  publicacao_da_empresa: 'a empresa publica no LinkedIn sobre expansão, contratação ou investimento',
}

export const OPCOES = {
  senioridade: ['Qualquer', 'Liderança', 'Especialista', 'Pleno e sênior'],
  periodo: ['Últimos 7 dias', 'Últimos 14 dias', 'Últimos 30 dias', 'Últimos 90 dias'],
  localizacao: ['Brasil', 'México', 'Colômbia', 'Argentina', 'Chile', 'Estados Unidos'],
  movimento: ['Chegada', 'Promoção', 'Mudança de empresa'],
  pessoas: ['Qualquer pessoa no cargo', 'Contatos das Contas-alvo', 'Compradores de negócios ganhos', 'Campeões de negócios perdidos'],
  nota: ['Qualquer nota', 'Até 3 estrelas', 'Até 2 estrelas'],
} as const

/** As opções prontas de "Cargos" (pessoas): os cargos que a tela sugere. */
export const CARGOS_PRONTOS: readonly string[] = ['CDO', 'CTO', 'VP de Engenharia', 'Head de Dados', 'CFO', 'Procurement']

/**
 * As opções prontas de "Cargos ou funções" (vagas): a lista geral e as sugestões de cada nicho
 * (`paginas/sinais/catalogo.ts` e `nichos.ts`). Um cargo fora delas foi escrito pela pessoa (Custom) e conta no limite.
 */
export const FUNCOES_PRONTAS: readonly string[] = [
  'Engenharia de dados', 'IA e machine learning', 'Plataforma e infraestrutura', 'RevOps e GTM', 'Finanças',
  'Recursos humanos',
  'Analista de comércio exterior', 'Coordenador de importação', 'Especialista em drawback', 'Despachante aduaneiro',
  'Analista fiscal', 'Coordenador tributário', 'Contador', 'Analista de obrigações acessórias',
  'Advogado empresarial', 'Analista jurídico', 'Coordenador de contratos', 'Compliance',
  'Analista de energia', 'Gestor de mercado livre', 'Engenheiro eletricista', 'Comprador de energia',
  'Engenheiro de manutenção', 'Comprador industrial', 'Coordenador de produção', 'Engenheiro de processos',
  'Analista de logística', 'Coordenador de transporte', 'Gerente de centro de distribuição', 'Planejador de rotas',
  'Consultor de benefícios', 'Analista de recursos humanos', 'Coordenador de gente e gestão', 'Gerente de benefícios',
  'Agrônomo', 'Gerente comercial agro', 'Analista de crédito rural', 'Coordenador de compras agrícolas',
]

/** Sem acento, sem caixa e com um espaço só: a chave para achar cargo repetido (a mesma de `private.normalized_role`). */
export function chaveDoCargo(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const PRONTAS_POR_CAMPO: Readonly<Record<'funcoes' | 'cargos', ReadonlySet<string>>> = {
  funcoes: new Set(FUNCOES_PRONTAS.map(chaveDoCargo)),
  cargos: new Set(CARGOS_PRONTOS.map(chaveDoCargo)),
}

const SLUG_DE_NICHO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function texto(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null
}

function umaEscolha(valor: unknown, opcoes: readonly string[]): string | null {
  const t = texto(valor)
  return t !== null && opcoes.includes(t) ? t : null
}

function variasEscolhas(valor: unknown, opcoes: readonly string[]): string[] | null {
  if (!Array.isArray(valor)) return null
  const vistos = new Set<string>()
  for (const item of valor) {
    if (typeof item !== 'string' || !opcoes.includes(item) || vistos.has(item)) return null
    vistos.add(item)
  }
  return [...vistos]
}

/** Cargos ou funções: até 60 caracteres cada, nenhum repetido, e até 10 escritos pela pessoa fora das opções prontas. */
function cargos(valor: unknown, campo: 'funcoes' | 'cargos'): string[] | null {
  if (!Array.isArray(valor) || valor.length > LIMITES_DO_PLANO.itensDeListaMax) return null
  const vistos = new Set<string>()
  const saida: string[] = []
  let custom = 0
  for (const item of valor) {
    if (typeof item !== 'string') return null
    const cargo = item.replace(/\s+/g, ' ').trim()
    const chave = chaveDoCargo(cargo)
    if (!chave || cargo.length > LIMITES_DO_PLANO.textoCustomMax || vistos.has(chave)) return null
    vistos.add(chave)
    if (!PRONTAS_POR_CAMPO[campo].has(chave)) custom++
    saida.push(cargo)
  }
  return custom > LIMITES_DO_PLANO.cargosCustomMax ? null : saida
}

/** O valor limpo de um campo, ou `null` quando ele não cabe nos limites. Texto sem espaços sobrando. */
export function valorDoCampo(campo: CampoDoPlano, valor: unknown): string | string[] | null {
  switch (campo) {
    case 'funcoes':
    case 'cargos':
      return cargos(valor, campo)
    case 'senioridade':
    case 'periodo':
    case 'pessoas':
    case 'nota':
      return umaEscolha(valor, OPCOES[campo])
    case 'localizacao':
    case 'movimento':
      return variasEscolhas(valor, OPCOES[campo])
    case 'palavras': {
      const t = texto(valor)?.replace(/\s+/g, ' ').trim()
      return t !== undefined && t.length <= LIMITES_DO_PLANO.palavrasMax ? t : null
    }
    case 'nicho': {
      const t = texto(valor)?.trim()
      return t !== undefined && t.length <= LIMITES_DO_PLANO.textoCustomMax && (t === 'qualquer' || t === 'custom' || SLUG_DE_NICHO.test(t))
        ? t
        : null
    }
    case 'nichoCustom': {
      const t = texto(valor)?.replace(/\s+/g, ' ').trim()
      return t !== undefined && t.length <= LIMITES_DO_PLANO.textoCustomMax ? t : null
    }
  }
}
