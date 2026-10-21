// Os tipos da cascata de Sinais (sinais em cascata, fatia 2). Um Sinal é uma cascata de 1..N passos: cada passo é um
// actor do Apify, uma fonte pública aberta ou uma regra interna, e a saída normalizada de um é a entrada do próximo.
// Nada aqui fala com a rede nem com o banco: as pontas entram por `DbDaCascata` e `ClienteDaFonte`.

/** Um item que passa de um passo para o seguinte (vaga, empresa, Sinal confirmado...), já normalizado. */
export type Item = Record<string, unknown>

/** Uma Conta-alvo do Workspace, como a cascata a vê para casar o resultado. */
export interface ContaDoWorkspace {
  id: string
  name: string
  domain: string | null
  linkedinUrl: string | null
  /** O CNPJ da Conta, quando o Workspace o tem; o passo da Receita só consulta quem o tem. */
  cnpj?: string | null
}

export type EstadoDaCascata = 'testing' | 'available' | 'sem_fonte' | 'disabled'
export type Origem = 'conversa' | 'monitor' | 'rotina'
export type TipoDePasso = 'actor' | 'fonte_publica' | 'regra'

/** O que roda quando o actor principal de um passo falha: outro actor, ou uma fonte pública. */
export interface AlternativaDoPasso {
  kind: 'actor' | 'fonte_publica'
  actorId?: string
  source?: string
  priceModel?: string
  estFixedUsd?: number
  estPerItemUsd?: number
}

export interface PassoDef {
  ordem: number
  kind: TipoDePasso
  /** Quem implementa o passo (a chave do registro de passos do servidor). */
  handler: string
  actorId: string | null
  fallbacks: AlternativaDoPasso[]
  inputTemplate: Record<string, unknown>
  priceModel: string
  estFixedUsd: number
  estPerItemUsd: number
  estItems: number
  maxItems: number | null
}

export interface CascataDef {
  id: string
  signalType: string
  icp: string
  name: string
  version: number
  state: EstadoDaCascata
  semFonteMotivo: string | null
  scope: 'conta' | 'mercado'
  multiplier: number
  capUsd: number
  capCredits: number | null
  cadenceHours: number
  maxAccounts: number
  steps: PassoDef[]
}

export interface PedidoDeCascata {
  workspaceId: string
  /** Quem pediu e ainda participa do Workspace; nulo no automático. */
  userId: string | null
  signalType: string
  origem: Origem
  monitorId?: string | null
  /** A chave da execução: repetir o pedido com ela não cobra nem grava de novo. */
  chave: string
  /** As Contas para casar; sem elas, a cascata lê as do Workspace (todas ou as de `idsDeContas`). */
  contas?: ContaDoWorkspace[]
  idsDeContas?: string[]
  criterios?: Record<string, unknown>
  /** O teto de créditos que quem pede aceita pagar nesta execução. */
  tetoCreditos?: number
  /** Deixa rodar uma cascata ainda em teste (só a equipe, na validação). */
  permitirTeste?: boolean
  /** Hora limite (ms) para a execução inteira terminar; passos novos não começam perto dela. */
  prazoFinal?: number
  /**
   * O tipo genérico do catálogo em que o Sinal de Conta é gravado: o Monitoramento de um tipo genérico (novo escritório,
   * expansão geográfica...) roda as cascatas que o atendem, e o Sinal fica no tipo do Monitoramento. A execução, a reserva de
   * crédito e o rastro continuam sendo da cascata. O Sinal de mercado nunca troca de tipo: não tem Conta.
   */
  registrarComo?: string
  /**
   * Descoberta no mercado endereçável (Monitoramento de Abertura de vagas no modo mercado): a cascata procura empresas pelos
   * termos, sem Conta-alvo. As Contas do Workspace só servem para casar; sem nenhuma, a execução roda mesmo assim, e as
   * empresas que não são Conta viram candidatas da Caixa de Descobertas.
   */
  descoberta?: boolean
}

/** Um Sinal confirmado pela cascata, pronto para o `record_signal`. */
export type SinalConfirmado = {
  contaId: string
  contaNome: string
  eventKey: string
  phrase: string
  firedAt: string
  source: string
  evidence: string
}

/**
 * Um Sinal de uma empresa que não é Conta do Workspace (uma vaga, uma filial, um financiamento). Vai para o banco, que a
 * procura nas Contas por CNPJ e domínio e, se não é Conta, guarda o Sinal na candidata da Caixa de Descobertas
 * (`record_signal_for_company`). Só dado da empresa: nunca nome de pessoa.
 */
export type SinalDeEmpresa = {
  empresa: {
    nome: string
    cnpj?: string
    site?: string
    linkedinUrl?: string
    uf?: string
    municipio?: string
    /** A descoberta não achou o site nem depois do enriquecimento: o banco cria a candidata pela página do LinkedIn, com a etiqueta "sem site". */
    semSite?: boolean
  }
  eventKey: string
  phrase: string
  firedAt: string
  source: string
  evidence: string
}

/** Um Sinal que acontece no mercado todo (Comex Stat, DOU, Plano Safra): sem Conta. */
export type SinalDeMercado = {
  eventKey: string
  phrase: string
  firedAt: string
  source: string
  evidence: string
  /** Os números do acontecimento, para a tela e o Hermes. */
  payload: Record<string, unknown>
}

export type Desfecho =
  | 'concluida'
  | 'parcial'
  | 'abortada'
  | 'falhou'
  | 'sem_fonte'
  | 'em_teste'
  | 'indisponivel'
  | 'sem_cascata'
  | 'sem_contas'
  | 'sem_creditos'
  | 'limite_diario'
  | 'ja_rodou_hoje'
  | 'automatico_parado'
  | 'em_andamento'
  | 'ja_concluida'
  | 'adiado'

export interface PassoExecutado {
  ordem: number
  handler: string
  estado: 'succeeded' | 'empty' | 'failed' | 'skipped' | 'aborted_cap'
  itensEntrada: number
  itensSaida: number
}

export interface ResultadoDaCascata {
  desfecho: Desfecho
  /** Em palavras do produto: pode ir ao usuário, ao Hermes e a `last_error`. Nunca cita fornecedor nem actor. */
  mensagem: string
  creditosCobrados: number
  /** O custo real da fonte, em dólar: interno. */
  custoUsd: number | null
  sinais: SinalConfirmado[]
  novos: number
  repetidos: number
  /** Empresas que a cascata achou e que não são Conta do Workspace. */
  semConta: number
  /** Os nomes (até 10) das empresas que não são Conta, para o Hermes dizer; vazio quando não há. */
  semContaNomes: string[]
  /** Candidatas novas da Caixa de Descobertas que a execução criou ou reabriu (as empresas que não são Conta). */
  candidatas?: number
  /** Os Sinais de mercado (cascatas de escopo `mercado`): vão para o feed do Workspace, não para uma Conta. */
  mercado: SinalDeMercado[]
  passos: PassoExecutado[]
}

// ---------------------------------------------------------------------------------------------------------------------
// As pontas.

export interface AbrirExecucao {
  workspaceId: string
  userId: string | null
  signalType: string
  origem: Origem
  monitorId: string | null
  chave: string
  estimativaUsd: number
  tetoCreditos: number | null
  permitirTeste: boolean
  /** Quantas Contas a execução varre (Sinal de Conta). O preço é fixo por Conta; o Sinal de Mercado não tem Conta. */
  contas?: number
}

export type ResultadoDaAbertura = {
  outcome:
    | 'go'
    | 'em_andamento'
    | 'done'
    | 'sem_fonte'
    | 'em_teste'
    | 'indisponivel'
    | 'sem_cascata'
    | 'no_credits'
    | 'limite_diario'
    | 'ja_rodou_hoje'
    | 'confirmar'
    | 'sem_teto'
    | 'teto_atingido'
    | 'contrato_inativo'
  runId: string | null
  estCredits: number
  capUsd: number
}

export interface DbDaCascata {
  definicao(signalType: string): Promise<CascataDef | null>
  /** Preço do crédito e teto do dia (internos). */
  configuracao(): Promise<{ usdPorCredito: number; limiteDiario: number }>
  contas(workspaceId: string, ids: string[] | null, limite: number): Promise<ContaDoWorkspace[]>
  abrir(args: AbrirExecucao): Promise<ResultadoDaAbertura>
  /**
   * O Workspace não tem Teto de Sinais (créditos ilimitados). Opcional: sem isto, o motor honra o teto da execução.
   * Quando verdadeiro, a execução não aborta no teto, e cada chamada ao fornecedor continua limitada ao `capUsd` do tipo.
   */
  semTetoDeSinais?(workspaceId: string): Promise<boolean>
  fechar(args: {
    runId: string
    estado: 'succeeded' | 'partial' | 'aborted' | 'failed' | 'adiado'
    custoUsd: number | null
    casados: number
    novos: number
    repetidos: number
    erroAmigavel: string | null
  }): Promise<{ creditosCobrados: number }>
  /** Na validação da equipe: até 5 CNPJs e razões sociais achados que não são Conta. Sem dado de pessoa. */
  gravarAmostraValidacao(args: { runId: string; amostra: { cnpj: string | null; nome: string }[] }): Promise<void>
  abrirPasso(args: {
    runId: string
    ordem: number
    tentativa: number
    handler: string
    kind: TipoDePasso
    actorId: string | null
    itensEntrada: number
  }): Promise<string>
  fecharPasso(args: {
    passoId: string
    estado: 'succeeded' | 'empty' | 'failed' | 'skipped' | 'aborted_cap'
    apifyRunId: string | null
    build: string | null
    tokenIndex: number | null
    itensSaida: number
    custoUsd: number | null
    statusHttp: number | null
    erroReal: string | null
  }): Promise<void>
  gravarSinal(args: {
    workspaceId: string
    contaId: string
    monitorId: string | null
    signalType: string
    sinal: SinalConfirmado
  }): Promise<boolean>
  /** O Sinal de mercado vai para o feed do Workspace (`record_market_signal`); com CNPJ, o banco o leva também à Conta ou à candidata. */
  gravarSinalDeMercado(args: { workspaceId: string; signalType: string; sinal: SinalDeMercado; peso?: number }): Promise<boolean>
  /**
   * O Sinal de uma empresa que o passo de casamento não achou entre as Contas (`record_signal_for_company`): o banco decide se
   * é Conta (CNPJ, depois domínio) ou candidata. Devolve onde foi parar e se o Sinal é novo.
   */
  gravarSinalDeEmpresa(args: {
    workspaceId: string
    monitorId: string | null
    signalType: string
    sinal: SinalDeEmpresa
    peso: number
  }): Promise<{ resolvido: string; novo: boolean }>
  /** A fotografia mais recente de cada assunto (antes de `antesDe`, quando informado). */
  lerSnapshots(args: { workspaceId: string; signalType: string; chaves: string[]; antesDe?: string }): Promise<Map<string, { takenAt: string; data: Record<string, unknown> }>>
  gravarSnapshots(args: { workspaceId: string; signalType: string; itens: { chave: string; data: Record<string, unknown>; takenAt?: string }[] }): Promise<void>
  /** A cópia mensal de uma fonte pública. `mes` nulo pede a mais recente ainda válida. */
  lerCache(args: { fonte: string; chave: string; mes: string | null }): Promise<unknown | null>
  gravarCache(args: { fonte: string; chave: string; mes: string; payload: unknown }): Promise<void>
}

/** Cópia de fonte pública à disposição do passo. Erro de cache não falha a execução: quem monta o contexto engole. */
export interface CacheDeFonte {
  ler(fonte: string, chave: string, mes: string | null): Promise<unknown | null>
  gravar(fonte: string, chave: string, mes: string, payload: unknown): Promise<void>
}

export type TipoDeErroDaFonte =
  | 'sem_credito'
  | 'sem_credito_em_todas'
  | 'timeout'
  | 'http'
  | 'rede'
  | 'run_falhou'
  | 'nao_e_lista'
  | 'entrada_invalida'

/**
 * A falha de uma fonte. `message` está em palavras do produto (pode ir ao usuário); `erroReal` é o que a fonte disse,
 * truncado e sem segredo, e só vai para a coluna técnica do passo.
 */
export class ErroDaFonte extends Error {
  constructor(
    readonly tipo: TipoDeErroDaFonte,
    mensagem: string,
    readonly detalhe: {
      statusHttp?: number | null
      apifyRunId?: string | null
      tokenIndex?: number | null
      erroReal?: string
      build?: string | null
      custoUsd?: number | null
    } = {},
  ) {
    super(mensagem)
    this.name = 'ErroDaFonte'
  }
}

export interface ExecucaoDaFonte {
  apifyRunId: string
  build: string | null
  tokenIndex: number
  items: unknown[]
  /** O custo real que a plataforma informou; nulo quando não foi possível ler. */
  custoUsd: number | null
}

export interface ClienteDaFonte {
  /** Roda o actor e espera os itens. Lança `ErroDaFonte`. */
  rodar(args: {
    actorId: string
    input: unknown
    maxItems: number
    maxTotalChargeUsd: number
    timeoutSegundos: number
  }): Promise<ExecucaoDaFonte>
}

/** As fotografias do assunto desta cascata (CNPJ ou Conta) para comparar com a rodada anterior. */
export interface Snapshots {
  ler(chaves: string[], antesDe?: string): Promise<Map<string, { takenAt: string; data: Record<string, unknown> }>>
  gravar(itens: { chave: string; data: Record<string, unknown>; takenAt?: string }[]): Promise<void>
}

/**
 * Um modelo de linguagem para classificar ou extrair de texto (notícia, diário oficial). O custo volta com a resposta.
 * `workspaceId` é posto pelo motor (o passo não precisa saber): o caminho que passa pela fila do Hermes enfileira por Workspace.
 * Quem usa trata a falha (erro ou prazo) caindo na regra de palavra-chave.
 */
export interface Llm {
  json(a: { sistema: string; usuario: string; maxTokens?: number; workspaceId?: string }): Promise<{ json: unknown; custoUsd: number }>
}

/** O que um passo vê do pedido. */
export interface ContextoDoPasso {
  workspaceId: string
  /** As fotografias do tipo de Sinal desta cascata, neste Workspace. */
  snapshots: Snapshots
  /** O modelo de linguagem, quando a função o tem ligado; passos que dependem dele escolhem a regra simples sem ele. */
  llm?: Llm
  /** Custo em dólar que o passo gastou fora de um actor (o modelo de linguagem); soma ao custo real da execução. */
  custo: { adicionar(usd: number): void }
  pedido: PedidoDeCascata
  contas: ContaDoWorkspace[]
  criterios: Record<string, unknown>
  agora: number
  def: PassoDef
  /** Memória comum aos passos da execução (o que um passo guarda para o seguinte). */
  memoria: Map<string, unknown>
  /** Cópia mensal das fontes públicas. Ausente nos testes que não passam pelo motor. */
  cacheFonte?: CacheDeFonte
}

export interface LoteDoActor {
  input: unknown
  maxItems: number
  /** Prazo deste lote no actor, em segundos. Sem ele, vale o prazo que ainda resta na função. */
  timeoutSegundos?: number
  /** Teto de dólar deste lote, além do que ainda resta na cascata. A chamada para no menor dos dois. */
  tetoUsd?: number
}

export type EntradaDoActor = LoteDoActor | { lotes: LoteDoActor[]; parcial?: boolean } | { pular: string }

export interface FontePublica {
  buscar(entrada: Item[], ctx: ContextoDoPasso): Promise<Item[]>
}

/** Como um passo monta a entrada e lê a saída. Cada `handler` do registro tem uma. */
export interface ImplDoPasso {
  /** Passo de actor: a entrada do actor (ou o motivo de pular o passo, sem custo). */
  montarEntrada?(entrada: Item[], ctx: ContextoDoPasso, actorId: string): EntradaDoActor | Promise<EntradaDoActor>
  /** Passo de actor: o resultado bruto vira itens normalizados para o passo seguinte. */
  normalizar?(brutos: unknown[], entrada: Item[], ctx: ContextoDoPasso, actorId: string): Item[] | Promise<Item[]>
  /**
   * Quando o principal devolve itens, diz se eles conferem com a consulta e a janela de datas.
   * `false` com bruto não vazio dispara a alternativa (o mesmo caminho da falha). Lista vazia de verdade não chama isto.
   * Passo que não declara segue como hoje: resultado vazio encerra, sem alternativa.
   */
  confereConsulta?(brutos: unknown[], normalizados: Item[], ctx: ContextoDoPasso, actorId: string): boolean
  /** Quantos itens o actor cobra para esta entrada (para a estimativa do passo); padrão: os que entram, até `maxItems`. */
  itensCobrados?(entrada: Item[], ctx: ContextoDoPasso): number
  /** Passo de regra: executa direto. */
  executar?(entrada: Item[], ctx: ContextoDoPasso): Item[] | Promise<Item[]>
}

export interface RegistroDePassos {
  passos: Record<string, ImplDoPasso>
  /** Fontes públicas abertas por nome (`brasilapi_cnpj`...), usadas como passo ou como alternativa de um actor. */
  fontes: Record<string, FontePublica>
}
