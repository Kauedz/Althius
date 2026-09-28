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
  /** Quantas Execuções o Agente já fez, contadas exatas. */
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
  /** A Conta de usuário da sessão. */
  usuario: ContaDeUsuario
  /** O papel da Participação da sessão neste Workspace; `null` quando a Conta de usuário não participa dele. */
  papel: Papel | null
  aprovacoesPendentes: number
}

/** Os dois únicos papéis de acesso de uma Participação no Workspace, sem matriz individualizada. */
export type Papel = 'administrador' | 'membro'

/** Identificador de uma Conta de usuário; não confundir com o de uma Conta-alvo. */
export type ContaDeUsuarioId = string

/** A identidade pessoal de acesso à Althius: existe independente de qualquer Participação no Workspace. */
export interface ContaDeUsuario {
  id: ContaDeUsuarioId
  nome: string
  email: string
  foto?: string
  cargo: string
}

/** Uma Participação ativa no Workspace: a Conta de usuário e o papel, que é do vínculo. */
export interface ParticipacaoAtiva {
  contaId: ContaDeUsuarioId
  papel: Papel
}

/** As informações gerais do Workspace: todos consultam; só Administradores alteram o nome e a descrição. */
export interface InformacoesDoWorkspace {
  /** O nome do Workspace, que é também como os Agentes chamam o Cliente. */
  nome: string
  descricao: string
  /** Data da criação, em ISO (aaaa-mm-dd). */
  criadoEm: string
}

/** O que um Administrador altera nas informações do Workspace. */
export type NovasInformacoesDoWorkspace = Pick<InformacoesDoWorkspace, 'nome' | 'descricao'>

/** Uma Participação no Workspace de uma Conta de usuário, vista a partir da Conta: o papel é do vínculo. */
export interface ParticipacaoDaConta {
  workspaceId: string
  nomeDoWorkspace: string
  papel: Papel
  /** Se é o Workspace aberto agora. */
  atual: boolean
}

/** Uma pessoa ativa no Workspace: a Conta de usuário e o papel da sua Participação neste Workspace. */
export interface Participante {
  conta: ContaDeUsuario
  papel: Papel
  /** Se é o único Administrador: não pode ser rebaixado nem removido, para o Workspace não ficar sem responsável. */
  ultimoAdministrador: boolean
  /** As Participações da mesma Conta de usuário em outros Workspaces, que a remoção deste preserva. */
  outrasParticipacoes: ParticipacaoDaConta[]
  /** Se é o Titular do Workspace pessoal: ninguém o rebaixa nem o remove, nem outro Administrador. */
  titular?: boolean
}

/** Os estados de um convite: só o pendente ainda pode ser aceito. */
export type EstadoDoConvite = 'pendente' | 'aceito' | 'expirado' | 'revogado'

/**
 * Convite para uma pessoa entrar no Workspace: não é Participante nem conta como um até ser aceito, com o e-mail
 * convidado. A Althius ainda não envia e-mail de convite: o Administrador copia o link e o envia.
 */
export interface Convite {
  id: string
  email: string
  papel: Papel
  /** Data do registro, em ISO (aaaa-mm-dd). */
  registradoEm: string
  /** A Demonstração só guarda convites pendentes. */
  estado: EstadoDoConvite
  /** O link do convite, que só Administradores recebem, enquanto ele está pendente. */
  link?: string
  /** Até quando o link vale, em ISO (aaaa-mm-dd); a Demonstração não tem prazo. */
  expiraEm?: string
}

export interface NovoConvite {
  email: string
  papel: Papel
}

/** Workspace / Pessoas e acesso: informações, Participantes ativos e convites pendentes, com o papel da sessão. */
export interface ParticipantesDoWorkspace {
  informacoes: InformacoesDoWorkspace
  /** A Conta de usuário da sessão. */
  contaId: ContaDeUsuarioId
  papel: Papel | null
  participantes: Participante[]
  convites: Convite[]
}

/** Uma Conta de usuário com todas as suas Participações, em qualquer Workspace. */
export interface ContaComParticipacoes {
  conta: ContaDeUsuario
  participacoes: ParticipacaoDaConta[]
}

/** As Execuções de Agentes de uma Especialidade no período: as do Agente padrão e as dos Agentes criados dela. */
export interface ExecucoesDaEspecialidade {
  especialidadeId: EspecialidadeId
  nome: string
  total: number
}

/** As Execuções de Agentes do Workspace num período explícito. Decidir uma Aprovação não é Execução nova. */
export interface ExecucoesNoPeriodo {
  /** O primeiro e o último dia do período, em ISO (aaaa-mm-dd). */
  inicio: string
  fim: string
  total: number
  porEspecialidade: ExecucoesDaEspecialidade[]
}

/** O uso do Workspace inteiro, que só os Participantes consultam. */
export interface UsoDoWorkspace {
  /** Os Participantes ativos, os mesmos de Pessoas e acesso; convites pendentes não contam. */
  participantes: number
  convitesPendentes: number
  execucoes: ExecucoesNoPeriodo
}

/**
 * O plano do Workspace, e não da Conta de usuário: todos os Participantes consultam o mesmo plano e o mesmo uso.
 * Não há preço, franquia nem limite: esses dados comerciais ainda não foram definidos, e o upgrade não existe.
 */
export interface PlanoDoWorkspace {
  nome: string
  nomeDoWorkspace: string
  /** `null` quando a sessão não participa do Workspace: como em Pessoas e acesso, ela vê só as informações gerais. */
  uso: UsoDoWorkspace | null
}

/** Os dados editáveis em Meu perfil: nome, e-mail e foto da Conta de usuário. Sem foto, iniciais. */
export interface Perfil {
  nome: string
  email: string
  foto?: string
}

/** Os temas da Althius. */
export type TemaEscolhido = 'escuro' | 'claro'

/**
 * As preferências pessoais da Conta de usuário, que valem em qualquer Workspace. Na Demonstração, o tema tem mecanismo
 * próprio, no navegador; no Workspace operacional, fica salvo na Conta de usuário e volta em qualquer dispositivo.
 */
export interface Preferencias {
  /**
   * A vontade de receber notificações do navegador. É só da pessoa: mostrar os avisos também depende da permissão
   * que o navegador dá, e desligar aqui não revoga essa permissão.
   */
  notificacoesDoNavegador: boolean
  /** O tema salvo na Conta de usuário; ausente quando ela nunca escolheu um, ou na Demonstração. */
  tema?: TemaEscolhido
}

/** Uma seção de um documento da Memória do Workspace (ex.: "Porte" do ICP). */
export interface SecaoDoDocumento {
  titulo: string
  texto: string
}

/** Quem pediu ou decidiu uma revisão, como era no momento: a Conta de usuário e o nome. */
export interface Autor {
  contaId: ContaDeUsuarioId
  nome: string
}

/**
 * Um documento vigente da Memória do Workspace (o ICP ou as definições de Personas): o último aprovado. A Memória
 * guarda só ele, sem histórico nem restauração.
 */
export interface DocumentoVigente {
  /** No ICP, os critérios (ex.: "Porte"); nas Personas, uma seção por Persona, com o nome no título. */
  secoes: SecaoDoDocumento[]
  /** Data da aprovação, em ISO (aaaa-mm-dd). */
  aprovadoEm: string
  aprovadoPor: Autor
}

/**
 * A documentação compartilhada do Cliente, distinta da Memória individual de cada Agente. É a única
 * referência dos módulos que dependem dela: nenhum guarda uma cópia.
 */
export interface MemoriaDoWorkspace {
  icp: DocumentoVigente
  /** As definições de Personas, pelas quais os Contatos são classificados. Não são participantes do Workspace. */
  personas: DocumentoVigente
}

/** Os documentos da Memória do Workspace que mudam só por revisão de um Agente e Aprovação de Administrador. */
export type DocumentoDaMemoria = keyof MemoriaDoWorkspace

/**
 * A proposta de um Agente para um documento da Memória do Workspace: o pedido e quem o fez. O documento vigente só
 * muda quando um Administrador ativo aprova.
 */
interface RevisaoDaMemoriaBase {
  documento: DocumentoDaMemoria
  /** O que o participante pediu ao Agente na Conversa. */
  pedido: string
  solicitante: Autor
  /** Data do pedido, em ISO (aaaa-mm-dd). */
  pedidaEm: string
}

/** Enquanto pendente, a revisão traz o conteúdo proposto e o vigente no pedido, para o Administrador ver o que muda. */
export interface RevisaoPendente extends RevisaoDaMemoriaBase {
  /** O documento inteiro como ficaria: a aprovação troca o vigente por este de uma vez. */
  proposto: SecaoDoDocumento[]
  /** O documento vigente no momento do pedido, para mostrar o que muda. */
  vigenteNoPedido: SecaoDoDocumento[]
}

/**
 * Decidida, fica só o registro da Aprovação: o pedido, quem pediu e quem decidiu. O conteúdo não é guardado, para a
 * fila não virar um histórico dos documentos; o aprovado passa a ser o vigente.
 */
export interface RevisaoDecidida extends RevisaoDaMemoriaBase {
  decididaPor: Autor
}

export type RevisaoDaMemoria = RevisaoPendente | RevisaoDecidida

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
  /** O documento da Memória do Workspace que a Habilidade lê a cada uso, o vigente: ela não guarda uma cópia dele. */
  usaDocumento?: DocumentoDaMemoria
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

/** Uma Execução (o Agente foi acionado e entregou um resultado) ou uma ação dentro dela. */
export type TipoDeAtividade = 'execucao' | 'acao'

export interface ItemDeAtividade {
  id: string
  agenteId: AgenteId
  tipo: TipoDeAtividade
  /** O que acionou o trabalho; uma ação herda o gatilho da Execução que a gerou. */
  gatilho: Gatilho
  quando: string
  descricao: string
  resultado: string
  /** Onde ver o resultado dentro da Althius. */
  link?: { rotulo: string; para: string }
  /** A ação não se concluiu e nada foi alterado: a Atividade registra a falha para quem a acompanha. */
  falhou?: boolean
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
/** Onde uma Aprovação foi pedida e pode ser decidida. */
export type Origem = 'althius' | CanalId
/** Onde uma Aprovação foi decidida: na fila de Aprovações, na página da Conversa ou no Canal de origem. */
export type LugarDaDecisao = 'fila' | 'conversa' | CanalId

/** Uma ação que um Agente quer fazer numa Integração; a Permissão dele decide o que acontece. */
export interface AcaoProposta {
  acao: string
  integracaoId: IntegracaoId
  impacto: string
  justificativa: string
}

/** O que toda Aprovação tem: o que o Agente propôs, onde foi pedida e o gatilho da Execução que a propôs. */
interface AprovacaoBase extends Omit<AcaoProposta, 'integracaoId'> {
  id: string
  agenteId: AgenteId
  origem: Origem
  /** O gatilho da Execução que propôs a Aprovação; a decisão entra na Atividade com ele. */
  gatilho: Gatilho
}

/** Uma ação que um Agente quer fazer numa Integração, pela Permissão Propor (ADR 0002). */
export interface AprovacaoDeAcao extends AprovacaoBase {
  integracaoId: IntegracaoId
  estado: EstadoAprovacao
  /** A Conta-alvo da ação, quando houver (não uma Conta de usuário). */
  contaId?: string
  contaNome?: string
  sequenciaId?: string
  revisao?: undefined
}

/**
 * Uma Revisão da Memória do Workspace (ADR 0010): não passa por Integração e só um Administrador ativo decide.
 * Pendente, traz o conteúdo proposto; decidida, só o registro da decisão.
 */
export type AprovacaoDeRevisao = AprovacaoDeRevisaoPendente | AprovacaoDeRevisaoDecidida
export type AprovacaoDeRevisaoPendente = AprovacaoBase & { estado: 'pendente'; revisao: RevisaoPendente }
export type AprovacaoDeRevisaoDecidida = AprovacaoBase & { estado: Decisao; revisao: RevisaoDecidida }

export type Aprovacao = AprovacaoDeAcao | AprovacaoDeRevisao

/** A categoria de uma Aprovação define quem a decide: a Revisão da Memória do Workspace, só Administradores. */
export type CategoriaDeAprovacao = 'acao' | 'revisao-da-memoria'

export interface NovaAprovacao {
  agenteId: AgenteId
  acao: string
  integracaoId?: IntegracaoId
  impacto: string
  justificativa: string
  origem?: Origem
  gatilho?: Gatilho
  contaId?: string
  contaNome?: string
  sequenciaId?: string
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
  /** Nascimento na Conversa: oferta de sequência, confirmação humana de participantes e documento incorporado. */
  | {
      tipo: 'nascimento-sequencia'
      agenteId: AgenteId
      contaId: string
      sinal?: string
      sequenciaId?: string
    }

/** O que aconteceu: uma Aprovação pedida, uma Aprovação decidida ou uma falha registrada na Atividade. */
export type TipoDeAviso = 'aprovacao-solicitada' | 'aprovacao-decidida' | 'falha'

/**
 * Um Aviso do Workspace sobre o que acabou de acontecer, para as notificações do navegador. Chega a quem observa
 * enquanto o aplicativo está aberto: não há envio em segundo plano nem para fora da Althius. Destina-se só às Contas
 * de usuário em `destinatarios`, escolhidas pela Participação e pelo papel no momento. Não concede capacidade
 * nenhuma: decidir continua exigindo o papel, validado na operação.
 */
export interface AvisoDoWorkspace {
  id: string
  tipo: TipoDeAviso
  destinatarios: ContaDeUsuarioId[]
  titulo: string
  texto: string
  /** Onde ver o assunto dentro da Althius. */
  para: string
}

/** Qualquer fonte de dados observável da aplicação: avisa as telas quando os dados mudam. */
export interface FonteObservavel {
  /** Avisa as telas quando algum dado muda. Devolve a função para cancelar. */
  observar(ouvinte: () => void): () => void
}

/**
 * A única fronteira entre as telas e os Agentes. Hoje só existe a implementação simulada;
 * uma implementação real vai substituí-la sem mudar as telas (ADR 0003).
 */
export interface FonteDeAgentes extends FonteObservavel {
  workspace(): Promise<Workspace>
  /**
   * Os Avisos do Workspace a partir de agora: Aprovações pedidas e decididas e falhas na Atividade. Emitir um aviso
   * não muda o resultado da operação que o gerou. Devolve a função para cancelar.
   */
  observarAvisos(ouvinte: (aviso: AvisoDoWorkspace) => void): () => void
  /** Nome, e-mail e foto da Conta de usuário da sessão, como Meu perfil os edita. */
  perfil(): Promise<Perfil>
  /**
   * Atualiza o perfil da Conta de usuário; valida nome não vazio. Na Demonstração, também troca o e-mail (com formato
   * válido e sem verificação). No Workspace operacional, grava só nome e foto: o e-mail é o do acesso no Supabase Auth,
   * só aparece, e um e-mail diferente do da sessão é recusado sem gravar nada.
   */
  salvarPerfil(perfil: Perfil): Promise<void>
  /** As preferências da Conta de usuário da sessão; sem nada salvo, as notificações do navegador ficam desligadas. */
  preferencias(): Promise<Preferencias>
  /** Grava só as preferências informadas; as demais continuam como estavam. */
  salvarPreferencias(preferencias: Partial<Preferencias>): Promise<void>

  /** Informações, Participantes e convites do Workspace atual, com o papel da sessão. Todos os Participantes consultam. */
  participantesDoWorkspace(): Promise<ParticipantesDoWorkspace>
  /** A Conta de usuário e suas Participações: ela continua existindo depois de removida de um Workspace. */
  contaDeUsuario(contaId: ContaDeUsuarioId): Promise<ContaComParticipacoes>
  // As operações administrativas abaixo validam a Participação e o papel da sessão: só Administradores as executam.
  /** Altera o nome e a descrição do Workspace; o nome não fica vazio. */
  salvarInformacoesDoWorkspace(informacoes: NovasInformacoesDoWorkspace): Promise<void>
  /** Registra um convite pendente, sem enviar e-mail; recusa quem já participa ou já tem convite pendente. */
  convidarParaWorkspace(convite: NovoConvite): Promise<Convite>
  /** Cancela (revoga) um convite pendente: o link deixa de valer. */
  cancelarConvite(conviteId: string): Promise<void>
  /** Alterna o papel entre Administrador e Membro; recusa rebaixar o último Administrador. */
  mudarPapel(contaId: ContaDeUsuarioId, papel: Papel): Promise<void>
  /**
   * Encerra só a Participação neste Workspace: a Conta de usuário e as outras Participações continuam.
   * Recusa remover o último Administrador e a própria sessão.
   */
  removerDoWorkspace(contaId: ContaDeUsuarioId): Promise<void>

  /**
   * O plano atual do Workspace e o uso: os Participantes ativos, os mesmos de Pessoas e acesso, e as Execuções de
   * Agentes do mês até hoje, as mesmas que sobem nos Agentes.
   */
  plano(): Promise<PlanoDoWorkspace>

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

  /** O ICP e as Personas vigentes, a referência compartilhada que Configurações, Sinais, Agentes e Contatos leem. */
  memoriaDoWorkspace(): Promise<MemoriaDoWorkspace>
  /**
   * Um participante ativo pede a revisão ao Agente do documento (o Scopus no ICP, o Ethos nas Personas). Numa Conversa
   * demonstrativa, o Agente prepara a proposta e a envia para Aprovações; o documento vigente não muda.
   * Recusa quem não participa do Workspace e um segundo pedido enquanto houver proposta pendente.
   */
  solicitarRevisao(documento: DocumentoDaMemoria, pedido: string): Promise<AprovacaoDeRevisao>

  aprovacoes(): Promise<Aprovacao[]>
  /**
   * Decide uma Aprovação: é uma ação da Execução que a propôs, não uma Execução nova. Uma revisão da Memória do
   * Workspace exige Administrador ativo; aprovada, substitui o documento vigente numa mudança só, e todas as
   * configurações que dependem dele passam a usar o novo. Se falhar, nada muda e a proposta continua pendente.
   */
  decidirAprovacao(aprovacaoId: string, decisao: Decisao, onde: LugarDaDecisao): Promise<void>
  /** Propõe uma nova Aprovação (ex.: para ativação de sequência simulada). */
  proporAprovacao(aprovacao: NovaAprovacao): Promise<Aprovacao>

  /** Envia uma mensagem ou sugestão e recebe a resposta passo a passo. */
  conversar(id: AgenteId, mensagem: Mensagem): AsyncIterable<PassoDaConversa>

  /** As sugestões clicáveis de pedidos coordenados, abaixo do composer. */
  sugestoesCoordenadas(): Promise<Sugestao[]>
  /**
   * Envia um pedido no composer, sem escolher um Agente, e recebe passo a passo as etapas de cada
   * Agente que a Coordenação chamou e a resposta consolidada. Com os pedidos anteriores da mesma
   * Conversa (nenhum, numa Conversa nova), a Coordenação continua a partir do que já foi feito, em vez de recomeçar.
   */
  conversarCoordenado(pedido: Mensagem, anteriores: Mensagem[]): AsyncIterable<PassoDaCoordenacao>
}

export * from './contas-tipos'
export * from './onboarding-tipos'
export * from './sequencias-tipos'
export type {
  FonteDeSinais,
  TipoDeSinal,
  Familia,
  Formulario,
  EstadoDoMonitoramento,
  ModoDePublico,
  Publico,
  Criterios,
  Monitoramento,
  NovoMonitoramento,
  SinalEncontrado,
  Origem as OrigemDoSinal,
} from './sinais-tipos'

