import type { ExplicacaoDeAderencia } from './aderencia-explicada'
import type { AjusteAprendido, CodigoDoDescarte, DimensaoAprendida } from './aprendizado-da-descoberta'
import type { FonteDeContas } from './tipos'
import type {
  ContaDescoberta,
  CotacaoDaDescoberta,
  FonteDeDescobertas,
  ResultadoDoAceite,
} from './descobertas-tipos'
import { criteriosDaBuscaVazios, type CriteriosDaBusca } from './descobertas-tipos'

/** Como a Demonstração escreve uma candidata: sem origem, é da busca; sem Sinais reais, não tem motivos de Sinal. */
type CandidataDaDemonstracao = Omit<ContaDescoberta, 'origem' | 'motivosDeSinal'> & Partial<Pick<ContaDescoberta, 'origem' | 'motivosDeSinal'>>

const CANDIDATAS_INICIAIS: CandidataDaDemonstracao[] = [
  {
    id: 'desc-1',
    state: 'nova',
    nome: 'LogiFlow Brasil S.A.',
    website: 'https://logiflow.com.br',
    dominio: 'logiflow.com.br',
    cnpj: '45.123.890/0001-12',
    linkedinUrl: 'https://linkedin.com/company/logiflow-brasil',
    localizacao: 'Curitiba, PR',
    uf: 'PR',
    setor: 'Logística e Cadeia de Suprimentos',
    tamanho: '100-250 funcionários',
    funcionarios: 180,
    descricao: 'Soluções integradas de inteligência logística e rastreamento de cargas para grandes frotas.',
    tags: ['logistica', 'b2b', 'saas', 'parana'],
    fitLevel: 'alto',
    motivos: ['Setor: Logística', 'Porte: 100-250 funcionários', 'Localização: Paraná', 'Presença digital ativa'],
    sinais: [
      { frase: 'Abriu 4 vagas para coordenadores de operações e SDR', fonte: 'linkedin_jobs', data: '2026-09-28' },
      { frase: 'Nova filial inaugurada em São José dos Pinhais', fonte: 'noticias', data: '2026-09-20' },
    ],
    criadaEm: '2026-09-30T10:00:00.000Z',
  },
  {
    id: 'desc-2',
    state: 'nova',
    nome: 'OmniVarejo Inteligência Digital Ltda',
    website: 'https://omnivarejo.com.br',
    dominio: 'omnivarejo.com.br',
    cnpj: '28.987.654/0001-99',
    linkedinUrl: 'https://linkedin.com/company/omnivarejo',
    localizacao: 'São Paulo, SP',
    uf: 'SP',
    setor: 'Varejo e E-commerce',
    tamanho: '50-100 funcionários',
    funcionarios: 75,
    descricao: 'Plataforma omnichannel de automação de pedidos e catálogo para redes de médio porte.',
    tags: ['varejo', 'ecommerce', 'sp'],
    fitLevel: 'medio',
    motivos: ['Setor: Varejo', 'Localização: São Paulo'],
    sinais: [
      { frase: 'Implementou novo ERP no último trimestre', fonte: 'tech_signals', data: '2026-09-15' },
    ],
    criadaEm: '2026-09-30T11:30:00.000Z',
  },
  {
    id: 'desc-3',
    state: 'nova',
    nome: 'Metalúrgica Catarinense S.A.',
    website: 'https://metalurgicacatarinense.com.br',
    dominio: 'metalurgicacatarinense.com.br',
    cnpj: '83.456.789/0001-33',
    linkedinUrl: 'https://linkedin.com/company/metalurgica-catarinense',
    localizacao: 'Joinville, SC',
    uf: 'SC',
    setor: 'Indústria Metalmecânica',
    tamanho: '250-500 funcionários',
    funcionarios: 340,
    descricao: 'Fabricação de componentes de alta precisão para o setor automotivo e agrícola.',
    tags: ['industria', 'manufatura', 'sc'],
    fitLevel: 'baixo',
    motivos: ['Localização: Santa Catarina', 'Porte compatível'],
    sinais: [],
    criadaEm: '2026-09-29T16:00:00.000Z',
  },
  {
    id: 'desc-4',
    state: 'nova',
    nome: 'Órbita Agroindustrial S.A.',
    website: 'https://orbitaagro.com.br',
    dominio: 'orbitaagro.com.br',
    cnpj: '04.252.011/0001-10',
    localizacao: 'Campinas, SP',
    uf: 'SP',
    setor: 'Agroindústria',
    tags: [],
    fitLevel: 'baixo',
    motivos: [],
    sinais: [],
    origem: 'sinal',
    motivosDeSinal: [
      { id: 'sinal-4a', tipo: 'nova_filial_icp_g', frase: 'Abriu filial em Campinas', fonte: 'Diário Oficial', data: '2026-09-21T12:00:00.000Z', valido: true, mercado: false },
      { id: 'sinal-4b', tipo: 'financiamento_bndes_finep', frase: 'Financiamento aprovado para nova linha de produção', fonte: 'Notícia', data: '2026-07-20T12:00:00.000Z', valido: false, mercado: false },
      { id: 'sinal-4c', tipo: 'vaga_comex', frase: 'Abriu vaga de Analista de Comércio Exterior em Campinas, SP', fonte: 'LinkedIn', data: '2026-06-02T12:00:00.000Z', valido: false, mercado: false },
    ],
    criadaEm: '2026-09-21T13:00:00.000Z',
  },
  {
    id: 'desc-5',
    state: 'nova',
    nome: 'Vértice Embalagens Ltda',
    website: 'https://verticeembalagens.com.br',
    dominio: 'verticeembalagens.com.br',
    localizacao: 'Joinville, SC',
    uf: 'SC',
    setor: 'Embalagens',
    tags: [],
    fitLevel: 'baixo',
    motivos: [],
    sinais: [],
    origem: 'sinal',
    motivosDeSinal: [
      { id: 'sinal-5a', tipo: 'nova_planta_filial', frase: 'Inaugurou nova planta em Joinville', fonte: 'Notícia', data: '2026-09-20T12:00:00.000Z', valido: true, mercado: false },
    ],
    voltouPorSinalEm: '2026-09-20T13:00:00.000Z',
    motivoDoDescarteAnterior: 'Fora do ICP: porte menor que o mínimo',
    criadaEm: '2026-05-10T10:00:00.000Z',
  },
]

const ROTULO_DO_NIVEL: Record<string, string> = { alto: 'alta', medio: 'média', baixo: 'baixa', sem_dado: 'sem dado' }

export function criarFonteDeDescobertasSimulada({
  fonteDeContas,
  candidatasIniciais = CANDIDATAS_INICIAIS,
  saldoInicial = 100,
}: {
  armazenamento?: Storage
  fonteDeContas?: FonteDeContas
  candidatasIniciais?: CandidataDaDemonstracao[]
  saldoInicial?: number
} = {}): FonteDeDescobertas {
  let candidatas: ContaDescoberta[] = candidatasIniciais.map((c) => ({ origem: 'busca', motivosDeSinal: [], ...c }))
  // O aprendizado da Demonstração: a mesma regra do banco (feedback-que-ensina), sem decaimento.
  const aprendido = new Map<string, { delta: number; decisoes: number; em: string }>()
  const aprender = (dimensao: DimensaoAprendida, valor: string, sinal: 1 | -1) => {
    const chave = `${dimensao}|${valor.trim().toLowerCase()}`
    const a = aprendido.get(chave) ?? { delta: 0, decisoes: 0, em: '' }
    aprendido.set(chave, { delta: a.delta + 2.5 * sinal, decisoes: a.decisoes + 1, em: new Date().toISOString() })
  }
  let saldo = saldoInicial
  let emAndamento = false
  const ouvintes = new Set<() => void>()

  const notificar = () => ouvintes.forEach((o) => o())

  return {
    async criteriosDaBusca() {
      return {
        temIcp: true,
        icpVersion: 1,
        icpResumo: 'Setor: Logística e tecnologia\nPorte: 11-200\nRegião: SP, PR',
        criterios: { ...criteriosDaBuscaVazios(), setores: ['Logística e tecnologia'], portes: ['11-50', '51-200'], regioes: ['SP', 'PR'] },
      }
    },
    async cotarBusca(_maxResults = 50): Promise<CotacaoDaDescoberta> {
      return {
        creditos: 5,
        saldoDisponivel: saldo,
        emAndamento,
        estadoDoActor: 'available',
        podeTestar: true,
      }
    },

    async buscarContas(_args: { criterios: CriteriosDaBusca; icpVersion: number | null; maxResults?: number; allowTesting?: boolean }): Promise<void> {
      if (saldo < 5) {
        throw new Error('Sem créditos suficientes para buscar novas contas.')
      }
      emAndamento = true
      notificar()

      // Debita créditos e simula chegada de novas contas
      saldo -= 5
      const nova: ContaDescoberta = {
        id: `desc-${Date.now()}`,
        state: 'nova',
        nome: 'AgroTech Soluções de Precisão',
        website: 'https://agrotechsolucoes.com.br',
        dominio: 'agrotechsolucoes.com.br',
        cnpj: '12.345.678/0001-90',
        linkedinUrl: 'https://linkedin.com/company/agrotech-solucoes',
        localizacao: 'Ribeirão Preto, SP',
        uf: 'SP',
        setor: 'Agronegócio e Tecnologia',
        tamanho: '50-100 funcionários',
        funcionarios: 60,
        descricao: 'Sensores IoT e monitoramento remoto de lavouras e frotas agrícolas.',
        tags: ['agritech', 'iot', 'sp'],
        fitLevel: 'alto',
        motivos: ['Setor: Agronegócio', 'Porte: 50-100 funcionários', 'Localização: São Paulo'],
        sinais: [{ frase: 'Captação Seed anunciada recentemente', fonte: 'noticias', data: '2026-10-01' }],
        origem: 'busca',
        motivosDeSinal: [],
        criadaEm: new Date().toISOString(),
      }
      candidatas.unshift(nova)
      emAndamento = false
      notificar()
    },

    async listarDescobertas(estado = 'nova'): Promise<ContaDescoberta[]> {
      if (!estado) return candidatas
      return candidatas.filter((c) => c.state === estado)
    },

    async aceitarDescoberta(id: string, url?: string): Promise<ResultadoDoAceite> {
      const aceita = candidatas.find((c) => c.id === id)
      if (aceita && aceita.state === 'nova') {
        if (aceita.setor) aprender('setor', aceita.setor, 1)
        if (aceita.uf) aprender('regiao', aceita.uf, 1)
      }
      const candidata = candidatas.find((c) => c.id === id)
      if (!candidata) throw new Error('Candidata não encontrada.')
      if (candidata.state === 'aceita') {
        return { targetAccountId: candidata.targetAccountId ?? id, created: false, sinaisMigrados: 0, comite: 'liberado' }
      }
      if (candidata.state === 'descartada') {
        throw new Error('Candidata já havia sido descartada.')
      }

      const siteFinal = url?.trim() || candidata.website
      if (!siteFinal) {
        throw new Error('É necessário informar o site da empresa para aceitar.')
      }

      let targetAccountId = `conta-${id}`
      if (fonteDeContas?.salvarConta) {
        const criada = await fonteDeContas.salvarConta({
          nome: candidata.nome,
          url: siteFinal,
          segmento: candidata.setor,
        })
        targetAccountId = criada.id
      }

      candidata.state = 'aceita'
      candidata.targetAccountId = targetAccountId
      candidata.decididoEm = new Date().toISOString()
      candidata.voltouPorSinalEm = undefined
      candidata.motivoDoDescarteAnterior = undefined
      notificar()
      return { targetAccountId, created: true, sinaisMigrados: candidata.motivosDeSinal.length, comite: 'liberado' }
    },

    async aprendizado(): Promise<AjusteAprendido[]> {
      return [...aprendido.entries()]
        .map(([chave, a]) => {
          const [dimensao, valor] = chave.split('|') as [DimensaoAprendida, string]
          return { dimensao, valor, ajuste: a.decisoes < 3 ? 0 : Math.max(-15, Math.min(15, a.delta)), decisoes: a.decisoes, atualizadoEm: a.em }
        })
        .filter((a) => a.ajuste !== 0)
    },

    async desfazerAprendizado(ajuste?: Pick<AjusteAprendido, 'dimensao' | 'valor'>): Promise<void> {
      if (ajuste) aprendido.delete(`${ajuste.dimensao}|${ajuste.valor}`)
      else aprendido.clear()
      notificar()
    },

    async descartarDescoberta(id: string, motivo?: string, codigo?: CodigoDoDescarte): Promise<void> {
      const candidata = candidatas.find((c) => c.id === id)
      if (!candidata) throw new Error('Candidata não encontrada.')
      if (candidata.state === 'aceita') {
        throw new Error('Não é possível descartar uma conta que já foi aceita.')
      }
      const dimensao = codigo === 'setor' ? 'setor' : codigo === 'porte' ? 'porte' : codigo === 'regiao' ? 'regiao' : undefined
      const valor = dimensao === 'setor' ? candidata.setor : dimensao === 'porte' ? candidata.tamanho : dimensao === 'regiao' ? candidata.uf : undefined
      if (dimensao && valor) aprender(dimensao, valor, -1)
      candidata.state = 'descartada'
      candidata.motivoDescarte = motivo
      candidata.decididoEm = new Date().toISOString()
      candidata.voltouPorSinalEm = undefined
      candidata.motivoDoDescarteAnterior = undefined
      notificar()
    },

    async explicarAderencia(id: string): Promise<ExplicacaoDeAderencia> {
      const candidata = candidatas.find((c) => c.id === id)
      if (!candidata) throw new Error('Descoberta não encontrada.')
      const motivos = candidata.motivos.length > 0 ? ` ${candidata.motivos.join('. ')}.` : ' Sem motivos registrados.'
      return { explicacao: `Aderência ${ROTULO_DO_NIVEL[candidata.fitLevel] ?? 'baixa'}.${motivos}`, origem: 'regra', nivel: candidata.fitLevel }
    },

    async restaurarDescoberta(id: string): Promise<void> {
      const candidata = candidatas.find((c) => c.id === id)
      if (!candidata) throw new Error('Candidata não encontrada.')
      if (candidata.state === 'aceita') {
        throw new Error('Conta já aceita não pode ser alterada.')
      }
      candidata.state = 'nova'
      candidata.motivoDescarte = undefined
      candidata.decididoEm = undefined
      notificar()
    },

    observar(ouvinte: () => void): () => void {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
  }
}
