// Os Sinais de Conta que o Plano do Sinal aceita e os campos de critério que cada um lê (agente-de-sinal 01). É a mesma
// tabela de `supabase/functions/_shared/plano-do-sinal/campos.ts` (a fonte única, conferida de novo no banco); um teste
// confere os dois. Quais destes tipos estão disponíveis vem do banco (o estado de cada coletor), nunca desta lista.
import type { Formulario } from '@/fonte/sinais-tipos'
import { criteriosComRecortes, recortesDoMonitoramento } from './criterios-custom'

export interface TipoDoPlano {
  rotulo: string
  /** O formulário de critérios que a tela já tem para o tipo (`CAMPOS` de `catalogo.ts`). */
  formulario: Formulario
  /** Os campos que o adaptador do tipo lê; os outros campos do formulário ficam escondidos. */
  campos: readonly string[]
}

const VAGAS = ['funcoes', 'senioridade', 'localizacao', 'periodo', 'palavras', 'nichos', 'nichosCustom', 'nicho', 'nichoCustom']
const PESSOAS_COMPLETO = ['cargos', 'movimento', 'pessoas', 'localizacao', 'periodo']

// Uma linha por tipo: o teste lê este bloco.
export const TIPOS_DO_PLANO: Readonly<Record<string, TipoDoPlano>> = {
  vaga_linkedin: { rotulo: 'Abertura de vagas', formulario: 'vagas', campos: VAGAS },
  vaga_indeed: { rotulo: 'Vagas no Indeed', formulario: 'vagas', campos: VAGAS },
  mudanca_de_emprego: { rotulo: 'Promoções', formulario: 'pessoas', campos: ['cargos', 'movimento', 'periodo'] },
  nova_lideranca: { rotulo: 'Nova liderança', formulario: 'pessoas', campos: PESSOAS_COMPLETO },
  entradas_e_saidas: { rotulo: 'Novas contratações', formulario: 'pessoas', campos: PESSOAS_COMPLETO },
  anuncio_de_movimentacao: { rotulo: 'Anúncio público de movimentação', formulario: 'pessoas', campos: ['cargos', 'movimento', 'pessoas', 'periodo'] },
  anuncio_linkedin: { rotulo: 'Anunciando no LinkedIn', formulario: 'anuncios', campos: ['localizacao', 'periodo', 'palavras'] },
  anuncio_meta: { rotulo: 'Anunciando na Meta', formulario: 'anuncios', campos: ['localizacao', 'periodo', 'palavras'] },
  anuncio_google: { rotulo: 'Anunciando no Google', formulario: 'anuncios', campos: ['localizacao', 'periodo'] },
  avaliacoes_google_maps: { rotulo: 'Avaliações no Google Maps', formulario: 'avaliacoes', campos: ['nota', 'periodo', 'palavras'] },
  crescimento_de_equipes: { rotulo: 'Crescimento ou redução de equipes', formulario: 'vagas', campos: [] },
  publicacao_da_empresa: { rotulo: 'Publicações da empresa', formulario: 'noticias', campos: ['periodo'] },
}

/** Os critérios de um tipo recém-escolhido: o período e o país padrão, onde o tipo os lê. */
export function criteriosPadraoDoTipo(tipo: string): Record<string, string | string[]> {
  const campos = TIPOS_DO_PLANO[tipo]?.campos ?? []
  return {
    ...(campos.includes('periodo') ? { periodo: 'Últimos 30 dias' } : {}),
    ...(campos.includes('localizacao') ? { localizacao: ['Brasil'] } : {}),
  }
}

/** Só o que a pessoa preencheu: sem lista vazia, texto em branco nem campo que o tipo não lê. */
export function criteriosParaSalvar(tipo: string, criterios: Record<string, unknown>): Record<string, string | string[]> {
  const campos = TIPOS_DO_PLANO[tipo]?.campos ?? []
  const saida: Record<string, string | string[]> = {}
  for (const [campo, valor] of Object.entries(criterios)) {
    if (!campos.includes(campo)) continue
    if (Array.isArray(valor)) {
      const itens = valor.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      if (itens.length) saida[campo] = itens
    } else if (typeof valor === 'string' && valor.trim() !== '') {
      saida[campo] = valor.trim()
    }
  }
  if (tipo === 'vaga_linkedin' || tipo === 'vaga_indeed') {
    const recortes = recortesDoMonitoramento(criterios)
    delete saida.nicho
    delete saida.nichoCustom
    const novos = criteriosComRecortes(saida, recortes) as Record<string, string | string[]>
    if (!recortes.some((r) => r.tipo === 'pronto')) delete novos.nichos
    if (!recortes.some((r) => r.tipo === 'custom')) delete novos.nichosCustom
    return novos
  }
  return saida
}
