import * as demo from './dados-demo'
import type { ArmazenamentoDemonstrativo } from './simulada-participacoes'
import type { CanalId, CategoriaDeIntegracao, Integracao, IntegracaoFutura, IntegracaoId, PreviaDeCanal } from './tipos'
import type { FerramentaDaIntegracao, FonteDeConexoes, RegraDaFerramenta } from './conexoes-tipos'

/** Ferramentas de exemplo da Demonstração: no Workspace operacional, a lista vem do servidor de cada conector. */
const FERRAMENTAS_DE_EXEMPLO: Partial<Record<IntegracaoId, FerramentaDaIntegracao[]>> = {
  hubspot: [
    { nome: 'search_companies', descricao: 'Busca empresas no CRM.', escreve: false },
    { nome: 'create_company', descricao: 'Cria uma empresa no CRM.', escreve: true },
    { nome: 'create_note', descricao: 'Cria uma nota num registro do CRM.', escreve: true },
  ],
  notion: [
    { nome: 'notion-search', descricao: 'Busca páginas e bases.', escreve: false },
    { nome: 'notion-create-pages', descricao: 'Cria páginas.', escreve: true },
  ],
  'meta-ads': [
    { nome: 'ler_relatorio', descricao: 'Lê o desempenho das campanhas.', escreve: false },
    { nome: 'criar_campanha', descricao: 'Cria uma campanha (gasta verba).', escreve: true },
  ],
}
const FERRAMENTAS_PADRAO_DE_EXEMPLO: FerramentaDaIntegracao[] = [
  { nome: 'buscar', descricao: 'Busca registros.', escreve: false },
  { nome: 'criar', descricao: 'Cria um registro.', escreve: true },
]

export interface OpcoesFonteDeConexoesSimulada {
  atrasoMs?: number
  armazenamento?: ArmazenamentoDemonstrativo | null
}

/**
 * Os conectores do catálogo ampliado (migration 20261002111000), só na tela de Conexões da Demonstração e nenhum
 * conectado: o catálogo dos Agentes e da automação (`catalogo-de-conexoes.ts`) não muda. O Zoho CRM vem "Em breve". O
 * Slack fica de fora aqui porque a Demonstração já o mostra como Canal, com a prévia das Aprovações.
 */
const CONECTORES_DA_DEMONSTRACAO: Integracao[] = [
  { id: 'bitrix24', nome: 'Bitrix24', categoria: 'CRM', descricao: 'CRM, tarefas e comunicação do Bitrix24.', escreve: true, conectada: false },
  { id: 'google-sheets', nome: 'Google Sheets', categoria: 'Conhecimento', descricao: 'Planilhas do Google Sheets.', escreve: true, conectada: false },
  { id: 'tiktok-ads', nome: 'TikTok Ads', categoria: 'Mídia paga', descricao: 'Campanhas e públicos do TikTok Ads.', escreve: true, conectada: false },
  { id: 'google-calendar', nome: 'Google Calendar', categoria: 'Agenda', descricao: 'Agenda e eventos do Google Calendar.', escreve: true, conectada: false },
  { id: 'calendly', nome: 'Calendly', categoria: 'Agenda', descricao: 'Tipos de evento e agendamentos do Calendly.', escreve: true, conectada: false },
]
const FUTURAS_DA_DEMONSTRACAO: IntegracaoFutura[] = [{ nome: 'Zoho CRM', categoria: 'CRM' }]

/**
 * A Fonte de Conexões da Demonstração: preserva o fluxo simulado de Canais, Integrações e prévias.
 */
export function criarFonteDeConexoesSimulada({
  atrasoMs = 0,
}: OpcoesFonteDeConexoesSimulada = {}): FonteDeConexoes {
  const ouvintes = new Set<() => void>()
  const estado = structuredClone({
    canais: demo.canais,
    integracoes: [...demo.integracoes, ...CONECTORES_DA_DEMONSTRACAO],
    previas: demo.previas,
  })
  const regras = new Map<IntegracaoId, Partial<Record<string, RegraDaFerramenta>>>()

  function avisar() {
    ouvintes.forEach((o) => o())
  }

  async function responder<T>(obter: () => T): Promise<T> {
    if (atrasoMs > 0) await new Promise((resolve) => setTimeout(resolve, atrasoMs))
    return obter()
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },

    canais: () =>
      responder(() =>
        estado.canais.map((c) => ({
          ...c,
          estado: c.conectado ? 'conectado' : 'nao_conectado',
        })),
      ),

    integracoes: () =>
      responder(() =>
        estado.integracoes.map((i) => ({
          ...i,
          categoria: i.categoria as CategoriaDeIntegracao,
          estado: i.conectada ? 'habilitada' : 'nao_habilitada',
          habilitada: i.conectada,
        })),
      ),

    integracoesFuturas: () => responder(() => [...(demo.integracoesFuturas as IntegracaoFutura[]), ...FUTURAS_DA_DEMONSTRACAO]),

    conectar: (conexao: CanalId | IntegracaoId) =>
      responder(() => {
        const canal = estado.canais.find((c) => c.id === conexao)
        if (canal) canal.conectado = true
        const integracao = estado.integracoes.find((i) => i.id === conexao)
        if (integracao) integracao.conectada = true
        avisar()
      }),

    habilitarIntegracao: (id: IntegracaoId) =>
      responder(() => {
        const integracao = estado.integracoes.find((i) => i.id === id)
        if (integracao) integracao.conectada = true
        avisar()
      }),

    ferramentas: (id: IntegracaoId) => responder(() => structuredClone(FERRAMENTAS_DE_EXEMPLO[id] ?? FERRAMENTAS_PADRAO_DE_EXEMPLO)),

    regrasDasFerramentas: (id: IntegracaoId) => responder(() => ({ ...(regras.get(id) ?? {}) })),

    definirRegraDaFerramenta: (id: IntegracaoId, ferramenta: string, regra: RegraDaFerramenta | null) =>
      responder(() => {
        const atuais = { ...(regras.get(id) ?? {}) }
        if (regra) atuais[ferramenta] = regra
        else delete atuais[ferramenta]
        regras.set(id, atuais)
      }),

    previaDeCanal: (canalId: CanalId): Promise<PreviaDeCanal> =>
      responder(() => {
        const previa = estado.previas.find((p) => p.canalId === canalId)
        if (!previa) throw new Error(`Sem prévia para o canal: ${canalId}`)
        return previa
      }),
  }
}
