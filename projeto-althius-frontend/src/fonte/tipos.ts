// Tipos do domínio, com o vocabulário do CONTEXT.md na raiz do repositório.

/** As 4 Especialidades do catálogo fixo da Althius (ADR 0005). */
export type EspecialidadeId = 'scopus' | 'ethos' | 'rhetor' | 'oraculum'

export interface Especialidade {
  id: EspecialidadeId
  /** O nome da Especialidade, que é também o nome do seu Agente padrão (ex.: "Scopus"). */
  nome: string
  /** Rótulo curto do que ela é (ex.: "Especialista em ICP"). */
  rotulo: string
  descricao: string
  entrega: string
  /** Ferramentas próprias da Especialidade, sem Integração (ex.: busca nos LLMs do Oraculum). */
  ferramentasNativas: string[]
  /** Sugestões clicáveis da Conversa, que disparam os roteiros da Especialidade. */
  sugestoes: Sugestao[]
  /** Integrações que o Agente padrão usa de saída; os Agentes criados herdam as dele. */
  integracoesPadrao: IntegracaoId[]
}

/** Identificador aberto: além dos Agentes padrão, o Cliente cria os seus. */
export type AgenteId = string

/** O que o Cliente escolhe ao criar um Agente: o nome é sempre "Especialidade · complemento". */
export interface NovoAgente {
  especialidadeId: EspecialidadeId
  complemento: string
  /** Instruções do Agente criado; vazias, ele fica com as do Agente padrão. */
  instrucoes: string
}

/** Agente padrão (um por Especialidade, não pode ser excluído) ou Agente criado pelo Cliente. */
export type TipoDeAgente = 'padrao' | 'criado'

export type EstadoAgente = 'ocioso' | 'trabalhando' | 'detectou'

export interface Agente {
  id: AgenteId
  nome: string
  tipo: TipoDeAgente
  especialidade: Especialidade
  estado: EstadoAgente
  /** Quantas vezes o Agente já trabalhou, contado exato. */
  execucoes: number
  /** A descrição da Especialidade no Agente padrão; as instruções no Agente criado. */
  descricao: string
  /** A Rotina que faz o Agente rodar sozinho; sem ela, ele roda sob demanda. */
  rotinaAtiva: Rotina | null
  /** As Integrações que o Agente pode usar, pela sua Permissão. */
  integracoes: IntegracaoId[]
}

/** Uma mensagem enviada a um Agente ou à Coordenação: texto livre ou uma sugestão clicável. */
export interface Mensagem {
  texto: string
  sugestaoId?: string
}

export interface Sugestao {
  id: string
  texto: string
}

export interface Workspace {
  cliente: string
  descricao: string
  usuario: { nome: string; cargo: string }
  aprovacoesPendentes: number
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

export type Gatilho = 'conversa' | 'mencao' | 'coordenacao' | 'rotina' | 'canal'

export interface ItemDeAtividade {
  id: string
  agenteId: AgenteId
  gatilho: Gatilho
  quando: string
  descricao: string
  resultado: string
  /** Onde ver o resultado dentro da Althius. */
  link?: { rotulo: string; para: string }
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
export type Decisao = Exclude<EstadoAprovacao, 'pendente'>
/** Onde uma Aprovação foi pedida ou decidida. */
export type Origem = 'althius' | CanalId

/** Uma ação que um Agente quer fazer numa Integração; a Permissão dele decide o que acontece. */
export interface AcaoProposta {
  acao: string
  integracaoId: IntegracaoId
  impacto: string
  justificativa: string
}

export interface Aprovacao extends AcaoProposta {
  id: string
  agenteId: AgenteId
  origem: Origem
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

/**
 * Um passo de uma Conversa coordenada (ADR 0004). Cada Agente chamado é uma etapa: começa na chamada,
 * faz as suas consultas e termina com o que fez. No fim vem a resposta consolidada (ou a direta,
 * sem etapas) e, quando um Agente quer agir, o que a Permissão dele permitiu.
 */
export type PassoDaCoordenacao =
  | { tipo: 'chamada'; agenteId: AgenteId }
  | { tipo: 'ferramenta'; agenteId: AgenteId; descricao: string }
  | { tipo: 'feito'; agenteId: AgenteId; resumo: string }
  | { tipo: 'resposta'; texto: string }
  | { tipo: 'aprovacao'; agenteId: AgenteId; aprovacaoId: string }
  /** Sem Aprovação: com Executar, o Agente agiu sozinho; com Ler, não pôde agir. */
  | { tipo: 'acao'; agenteId: AgenteId; acao: AcaoProposta; executada: boolean }

/**
 * A única fronteira entre as telas e os Agentes. Hoje só existe a implementação simulada;
 * uma implementação real vai substituí-la sem mudar as telas (ADR 0003).
 */
export interface FonteDeAgentes {
  /** Avisa as telas quando algum dado muda. Devolve a função para cancelar. */
  observar(ouvinte: () => void): () => void

  workspace(): Promise<Workspace>

  /** O catálogo fixo: não há operação para criar uma Especialidade. */
  especialidades(): Promise<Especialidade[]>

  agentes(): Promise<Agente[]>
  agente(id: AgenteId): Promise<Agente>
  /**
   * Cria um Agente a partir de uma Especialidade (ADR 0005), com uma cópia da Personalização, das
   * Permissões e das Habilidades do Agente padrão, Memória vazia e sem Rotinas.
   */
  criarAgente(novo: NovoAgente): Promise<Agente>
  /** Exclui um Agente criado e tudo que é dele. O Agente padrão não pode ser excluído. */
  excluirAgente(id: AgenteId): Promise<void>

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
  decidirAprovacao(aprovacaoId: string, decisao: Decisao, onde: Origem): Promise<void>

  /** Envia uma mensagem ou sugestão e recebe a resposta passo a passo. */
  conversar(id: AgenteId, mensagem: Mensagem): AsyncIterable<PassoDaConversa>

  /** As sugestões clicáveis de pedidos coordenados, abaixo do composer. */
  sugestoesCoordenadas(): Promise<Sugestao[]>
  /**
   * Envia um pedido no composer, sem escolher um Agente, e recebe passo a passo as etapas de cada
   * Agente que a Coordenação chamou e a resposta consolidada. Com os pedidos anteriores do mesmo
   * fio (nenhum, num fio novo), a Coordenação continua a partir do que já foi feito, em vez de recomeçar.
   */
  conversarCoordenado(pedido: Mensagem, fio: Mensagem[]): AsyncIterable<PassoDaCoordenacao>
}
