import type { BloqueioDoTeto } from './automacao-tipos'
import type { SugestaoDeTemplate, TemplateDaAlthius } from './templates-althius'
import type { EntradaDeTemplateProprio, LiteralDeTemplate, PreviaDeTemplateProprio, TemplateProprio } from './templates-proprios'
import type { FonteObservavel } from './tipos'

export type StatusSequencia = 'ativa' | 'pausada' | 'reuniao' | 'esgotada' | 'encerrada'

/** Por que o sistema encerrou a Sequência: o responsável da Conta mudou (Transferência) ou a Conta foi apagada. */
export type MotivoDeEncerramento = 'transferencia' | 'exclusao'

export type CanalStep =
  | 'email'
  | 'linkedin'
  | 'whatsapp'
  | 'sms'
  | 'ligacao'
  | 'tarefa'

export const CANAIS_SUPORTADOS = ['email', 'linkedin', 'whatsapp'] as const
export type CanalSuportado = (typeof CANAIS_SUPORTADOS)[number]

export function ehCanalSuportado(canal: string): canal is CanalSuportado {
  return (CANAIS_SUPORTADOS as readonly string[]).includes(canal)
}

export type ModoEmail = 'auto' | 'manual'

export type SubtipoLinkedIn = 'convite' | 'mensagem' | 'inmail'

export interface JanelaHorario {
  de: string
  ate: string
}

/** Sugestões visíveis. A ativação só vale depois que o Vendedor confirma estes valores. */
export const FUSO_PADRAO = 'America/Sao_Paulo'
export const DIAS_UTEIS_PADRAO = [1, 2, 3, 4, 5]
export const MAXIMO_DIARIO_SUGERIDO = 3
export const INTERVALO_MINUTOS_SUGERIDO = 30

export interface AgendaDaSequencia {
  fuso: string
  diasUteis: number[]
  maximoDiario: number
  intervaloMinutos: number
}

export interface AnexoStep {
  tipo: 'imagem' | 'video'
  nome: string
  duracao?: string
  /**
   * O arquivo guardado no Workspace (canais-10): o documento leva só o id, e o conteúdo abre por um endereço temporário
   * pedido ao backend. Sem id, o anexo é só da Demonstração.
   */
  id?: string
  mime?: string
  tamanho?: number
  /** URL local (blob:) da Demonstração, criada via URL.createObjectURL — só persiste na sessão. */
  url?: string
}

export interface MetricasDemoStep {
  aberturas?: number | null
  respondeu?: boolean
  desfecho?: string
}

/**
 * Como o passo fica elegível (ADR-0031). Ausente = documento legado: a execução serial segue a ordem visual.
 * Com valor, a ordem visual não define dependência nem autorização.
 */
export type LiberacaoDoPasso = 'ativacao' | 'predecessor' | 'manual'

export interface StepSequencia {
  id: string
  ordem: number
  canal: CanalStep
  contatoId: string
  delayDiasUteis: number
  titulo: string
  assunto?: string
  corpo?: string
  objetivo?: string
  modoEmail?: ModoEmail
  /**
   * Qual e-mail (passo de E-mail) ou telefone (WhatsApp) do Contato o passo usa, de 1 a 3: 1 é o principal e ausente
   * vale 1. A confirmação fixa o endereço dessa posição (ADR-0014).
   */
  destino?: number
  subtipoLinkedIn?: SubtipoLinkedIn
  janela?: JanelaHorario | null
  anexos?: AnexoStep[]
  metricas?: MetricasDemoStep | null
  /**
   * Condição de liberação explícita. Sem este campo o passo é legado (serial pela lista).
   * Ticket 01 grava e valida; o paralelismo na execução fica para o ticket 02.
   */
  liberacao?: LiberacaoDoPasso
  /**
   * Id estável do predecessor na mesma Sequência. Só com liberacao === 'predecessor'.
   * No máximo um; reordenar a lista não altera este id.
   */
  predecessorId?: string
  /**
   * Outro Contato da mesma Conta citado no texto. Só entra com evidência do tipo pedido
   * (envio confirmado, resposta ou indicação). Ausente não cita ninguém.
   */
  referenciaContatoId?: string
}

export interface Sequencia {
  id: string
  contaId: string
  status: StatusSequencia
  /** False when the active user may see only the shared status projection. */
  responsavel?: boolean
  /** Safe shared count of steps; private step content is only present for the owner. */
  totalSteps?: number
  motivoPause?: string
  /** Só numa Sequência encerrada: o histórico fica, e a Conta pode ter outra Sequência em andamento. */
  encerradaPor?: MotivoDeEncerramento
  /** A Conta-alvo está arquivada: a Sequência fica pausada e só volta a ser retomada depois de restaurar a Conta. */
  pausadaPelaConta?: boolean
  /**
   * A Conta remetente do responsável neste Canal caiu (credenciais revogadas ou expiradas, conta removida): a Sequência
   * pausou e nada sai. Reconectar não retoma; o responsável retoma quando quiser (canais-11).
   */
  pausadaPelaContaRemetente?: CanalStep
  participantesIds: string[]
  janelaPadrao: JanelaHorario
  /** Ausente no documento antigo: a tela mostra a sugestão e exige confirmação antes de ativar. */
  fuso?: string
  diasUteis?: number[]
  maximoDiario?: number
  intervaloMinutos?: number
  regraDePause: string
  steps: StepSequencia[]
  /** Quantos steps já foram concluídos na demo (índice do próximo step). */
  passoAtual: number
  /** Total de participantes confirmados (calculado pela fonte). */
  totalParticipantes: number
  criadaEm: string
  atualizadaEm?: string
}

/** O desfecho de uma Conta-alvo na criação em lote. */
export interface ResultadoDoLoteDeSequencias {
  contaId: string
  desfecho: string
  sequenciaId?: string
}

export interface NovaSequencia {
  contaId: string
  participantesIds?: string[]
  steps?: StepSequencia[]
  janelaPadrao?: JanelaHorario
  regraDePause?: string
  status?: StatusSequencia
}

export interface AtualizacaoDocumento {
  participantesIds?: string[]
  steps?: StepSequencia[]
  janelaPadrao?: JanelaHorario
  fuso?: string
  diasUteis?: number[]
  maximoDiario?: number
  intervaloMinutos?: number
  regraDePause?: string
  status?: StatusSequencia
  motivoPause?: string
}

export interface ResumoPublicoSequencia {
  id: string
  contaId: string
  status: StatusSequencia
  totalParticipantes: number
  totalSteps: number
  passoAtual: number
  motivoPause?: string
  encerradaPor?: MotivoDeEncerramento
  atualizadaEm?: string
}

/** Interpretação, evidência e recomendação da IA sobre uma resposta pendente (sequencias-multicontato 05). A IA só
 * propõe: a decisão de pausar/continuar continua exclusivamente do Vendedor responsável. */
export interface AnaliseDaResposta {
  status: 'gerando' | 'pronta' | 'falhou'
  classificacao?: 'humana' | 'automatica' | 'possivel_nao_contato' | 'indeterminada'
  interpretacao?: string
  evidencia?: string
  recomendacao?: 'pausar' | 'continuar' | 'indeterminado'
}

export interface RespostaPendenteDeRetencao {
  id: string
  canal?: CanalStep
  contatoId?: string
  recebidaEm: string
  assunto?: string
  trecho?: string
  de?: string
  /** Ausente enquanto a resposta não tem análise, falhou ou o modelo ainda está gerando. */
  analise?: AnaliseDaResposta
}

export interface DecisaoDeRetencaoRegistrada {
  decisao: 'pause' | 'continue'
  versao: number
  criadaEm: string
}

/** Estado consultável da retenção. Conteúdo só quando podeLerConteudo. */
export interface RevisaoDeRetencao {
  aberta: boolean
  estado: 'nenhuma' | 'preventiva' | 'pausa_decidida'
  versao: number
  pendentes: RespostaPendenteDeRetencao[]
  decisoes: DecisaoDeRetencaoRegistrada[]
  /** Contatos mantidos em pausa local depois de uma retomada seletiva. */
  contatosPausados: string[]
  podeLerConteudo: boolean
  podeDecidir: boolean
}

export interface ResultadoDaDecisaoDeRetencao {
  outcome: 'paused' | 'continued' | 'reviewed_other_hold' | 'stale' | 'not_open'
  versao: number
}

/** O Resultado dos Envios do Workspace por canal e segmento da Conta (motor-hermes 03): quantos Envios saíram e quantos
 * tiveram resposta, resposta positiva, reunião e oportunidade. Positiva conta reunião e oportunidade; negativa só conta
 * como resposta. Só números: nenhum texto de mensagem.
 */
export interface TaxaDosEnvios {
  canal: string
  segmento: string
  enviados: number
  respostas: number
  positivas: number
  reunioes: number
  oportunidades: number
}

/** O Resultado dos Envios por abordagem, que é o título do passo da Sequência (decisão do Nan, 2026-10-01). */
export interface TaxaPorAbordagem {
  abordagem: string
  canal: string
  enviados: number
  respostas: number
  positivas: number
  reunioes: number
  oportunidades: number
}

/** Resultados únicos por Conta no histórico de envios até o corte informado pelo banco. */
export interface ResultadosPorConta {
  dataCorte: string
  contasAbordadas: number
  respostasPositivas: number
  reunioes: number
  respostasNegativas: number
}

export interface MetricasDemoSequencia {
  sequenciaId: string
  status: StatusSequencia
  coberturaContatos: number
  stepsConcluidos: number
  totalSteps: number
  respostas: number
  reunioes: number
}

/** A situação de um Envio do passo, como o backend a guarda. */
export type StatusDoEnvio =
  | 'waiting'
  | 'scheduled'
  | 'confirmed'
  | 'awaiting_reconfirmation'
  | 'sending'
  | 'sent'
  | 'uncertain'
  | 'failed'
  | 'bounced'
  | 'cancelled'

/** O Envio de um passo de E-mail: o Destino fixado na confirmação e o que o provedor respondeu. */
export interface EnvioDoPasso {
  id: string
  stepId: string
  contatoId: string
  destino: string
  status: StatusDoEnvio
  confirmadoEm: string
  enviadoEm?: string
  ultimoErro?: string
  /** Automático (sai pelo Executor) ou manual (espera o envio explícito do titular). Só num passo de versão ativada. */
  modo?: 'auto' | 'manual'
  /** Quando o passo sai (automático) ou fica pronto para o titular enviar (manual). */
  programadoPara?: string
  /** O Resultado do Envio que saiu (motor-hermes 03). Sem valor: sem resposta, ou a fonte não mede. */
  desfecho?: DesfechoDoEnvio
}

/** O que aconteceu com um Envio que saiu. "Sem resposta" é a falta de desfecho. */
export type DesfechoDoEnvio = 'resposta' | 'resposta_positiva' | 'resposta_negativa' | 'reuniao_marcada' | 'oportunidade'

/** A versão autorizada mais recente dos envios da sequência (canais-05). */
export interface AutorizacaoDosEnvios {
  versao: number
  autorizadaEm: string
  ativa: boolean
  /**
   * Por que deixou de valer: um passo pendente foi editado, uma nova ativação a substituiu ou o sistema a revogou (a
   * responsabilidade da Conta foi transferida, ou a Conta foi arquivada ou apagada).
   */
  motivoDaRevogacao?: 'edited' | 'reactivated' | 'responsibility_transferred' | 'account_archived' | 'account_deleted'
}

/**
 * O que o backend respondeu a "Ativar envios". `activated` traz o passo programado (se houver); os outros valores são
 * bloqueios com o passo que os causou, e a tela mostra a `mensagem`.
 */
export interface ResultadoDaAtivacao {
  outcome: string
  stepId?: string
  versao?: number
  programadoPara?: string
  mensagem?: string
}

/**
 * O que o backend respondeu a um pedido de envio. `sent`, `failed` e `uncertain` são o resultado do provedor; os
 * outros valores são bloqueios com motivo (ex.: `sender_not_ready`, `destination_changed`, `reply_found`), e a tela
 * mostra a `mensagem` que veio com eles.
 */
export interface ResultadoDoEnvio {
  outcome: string
  mensagem?: string
}

export interface AnexoRecebido {
  id: string
  nome: string
  mime?: string
  tamanho?: number
  status: 'pending' | 'stored' | 'failed'
}

/** O estado de uma Proposta de resposta (canais 08 e 09). */
export type EstadoDaProposta =
  | 'gerando'
  | 'pronta'
  | 'falhou'
  | 'desatualizada'
  | 'aprovada'
  | 'enviando'
  | 'enviada'
  | 'incerta'
  | 'rejeitada'

/** A resposta que o Rhetor sugere a uma mensagem do Contato. Só o titular a lê; nada sai sem a Aprovação dele. */
export interface PropostaDeResposta {
  id: string
  canal: string
  destinatario: string
  nomeDoDestinatario?: string
  assunto?: string
  texto: string
  revisao: number
  status: EstadoDaProposta
  mensagemDeOrigem?: string
  recebidaEm?: string
  enviadaEm?: string
  erroDoEnvio?: string
  /**
   * Por que a primeira geração, que é automática, não saiu (creditos-e-planos 03): o automático está em confirmar, sem
   * teto ou no teto do mês. A proposta espera o titular pedir a resposta.
   */
  paradaPeloTeto?: BloqueioDoTeto
}

/** Uma resposta do Contato guardada pela Althius; só o Responsável pela Sequência a lê. */
export interface RespostaRecebida {
  interacaoId: string
  sequenciaId: string
  envioId?: string
  contatoId?: string
  /** WhatsApp ou LinkedIn. A resposta de e-mail não traz canal: o assunto já a identifica. */
  canal?: 'whatsapp' | 'linkedin'
  de: { email?: string; nome?: string }
  assunto?: string
  corpo?: string
  recebidaEm: string
  anexos: AnexoRecebido[]
  /** Anexos de chat: a tela só conta. Não há arquivo para baixar. */
  quantidadeDeAnexos?: number
}

/**
 * A fronteira de dados do módulo Sequências.
 * Operações assíncronas com observador de mudanças (ADR 0003).
 */
export interface FonteDeSequencias extends FonteObservavel {
  /** A data de referência de "hoje" adotada pela fonte. */
  hoje(): Date

  /** Lista todas as sequências do Workspace. */
  sequencias(): Promise<Sequencia[]>

  /** Busca uma sequência pelo seu id. Rejeita se não existir. */
  sequencia(id: string): Promise<Sequencia>

  /**
   * Busca a sequência de uma Conta-alvo: a em andamento (no máximo uma) ou, se só houver encerradas, a mais recente.
   * Devolve null se não houver.
   */
  sequenciaPorConta(contaId: string): Promise<Sequencia | null>

  /**
   * Cria uma nova sequência para uma Conta-alvo. Rejeita se já existir uma em andamento para ela ou se quem chama não
   * for o Vendedor responsável pela Conta. Depois de uma Transferência de responsabilidade, o novo responsável cria a dele.
   */
  criarSequencia(nova: NovaSequencia): Promise<Sequencia>

  /**
   * Cria uma Sequência por Conta-alvo com a mesma Cadência (`create_sequences_in_batch`).
   * Contas puladas voltam no desfecho, sem desfazer as outras.
   */
  criarSequenciasEmLote?(
    contaIds: string[],
    template: { steps: Omit<StepSequencia, 'contatoId'>[]; janelaPadrao?: JanelaHorario; regraDePause?: string },
  ): Promise<ResultadoDoLoteDeSequencias[]>

  /** E-mails e domínios suprimidos do Workspace, para a prévia do lote. */
  supressoesDoWorkspace?(): Promise<{ kind: 'email' | 'domain'; value: string }[]>

  /** Atualiza o documento de uma sequência (participantes, steps, delays, janela, pause). */
  atualizarDocumento(id: string, atualizacao: AtualizacaoDocumento): Promise<Sequencia>

  /** Confirma ou ajusta os participantes de uma sequência. */
  confirmarParticipantes(id: string, participantesIds: string[]): Promise<Sequencia>

  /** Lê as métricas de demonstração de uma sequência. */
  metricasDeDemo(id: string): Promise<MetricasDemoSequencia | null>

  /** Lê apenas a projeção pública da sequência (sem corpos, assuntos ou anexos privados). */
  resumoPublico(id: string): Promise<ResumoPublicoSequencia | null>

  /** O titular diz o que aconteceu com um Envio que saiu. Sem o método, a tela não oferece a classificação. */
  classificarEnvio?(envioId: string, desfecho: DesfechoDoEnvio): Promise<void>

  /** O Resultado dos Envios do Workspace, por canal e segmento. Sem o método, a fonte não mede (e a tela não mostra). */
  taxasDosEnvios?(): Promise<TaxaDosEnvios[]>

  /** O Resultado dos Envios do Workspace por abordagem (o título do passo) e canal. */
  taxasPorAbordagem?(): Promise<TaxaPorAbordagem[]>

  /** Apuração por Conta-alvo no histórico completo, até o corte do banco. */
  resultadosPorConta?(): Promise<ResultadosPorConta | null>

  /** Os Envios dos passos da sequência. Só o Responsável pela Sequência os vê; os demais recebem uma lista vazia. */
  envios(sequenciaId: string): Promise<EnvioDoPasso[]>

  /** Confirma um passo de E-mail: fixa o e-mail atual do Contato como Destino. Rejeita passos de outro canal. */
  confirmarPasso(sequenciaId: string, stepId: string): Promise<EnvioDoPasso>

  /** Pede ao backend o envio de um passo confirmado. Um bloqueio volta como resultado, não como erro. */
  enviarPasso(sequenciaId: string, envioId: string): Promise<ResultadoDoEnvio>

  /** As Propostas de resposta da sequência. Só para o titular; ausente onde ainda não há propostas reais. */
  propostasDeResposta?(sequenciaId: string): Promise<PropostaDeResposta[]>

  /** Aprova a revisão lida (gravando antes o texto editado, se houver) e pede o envio. Um bloqueio volta no resultado. */
  aprovarEEnviarProposta?(pedido: { id: string; revisao: number; textoEditado?: string }): Promise<{ enviada: boolean; mensagem?: string }>

  /** Rejeita a proposta: nada é enviado. */
  rejeitarProposta?(id: string): Promise<void>

  /** Pede ao Rhetor uma nova proposta para a mesma mensagem. */
  gerarPropostaDeNovo?(id: string): Promise<void>

  /** As respostas recebidas da sequência, com conteúdo. Só para o Responsável pela Sequência. */
  respostasRecebidas(sequenciaId: string): Promise<RespostaRecebida[]>

  /** Um endereço temporário para abrir um anexo recebido. Só para o Responsável pela Sequência. */
  urlDoAnexo(interacaoId: string, anexoId: string): Promise<string>

  /**
   * Guarda um arquivo no passo (canais-10): o backend confere o tipo, o tamanho e o canal do passo e devolve o anexo a
   * gravar no documento. Ausente onde o Workspace não guarda arquivos (a Demonstração usa o endereço local).
   */
  anexarArquivo?(sequenciaId: string, stepId: string, arquivo: File): Promise<AnexoStep>

  /** Um endereço temporário para ver um anexo de passo. Só para o Responsável pela Sequência. */
  urlDoAnexoDoPasso?(anexoId: string): Promise<string>

  /** A autorização mais recente dos envios automáticos, ou null quando nunca foram ativados. Só para o Responsável. */
  autorizacao(sequenciaId: string): Promise<AutorizacaoDosEnvios | null>

  /** Ativa os caminhos confirmados. Sem a lista, o contrato antigo autoriza o documento inteiro. */
  ativarEnvios(sequenciaId: string, pedido?: {
    stepIds: string[]
    agenda: AgendaDaSequencia & { janela: JanelaHorario }
  }): Promise<ResultadoDaAtivacao>

  /** Libera um passo de liberação manual já autorizado. Não cria autorização nem troca o Destino. */
  liberarPassoManual?(sequenciaId: string, stepId: string): Promise<{ outcome: string; programadoPara?: string }>

  /**
   * Quais canais de chat estão liberados para envio. Null quando a leitura falha: a tela não trata isso como canal
   * ligado, para uma Sequência só de chat não ativar no escuro.
   */
  canaisDeChatLiberados?(): Promise<{ whatsapp: boolean; linkedin: boolean } | null>

  /** Resolve um envio incerto que o provedor não confirmou: o titular diz se ele saiu. */
  resolverIncerto(sequenciaId: string, stepId: string, saiu: boolean): Promise<void>

  /**
   * Revisão conjunta das respostas que retêm a Conta. Sem o método, a tela não oferece a decisão.
   * Outro participante recebe o estado sem conteúdo.
   */
  revisaoDeRetencao?(sequenciaId: string): Promise<RevisaoDeRetencao>

  /** Pausa a Conta inteira ou continua os Contatos escolhidos para o conjunto revisado. Não chama IA. */
  decidirRetencao?(pedido: {
    sequenciaId: string
    decisao: 'pause' | 'continue'
    versao: number
    respostasRevisadas: string[]
    contatosSelecionados: string[]
  }): Promise<ResultadoDaDecisaoDeRetencao>

  /** Confirma um pedido textual de não contato usando uma resposta privada como evidência. */
  confirmarNaoContatar?(sequenciaId: string, interacaoId: string): Promise<void>

  /**
   * Templates da Althius: estruturas sem Contato, destino ou histórico. O Cliente lê; não edita o original.
   */
  templatesDaAlthius(): Promise<TemplateDaAlthius[]>

  /**
   * Sugere um template existente a partir de um Sinal real da Conta. Sem contexto ou com o teto fechado, não escolhe.
   * Não cria Sequência e não ativa envio.
   */
  sugerirTemplateDaAlthius(contaId: string): Promise<SugestaoDeTemplate>

  /**
   * Templates próprios do criador neste Workspace. Outro participante não recebe a lista.
   * Não é biblioteca compartilhada.
   */
  templatesProprios(): Promise<TemplateProprio[]>

  /** A prévia parametrizada, sem persistir. O salvamento só aceita este resultado. */
  previaDeTemplateProprio(entrada: EntradaDeTemplateProprio): Promise<PreviaDeTemplateProprio>

  /** Grava só a prévia já segura. Não autoriza Contato e não altera Sequências. */
  salvarTemplateProprio(entrada: PreviaDeTemplateProprio & { literais?: LiteralDeTemplate[] }): Promise<TemplateProprio>

  /** Só o criador edita. A Sequência já copiada não muda. */
  atualizarTemplateProprio(
    id: string,
    entrada: PreviaDeTemplateProprio & { literais?: LiteralDeTemplate[] },
  ): Promise<TemplateProprio>

  /**
   * Sugere um template próprio que o leitor pode ler. Sem template legível, sem Sinal ou com o teto fechado, não escolhe.
   * Não substitui a sugestão da Althius e não ativa envio.
   */
  sugerirTemplateProprio(contaId: string): Promise<SugestaoDeTemplate>
}
