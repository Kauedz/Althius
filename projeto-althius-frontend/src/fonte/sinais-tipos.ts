import type { PerfilFirmografico } from '@/paginas/sinais/perfil'
import type { FonteObservavel } from './tipos'
import type { PedidoDePlano, PlanoDoSinal, PlanoMontado, PlanoParaSalvar } from './plano-do-sinal'
import type { AchadoDaRodada, HistoricoDeRodadas, PreviaDaRodada } from './rodadas-do-sinal'
import type { AgendaDoSinal } from './agenda-do-sinal'
import type { EstimativaDoSinal } from './preco-por-rodada'

export type Origem = 'externo' | 'interno' | 'originado'

export type EstadoDoMonitoramento = 'rascunho' | 'em-preparacao' | 'ativo' | 'pausado'

export type ModoDePublico = 'listas' | 'descoberta' | 'ambos'

export interface Publico {
  modo: ModoDePublico
  listas: string[]
  /** Na descoberta, usa o público recomendado das configurações do Cliente; senão, o perfil personalizado. */
  usaRecomendado: boolean
  perfil?: PerfilFirmografico
  /**
   * Só no Workspace operacional, em Abertura de vagas: 'mercado' procura empresas do mercado endereçável que estão
   * contratando, sem Conta-alvo. Ausente é 'contas', o de sempre.
   */
  escopo?: EscopoDoPublico
}

export type EscopoDoPublico = 'contas' | 'mercado'

export type Criterios = Record<string, any>

export interface Monitoramento {
  id: string
  tipoId: string
  nome: string
  estado: EstadoDoMonitoramento
  publico: Publico
  criterios: Criterios
  /** Só nos personalizados: o pedido em linguagem livre, a fonte indicada e os critérios preparados. */
  descricao?: string
  fonte?: string
  origem?: Origem
  criteriosLivres?: string[]
  /** Por que a última rodada não varreu tudo, em palavras do produto (só o Workspace operacional informa). */
  ultimaFalha?: string
  /** A última avaliação gravada no banco (só o Workspace operacional informa). */
  ultimaRodada?: RodadaDoMonitoramento
  /** O Briefing e o Plano de onde o Monitoramento veio, quando nasceu de um Plano (agente-de-sinal 01). */
  briefing?: string
  plano?: PlanoDoSinal
  /** Quantas vezes o Plano foi gravado. */
  versaoDoPlano?: number
  /** A Agenda do Sinal (agente-de-sinal 03). Ausente é o Monitoramento de antes, que roda a cada 24 horas. */
  agenda?: AgendaDoSinal
  /** O limite de créditos por dia (agente-de-sinal 04). Ausente é o Sinal sem limite próprio. */
  limitePorDia?: number
  /** Quando foi o sistema que pausou o Sinal: `sem_creditos` depois de 3 Rodadas seguidas puladas. Ausente na pausa da pessoa. */
  pausadoPor?: 'sem_creditos'
  /** Quantas Rodadas seguidas foram puladas por falta de créditos (agente-de-sinal 05). Ausente ou 0: nenhuma. Uma Rodada que verifica zera. */
  rodadasPuladas?: number
}

/** Uma avaliação de um Monitoramento: quando terminou, quantas Contas olhou e o que encontrou. */
export interface RodadaDoMonitoramento {
  estado: 'rodando' | 'concluida' | 'falhou'
  data: string
  contasAvaliadas: number
  sinaisNovos: number
  sinaisReencontrados: number
}

export interface NovoMonitoramento {
  id?: string
  tipoId: string
  nome: string
  estado?: EstadoDoMonitoramento
  publico?: Publico
  criterios?: Criterios
  descricao?: string
  fonte?: string
  origem?: Origem
  criteriosLivres?: string[]
}

export type Formulario =
  | 'vagas'
  | 'pessoas'
  | 'capital'
  | 'expansao'
  | 'tecnologia'
  | 'noticias'
  | 'eventos'
  | 'anuncios'
  | 'reputacao'
  | 'avaliacoes'
  | 'comunidade'
  | 'site'
  | 'historico'
  | 'verificacao'
  | 'seguranca'

export interface Familia {
  id: string
  nome: string
  origem: Origem
  formulario: Formulario
  /** A família aceita descobrir empresas novas por perfil, além de acompanhar listas. */
  descoberta: boolean
}

/** Se o tipo já roda de verdade: disponível (o actor passou no teste), em teste ou em breve. Só o Workspace operacional informa. */
export type Disponibilidade = 'disponivel' | 'em-teste' | 'em-breve'

export interface TipoDeSinal {
  id: string
  nome: string
  descricao: string
  familiaId: string
  formulario?: Formulario
  padroes?: Criterios
  disponibilidade?: Disponibilidade
}

export interface SinalEncontrado {
  id: string
  contaId: string
  acontecimentoId?: string
  tipoId: string
  monitoramentoId: string
  frase: string
  data: string
  fonte: string
  evidencia: string
  reencontrado?: { data: string; monitoramentoId: string }
}

export interface ParametrosSimulacaoDisparo {
  id?: string
  monitoramentoId: string
  contaId?: string
  acontecimentoId?: string
  frase?: string
  evidencia?: string
  fonte?: string
  data?: string | Date
}

/** Como a tela diz o estado de um Sinal por mercado: o que roda, o que ainda está em validação e o que não tem fonte. */
export type EstadoDaCascata = 'disponivel' | 'em-teste' | 'sem-fonte'

/**
 * Um Sinal do Mapa de Mercado, como o cartão do catálogo o mostra: só o que o usuário lê. Sem teto, passos nem
 * fornecedor. O `motivo` só existe quando o Sinal está sem fonte.
 */
export interface CascataDoCatalogo {
  /** O `signal_type` do Mapa (por exemplo `vaga_comex`). */
  tipo: string
  /** A letra do ICP do Mapa, de A a H. */
  icp: string
  nome: string
  estado: EstadoDaCascata
  /** `mercado`: mostra movimento do mercado, não de uma Conta do usuário. */
  escopo: 'conta' | 'mercado'
  motivo?: string
}

/**
 * Um Sinal de mercado como a tela o mostra: a frase e a data, do ICP do Workspace. Sem fonte, evidência, chave nem
 * payload — nada disso sai da leitura.
 */
export interface SinalDeMercado {
  id: string
  tipo: string
  nome: string
  frase: string
  data: string
  /** Quando o Sinal tem empresa (CNPJ): a Conta do Workspace ou a candidata da Caixa de Descobertas. */
  empresa?: { tipo: 'conta' | 'candidata'; id: string }
}

/** Um Sinal de uma empresa que ainda não é Conta: está na candidata da Caixa de Descobertas, esperando decisão. */
export interface SinalDeCandidata {
  id: string
  candidataId: string
  /** O nome da empresa. */
  empresa: string
  tipoId: string
  frase: string
  data: string
  fonte: string
}

/**
 * A fronteira de dados do módulo Sinais e Monitoramentos.
 * Operações assíncronas com observador de mudanças (ADR 0003 e ADR 0007).
 */
export interface FonteDeSinais extends FonteObservavel {
  /** Leitura do ICP estruturado vigente do Workspace, isolada por Participação ativa. */
  icpDoWorkspace?(): Promise<IcpDoWorkspace | null>
  /** Ids do catálogo global que correspondem ao ICP estruturado vigente. */
  catalogoParaIcp?(): Promise<string[]>
  /** A data de referência de "hoje" adotada pela fonte. */
  hoje(): Date

  /** Lista todos os tipos do catálogo de sinais. */
  tipos(): Promise<TipoDeSinal[]>

  /** Os Sinais por mercado do Mapa (um cartão cada). A Demonstração não tem; uma leitura que falha rejeita. */
  cascatas(): Promise<CascataDoCatalogo[]>

  /**
   * O feed de Sinais de mercado do ICP (letra A–H) neste Workspace. A Demonstração não tem. A leitura que falha rejeita
   * com texto neutro.
   */
  sinaisDeMercado(icp: string): Promise<SinalDeMercado[]>

  /**
   * Os Sinais das candidatas novas da Caixa de Descobertas (empresas que ainda não são Conta). A Demonstração não tem;
   * quem não implementa não tem candidatas.
   */
  sinaisDeCandidatas?(): Promise<SinalDeCandidata[]>

  /** Busca um tipo de sinal pelo id. Rejeita se não existir. */
  tipo(id: string): Promise<TipoDeSinal>

  /** Lista todos os Monitoramentos. */
  monitoramentos(): Promise<Monitoramento[]>

  /** Lista os Monitoramentos de um tipo específico. */
  monitoramentosDoTipo(tipoId: string): Promise<Monitoramento[]>

  /** Busca um Monitoramento pelo id. Rejeita se não existir. */
  monitoramento(id: string): Promise<Monitoramento>

  /** Salva ou atualiza um Monitoramento (cria se novo, atualiza se existente). */
  salvarMonitoramento(monitoramento: Monitoramento | NovoMonitoramento): Promise<Monitoramento>

  /** Altera o estado de um Monitoramento ('rascunho' | 'em-preparacao' | 'ativo' | 'pausado'). */
  mudarEstado(id: string, estado: EstadoDoMonitoramento): Promise<Monitoramento>

  /** Exclui um Monitoramento. */
  excluirMonitoramento(id: string): Promise<void>

  /** Lista os sinais encontrados da demonstração. */
  sinaisEncontrados(): Promise<SinalEncontrado[]>

  /** Simula um disparo para um Monitoramento Ativo (Ticket 04). */
  simularDisparo(parametros: ParametrosSimulacaoDisparo): Promise<SinalEncontrado>

  /** Pedidos de Sinal feitos à equipe Althius neste Workspace, do mais novo ao mais antigo. */
  pedidosDeSinal(): Promise<PedidoDeSinal[]>

  /** Grava um pedido. Não cobra. O aviso à equipe sai em seguida, quando há provedor. */
  pedirSinal(pedido: NovoPedidoDeSinal): Promise<PedidoDeSinal>

  /**
   * Cards de Sinal construídos para este Workspace (workspace_id preenchido). O catálogo global é o da tela.
   * Sem a migração, ou se a leitura falhar, devolve lista vazia.
   */
  catalogoDoWorkspace(): Promise<CardSobPedido[]>

  /**
   * O estado de cada coletor (`signal_type` do banco): 'available', 'testing' ou 'out'. É o que decide quais cards o
   * cliente vê (catalogo-so-funcionais). A Demonstração dá todos por disponíveis. Rejeita quando nada pôde ser lido;
   * quem não implementa não informa, e o catálogo aparece inteiro.
   */
  estadosDosColetores?(): Promise<ReadonlyMap<string, string>>

  /** Se quem está logado é da equipe Althius e vê também os Sinais internos. Qualquer erro vale `false`. */
  souDaEquipeAlthius?(): Promise<boolean>

  /**
   * Monta o Plano do Sinal a partir do Briefing e das Contas escolhidas, sem gravar nada e sem cobrar crédito
   * (agente-de-sinal 01). Rejeita com `ErroDoPlano`. Quem não implementa não oferece "Descrever um Sinal".
   */
  montarPlano?(pedido: PedidoDePlano): Promise<PlanoMontado>

  /** Grava o Plano revisado como rascunho do Monitoramento (cria ou atualiza). Nunca ativa. */
  salvarPlano?(plano: PlanoParaSalvar): Promise<Monitoramento>

  /**
   * A prévia do "Rodar agora" de um Monitoramento (agente-de-sinal 02): as Contas, o preço em créditos, o saldo e o bloqueio.
   * Só créditos; nunca US$ nem Teto. Quem não implementa não oferece o botão.
   */
  previaDaRodada?(monitoramentoId: string): Promise<PreviaDaRodada>

  /**
   * Pede a Rodada agora. Cobra créditos e não consome o Teto de automação. Rejeita com `ErroDaRodada` quando há bloqueio
   * (por exemplo, já há uma Rodada na fila).
   */
  rodarAgora?(monitoramentoId: string): Promise<void>

  /** As Rodadas mais recentes do Monitoramento e os pedidos ainda abertos. */
  rodadas?(monitoramentoId: string): Promise<HistoricoDeRodadas>

  /** Os Sinais que uma Rodada achou, com a Conta e o "por que apareceu". */
  achadosDaRodada?(rodadaId: string): Promise<AchadoDaRodada[]>

  /**
   * Grava a Agenda do Sinal (agente-de-sinal 03). O servidor confere os limites e rejeita com `ErroDaAgenda`. Quem não
   * implementa não oferece a Agenda.
   */
  salvarAgenda?(monitoramentoId: string, agenda: AgendaDoSinal): Promise<Monitoramento>

  /**
   * Os próximos `n` horários da Agenda (ISO), a partir de agora, no mesmo cálculo que o relógio usa. `contas`: as Contas no
   * escopo. Rejeita com `ErroDaAgenda` quando a Agenda não vale.
   */
  proximasRodadas?(agenda: AgendaDoSinal, contas: number, n: number): Promise<string[]>

  /**
   * A estimativa em créditos antes de ativar (agente-de-sinal 04): por Rodada, por dia e por mês, quantos dias o saldo aguenta e o
   * que ainda bloqueia a ativação. `agenda`: a que a tela propõe e ainda não gravou; ausente, a gravada. Só créditos: nunca US$,
   * custo de fornecedor nem valor de Teto. Rejeita com `ErroDaAgenda` quando a Agenda proposta não vale. Quem não implementa não
   * mostra a estimativa nem a confirmação de ativação.
   */
  estimarAgenda?(monitoramentoId: string, agenda?: AgendaDoSinal): Promise<EstimativaDoSinal>

  /**
   * Grava o limite de créditos por dia do Sinal, de 1 ao máximo de um dia da Agenda gravada (só se baixa). Rejeita com
   * `ErroDoLimite`.
   */
  salvarLimitePorDia?(monitoramentoId: string, limite: number): Promise<Monitoramento>

  /**
   * O limite mensal da automação sugerido ao ativar (agente-de-sinal 05): o custo estimado do mês mais 20%, em créditos inteiros,
   * até os créditos da faixa. `agenda`: a que a tela propõe e ainda não gravou. Só o número sugerido: nunca o limite que o
   * Workspace tem hoje nem US$. Quem não implementa não oferece liberar a automação ao ativar.
   */
  limiteMensalSugerido?(monitoramentoId: string, agenda?: AgendaDoSinal): Promise<number>

  /**
   * Libera a automação da varredura de Sinais com o limite mensal escolhido (só o Administrador). Nunca baixa um limite que já
   * existe. Rejeita com `ErroDaAutomacao`.
   */
  liberarAutomacao?(monitoramentoId: string, limiteMensal: number): Promise<void>
}

export interface IcpDoWorkspace {
  sector: string
  companySize: string
  geography: string
  targetRoles: unknown[]
  freeText: string
  oQueVende: string
  miniIcp: string
  porQueCompram: string
}

export type UrgenciaDoPedido = 'esta_semana' | 'este_mes' | 'sem_pressa'

export type StatusDoPedido = 'novo' | 'em_analise' | 'em_construcao' | 'disponivel' | 'recusado'

export interface ContatoDoPedido {
  nome: string
  email: string
  whatsapp?: string
}

export interface PedidoDeSinal {
  id: string
  evento: string
  empresasOuNicho: string
  fontesConhecidas?: string
  urgencia: UrgenciaDoPedido
  contato: ContatoDoPedido
  status: StatusDoPedido
  criadoEm: string
}

export interface NovoPedidoDeSinal {
  evento: string
  empresasOuNicho: string
  fontesConhecidas?: string
  urgencia: UrgenciaDoPedido
  contato: ContatoDoPedido
}

/** Card visível só no Workspace que pediu. O catálogo global não passa por aqui. */
export interface CardSobPedido {
  id: string
  nome: string
  frase: string
  familiaId: string
  fonte: string
  custoRotulo: string
  /** O preço fixo em créditos por Conta varrida (`signal_catalog.credits_per_account`). */
  creditosPorConta?: number
  nichos: string[]
  coletores: string[]
}

