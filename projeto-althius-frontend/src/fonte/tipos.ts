// Tipos do domínio, com o vocabulário do CONTEXT.md na raiz do repositório.

export type AgenteId = 'scopus' | 'ethos' | 'rhetor' | 'oraculum'

export type EstadoAgente = 'ocioso' | 'trabalhando' | 'detectou'

export interface Agente {
  id: AgenteId
  nome: string
  especialidade: string
  descricao: string
  entrega: string
  estado: EstadoAgente
  tarefasFeitas: number
  horasEconomizadas: number
  sugestoes: Sugestao[]
}

export interface Sugestao {
  id: string
  texto: string
}

export interface Workspace {
  cliente: string
  descricao: string
  usuario: { nome: string; cargo: string }
}

export interface Fato {
  id: string
  agenteId: AgenteId
  texto: string
  origem: string
}

export interface Habilidade {
  id: string
  agenteId: AgenteId
  nome: string
  descricao: string
  usos: number
  ultimaMelhoria: string
  ativa: boolean
}

export type Frequencia = 'diaria' | 'semanal' | 'mensal'

export interface Rotina {
  id: string
  agenteId: AgenteId
  tarefa: string
  frequencia: Frequencia
  diaDaSemana?: string
  horario: string
  canalDestino: CanalId | null
  pausada: boolean
}

export type NovaRotina = Omit<Rotina, 'id' | 'pausada'>

export type Gatilho = 'conversa' | 'mencao' | 'rotina' | 'canal'

export interface ItemDeAtividade {
  id: string
  agenteId: AgenteId
  gatilho: Gatilho
  quando: string
  descricao: string
  resultado: string
  link?: string
}

export type CanalId = 'slack' | 'whatsapp' | 'teams' | 'email'
export type IntegracaoId = 'hubspot' | 'clay' | 'apollo' | 'lusha' | 'notion' | 'meta-ads' | 'google-ads'

export interface Canal {
  id: CanalId
  nome: string
  descricao: string
  conectado: boolean
}

export type CategoriaDeIntegracao = 'CRM' | 'Enriquecimento' | 'Conhecimento' | 'Mídia paga'

export interface Integracao {
  id: IntegracaoId
  nome: string
  categoria: CategoriaDeIntegracao
  descricao: string
  conectada: boolean
  /** Ações desta Integração que escrevem ou gastam dinheiro. */
  escreve: boolean
}

/** Integração prevista, ainda sem conexão disponível. */
export interface IntegracaoFutura {
  nome: string
  categoria: CategoriaDeIntegracao
}

export type Permissao = 'ler' | 'propor' | 'executar'

export interface Personalizacao {
  instrucoes: string
  tomDeVoz: string
  baseDeConhecimento: FonteDeConhecimento[]
  canais: CanalId[]
  /** Integrações que o Agente pode usar, com a Permissão de cada uma. */
  permissoes: Partial<Record<IntegracaoId, Permissao>>
}

export interface FonteDeConhecimento {
  id: string
  tipo: 'documento' | 'url' | 'notion'
  nome: string
}

export type EstadoAprovacao = 'pendente' | 'aprovada' | 'rejeitada'

export interface Aprovacao {
  id: string
  agenteId: AgenteId
  acao: string
  integracaoId: IntegracaoId
  impacto: string
  justificativa: string
  origem: 'althius' | CanalId
  estado: EstadoAprovacao
}

export interface MensagemDeCanal {
  autor: string
  ehAgente: boolean
  texto: string
  aprovacaoId?: string
}

export interface PreviaDeCanal {
  canalId: CanalId
  titulo: string
  mensagens: MensagemDeCanal[]
}

/** Um passo da resposta de um Agente numa Conversa. */
export type PassoDaConversa =
  | { tipo: 'ferramenta'; agenteId: AgenteId; descricao: string }
  | { tipo: 'texto'; agenteId: AgenteId; texto: string }
  | { tipo: 'repasse'; de: AgenteId; para: AgenteId; resumo: string }
  | { tipo: 'aprovacao'; agenteId: AgenteId; aprovacaoId: string }

export interface Painel {
  aprovacoesPendentes: number
  rotinasDeHoje: Rotina[]
  atividadeRecente: ItemDeAtividade[]
  tarefasFeitas: number
  horasEconomizadas: number
}

/**
 * A única fronteira entre as telas e os Agentes. Hoje só existe a implementação simulada;
 * uma implementação real vai substituí-la sem mudar as telas (ADR 0003).
 */
export interface FonteDeAgentes {
  /** Avisa as telas quando algum dado muda. Devolve a função para cancelar. */
  observar(ouvinte: () => void): () => void

  workspace(): Promise<Workspace>
  painel(): Promise<Painel>

  agentes(): Promise<Agente[]>
  agente(id: AgenteId): Promise<Agente>

  memoria(id: AgenteId): Promise<Fato[]>
  editarFato(fatoId: string, texto: string): Promise<void>
  apagarFato(fatoId: string): Promise<void>

  habilidades(id: AgenteId): Promise<Habilidade[]>
  definirHabilidadeAtiva(habilidadeId: string, ativa: boolean): Promise<void>

  rotinas(id: AgenteId): Promise<Rotina[]>
  criarRotina(rotina: NovaRotina): Promise<void>
  editarRotina(rotinaId: string, rotina: NovaRotina): Promise<void>
  definirRotinaPausada(rotinaId: string, pausada: boolean): Promise<void>
  excluirRotina(rotinaId: string): Promise<void>

  atividade(id: AgenteId, gatilho?: Gatilho): Promise<ItemDeAtividade[]>

  personalizacao(id: AgenteId): Promise<Personalizacao>
  salvarPersonalizacao(id: AgenteId, personalizacao: Personalizacao): Promise<void>

  canais(): Promise<Canal[]>
  integracoes(): Promise<Integracao[]>
  integracoesFuturas(): Promise<IntegracaoFutura[]>
  conectar(conexao: CanalId | IntegracaoId): Promise<void>
  previaDeCanal(canalId: CanalId): Promise<PreviaDeCanal>

  aprovacoes(): Promise<Aprovacao[]>
  decidirAprovacao(aprovacaoId: string, decisao: 'aprovada' | 'rejeitada'): Promise<void>

  /** Envia uma mensagem ou sugestão e recebe a resposta passo a passo. */
  conversar(id: AgenteId, mensagem: { texto: string; sugestaoId?: string }): AsyncIterable<PassoDaConversa>
}
