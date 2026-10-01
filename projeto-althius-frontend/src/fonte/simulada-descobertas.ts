import type { FonteDeContas } from './tipos'
import type {
  ContaDescoberta,
  CotacaoDaDescoberta,
  FonteDeDescobertas,
} from './descobertas-tipos'

const CANDIDATAS_INICIAIS: ContaDescoberta[] = [
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
]

export function criarFonteDeDescobertasSimulada({
  fonteDeContas,
  candidatasIniciais = CANDIDATAS_INICIAIS,
  saldoInicial = 100,
}: {
  armazenamento?: Storage
  fonteDeContas?: FonteDeContas
  candidatasIniciais?: ContaDescoberta[]
  saldoInicial?: number
} = {}): FonteDeDescobertas {
  let candidatas = candidatasIniciais.map((c) => ({ ...c }))
  let saldo = saldoInicial
  let emAndamento = false
  const ouvintes = new Set<() => void>()

  const notificar = () => ouvintes.forEach((o) => o())

  return {
    async cotarBusca(_maxResults = 50): Promise<CotacaoDaDescoberta> {
      return {
        creditos: 5,
        saldoDisponivel: saldo,
        emAndamento,
        estadoDoActor: 'available',
        podeTestar: true,
      }
    },

    async buscarContas(_args = {}): Promise<void> {
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

    async aceitarDescoberta(id: string, url?: string): Promise<{ targetAccountId: string; created: boolean }> {
      const candidata = candidatas.find((c) => c.id === id)
      if (!candidata) throw new Error('Candidata não encontrada.')
      if (candidata.state === 'aceita') {
        return { targetAccountId: candidata.targetAccountId ?? id, created: false }
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
      notificar()
      return { targetAccountId, created: true }
    },

    async descartarDescoberta(id: string, motivo?: string): Promise<void> {
      const candidata = candidatas.find((c) => c.id === id)
      if (!candidata) throw new Error('Candidata não encontrada.')
      if (candidata.state === 'aceita') {
        throw new Error('Não é possível descartar uma conta que já foi aceita.')
      }
      candidata.state = 'descartada'
      candidata.motivoDescarte = motivo
      candidata.decididoEm = new Date().toISOString()
      notificar()
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
