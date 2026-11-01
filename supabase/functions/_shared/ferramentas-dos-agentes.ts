// As ferramentas dos Agentes (Etapa 5b, CRM-14 e CRM-15): o que o Scopus, o Ethos, o Rhetor e o Oraculum podem FAZER numa
// Conversa, além de conversar. Um catálogo pequeno e seguro, igual para a ponte (`agent-conversation`) e para o worker do
// Hermes; o motor só expõe ao Agente da vez o que a Especialidade e a Permissão dele permitem, executa a chamada e
// devolve o resultado para a próxima rodada. Cada chamada vira um passo visível na Conversa.
//
//   buscar_contas_pelo_icp  (Scopus)            pede uma busca de empresas pelo ICP; ela espera a pessoa confirmar na
//                                                Caixa de Descobertas, que reserva os Créditos (nunca cria Conta-alvo);
//   ler_contas_e_sinais     (todos)              lê Contas-alvo, estágio, Sinais ativos e Contatos do Workspace;
//   consultar_integracao    (todos, com Ler+)    lê um CRM ou fonte conectado, pelo Acesso de quem pediu, só leitura;
//   propor_envio_ao_crm     (Scopus, Ethos,      propõe Enviar ao CRM: com Propor, nasce a Aprovação pendente; com
//                            Rhetor; Propor+)    Executar, ela nasce liberada e o executor das Aprovações envia;
//   usar_conector           (todos, com Ler+)    lista e chama as ferramentas que o servidor de um conector oferece, sem
//                                                código por app (ADR-0022): a regra de cada ferramenta somada à Permissão
//                                                decide se executa, pede Aprovação (com a chamada exata) ou é recusada;
//   buscar_sinais           (Scopus)             busca Sinais de um tipo do catálogo (os 8 ICPs do Mapa de Mercado) nas Contas do
//                                                Workspace, pelo mesmo motor de cascata dos Monitoramentos, com teto de
//                                                Créditos; sem o Sinal, lista o catálogo e os que não têm fonte;
//   propor_mudanca_no_playbook (Scopus, Ethos)   propõe uma nova versão de uma seção do Playbook da Especialidade (CRM-09,
//                                                ADR-0010): nasce uma Aprovação que só um Administrador decide, e o
//                                                Playbook só muda quando ela é aprovada;
//   propor_sequencia        (Rhetor)            propõe uma Sequência de E-mail para uma Conta-alvo (cadencia-pela-ia 01):
//                                                nasce sempre uma Aprovação, mesmo com Executar, que só o Vendedor
//                                                responsável decide; aprovada, a Sequência é criada sem envio, e nada sai
//                                                antes de ele clicar "Ativar envios". Sem Contatos, lista os da Conta.
//
// O que pode ser feito é sempre conferido de novo no banco (a Especialidade, a Permissão, a Participação, a Integração
// ligada) e no Acesso (`chamarFerramenta` com o `agenteId`). Uma falha de ferramenta vira texto para o Agente, nunca
// derruba o pedido. O banco, o Acesso e o executor entram por injeção, para o teste rodar sem rede.
import { icpDoSinalDoMapa, MAPA_DE_SINAIS } from './mapa-de-sinais.ts'
import type { DesfechoDaChamadaAprovada, DesfechoDoEnvioAprovado } from './executor-de-aprovacoes.ts'
import { chamarFerramenta, type DepsDeAcesso, ErroDoBanco, listarFerramentas, type Permissao } from './integration-access.ts'
import { perfilDaIntegracao } from './integracoes/perfis.ts'
import { decidirChamada, regraVigente } from './integracoes/regras.ts'
import { ferramentasRest } from './integracoes/rest.ts'
import type { AgenteDoWorkspace } from './orquestracao.ts'

/** A Permissão de um Agente numa Integração ligada no Workspace, como `agent_run_tools_context` devolve. */
export interface PermissaoNaIntegracao {
  agentId: string
  integrationId: string
  permission: Permissao
  category: string | null
  name: string
}

export interface ContextoDasFerramentas {
  workspaceId: string
  /** Quem fez o pedido: é o Acesso dele que as Integrações usam (ADR-0017). */
  requestedBy: string
  permissoes: PermissaoNaIntegracao[]
}

export interface PedidoDeDescoberta {
  criterios: Record<string, unknown>
  maxResults: number
  motivo: string | null
}

export interface DescobertaPedida {
  discoveryRunId: string
  outcome: 'pedido' | 'existente' | string
  creditos: number
  saldo: number
  novasNaCaixa: number
  estadoDoActor: 'available' | 'testing' | 'none' | string
}

export interface EnvioProposto {
  approvalId: string
  outcome: 'pendente' | 'liberada' | 'existente' | string
  conta: string
  crm: string
}

/** Uma chamada de ferramenta de conector que precisa de Aprovação, como vai a `propose_agent_action`. */
export interface ChamadaProposta {
  integrationId: string
  /**
   * `{ tipo: 'ferramenta', integration_id, ferramenta, argumentos }`: exatamente o que o executor vai chamar. Com o efeito
   * declarado pelo Agente (ADR-0023), também `efeito: 'empresa_no_crm'`.
   */
  payload: {
    tipo: 'ferramenta'
    integration_id: string
    ferramenta: string
    argumentos: Record<string, unknown>
    efeito?: EfeitoDaChamada
  }
  acao: string
  impacto: string
  justificativa: string
  /** A Conta-alvo da chamada com o efeito: o banco só fecha o Envio ao CRM desta Conta. */
  targetAccountId?: string
}

/**
 * O efeito que o Agente declara numa chamada de conector (ADR-0023). `empresa_no_crm`: esta chamada leva a empresa ao
 * CRM no Envio ao CRM pelos Agentes; quando ela termina executada, o envio da Conta fecha como enviado.
 */
export type EfeitoDaChamada = 'empresa_no_crm'

/** A chamada liberada sem Aprovação que declarou o efeito, como vai a `finish_crm_handoff_by_tool_call`. */
export interface ChamadaComEfeito {
  integrationId: string
  ferramenta: string
  targetAccountId: string
  ok: boolean
  erro: string | null
}

/** O conteúdo de uma seção do Playbook, como o banco o guarda: o texto e as linhas da tabela (campo → texto). */
export interface ConteudoDoPlaybook {
  texto: string
  linhas: Record<string, string>[]
}

/** A nova versão de uma seção que o Agente propôs (CRM-09), como `agent_propose_playbook_revision` devolve. */
export interface RevisaoProposta {
  approvalId: string
  /** `pendente` (nasceu agora) ou `existente` (a mesma proposta já tinha sido feita nesta Execução). */
  outcome: 'pendente' | 'existente' | string
  /** O nome da seção no catálogo do Playbook. */
  secao: string
  /** A versão vigente de que a proposta partiu (0: a seção ainda não tinha versão). */
  versaoBase: number
}

/** Um passo de E-mail da Sequência proposta, como vai a `agent_propose_sequence`. */
export interface PassoProposto {
  esperaEmDias: number
  assunto: string
  corpo: string
}

/** A Sequência que o Rhetor propôs (cadencia-pela-ia 01), como `agent_propose_sequence` devolve. */
export interface SequenciaProposta {
  approvalId: string
  /** `pendente` (nasceu agora) ou `existente` (a mesma proposta já tinha sido feita nesta Execução). */
  outcome: 'pendente' | 'existente' | string
  /** O nome da Conta-alvo. */
  conta: string
}

/** O contrato com o banco das ferramentas (migration 20261001210000). Erros do banco chegam como ErroDoBanco. */
export interface BancoDasFerramentas {
  contexto(runId: string): Promise<ContextoDasFerramentas>
  lerContas(runId: string, a: { termo: string; soQuentes: boolean; limite: number }): Promise<unknown[]>
  pedirDescoberta(runId: string, agenteId: string, pedido: PedidoDeDescoberta): Promise<DescobertaPedida>
  proporEnvio(
    runId: string,
    agenteId: string,
    a: { targetAccountId: string; integrationId: string; justificativa: string },
  ): Promise<EnvioProposto>
  /** RPC `propose_agent_action` com a chamada de ferramenta (ADR-0022). Sem ela, `usar_conector` não é oferecida. */
  proporChamada?(runId: string, agenteId: string, a: ChamadaProposta): Promise<{ approvalId: string; outcome: string }>
  /**
   * RPC `finish_crm_handoff_by_tool_call` (ADR-0023): a chamada com o efeito que executou na hora fecha o Envio ao CRM
   * pelos Agentes desta Execução. Devolve 'enviado' ou 'falhou'. Sem ele, `usar_conector` não aceita o efeito.
   */
  fecharEnvioPelaChamada?(runId: string, agenteId: string, a: ChamadaComEfeito): Promise<string>
  /**
   * RPC `agent_propose_playbook_revision` (CRM-09): a nova versão de uma seção do Playbook vira uma Aprovação da categoria
   * revisão. Sem ela, `propor_mudanca_no_playbook` não é oferecida.
   */
  proporRevisao?(
    runId: string,
    agenteId: string,
    a: { secao: string; conteudo: ConteudoDoPlaybook; justificativa: string },
  ): Promise<RevisaoProposta>
  /**
   * RPC `agent_propose_sequence` (cadencia-pela-ia 01): a Sequência de E-mail proposta vira uma Aprovação da categoria
   * sequencia, que só o Vendedor responsável decide. Sem ela, `propor_sequencia` não é oferecida.
   */
  proporSequencia?(
    runId: string,
    agenteId: string,
    a: { targetAccountId: string; contatos: string[]; passos: PassoProposto[]; justificativa: string },
  ): Promise<SequenciaProposta>
  /**
   * RPC `agent_read_sequence_contacts`: os Contatos da Conta-alvo com o id e se podem entrar na Sequência. Só o Rhetor
   * lê, e só de uma Conta que não está arquivada.
   */
  contatosParaSequencia?(runId: string, agenteId: string, targetAccountId: string): Promise<unknown>
  /**
   * RPC `agent_suggest_althius_sequence_template` (ticket 07): sugere um template existente e acessível.
   * Sem ela, `sugerir_template_de_sequencia` não é oferecida. Não cria Sequência nem ativa envio.
   */
  sugerirTemplate?(
    runId: string,
    agenteId: string,
    targetAccountId: string,
  ): Promise<{ templateId: string | null; justificativa: string; outcome: string }>
  /**
   * RPC `agent_suggest_own_sequence_template` (ticket 08): sugere um template próprio que o solicitante pode ler.
   * Sem ela, `sugerir_template_proprio` não é oferecida. Não cria Sequência nem ativa envio.
   */
  sugerirTemplateProprio?(
    runId: string,
    agenteId: string,
    targetAccountId: string,
  ): Promise<{ templateId: string | null; justificativa: string; outcome: string }>
}

/** Um Sinal do catálogo como o Hermes o vê: sem fornecedor, actor nem custo em dólar. */
export interface SinalDoCatalogo {
  sinal: string
  icp: string
  nome: string
  /** disponivel | em_validacao | sem_fonte | fora_do_ar */
  estado: string
  /** conta: grava na Conta do Workspace; mercado: acontece no mercado todo e não vai para uma Conta. */
  escopo: string
  /** O porquê de não haver fonte, em palavras do produto. */
  motivo: string | null
}

export interface RespostaDaBusca {
  desfecho: string
  mensagem: string
  creditos: number
  novos: number
  repetidos: number
  empresasSemConta: number
  sinais: { conta: string; contaId: string; frase: string; quando: string; fonte: string; evidencia: string }[]
  /** Sinais de mercado (sem Conta), quando o tipo é de mercado. */
  mercado?: { frase: string; quando: string; fonte: string; evidencia: string; numeros?: Record<string, unknown> }[]
}

/** A busca de Sinais pelo motor de cascata (a Edge Function `signal-cascade`). Sem ela, `buscar_sinais` não é oferecida. */
export interface BuscaDeSinais {
  catalogo(): Promise<SinalDoCatalogo[]>
  buscar(a: {
    workspaceId: string
    userId: string
    sinal: string
    contas?: string[]
    criterios?: Record<string, unknown>
    tetoCreditos?: number
    chave: string
  }): Promise<RespostaDaBusca>
}

export interface DepsDasFerramentas {
  banco: BancoDasFerramentas
  /** A busca de Sinais por cascata; sem ela, `buscar_sinais` não é oferecida. */
  sinais?: BuscaDeSinais
  /** O Acesso às Integrações; sem ele, `consultar_integracao` não é oferecida. */
  acesso?: DepsDeAcesso
  /** O executor das Aprovações de envio, para a proposta que nasce liberada (Executar). Sem ele, ela espera a tela. */
  executarAprovacao?: (approvalId: string) => Promise<DesfechoDoEnvioAprovado>
  /** O executor das Aprovações de ferramenta, para a que nasce liberada. Sem ele, ela espera a decisão na Conversa. */
  executarChamada?: (approvalId: string) => Promise<DesfechoDaChamadaAprovada>
  log?: (campos: Record<string, unknown>) => void
  /** Prazo de cada chamada; passou, vira texto de falha para o Agente. */
  prazoMs?: number
}

/** Para onde o passo leva na tela. */
export type LinkDoPasso = { tipo: 'descobertas' } | { tipo: 'aprovacao'; id: string }

/** O passo como a tela o mostra (evento `ferramenta` de `append_agent_run_event`). */
export interface PassoDaFerramenta {
  descricao: string
  estado: 'concluida' | 'falhou' | 'aguardando'
  link?: LinkDoPasso
}

export interface ResultadoDaFerramentaDoAgente {
  /** O que volta ao modelo, como resultado da ferramenta. */
  paraOAgente: string
  erro: boolean
  passo: PassoDaFerramenta
}

export interface ChamadaDaFerramenta {
  runId: string
  agente: AgenteDoWorkspace
  entrada: Record<string, unknown>
  ctx: ContextoDasFerramentas
  deps: DepsDasFerramentas
}

export interface FerramentaDoAgente {
  nome: string
  descricao: string
  /** JSON Schema da entrada. */
  esquema: Record<string, unknown>
  /** As Especialidades que podem usar a ferramenta. */
  especialidades: readonly string[]
  /** A Integração (pela categoria) e a Permissão mínima que o Agente precisa ter; null quando não depende de Integração. */
  exige: { categoria?: string; permissao: Permissao } | null
  /** Se o Agente da vez pode usar agora (a Permissão dele nas Integrações ligadas, o Acesso disponível). */
  disponivel(agente: AgenteDoWorkspace, ctx: ContextoDasFerramentas, deps: DepsDasFerramentas): boolean
  /** A descrição para o modelo, com o que vale para este Agente (ex.: as Integrações que ele pode usar). */
  descricaoPara?(agente: AgenteDoWorkspace, ctx: ContextoDasFerramentas): string
  executar(chamada: ChamadaDaFerramenta): Promise<ResultadoDaFerramentaDoAgente>
}

const RANGO: Record<Permissao, number> = { ler: 1, propor: 2, executar: 3 }
const NOME_DA_PERMISSAO: Record<Permissao, string> = { ler: 'Ler', propor: 'Propor', executar: 'Executar' }
/** Chamadas de ferramenta por pedido, somando todos os Agentes. */
export const MAX_CHAMADAS_POR_PEDIDO = 6
const PRAZO_MS = 90_000
const TAMANHO_DO_RESULTADO = 6000
const ESPECIALIDADES_DO_ENVIO = ['scopus', 'ethos', 'rhetor'] as const

function permissoesDo(agente: AgenteDoWorkspace, ctx: ContextoDasFerramentas, minima: Permissao, categoria?: string) {
  return ctx.permissoes.filter((p) =>
    p.agentId === agente.id && RANGO[p.permission] >= RANGO[minima] && (!categoria || p.category === categoria)
  )
}

function textos(valor: unknown, maximo = 20): string[] {
  if (!Array.isArray(valor)) return []
  return valor.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim().slice(0, 120))
    .slice(0, maximo)
}

function texto(valor: unknown, maximo = 500): string {
  return typeof valor === 'string' ? valor.trim().slice(0, maximo) : ''
}

function cortar(dado: unknown, tamanho = TAMANHO_DO_RESULTADO): string {
  const json = JSON.stringify(dado ?? null)
  return json.length > tamanho ? `${json.slice(0, tamanho)}…[cortado]` : json
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function falhou(descricao: string, paraOAgente: string): ResultadoDaFerramentaDoAgente {
  return { erro: true, paraOAgente, passo: { descricao, estado: 'falhou' } }
}

/** O motivo do banco em palavras para o Agente, sem detalhe interno. */
function motivoDoBanco(erro: unknown): string {
  if (erro instanceof ErroDoBanco) {
    const m = erro.message
    if (m.startsWith('sequence: ')) return motivoDaSequencia(m)
    if (m.includes('only the responsible seller')) {
      return 'Só o Vendedor responsável pela Conta-alvo a envia ao CRM, e quem fez este pedido não é o responsável. Diga isso ao usuário.'
    }
    if (m.includes('may only read')) return 'Você só tem a Permissão Ler nesta Integração: não pode propor esta ação.'
    if (m.includes('already sent')) return 'Esta Conta-alvo já foi enviada ao CRM. Depois do envio, o CRM é a fonte da verdade.'
    if (m.includes('access not connected')) {
      return 'Quem fez este pedido não conectou a própria conta deste CRM em Conexões. Peça para conectar.'
    }
    if (m.includes('not enabled')) return 'Esta Integração não está ligada no Workspace.'
    if (m.includes('not a CRM')) return 'Esta Integração não é um CRM.'
    if (m.includes('target account not found')) return 'Esta Conta-alvo não existe no Workspace (use o id que ler_contas_e_sinais devolve).'
    if (m.includes('ICP specialist')) return 'Só o Scopus pede busca de contas pelo ICP.'
    if (m.includes('tool is blocked')) return 'O Administrador bloqueou esta ferramenta neste Workspace. Não a use.'
    if (m.includes('does not propose this playbook section')) return 'Você não propõe mudanças nesta seção do Playbook.'
    if (m.includes('does not change the playbook section')) {
      return 'O conteúdo proposto é igual à versão vigente da seção: nada mudaria. Diga isso ao usuário.'
    }
    if (m.includes('playbook content too long')) return 'O conteúdo passou do tamanho máximo de uma seção do Playbook.'
    if (m.includes('unknown playbook section')) return 'Esta seção do Playbook não existe.'
    if (m.includes('active workspace membership required')) return 'Quem fez o pedido não participa mais do Workspace.'
    if (m.includes('invalid')) return 'A entrada da ferramenta é inválida.'
  }
  return 'A ferramenta falhou agora. Não use dados dela e siga com o que você tem.'
}

/** As recusas de `agent_propose_sequence`, em palavras para o Rhetor. */
function motivoDaSequencia(m: string): string {
  if (m.includes('not the responsible seller')) {
    return 'Só o Vendedor responsável pela Conta-alvo pede a Sequência dela, e quem fez este pedido não é o responsável ' +
      '(ADR-0009). Diga isso ao usuário e não proponha de novo.'
  }
  if (m.includes('sequence in progress')) {
    return 'Esta Conta-alvo já tem uma Sequência em andamento: cada Conta tem no máximo uma. Diga isso ao usuário.'
  }
  if (m.includes('not linked')) {
    return 'Um dos Contatos não é desta Conta-alvo. Chame propor_sequencia sem contatos para ver os Contatos dela.'
  }
  if (m.includes('no e-mail')) return 'Um dos Contatos não tem e-mail. Tire-o da proposta.'
  if (m.includes('suppressed')) return 'Um dos Contatos se descadastrou e não recebe mais e-mails do Workspace. Tire-o da proposta.'
  if (m.includes('another active sequence')) return 'Um dos Contatos já está em outra Sequência ativa ou pausada. Tire-o da proposta.'
  const variavel = m.match(/unknown variable: (.+)$/)
  if (variavel) {
    return `A variável {{${variavel[1].split(', ').join('}}, {{')}}} não existe no envio. Use só: ${VARIAVEIS_DO_ENVIO}.`
  }
  if (m.includes('only e-mail')) return 'Por enquanto a Sequência proposta é só de E-mail: LinkedIn e WhatsApp ficam de fora.'
  if (m.includes('steps')) return 'A Sequência tem de 1 a 8 passos de E-mail.'
  if (m.includes('contacts')) return 'A Sequência tem de 1 a 5 Contatos.'
  if (m.includes('step wait')) return 'A espera de cada passo é um número inteiro de dias, de 0 a 60.'
  if (m.includes('step text')) return 'Cada passo precisa de assunto (até 200 caracteres) e corpo (até 5000).'
  if (m.includes('cadence specialist')) return 'Só o Rhetor propõe Sequências.'
  return 'A proposta foi recusada.'
}

const LER_CONTAS: FerramentaDoAgente = {
  nome: 'ler_contas_e_sinais',
  descricao:
    'Lê as Contas-alvo ativas do Workspace (até 20), as com Sinal ativo primeiro: id, nome, domínio, segmento, Estágio ' +
    'de prospecção, Sinais ativos e Contatos (nome e cargo). Use o id da Conta nas outras ferramentas.',
  esquema: {
    type: 'object',
    properties: {
      termo: { type: 'string', description: 'Parte do nome ou do domínio. Vazio lista todas.' },
      so_quentes: { type: 'boolean', description: 'Só as Contas com Sinal ativo.' },
      limite: { type: 'integer', description: 'De 1 a 20.' },
    },
    additionalProperties: false,
  },
  especialidades: ['scopus', 'ethos', 'rhetor', 'oraculum'],
  exige: null,
  disponivel: () => true,
  async executar({ runId, agente, entrada, deps }) {
    const termo = texto(entrada.termo, 200)
    const soQuentes = entrada.so_quentes === true
    const limite = Number.isInteger(entrada.limite) ? Math.min(Math.max(entrada.limite as number, 1), 20) : 10
    const alvo = soQuentes ? 'as Contas-alvo com Sinal ativo' : termo ? `as Contas-alvo: "${termo}"` : 'as Contas-alvo'
    try {
      const contas = await deps.banco.lerContas(runId, { termo, soQuentes, limite })
      return {
        erro: false,
        paraOAgente: cortar(contas),
        passo: { descricao: `${agente.name} leu ${alvo} (${plural(contas.length, 'Conta', 'Contas')})`, estado: 'concluida' },
      }
    } catch (erro) {
      return falhou(`${agente.name} tentou ler ${alvo}`, `A leitura falhou. ${motivoDoBanco(erro)}`)
    }
  },
}

const BUSCAR_PELO_ICP: FerramentaDoAgente = {
  nome: 'buscar_contas_pelo_icp',
  descricao:
    'Pede uma busca de empresas que encaixam no ICP do Playbook. A busca NÃO roda na hora e não cria Conta-alvo: ela ' +
    'espera uma pessoa confirmar na Caixa de Descobertas, que mostra o custo em Créditos; as empresas achadas entram ' +
    'na Caixa como candidatas. Informe ao menos um setor ou uma palavra-chave (ou, na Receita, um CNAE de 7 dígitos).',
  esquema: {
    type: 'object',
    properties: {
      fonte: { type: 'string', enum: ['linkedin', 'receita'] },
      setores: { type: 'array', items: { type: 'string' } },
      palavras_chave: { type: 'array', items: { type: 'string' } },
      portes: { type: 'array', items: { type: 'string' }, description: 'Faixas do LinkedIn ("51-200") ou portes da Receita.' },
      regioes: { type: 'array', items: { type: 'string' }, description: 'Siglas de estado, cidades ou "Brasil".' },
      cnaes: { type: 'array', items: { type: 'string' } },
      max_empresas: { type: 'integer', description: 'De 1 a 100 (padrão 50).' },
      motivo: { type: 'string', description: 'Por que esta busca, em uma frase, para a pessoa que vai confirmar.' },
    },
    additionalProperties: false,
  },
  especialidades: ['scopus'],
  exige: null,
  disponivel: () => true,
  async executar({ runId, agente, entrada, deps }) {
    const criterios = {
      fonte: entrada.fonte === 'receita' ? 'receita' : 'linkedin',
      setores: textos(entrada.setores),
      palavrasChave: textos(entrada.palavras_chave),
      portes: textos(entrada.portes),
      regioes: textos(entrada.regioes),
      cnaes: textos(entrada.cnaes),
    }
    const basta = criterios.fonte === 'receita'
      ? criterios.cnaes.length > 0
      : criterios.setores.length > 0 || criterios.palavrasChave.length > 0
    if (!basta) {
      return falhou(
        `${agente.name} não conseguiu pedir a busca de contas pelo ICP`,
        'Informe ao menos um setor ou uma palavra-chave (ou um CNAE de 7 dígitos, na Receita), tirados do ICP do Playbook.',
      )
    }
    const maxResults = Number.isInteger(entrada.max_empresas) ? Math.min(Math.max(entrada.max_empresas as number, 1), 100) : 50
    try {
      const r = await deps.banco.pedirDescoberta(runId, agente.id, {
        criterios,
        maxResults,
        motivo: texto(entrada.motivo) || null,
      })
      const caixa = r.novasNaCaixa > 0 ? `; já há ${plural(r.novasNaCaixa, 'candidata', 'candidatas')} na Caixa de Descobertas` : ''
      const descricao = r.outcome === 'existente'
        ? `${agente.name} lembrou a busca de contas pelo ICP que espera confirmação na Caixa de Descobertas${caixa}`
        : `${agente.name} pediu uma busca de contas pelo ICP (até ${maxResults} empresas, ${r.creditos} Créditos): confirme na Caixa de Descobertas${caixa}`
      const saldo = r.saldo < r.creditos
        ? ` O saldo de Créditos (${r.saldo}) não cobre a busca (${r.creditos}): avise que é preciso comprar Créditos antes de confirmar.`
        : ''
      const actor = r.estadoDoActor === 'available' ? '' : ' A busca de empresas ainda não está liberada no Workspace (a fonte de dados está em teste ou fora do ar).'
      return {
        erro: false,
        paraOAgente:
          `Busca pedida, aguardando a confirmação de uma pessoa na Caixa de Descobertas (custa ${r.creditos} Créditos). ` +
          `Candidatas novas já na Caixa: ${r.novasNaCaixa}. Nenhuma Conta-alvo foi criada.${saldo}${actor}`,
        passo: { descricao, estado: 'aguardando', link: { tipo: 'descobertas' } },
      }
    } catch (erro) {
      return falhou(`${agente.name} tentou pedir uma busca de contas pelo ICP`, `O pedido falhou. ${motivoDoBanco(erro)}`)
    }
  },
}

/** As ferramentas de leitura que se sabe de antemão (API REST do perfil); nas de MCP, o Agente pede a lista. */
function leiturasConhecidas(integrationId: string): string[] {
  const rest = perfilDaIntegracao(integrationId)?.rest
  return rest ? ferramentasRest(rest).filter((f) => !f.escreve).map((f) => f.nome) : []
}

const CONSULTAR_INTEGRACAO: FerramentaDoAgente = {
  nome: 'consultar_integracao',
  descricao:
    'Lê dados de um CRM ou fonte conectado (só leitura), pela conta de quem fez o pedido. Passe a Integração, a ' +
    'ferramenta de leitura e os argumentos dela. Use ferramenta "listar" para ver as ferramentas de leitura disponíveis.',
  esquema: {
    type: 'object',
    properties: {
      integracao: { type: 'string', description: 'O id da Integração (ex.: hubspot).' },
      ferramenta: { type: 'string', description: 'O nome da ferramenta de leitura, ou "listar".' },
      argumentos: { type: 'object', description: 'Os argumentos da ferramenta.' },
    },
    required: ['integracao', 'ferramenta'],
    additionalProperties: false,
  },
  especialidades: ['scopus', 'ethos', 'rhetor', 'oraculum'],
  exige: { permissao: 'ler' },
  disponivel: (agente, ctx, deps) =>
    !!deps.acesso && permissoesDo(agente, ctx, 'ler').some((p) => perfilDaIntegracao(p.integrationId)),
  descricaoPara(agente, ctx) {
    const linhas = permissoesDo(agente, ctx, 'ler')
      .filter((p) => perfilDaIntegracao(p.integrationId))
      .map((p) => {
        const conhecidas = leiturasConhecidas(p.integrationId)
        return `- ${p.integrationId} (${p.name})${conhecidas.length ? `: ${conhecidas.join(', ')}` : ''}`
      })
    return `${CONSULTAR_INTEGRACAO.descricao}\nIntegrações que você pode ler:\n${linhas.join('\n')}`
  },
  async executar({ agente, entrada, ctx, deps }) {
    const integrationId = texto(entrada.integracao, 40)
    const ferramenta = texto(entrada.ferramenta, 100)
    const permissao = permissoesDo(agente, ctx, 'ler').find((p) => p.integrationId === integrationId)
    const nome = permissao?.name ?? integrationId
    if (!permissao || !deps.acesso) {
      return falhou(`${agente.name} tentou consultar ${nome}`, 'Você não tem Permissão nesta Integração, ou ela não está ligada.')
    }
    const pedido = { workspaceId: ctx.workspaceId, userId: ctx.requestedBy, integrationId }
    if (ferramenta === 'listar') {
      const lista = await listarFerramentas(deps.acesso, pedido)
      if (!lista.ok) return falhou(`${agente.name} tentou consultar o ${nome}`, lista.erro.mensagem)
      const leitura = lista.valor.filter((f) => !f.escreve).map((f) => ({ nome: f.nome, descricao: f.descricao, esquema: f.esquema }))
      return {
        erro: false,
        paraOAgente: cortar(leitura),
        passo: { descricao: `${agente.name} viu o que dá para ler no ${nome}`, estado: 'concluida' },
      }
    }
    const argumentos = entrada.argumentos && typeof entrada.argumentos === 'object' && !Array.isArray(entrada.argumentos)
      ? entrada.argumentos as Record<string, unknown>
      : {}
    const r = await chamarFerramenta(deps.acesso, { ...pedido, ferramenta, argumentos, agenteId: agente.id, somenteLeitura: true })
    if (!r.ok) return falhou(`${agente.name} tentou consultar o ${nome} (${ferramenta})`, r.erro.mensagem)
    if (r.valor.erro) {
      return falhou(`${agente.name} consultou o ${nome} (${ferramenta}), que recusou`, `O ${nome} recusou: ${cortar(r.valor.conteudo)}`)
    }
    return {
      erro: false,
      paraOAgente: cortar(r.valor.estruturado ?? r.valor.conteudo),
      passo: { descricao: `${agente.name} consultou o ${nome} (${ferramenta})`, estado: 'concluida' },
    }
  },
}

const PROPOR_ENVIO: FerramentaDoAgente = {
  nome: 'propor_envio_ao_crm',
  descricao:
    'Propõe Enviar ao CRM uma Conta-alvo (a empresa, os Contatos e uma nota com os Sinais e a abordagem). A Althius ' +
    'monta o conteúdo; você escolhe só a Conta (pelo id de ler_contas_e_sinais), o CRM e a justificativa. Com a ' +
    'Permissão Propor, nasce uma Aprovação que um Administrador decide; com Executar, o envio sai na hora. Só o Vendedor ' +
    'responsável pela Conta (quem fez o pedido) a envia.',
  esquema: {
    type: 'object',
    properties: {
      conta_id: { type: 'string', description: 'O id da Conta-alvo.' },
      crm: { type: 'string', description: 'O id do CRM (ex.: hubspot, pipedrive, rd-station).' },
      justificativa: { type: 'string', description: 'Por que enviar agora, em uma ou duas frases (Sinais, resposta…).' },
    },
    required: ['conta_id', 'crm'],
    additionalProperties: false,
  },
  especialidades: ESPECIALIDADES_DO_ENVIO,
  exige: { categoria: 'CRM', permissao: 'propor' },
  disponivel: (agente, ctx) => permissoesDo(agente, ctx, 'propor', 'CRM').length > 0,
  descricaoPara(agente, ctx) {
    const crms = permissoesDo(agente, ctx, 'propor', 'CRM').map((p) =>
      `- ${p.integrationId} (${p.name}): ${p.permission === 'executar' ? 'Executar, envia na hora' : 'Propor, pede Aprovação'}`
    )
    return `${PROPOR_ENVIO.descricao}\nCRMs em que você pode propor:\n${crms.join('\n')}`
  },
  async executar({ runId, agente, entrada, ctx, deps }) {
    const targetAccountId = texto(entrada.conta_id, 64)
    const integrationId = texto(entrada.crm, 40)
    const permissao = permissoesDo(agente, ctx, 'propor', 'CRM').find((p) => p.integrationId === integrationId)
    if (!permissao) {
      return falhou(`${agente.name} tentou propor um envio ao CRM`, 'Você não tem a Permissão Propor ou Executar neste CRM.')
    }
    if (!/^[0-9a-f-]{36}$/i.test(targetAccountId)) {
      return falhou(`${agente.name} tentou propor um envio ao ${permissao.name}`, 'Informe o id da Conta-alvo que ler_contas_e_sinais devolve.')
    }
    let proposta: EnvioProposto
    try {
      proposta = await deps.banco.proporEnvio(runId, agente.id, {
        targetAccountId,
        integrationId,
        justificativa: texto(entrada.justificativa, 2000),
      })
    } catch (erro) {
      return falhou(`${agente.name} tentou propor enviar uma Conta ao ${permissao.name}`, `A proposta falhou. ${motivoDoBanco(erro)}`)
    }
    const { conta, crm, approvalId } = proposta
    const link: LinkDoPasso = { tipo: 'aprovacao', id: approvalId }
    if (proposta.outcome === 'existente') {
      return {
        erro: false,
        paraOAgente: `Já existe uma Aprovação aberta para enviar a ${conta} ao CRM. Nada novo foi criado.`,
        passo: { descricao: `${agente.name} viu que já há uma Aprovação aberta para enviar a ${conta} ao CRM`, estado: 'aguardando', link },
      }
    }
    if (proposta.outcome !== 'liberada') {
      return {
        erro: false,
        paraOAgente:
          `Aprovação criada: enviar a ${conta} ao ${crm} espera a decisão de um Administrador na fila de Aprovações. ` +
          'Nada foi enviado ainda. Termine dizendo que a próxima ação depende da Aprovação.',
        passo: { descricao: `${agente.name} propôs enviar a ${conta} ao ${crm} — aguardando Aprovação`, estado: 'aguardando', link },
      }
    }
    // Executar: a Aprovação nasceu liberada pela Permissão, e o executor envia agora.
    if (!deps.executarAprovacao) {
      return {
        erro: false,
        paraOAgente: `O envio da ${conta} ao ${crm} foi liberado pela sua Permissão Executar e sai pela fila de Aprovações.`,
        passo: { descricao: `${agente.name} liberou o envio da ${conta} ao ${crm}`, estado: 'aguardando', link },
      }
    }
    let desfecho: DesfechoDoEnvioAprovado
    try {
      desfecho = await deps.executarAprovacao(approvalId)
    } catch (erro) {
      deps.log?.({ type: 'agent_tools', ferramenta: 'propor_envio_ao_crm', outcome: 'executor_failed', message: String(erro) })
      return { ...falhou(`${agente.name} tentou enviar a ${conta} ao ${crm}`, 'O envio falhou agora. Diga ao usuário.'), passo: { descricao: `${agente.name} tentou enviar a ${conta} ao ${crm}`, estado: 'falhou', link } }
    }
    if (desfecho.status === 'enviado') {
      return {
        erro: false,
        paraOAgente: `${desfecho.mensagem} A Conta foi para o estágio No CRM; depois do envio, o ${crm} é a fonte da verdade.`,
        passo: { descricao: `${agente.name} enviou a ${conta} ao ${crm}`, estado: 'concluida', link },
      }
    }
    return {
      erro: true,
      paraOAgente: `O envio da ${conta} ao ${crm} não saiu: ${desfecho.mensagem}`,
      passo: { descricao: `${agente.name} tentou enviar a ${conta} ao ${crm}: ${desfecho.mensagem}`, estado: 'falhou', link },
    }
  },
}

const TAMANHO_DA_LISTA = 12_000
const TETO_DOS_ARGUMENTOS = 50_000

/** As Integrações em que o Agente tem Permissão (Ler ou mais) e que a Althius sabe conectar. */
function conectoresDo(agente: AgenteDoWorkspace, ctx: ContextoDasFerramentas) {
  return permissoesDo(agente, ctx, 'ler').filter((p) => perfilDaIntegracao(p.integrationId))
}

const MOTIVO_DA_RECUSA = {
  bloqueada: 'O Administrador bloqueou esta ferramenta neste Workspace. Não a use.',
  so_ler: 'Você só tem a Permissão Ler neste conector: não escreve nem pede Aprovação.',
  sem_permissao: 'Você não tem Permissão neste conector.',
} as const

/**
 * Como enviar uma Conta ao CRM pelas ferramentas do próprio conector (ADR-0023), igual para qualquer CRM: a Althius não
 * sabe o nome das ferramentas de cada app; o Agente as lê no "listar" e declara o efeito na chamada que leva a empresa.
 */
export const COMO_ENVIAR_AO_CRM =
  'Enviar ao CRM (quando o pedido traz o pacote de uma Conta-alvo e o conta_id): 1) liste as ferramentas do CRM; ' +
  '2) procure a empresa antes de criar (pelo domínio ou pelo nome), para não duplicar; 3) crie a empresa e passe ' +
  'efeito "empresa_no_crm" e o conta_id nessa chamada (se a empresa já existe no CRM, declare o efeito na primeira ' +
  'escrita que a usa, como associar um Contato ou criar a nota); 4) crie os Contatos, associe-os à empresa e crie a nota ' +
  'com o texto do pacote. Não declare o efeito em nenhuma outra chamada. Quando uma escrita pede Aprovação, proponha a ' +
  'da empresa primeiro e diga que o resto continua depois da decisão na Conversa.'

const UUID_DA_CONTA = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i

const USAR_CONECTOR: FerramentaDoAgente = {
  nome: 'usar_conector',
  descricao:
    'Usa as ferramentas de um conector (CRM, agenda, planilha, anúncios…) com a conta de quem fez o pedido. Primeiro ' +
    'passe ferramenta "listar" para ver o que o conector oferece: nome, descrição, esquema dos argumentos, se escreve e ' +
    'o que acontece ao usar ("executa" ou "pede Aprovação"). Depois passe o nome da ferramenta e os argumentos. Uma ' +
    'ferramenta que pede Aprovação não roda na hora: nasce uma Aprovação que um Administrador decide na Conversa.',
  esquema: {
    type: 'object',
    properties: {
      integracao: { type: 'string', description: 'O id do conector (ex.: notion).' },
      ferramenta: { type: 'string', description: 'O nome da ferramenta, ou "listar".' },
      argumentos: { type: 'object', description: 'Os argumentos, como o esquema da ferramenta pede.' },
      justificativa: { type: 'string', description: 'Por que usar agora, em uma frase, para quem decide a Aprovação.' },
      efeito: {
        type: 'string',
        enum: ['empresa_no_crm'],
        description: 'Só no Enviar ao CRM: "empresa_no_crm" na chamada que leva a empresa ao CRM (com conta_id).',
      },
      conta_id: { type: 'string', description: 'O id da Conta-alvo do Enviar ao CRM, junto com o efeito.' },
    },
    required: ['integracao', 'ferramenta'],
    additionalProperties: false,
  },
  especialidades: ['scopus', 'ethos', 'rhetor', 'oraculum'],
  exige: { permissao: 'ler' },
  disponivel: (agente, ctx, deps) =>
    !!deps.acesso?.banco.regrasDasFerramentas && !!deps.banco.proporChamada && conectoresDo(agente, ctx).length > 0,
  descricaoPara(agente, ctx) {
    const conectores = conectoresDo(agente, ctx)
    const linhas = conectores.map((p) => `- ${p.integrationId} (${p.name}): ${NOME_DA_PERMISSAO[p.permission]}`)
    const crm = conectores.some((p) => p.category === 'CRM' && RANGO[p.permission] >= RANGO.propor)
    return `${USAR_CONECTOR.descricao}\nConectores que você pode usar (com a sua Permissão):\n${linhas.join('\n')}` +
      (crm ? `\n${COMO_ENVIAR_AO_CRM}` : '')
  },
  async executar({ runId, agente, entrada, ctx, deps }) {
    const integrationId = texto(entrada.integracao, 40)
    const nomeDaFerramenta = texto(entrada.ferramenta, 200)
    const permissao = conectoresDo(agente, ctx).find((p) => p.integrationId === integrationId)
    const nome = permissao?.name ?? integrationId
    const acesso = deps.acesso
    const lerRegras = acesso?.banco.regrasDasFerramentas
    if (!permissao || !acesso || !lerRegras || !deps.banco.proporChamada) {
      return falhou(`${agente.name} tentou usar o conector ${nome}`, 'Você não tem Permissão neste conector, ou ele não está ligado.')
    }
    const proporChamada = deps.banco.proporChamada
    const pedido = { workspaceId: ctx.workspaceId, userId: ctx.requestedBy, integrationId }
    const lista = await listarFerramentas(acesso, pedido)
    if (!lista.ok) return falhou(`${agente.name} tentou usar o ${nome}`, lista.erro.mensagem)
    let regras
    try {
      regras = await lerRegras({ workspaceId: ctx.workspaceId, integrationId })
    } catch {
      return falhou(`${agente.name} tentou usar o ${nome}`, 'As regras deste conector não puderam ser lidas agora. Siga sem ele.')
    }
    const decisaoDe = (f: { nome: string; escreve: boolean }) =>
      decidirChamada({ permissao: permissao.permission, escreve: f.escreve, regra: regraVigente(regras, f) })

    if (nomeDaFerramenta === 'listar') {
      const usaveis = lista.valor
        .map((f) => ({ f, decisao: decisaoDe(f) }))
        .filter(({ decisao }) => decisao.tipo !== 'negada')
        .map(({ f, decisao }) => ({
          nome: f.nome,
          descricao: f.descricao.slice(0, 300),
          escreve: f.escreve,
          uso: decisao.tipo === 'executa' ? 'executa' : 'pede Aprovação',
          esquema: f.esquema,
        }))
      return {
        erro: false,
        paraOAgente: cortar(usaveis, TAMANHO_DA_LISTA),
        passo: { descricao: `${agente.name} viu as ferramentas do ${nome}`, estado: 'concluida' },
      }
    }

    const ferramenta = lista.valor.find((f) => f.nome === nomeDaFerramenta)
    if (!ferramenta) {
      return falhou(
        `${agente.name} pediu ao ${nome} uma ferramenta que ele não tem`,
        `O ${nome} não tem a ferramenta "${nomeDaFerramenta}". Use ferramenta "listar" para ver as que existem.`,
      )
    }
    const bruto = entrada.argumentos
    const argumentos = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto as Record<string, unknown> : {}
    if (JSON.stringify(argumentos).length > TETO_DOS_ARGUMENTOS) {
      return falhou(`${agente.name} tentou usar ${ferramenta.nome} no ${nome}`, 'Os argumentos são grandes demais.')
    }
    const decisao = decisaoDe(ferramenta)
    if (decisao.tipo === 'negada') {
      return falhou(`${agente.name} não pôde usar ${ferramenta.nome} no ${nome}`, MOTIVO_DA_RECUSA[decisao.motivo])
    }

    // O efeito declarado (ADR-0023): só `empresa_no_crm`, só numa escrita, com a Conta, e só onde o banco sabe fechar.
    let efeito: { efeito: EfeitoDaChamada; targetAccountId: string } | null = null
    if (entrada.efeito !== undefined && entrada.efeito !== null && entrada.efeito !== '') {
      const contaId = texto(entrada.conta_id, 64)
      const recusar = (motivo: string) => falhou(`${agente.name} tentou usar ${ferramenta.nome} no ${nome}`, motivo)
      if (entrada.efeito !== 'empresa_no_crm') return recusar('O único efeito que existe é "empresa_no_crm".')
      if (!ferramenta.escreve) {
        return recusar('O efeito "empresa_no_crm" vale só para uma ferramenta que escreve no CRM. Use a leitura sem o efeito.')
      }
      if (!UUID_DA_CONTA.test(contaId)) return recusar('Com o efeito, passe o conta_id que o pedido traz.')
      if (!deps.banco.fecharEnvioPelaChamada) return recusar('O Enviar ao CRM pelos Agentes não está disponível agora.')
      efeito = { efeito: 'empresa_no_crm', targetAccountId: contaId }
    }

    if (decisao.tipo === 'executa') {
      const r = await chamarFerramenta(acesso, { ...pedido, ferramenta: ferramenta.nome, argumentos, agenteId: agente.id })
      // A chamada com o efeito fecha o Envio ao CRM desta Execução: deu certo, enviado; falhou, falhou (o banco confere).
      const fecharEnvio = async (ok: boolean, erro: string | null): Promise<string | null> => {
        if (!efeito) return null
        try {
          return await deps.banco.fecharEnvioPelaChamada!(runId, agente.id, {
            integrationId,
            ferramenta: ferramenta.nome,
            targetAccountId: efeito.targetAccountId,
            ok,
            erro,
          })
        } catch (falha) {
          deps.log?.({
            type: 'agent_tools',
            ferramenta: 'usar_conector',
            outcome: 'crm_handoff_not_closed',
            code: falha instanceof ErroDoBanco ? falha.codigo : 'desconhecido',
          })
          return null
        }
      }
      if (!r.ok) {
        await fecharEnvio(false, r.erro.mensagem)
        return falhou(`${agente.name} tentou usar ${ferramenta.nome} no ${nome}`, r.erro.mensagem)
      }
      if (r.valor.erro) {
        await fecharEnvio(false, `O ${nome} recusou ${ferramenta.nome}.`)
        return falhou(`${agente.name} usou ${ferramenta.nome} no ${nome}, que recusou`, `O ${nome} recusou: ${cortar(r.valor.conteudo)}`)
      }
      const envio = await fecharEnvio(true, null)
      const resultado = cortar(r.valor.estruturado ?? r.valor.conteudo)
      return {
        erro: false,
        paraOAgente: efeito ? `${resultado}\n${avisoDoEnvio(envio === 'enviado', nome)}` : resultado,
        passo: { descricao: `${agente.name} usou ${ferramenta.nome} no ${nome}`, estado: 'concluida' },
      }
    }

    // Pede Aprovação: nasce com a chamada exata, e só ela sai depois da decisão.
    let proposta: { approvalId: string; outcome: string }
    try {
      proposta = await proporChamada(runId, agente.id, {
        integrationId,
        payload: {
          tipo: 'ferramenta',
          integration_id: integrationId,
          ferramenta: ferramenta.nome,
          argumentos,
          ...(efeito ? { efeito: efeito.efeito } : {}),
        },
        ...(efeito ? { targetAccountId: efeito.targetAccountId } : {}),
        acao: `Usar ${ferramenta.nome} no ${nome}`.slice(0, 300),
        impacto: `${ferramenta.escreve ? 'Escreve ou gasta' : 'Lê'} no ${nome} com a conta de quem fez o pedido. ` +
          `Argumentos: ${cortar(argumentos, 600)}` +
          (efeito ? ` Leva a empresa ao ${nome}: executada, a Conta vai para No CRM.` : ''),
        justificativa: texto(entrada.justificativa, 2000),
      })
    } catch (erro) {
      return falhou(`${agente.name} tentou propor usar ${ferramenta.nome} no ${nome}`, `A proposta falhou. ${motivoDoBanco(erro)}`)
    }
    const link: LinkDoPasso = { tipo: 'aprovacao', id: proposta.approvalId }
    if (proposta.outcome !== 'liberada' || !deps.executarChamada) {
      return {
        erro: false,
        paraOAgente:
          `Aprovação criada: usar ${ferramenta.nome} no ${nome} espera a decisão de um Administrador na Conversa. ` +
          'Nada foi feito ainda. Termine dizendo que a próxima ação depende da Aprovação.',
        passo: { descricao: `${agente.name} propôs usar ${ferramenta.nome} no ${nome} — aguardando Aprovação`, estado: 'aguardando', link },
      }
    }
    let desfecho: DesfechoDaChamadaAprovada
    try {
      desfecho = await deps.executarChamada(proposta.approvalId)
    } catch (erro) {
      deps.log?.({ type: 'agent_tools', ferramenta: 'usar_conector', outcome: 'executor_failed', message: String(erro) })
      return {
        erro: true,
        paraOAgente: 'A chamada falhou agora. Diga ao usuário.',
        passo: { descricao: `${agente.name} tentou usar ${ferramenta.nome} no ${nome}`, estado: 'falhou', link },
      }
    }
    if (desfecho.status === 'executada') {
      return {
        erro: false,
        paraOAgente: efeito ? `${desfecho.resultado}\n${avisoDoEnvio(desfecho.envioAoCrm === 'enviado', nome)}` : desfecho.resultado,
        passo: { descricao: `${agente.name} usou ${ferramenta.nome} no ${nome}`, estado: 'concluida', link },
      }
    }
    return {
      erro: true,
      paraOAgente: `A chamada de ${ferramenta.nome} no ${nome} não saiu: ${desfecho.mensagem}`,
      passo: { descricao: `${agente.name} tentou usar ${ferramenta.nome} no ${nome}: ${desfecho.mensagem}`, estado: 'falhou', link },
    }
  },
}

/** O que o Agente lê depois da chamada com o efeito: se a Conta foi para No CRM. */
function avisoDoEnvio(enviado: boolean, crm: string): string {
  return enviado
    ? `A empresa está no ${crm}: o Envio ao CRM desta Conta foi registrado e ela foi para No CRM. Siga com os Contatos e a nota.`
    : 'A chamada saiu, mas a Althius não registrou o Envio ao CRM desta Conta (o pedido não é um Enviar ao CRM, ou ele já fechou). Diga isso ao usuário.'
}

/**
 * As seções do Playbook que cada Especialidade propõe: as dela em `playbook_specialty_sections`, só no Scopus e no Ethos
 * (ADR-0010; a Empresa não é de ninguém). O banco confere de novo. `colunas` são as da tabela da seção, as mesmas da tela
 * (`regras-playbook.ts`), para o Agente escrever as linhas nos campos que a tela mostra.
 */
const SECOES_QUE_PROPOE: Record<string, readonly { id: string; nome: string; doNome: string; colunas?: readonly string[] }[]> = {
  scopus: [
    { id: 'icp', nome: 'ICP', doNome: 'do ICP' },
    { id: 'mercado', nome: 'Mercado', doNome: 'do Mercado', colunas: ['segmento', 'tam', 'sam', 'som', 'complexidade'] },
  ],
  ethos: [
    { id: 'personas', nome: 'Personas', doNome: 'das Personas', colunas: ['papel', 'cargo', 'dores', 'objecoes', 'gatilhos'] },
    {
      id: 'processo_de_compra',
      nome: 'Processo de compra',
      doNome: 'do Processo de compra',
      colunas: ['etapa', 'quem_decide', 'criterio', 'prazo'],
    },
    {
      id: 'dor_e_percepcao',
      nome: 'Dor e percepção',
      doNome: 'da Dor e percepção',
      colunas: ['dor', 'urgencia', 'consciencia', 'gravidade', 'frequencia', 'pergunta'],
    },
    { id: 'objecoes', nome: 'Objeções', doNome: 'das Objeções', colunas: ['objecao', 'resposta', 'prova'] },
  ],
}

const TETO_DO_CONTEUDO = 100_000
const MAX_LINHAS = 200

/** O conteúdo como o Agente o mandou, só com o que o Playbook guarda: texto e linhas de campos de texto. */
function conteudoProposto(bruto: unknown): ConteudoDoPlaybook {
  const objeto = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto as Record<string, unknown> : {}
  const linhas = Array.isArray(objeto.linhas) ? objeto.linhas : []
  return {
    texto: typeof objeto.texto === 'string' ? objeto.texto.trim() : '',
    linhas: linhas
      .flatMap((linha) => {
        if (!linha || typeof linha !== 'object' || Array.isArray(linha)) return []
        const campos = Object.entries(linha as Record<string, unknown>)
          .filter((par): par is [string, string] => typeof par[1] === 'string' && par[1].trim() !== '')
          .map(([campo, valor]) => [campo.trim().slice(0, 60), valor.trim()])
        return campos.length ? [Object.fromEntries(campos)] : []
      })
      .slice(0, MAX_LINHAS),
  }
}

const PROPOR_MUDANCA_NO_PLAYBOOK: FerramentaDoAgente = {
  nome: 'propor_mudanca_no_playbook',
  descricao:
    'Propõe uma nova versão de uma seção do Playbook da sua Especialidade, quando a Conversa chega a um ICP, a Personas, ' +
    'a uma dor ou a uma objeção nova, ou quando pedem para ajustar o Playbook. Escreva a seção INTEIRA como deve ficar ' +
    '(o texto e, se a seção tem tabela, todas as linhas), partindo da versão vigente que você recebeu no Playbook. Nada ' +
    'muda na hora: nasce uma Aprovação que só um Administrador decide; aprovada, a versão nova vale para todos os Agentes.',
  esquema: {
    type: 'object',
    properties: {
      secao: {
        type: 'string',
        enum: Object.values(SECOES_QUE_PROPOE).flatMap((secoes) => secoes.map((s) => s.id)),
        description: 'A seção do Playbook (só as da sua Especialidade).',
      },
      conteudo: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'O texto inteiro da seção.' },
          linhas: {
            type: 'array',
            items: { type: 'object', additionalProperties: { type: 'string' } },
            description: 'As linhas da tabela da seção, inteiras, nos campos indicados.',
          },
        },
        additionalProperties: false,
      },
      justificativa: { type: 'string', description: 'Por que mudar, em uma ou duas frases, para o Administrador que decide.' },
    },
    required: ['secao', 'conteudo', 'justificativa'],
    additionalProperties: false,
  },
  especialidades: ['scopus', 'ethos'],
  exige: null,
  disponivel: (_agente, _ctx, deps) => !!deps.banco.proporRevisao,
  descricaoPara(agente) {
    const linhas = (SECOES_QUE_PROPOE[agente.specialty] ?? []).map((s) =>
      `- ${s.id} (${s.nome})${s.colunas ? `: linhas com os campos ${s.colunas.join(', ')}` : ': só texto'}`
    )
    return `${PROPOR_MUDANCA_NO_PLAYBOOK.descricao}\nSeções que você pode propor:\n${linhas.join('\n')}`
  },
  async executar({ runId, agente, entrada, deps }) {
    const secoes = SECOES_QUE_PROPOE[agente.specialty] ?? []
    const id = texto(entrada.secao, 40)
    const secao = secoes.find((s) => s.id === id)
    if (!secao || !deps.banco.proporRevisao) {
      return falhou(
        `${agente.name} tentou propor uma mudança no Playbook`,
        `Você só propõe mudanças nestas seções do Playbook: ${secoes.map((s) => s.nome).join(', ') || 'nenhuma'}.`,
      )
    }
    const conteudo = conteudoProposto(entrada.conteudo)
    if (!conteudo.texto && conteudo.linhas.length === 0) {
      return falhou(
        `${agente.name} tentou propor uma nova versão ${secao.doNome}`,
        'Escreva o conteúdo inteiro da seção: o texto e, se ela tem tabela, as linhas.',
      )
    }
    if (JSON.stringify(conteudo).length > TETO_DO_CONTEUDO) {
      return falhou(`${agente.name} tentou propor uma nova versão ${secao.doNome}`, 'O conteúdo é grande demais para uma seção.')
    }
    const justificativa = texto(entrada.justificativa, 2000)
    if (!justificativa) {
      return falhou(
        `${agente.name} tentou propor uma nova versão ${secao.doNome}`,
        'Diga em uma ou duas frases por que mudar a seção: é o que o Administrador lê para decidir.',
      )
    }
    let proposta: RevisaoProposta
    try {
      proposta = await deps.banco.proporRevisao(runId, agente.id, { secao: secao.id, conteudo, justificativa })
    } catch (erro) {
      return falhou(`${agente.name} tentou propor uma nova versão ${secao.doNome}`, `A proposta falhou. ${motivoDoBanco(erro)}`)
    }
    const link: LinkDoPasso = { tipo: 'aprovacao', id: proposta.approvalId }
    if (proposta.outcome === 'existente') {
      return {
        erro: false,
        paraOAgente: `Esta mesma proposta ${secao.doNome} já existe nesta Conversa. Nada novo foi criado.`,
        passo: { descricao: `${agente.name} lembrou a proposta ${secao.doNome} que já está em Aprovações`, estado: 'aguardando', link },
      }
    }
    return {
      erro: false,
      paraOAgente:
        `Proposta criada: a nova versão ${secao.doNome} espera a decisão de um Administrador, aqui na Conversa ou em ` +
        'Aprovações. O Playbook não mudou ainda. Termine dizendo que a mudança só vale depois da Aprovação.',
      passo: {
        descricao: `${agente.name} propôs uma nova versão ${secao.doNome} — aguardando Aprovação de um Administrador`,
        estado: 'aguardando',
        link,
      },
    }
  },
}

/** As variáveis que o envio preenche (`private.step_variable_value`, PR #227). O Sinal e a Persona não são variáveis. */
export const VARIAVEIS_DO_ENVIO =
  '{{primeiro_nome}}, {{nome}}, {{sobrenome}}, {{cargo}}, {{email}}, {{empresa}}, {{segmento}}, {{dominio}} e ' +
  '{{remetente.nome}} (também com os prefixos contato. e conta., como {{contato.primeiro_nome}} e {{conta.nome}})'

const MAX_PASSOS_DA_SEQUENCIA = 8
const MAX_CONTATOS_DA_SEQUENCIA = 5
/** O padrão sem a seção Cadência do Playbook: 3 E-mails, no dia 0, 3 e 7 (esperas de 0, 3 e 4 dias). */
const ESPERAS_DO_PADRAO = [0, 3, 4]
const VARIAVEL = /\{\{\s*([A-Za-z_.]+)\s*\}\}/g
const CONHECIDAS = new Set([
  'primeiro_nome', 'nome', 'sobrenome', 'cargo', 'email', 'empresa', 'segmento', 'dominio', 'remetente', 'remetente.nome',
  'contato.primeiro_nome', 'contato.nome', 'contato.sobrenome', 'contato.cargo', 'contato.email', 'conta.nome',
  'conta.segmento', 'conta.dominio',
])

/** As variáveis do texto que o envio não conhece, sem repetição (a mesma lista do banco, que confere de novo). */
export function variaveisDesconhecidas(texto: string): string[] {
  const nomes = [...texto.matchAll(VARIAVEL)].map((m) => m[1].toLowerCase())
  return [...new Set(nomes)].filter((nome) => !CONHECIDAS.has(nome))
}

const PROPOR_SEQUENCIA: FerramentaDoAgente = {
  nome: 'propor_sequencia',
  descricao:
    'Propõe uma Sequência de E-mail para uma Conta-alvo: os Contatos e os passos, cada um com a espera em dias desde o ' +
    'passo anterior, o assunto e o corpo. Use quando pedirem uma Sequência ou uma Cadência para uma Conta-alvo, com ou ' +
    'sem Sinal. Antes, leia a Conta e, quando houver, o Sinal com ler_contas_e_sinais e chame esta ferramenta sem contatos para ' +
    'ver os Contatos da Conta (com o id e se cada um pode entrar). Use o Sinal no primeiro e-mail, quando houver; sem Sinal, ' +
    'use a Conta enriquecida (setor, porte, Receita/CNPJ, Comitê e Contatos), o ICP e o Playbook (Cadência, dores e ' +
    'proposta de valor); escreva sempre com as suas palavras. Siga a seção Cadência do Playbook (número de passos, esperas e tom); se ela estiver vazia, ' +
    'proponha 3 passos de E-mail (dia 0, 3 e 7: esperas de 0, 3 e 4 dias), passe playbook_vazio e diga ao usuário que o ' +
    `Playbook não tem Cadência. Use só as variáveis ${VARIAVEIS_DO_ENVIO}. Nada é enviado: nasce uma Aprovação que só ` +
    'o Vendedor responsável pela Conta decide; aprovada, a Sequência é criada sem envio, e os e-mails só saem depois ' +
    'que ele clicar em "Ativar envios". Para partir de um template da Althius, chame sugerir_template_de_sequencia ' +
    'antes e use só o id que ela devolver. Para um template próprio do vendedor, chame sugerir_template_proprio: ' +
    'ela só devolve um template que ele pode ler. A justificativa é visível a todos os membros do Workspace: diga nela por que ' +
    'esta Sequência para esta Conta (o Sinal, se houver, ou o encaixe com o ICP e o Comitê), sem copiar o assunto nem o corpo dos e-mails.',
  esquema: {
    type: 'object',
    properties: {
      conta_id: { type: 'string', description: 'O id da Conta-alvo (de ler_contas_e_sinais).' },
      contatos: {
        type: 'array',
        items: { type: 'string' },
        description: 'Os ids dos Contatos (de 1 a 5). Vazio: a ferramenta lista os Contatos da Conta, e nada é proposto.',
      },
      passos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            canal: { type: 'string', enum: ['email'] },
            espera_em_dias: { type: 'integer', description: 'Dias desde o passo anterior (0 no primeiro).' },
            assunto: { type: 'string' },
            corpo: { type: 'string' },
          },
          required: ['espera_em_dias', 'assunto', 'corpo'],
          additionalProperties: false,
        },
        description: 'De 1 a 8 passos de E-mail, em ordem; cada passo vai para cada Contato.',
      },
      justificativa: {
        type: 'string',
        description: 'Por que esta Sequência para esta Conta: o Sinal, se houver, ou o encaixe com o ICP e o Comitê. Todos os membros leem: não copie o assunto nem o corpo.',
      },
      playbook_vazio: { type: 'boolean', description: 'true quando a seção Cadência do Playbook está vazia.' },
    },
    required: ['conta_id'],
    additionalProperties: false,
  },
  especialidades: ['scopus', 'ethos', 'rhetor', 'oraculum'],
  exige: null,
  disponivel: (_agente, _ctx, deps) => !!deps.banco.proporSequencia && !!deps.banco.contatosParaSequencia,
  async executar({ runId, agente, entrada, deps }) {
    const proporSequencia = deps.banco.proporSequencia
    const lerContatos = deps.banco.contatosParaSequencia
    const contaId = texto(entrada.conta_id, 64)
    if (!proporSequencia || !lerContatos) {
      return falhou(`${agente.name} tentou propor uma Sequência`, 'A proposta de Sequência não está disponível agora.')
    }
    if (!UUID_DA_CONTA.test(contaId)) {
      return falhou(`${agente.name} tentou propor uma Sequência`, 'Informe o id da Conta-alvo que ler_contas_e_sinais devolve.')
    }

    const contatos = textos(entrada.contatos, MAX_CONTATOS_DA_SEQUENCIA + 1)
    if (contatos.length === 0) {
      try {
        const lidos = await lerContatos(runId, agente.id, contaId)
        return {
          erro: false,
          paraOAgente: `${cortar(lidos)}\nEscolha os Contatos que podem entrar (pode_entrar) e chame propor_sequencia de novo com os ids.`,
          passo: { descricao: `${agente.name} viu os Contatos que podem entrar na Sequência`, estado: 'concluida' },
        }
      } catch (erro) {
        return falhou(`${agente.name} tentou ler os Contatos da Conta`, `A leitura falhou. ${motivoDoBanco(erro)}`)
      }
    }
    const recusar = (motivo: string) => falhou(`${agente.name} tentou propor uma Sequência`, motivo)
    if (contatos.length > MAX_CONTATOS_DA_SEQUENCIA || contatos.some((id) => !UUID_DA_CONTA.test(id))) {
      return recusar(`Passe de 1 a ${MAX_CONTATOS_DA_SEQUENCIA} ids de Contatos, como a lista da Conta mostra.`)
    }

    const brutos = Array.isArray(entrada.passos) ? entrada.passos : []
    if (brutos.length === 0 || brutos.length > MAX_PASSOS_DA_SEQUENCIA) {
      return recusar(`A Sequência tem de 1 a ${MAX_PASSOS_DA_SEQUENCIA} passos de E-mail.`)
    }
    const passos: PassoProposto[] = []
    for (const bruto of brutos) {
      const passo = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto as Record<string, unknown> : {}
      if (passo.canal !== undefined && passo.canal !== 'email') {
        return recusar('Por enquanto a Sequência proposta é só de E-mail: LinkedIn e WhatsApp ficam de fora.')
      }
      const espera = passo.espera_em_dias
      if (!Number.isInteger(espera) || (espera as number) < 0 || (espera as number) > 60) {
        return recusar('A espera de cada passo é um número inteiro de dias, de 0 a 60.')
      }
      const assunto = texto(passo.assunto, 200)
      const corpo = texto(passo.corpo, 5000)
      if (!assunto || !corpo) return recusar('Cada passo precisa de assunto e corpo.')
      const desconhecidas = variaveisDesconhecidas(`${assunto} ${corpo}`)
      if (desconhecidas.length) {
        return recusar(
          `A variável {{${desconhecidas.join('}}, {{')}}} não existe no envio. Use só: ${VARIAVEIS_DO_ENVIO}. ` +
            'Escreva o Sinal com as suas palavras.',
        )
      }
      passos.push({ esperaEmDias: espera as number, assunto, corpo })
    }
    const playbookVazio = entrada.playbook_vazio === true
    if (playbookVazio && passos.map((p) => p.esperaEmDias).join() !== ESPERAS_DO_PADRAO.join()) {
      return recusar('Sem a seção Cadência no Playbook, proponha 3 passos de E-mail: no dia 0, 3 e 7 (esperas de 0, 3 e 4 dias).')
    }
    const justificativa = [
      texto(entrada.justificativa, 1800),
      playbookVazio ? 'O Playbook não tem a seção Cadência: a proposta segue o padrão de 3 e-mails (dia 0, 3 e 7).' : '',
    ].filter(Boolean).join(' ')

    let proposta: SequenciaProposta
    try {
      proposta = await proporSequencia(runId, agente.id, { targetAccountId: contaId, contatos, passos, justificativa })
    } catch (erro) {
      return falhou(`${agente.name} tentou propor uma Sequência`, `A proposta falhou. ${motivoDoBanco(erro)}`)
    }
    const link: LinkDoPasso = { tipo: 'aprovacao', id: proposta.approvalId }
    const resumo = `${plural(contatos.length, 'Contato', 'Contatos')}, ${plural(passos.length, 'e-mail', 'e-mails')}`
    if (proposta.outcome === 'existente') {
      return {
        erro: false,
        paraOAgente: `Esta mesma Sequência para a ${proposta.conta} já existe nesta Conversa. Nada novo foi criado.`,
        passo: { descricao: `${agente.name} lembrou a Sequência proposta para a ${proposta.conta}`, estado: 'aguardando', link },
      }
    }
    const aviso = playbookVazio
      ? ' Diga também que a seção Cadência do Playbook está vazia e que a proposta seguiu o padrão de 3 e-mails (dia 0, 3 e 7).'
      : ''
    return {
      erro: false,
      paraOAgente:
        `Proposta criada: a Sequência para a ${proposta.conta} (${resumo}) espera a decisão do Vendedor responsável, aqui ` +
        'na Conversa ou em Aprovações. Nada foi enviado: aprovada, a Sequência é criada sem envio, e os e-mails só saem ' +
        `depois que ele clicar em "Ativar envios". Termine dizendo isso, sem repetir o texto dos e-mails.${aviso}`,
      passo: {
        descricao: `${agente.name} propôs uma Sequência para a ${proposta.conta} (${resumo}) — aguardando o Vendedor responsável`,
        estado: 'aguardando',
        link,
      },
    }
  },
}

const SUGERIR_TEMPLATE: FerramentaDoAgente = {
  nome: 'sugerir_template_de_sequencia',
  descricao:
    'Sugere um template da Althius para uma Conta-alvo. Chame antes de propor os e-mails, com o id da Conta que ' +
    'ler_contas_e_sinais devolve. A ferramenta escolhe só um template que já existe e está acessível, e justifica com ' +
    'o Sinal quando houver, ou o contexto enriquecido da Conta, ICP e Playbook. Se não houver contexto ou crédito, ela não escolhe: diga ao usuário para escolher ' +
    'manualmente ou criar do zero. Não invente template, adequação ou eficácia (não diga que aumenta resposta, ' +
    'conversão ou que está comprovado). Não cria Sequência e não ativa envio. Ajustes de mensagem continuam em ' +
    'propor_sequencia; a Aprovação dessa proposta não ativa envios.',
  esquema: {
    type: 'object',
    properties: {
      conta_id: { type: 'string', description: 'O id da Conta-alvo (de ler_contas_e_sinais).' },
    },
    required: ['conta_id'],
    additionalProperties: false,
  },
  especialidades: ['scopus', 'ethos', 'rhetor', 'oraculum'],
  exige: null,
  disponivel: (_agente, _ctx, deps) => !!deps.banco.sugerirTemplate,
  async executar({ runId, agente, entrada, deps }) {
    const sugerir = deps.banco.sugerirTemplate
    if (!sugerir) {
      return falhou(`${agente.name} tentou sugerir um template`, 'A sugestão de template não está disponível agora.')
    }
    const contaId = texto(entrada.conta_id, 64)
    if (!UUID_DA_CONTA.test(contaId)) {
      return falhou(`${agente.name} tentou sugerir um template`, 'Informe o id da Conta-alvo que ler_contas_e_sinais devolve.')
    }
    let sugestao: { templateId: string | null; justificativa: string; outcome: string }
    try {
      sugestao = await sugerir(runId, agente.id, contaId)
    } catch (erro) {
      return falhou(`${agente.name} tentou sugerir um template`, `A sugestão falhou. ${motivoDoBanco(erro)}`)
    }
    if (sugestao.outcome === 'ok' && sugestao.templateId) {
      return {
        erro: false,
        paraOAgente:
          `${sugestao.justificativa}\nTemplate acessível: ${sugestao.templateId}. Use só este id. ` +
          'Não diga que ele aumenta resposta, conversão ou tem eficácia comprovada. Nada foi criado e nada foi enviado. ' +
          'Se for propor os e-mails, chame propor_sequencia: a Aprovação não ativa envios.',
        passo: {
          descricao: `${agente.name} sugeriu o template ${sugestao.templateId} — sem criar Sequência e sem envio`,
          estado: 'concluida',
        },
      }
    }
    const peloTeto = sugestao.outcome === 'teto_atingido' || sugestao.outcome === 'sem_teto' || sugestao.outcome === 'sem_espaco'
    return {
      erro: false,
      paraOAgente: peloTeto
        ? 'A sugestão não rodou por causa do limite de créditos. O vendedor escolhe o template manualmente ou cria do zero. Não invente um template.'
        : 'Não há Sinal recente para sugerir um template. O vendedor escolhe manualmente ou cria do zero. Não invente adequação nem eficácia.',
      passo: {
        descricao: `${agente.name} não sugeriu template — a escolha manual continua`,
        estado: 'concluida',
      },
    }
  },
}

const SUGERIR_TEMPLATE_PROPRIO: FerramentaDoAgente = {
  nome: 'sugerir_template_proprio',
  descricao:
    'Sugere um template próprio do vendedor que pediu a Conversa, para uma Conta-alvo. Chame com o id da Conta que ' +
    'ler_contas_e_sinais devolve. A ferramenta só devolve um template que esse vendedor pode ler. Se ele não tiver ' +
    'template próprio, não houver contexto da Conta ou não houver crédito, ela não escolhe: a sugestão da Althius continua em ' +
    'sugerir_template_de_sequencia, e a escolha manual também. Não invente template, não use template de outra pessoa ' +
    'e não diga que aumenta resposta ou conversão. Não cria Sequência, não autoriza Contato e não ativa envio.',
  esquema: {
    type: 'object',
    properties: {
      conta_id: { type: 'string', description: 'O id da Conta-alvo (de ler_contas_e_sinais).' },
    },
    required: ['conta_id'],
    additionalProperties: false,
  },
  especialidades: ['scopus', 'ethos', 'rhetor', 'oraculum'],
  exige: null,
  disponivel: (_agente, _ctx, deps) => !!deps.banco.sugerirTemplateProprio,
  async executar({ runId, agente, entrada, deps }) {
    const sugerir = deps.banco.sugerirTemplateProprio
    if (!sugerir) {
      return falhou(`${agente.name} tentou sugerir um template próprio`, 'A sugestão de template próprio não está disponível agora.')
    }
    const contaId = texto(entrada.conta_id, 64)
    if (!UUID_DA_CONTA.test(contaId)) {
      return falhou(`${agente.name} tentou sugerir um template próprio`, 'Informe o id da Conta-alvo que ler_contas_e_sinais devolve.')
    }
    let sugestao: { templateId: string | null; justificativa: string; outcome: string }
    try {
      sugestao = await sugerir(runId, agente.id, contaId)
    } catch (erro) {
      return falhou(`${agente.name} tentou sugerir um template próprio`, `A sugestão falhou. ${motivoDoBanco(erro)}`)
    }
    if (sugestao.outcome === 'ok' && sugestao.templateId) {
      return {
        erro: false,
        paraOAgente:
          `${sugestao.justificativa}\nTemplate próprio acessível: ${sugestao.templateId}. Use só este id. ` +
          'Ele não autoriza Contatos novos. Não diga que aumenta resposta, conversão ou tem eficácia comprovada. ' +
          'Nada foi criado e nada foi enviado. A sugestão da Althius continua em sugerir_template_de_sequencia.',
        passo: {
          descricao: `${agente.name} sugeriu o template próprio ${sugestao.templateId} — sem criar Sequência e sem envio`,
          estado: 'concluida',
        },
      }
    }
    const peloTeto = sugestao.outcome === 'teto_atingido' || sugestao.outcome === 'sem_teto' || sugestao.outcome === 'sem_espaco'
    return {
      erro: false,
      paraOAgente: peloTeto
        ? 'A sugestão não rodou por causa do limite de créditos. O vendedor escolhe o template manualmente, usa um template da Althius ou cria do zero. Não invente um template.'
        : 'Não há template próprio seu para sugerir, ou não há Sinal recente. Escolha manualmente, use um template da Althius ou crie do zero. Não invente adequação nem eficácia.',
      passo: {
        descricao: `${agente.name} não sugeriu template próprio — a escolha manual continua`,
        estado: 'concluida',
      },
    }
  },
}

const TETO_PADRAO_DA_BUSCA_DE_SINAIS = 5
const TETO_MAXIMO_DA_BUSCA_DE_SINAIS = 20
const MAX_SINAIS_NO_RESULTADO = 15
const FALHAS_DA_BUSCA = new Set(['falhou', 'abortada', 'sem_creditos', 'limite_diario', 'sem_contas', 'indisponivel', 'em_teste', 'sem_cascata'])

/** Uma impressão curta e estável de um objeto, para a mesma busca repetida na Execução levar a mesma chave. */
function impressao(dado: unknown): string {
  const texto = JSON.stringify(dado ?? null)
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

const BUSCAR_SINAIS: FerramentaDoAgente = {
  nome: 'buscar_sinais',
  descricao:
    'Busca Sinais de compra em fontes públicas para as Contas-alvo do Workspace, de um tipo do catálogo (ex.: vaga de analista ' +
    'de comex). Roda na hora, gasta Créditos pelo custo real até o teto que você informar e grava os Sinais nas Contas que os ' +
    'tiveram. Sem "sinal", devolve o catálogo do ICP pedido (A a H) e quais tipos ainda não têm fonte, para você explicar ao ' +
    'usuário. Só ofereça tipos do catálogo; um tipo "sem fonte" não roda e não custa nada. Os Sinais voltam já normalizados.',
  esquema: {
    type: 'object',
    properties: {
      sinal: { type: 'string', description: 'O tipo de Sinal do catálogo. Vazio devolve o catálogo.' },
      icp: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], description: 'Filtra o catálogo pelo ICP.' },
      contas: { type: 'array', items: { type: 'string' }, description: 'Ids de Contas-alvo (de ler_contas_e_sinais). Vazio usa todas.' },
      criterios: {
        type: 'object',
        properties: {
          termos: { type: 'array', items: { type: 'string' }, description: 'Termos da busca, quando o tipo aceita.' },
          periodo: { type: 'string', description: 'Ex.: "Últimos 7 dias".' },
        },
        additionalProperties: false,
      },
      teto_creditos: { type: 'integer', description: `Quanto você aceita gastar nesta busca, de 1 a ${TETO_MAXIMO_DA_BUSCA_DE_SINAIS} (padrão ${TETO_PADRAO_DA_BUSCA_DE_SINAIS}).` },
    },
    additionalProperties: false,
  },
  especialidades: ['scopus'],
  exige: null,
  disponivel: (_agente, _ctx, deps) => !!deps.sinais,
  async executar({ runId, agente, entrada, ctx, deps }) {
    const busca = deps.sinais!
    const sinal = texto(entrada.sinal, 80)
    const icp = typeof entrada.icp === 'string' && /^[A-H]$/.test(entrada.icp) ? entrada.icp : null
    let catalogo: SinalDoCatalogo[]
    try {
      catalogo = await busca.catalogo()
    } catch {
      return falhou(`${agente.name} tentou ler o catálogo de Sinais`, 'O catálogo de Sinais não respondeu agora. Siga sem ele.')
    }

    if (!sinal) {
      // Só os Sinais do Mapa de Mercado: nada fora dele é oferecido.
      const lista = catalogo.filter((c) => icpDoSinalDoMapa(c.sinal) !== null && (!icp || c.icp === icp))
      const dosIcps = [...new Set(lista.map((c) => c.icp))].flatMap((i) => {
        const m = MAPA_DE_SINAIS[i]
        return m ? [{ icp: i, nome: m.nome, gatilho: m.gatilho, ...(m.restricao ? { restricao: m.restricao } : {}) }] : []
      })
      return {
        erro: false,
        paraOAgente: cortar({
          icps: dosIcps,
          catalogo: lista,
          orientacao:
            'Ofereça só estes tipos. "disponivel" roda agora (pede um teto de Créditos); "em_validacao" ainda não roda; ' +
            '"sem_fonte" é um Sinal sem fonte pública confiável (explique o motivo, sem inventar uma alternativa); escopo ' +
            '"mercado" acontece no mercado todo e não vira Sinal de uma Conta.',
        }),
        passo: { descricao: `${agente.name} leu o catálogo de Sinais${icp ? ` do ICP ${icp}` : ''} (${plural(lista.length, 'tipo', 'tipos')})`, estado: 'concluida' },
      }
    }

    const item = icpDoSinalDoMapa(sinal) === null ? undefined : catalogo.find((c) => c.sinal === sinal)
    if (!item) {
      return falhou(
        `${agente.name} pediu um Sinal que não está no catálogo`,
        `"${sinal}" não está no catálogo de Sinais. Chame buscar_sinais sem "sinal" para ver os tipos e ofereça só esses.`,
      )
    }
    if (item.estado === 'sem_fonte') {
      return {
        erro: false,
        paraOAgente: `Este Sinal (${item.nome}) não tem fonte pública confiável hoje: ${item.motivo ?? 'sem fonte adequada'}. Nada foi rodado nem cobrado. Explique isso ao usuário e não proponha outra fonte por conta própria.`,
        passo: { descricao: `${agente.name} explicou que "${item.nome}" ainda não tem fonte pública`, estado: 'concluida' },
      }
    }
    if (item.estado !== 'disponivel') {
      return {
        erro: false,
        paraOAgente: `Este Sinal (${item.nome}) ainda está em validação ou fora do ar e não roda neste Workspace. Nada foi rodado nem cobrado.`,
        passo: { descricao: `${agente.name} viu que "${item.nome}" ainda está em validação`, estado: 'concluida' },
      }
    }

    const contas = textos(entrada.contas, 100)
    const brutos = entrada.criterios && typeof entrada.criterios === 'object' && !Array.isArray(entrada.criterios)
      ? entrada.criterios as Record<string, unknown>
      : undefined
    const criterios = brutos
      ? {
        ...(textos(brutos.termos).length ? { termos: textos(brutos.termos) } : {}),
        ...(texto(brutos.periodo, 60) ? { periodo: texto(brutos.periodo, 60) } : {}),
      }
      : undefined
    const teto = Number.isInteger(entrada.teto_creditos)
      ? Math.min(Math.max(entrada.teto_creditos as number, 1), TETO_MAXIMO_DA_BUSCA_DE_SINAIS)
      : TETO_PADRAO_DA_BUSCA_DE_SINAIS
    const chave = `hermes:${runId}:${agente.id}:${sinal}:${impressao({ contas, criterios, teto })}`
    try {
      const r = await busca.buscar({
        workspaceId: ctx.workspaceId,
        userId: ctx.requestedBy,
        sinal,
        ...(contas.length ? { contas } : {}),
        ...(criterios && Object.keys(criterios).length ? { criterios } : {}),
        tetoCreditos: teto,
        chave,
      })
      const falha = FALHAS_DA_BUSCA.has(r.desfecho)
      return {
        erro: false,
        paraOAgente: cortar({
          sinal,
          desfecho: r.desfecho,
          mensagem: r.mensagem,
          creditos: r.creditos,
          novos: r.novos,
          repetidos: r.repetidos,
          empresasSemConta: r.empresasSemConta,
          sinais: r.sinais.slice(0, MAX_SINAIS_NO_RESULTADO),
          ...(r.mercado ? { mercado: r.mercado.slice(0, MAX_SINAIS_NO_RESULTADO) } : {}),
        }),
        passo: {
          descricao: falha
            ? `${agente.name} tentou buscar Sinais de "${item.nome}": ${r.mensagem}`
            : `${agente.name} buscou Sinais de "${item.nome}" (${plural(r.novos, 'Sinal novo', 'Sinais novos')}, ${r.creditos} Créditos)`,
          estado: falha ? 'falhou' : 'concluida',
        },
      }
    } catch (erro) {
      deps.log?.({ type: 'agent_tools', runId, ferramenta: 'buscar_sinais', outcome: 'failed', message: String(erro).slice(0, 300) })
      return falhou(`${agente.name} tentou buscar Sinais de "${item.nome}"`, 'A busca de Sinais falhou agora. Não use dados dela e diga ao usuário que tente de novo mais tarde.')
    }
  },
}

export const CATALOGO: readonly FerramentaDoAgente[] = [LER_CONTAS, BUSCAR_PELO_ICP, CONSULTAR_INTEGRACAO, PROPOR_ENVIO]

/**
 * O catálogo com a ferramenta genérica dos conectores (ADR-0022) e a proposta de mudança no Playbook (CRM-09). Elas ficam
 * à parte do `CATALOGO` das ferramentas da Etapa 5b porque dependem de contratos novos do banco (as regras, a proposta de
 * chamada, a proposta de revisão): quem não os tem continua vendo só as quatro de antes.
 */
export const FERRAMENTAS: readonly FerramentaDoAgente[] = [
  ...CATALOGO,
  USAR_CONECTOR,
  PROPOR_MUDANCA_NO_PLAYBOOK,
  BUSCAR_SINAIS,
  PROPOR_SEQUENCIA,
  SUGERIR_TEMPLATE,
  SUGERIR_TEMPLATE_PROPRIO,
]

/** A ferramenta como o modelo a recebe. */
export interface FerramentaParaOModelo {
  nome: string
  descricao: string
  esquema: Record<string, unknown>
}

export interface SessaoDeFerramentas {
  /** As ferramentas que o Agente da vez pode usar, pela Especialidade e pela Permissão. */
  paraOAgente(agente: AgenteDoWorkspace): FerramentaParaOModelo[]
  /** Se o nome é de uma ferramenta deste catálogo. */
  conhece(nome: string): boolean
  /** Executa a chamada do Agente; nunca lança: a falha volta como texto para ele. */
  chamar(agente: AgenteDoWorkspace, nome: string, entrada: unknown): Promise<ResultadoDaFerramentaDoAgente>
  /** O que os Agentes já fizeram com ferramentas neste pedido, como o próximo Agente lê ("como num Slack"). */
  mural(): string[]
}

/** Uma sessão por Execução: o limite de chamadas e o mural valem para todos os Agentes do pedido. */
export function criarSessaoDeFerramentas(
  deps: DepsDasFerramentas,
  { runId, ctx, maxChamadas = MAX_CHAMADAS_POR_PEDIDO }: { runId: string; ctx: ContextoDasFerramentas; maxChamadas?: number },
): SessaoDeFerramentas {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const prazo = deps.prazoMs ?? PRAZO_MS
  const mural: string[] = []
  let chamadas = 0
  const permitidas = (agente: AgenteDoWorkspace) =>
    FERRAMENTAS.filter((f) => f.especialidades.includes(agente.specialty) && f.disponivel(agente, ctx, deps))

  return {
    paraOAgente: (agente) =>
      permitidas(agente).map((f) => ({ nome: f.nome, descricao: f.descricaoPara?.(agente, ctx) ?? f.descricao, esquema: f.esquema })),
    conhece: (nome) => FERRAMENTAS.some((f) => f.nome === nome),
    mural: () => [...mural],
    async chamar(agente, nome, entrada) {
      const ferramenta = permitidas(agente).find((f) => f.nome === nome)
      if (!ferramenta) {
        return falhou(`${agente.name} pediu uma ferramenta que não pode usar (${nome})`, `A ferramenta ${nome} não está disponível para você.`)
      }
      if (chamadas >= maxChamadas) {
        return falhou(
          `${agente.name} passou do limite de ferramentas do pedido`,
          `O pedido chegou ao limite de ${maxChamadas} chamadas de ferramenta. Responda com o que você já tem.`,
        )
      }
      chamadas++
      const objeto = entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada as Record<string, unknown> : {}
      let resultado: ResultadoDaFerramentaDoAgente
      let relogio: ReturnType<typeof setTimeout> | undefined
      try {
        resultado = await Promise.race([
          ferramenta.executar({ runId, agente, entrada: objeto, ctx, deps }),
          new Promise<ResultadoDaFerramentaDoAgente>((resolver) => {
            relogio = setTimeout(
              () => resolver(falhou(`${agente.name} esperou demais por ${nome}`, 'A ferramenta demorou demais. Siga sem ela.')),
              prazo,
            )
          }),
        ])
      } catch (erro) {
        log({ type: 'agent_tools', runId, ferramenta: nome, outcome: 'failed', message: String(erro) })
        resultado = falhou(`${agente.name} tentou usar ${nome}`, 'A ferramenta falhou agora. Não use dados dela.')
      } finally {
        clearTimeout(relogio)
      }
      mural.push(resultado.passo.descricao)
      return resultado
    },
  }
}

/** O mural como entra no pedido do próximo Agente. Vazio quando ninguém usou ferramenta ainda. */
export function textoDoMural(mural: string[]): string {
  return mural.length ? `O que os Agentes já fizeram neste pedido:\n${mural.map((linha) => `- ${linha}`).join('\n')}` : ''
}

/** O payload do evento `ferramenta` (a tela lê `descricao`, `estado` e, aditivo, `link`). */
export function eventoDoPasso(nome: string, passo: PassoDaFerramenta): Record<string, unknown> {
  return { ferramenta: nome, descricao: passo.descricao, estado: passo.estado, ...(passo.link ? { link: passo.link } : {}) }
}

/** O banco das ferramentas pelas RPCs de serviço (migration 20261001210000). */
export function bancoDasFerramentas(
  rpc: (nome: string, parametros: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>,
): BancoDasFerramentas {
  async function chamar<T>(nome: string, parametros: Record<string, unknown>): Promise<T> {
    const { data, error } = await rpc(nome, parametros)
    if (error) throw new ErroDoBanco(error.code ?? '', error.message)
    return data as T
  }
  const primeira = <T>(data: unknown): T => {
    const linha = (Array.isArray(data) ? data[0] : data) as T | undefined
    if (!linha) throw new ErroDoBanco('', 'sem resposta')
    return linha
  }
  return {
    async contexto(runId) {
      const linha = primeira<{
        workspace_id: string
        requested_by: string
        permissions: { agent_id: string; integration_id: string; permission: Permissao; category: string | null; name: string }[]
      }>(await chamar('agent_run_tools_context', { p_run_id: runId }))
      return {
        workspaceId: linha.workspace_id,
        requestedBy: linha.requested_by,
        permissoes: (linha.permissions ?? []).map((p) => ({
          agentId: p.agent_id,
          integrationId: p.integration_id,
          permission: p.permission,
          category: p.category,
          name: p.name,
        })),
      }
    },
    async lerContas(runId, a) {
      const contas = await chamar<unknown[] | null>('agent_read_accounts_and_signals', {
        p_run_id: runId,
        p_query: a.termo,
        p_only_hot: a.soQuentes,
        p_limit: a.limite,
      })
      return Array.isArray(contas) ? contas : []
    },
    async pedirDescoberta(runId, agenteId, pedido) {
      const linha = primeira<{
        discovery_run_id: string
        outcome: string
        estimated_credits: number | string
        available: number | string | null
        new_in_inbox: number
        actor_state: string
      }>(await chamar('agent_request_account_discovery', {
        p_run_id: runId,
        p_agent_id: agenteId,
        p_criteria: pedido.criterios,
        p_max_results: pedido.maxResults,
        p_reason: pedido.motivo,
      }))
      return {
        discoveryRunId: linha.discovery_run_id,
        outcome: linha.outcome,
        creditos: Number(linha.estimated_credits ?? 0),
        saldo: Number(linha.available ?? 0),
        novasNaCaixa: Number(linha.new_in_inbox ?? 0),
        estadoDoActor: linha.actor_state,
      }
    },
    async proporEnvio(runId, agenteId, a) {
      const linha = primeira<{ approval_id: string; outcome: string; account_name: string; integration_name: string }>(
        await chamar('agent_propose_crm_handoff', {
          p_run_id: runId,
          p_agent_id: agenteId,
          p_target_account_id: a.targetAccountId,
          p_integration_id: a.integrationId,
          p_justification: a.justificativa,
        }),
      )
      return { approvalId: linha.approval_id, outcome: linha.outcome, conta: linha.account_name, crm: linha.integration_name }
    },
    async proporChamada(runId, agenteId, a) {
      const linha = primeira<{ approval_id: string; outcome: string }>(await chamar('propose_agent_action', {
        p_run_id: runId,
        p_agent_id: agenteId,
        p_integration_id: a.integrationId,
        p_action: a.acao,
        p_payload: a.payload,
        p_impact: a.impacto.slice(0, 1000),
        p_justification: a.justificativa,
        ...(a.targetAccountId ? { p_target_account_id: a.targetAccountId } : {}),
      }))
      return { approvalId: linha.approval_id, outcome: linha.outcome }
    },
    // Migration 20261002112000 (ADR-0023).
    fecharEnvioPelaChamada: (runId, agenteId, a) =>
      chamar<string>('finish_crm_handoff_by_tool_call', {
        p_run_id: runId,
        p_agent_id: agenteId,
        p_integration_id: a.integrationId,
        p_tool_name: a.ferramenta,
        p_target_account_id: a.targetAccountId,
        p_ok: a.ok,
        p_error: a.erro,
      }),
    // Migration 20261009220509 (CRM-09).
    async proporRevisao(runId, agenteId, a) {
      const linha = primeira<{ approval_id: string; outcome: string; section_name: string; base_version: number | string }>(
        await chamar('agent_propose_playbook_revision', {
          p_run_id: runId,
          p_agent_id: agenteId,
          p_section: a.secao,
          p_content: a.conteudo,
          p_justification: a.justificativa,
        }),
      )
      return {
        approvalId: linha.approval_id,
        outcome: linha.outcome,
        secao: linha.section_name,
        versaoBase: Number(linha.base_version ?? 0),
      }
    },
    // Migration 20261105100000 (cadencia-pela-ia 01).
    async proporSequencia(runId, agenteId, a) {
      const linha = primeira<{ approval_id: string; outcome: string; account_name: string }>(
        await chamar('agent_propose_sequence', {
          p_run_id: runId,
          p_agent_id: agenteId,
          p_target_account_id: a.targetAccountId,
          p_contacts: a.contatos,
          p_steps: a.passos,
          p_justification: a.justificativa,
        }),
      )
      return { approvalId: linha.approval_id, outcome: linha.outcome, conta: linha.account_name }
    },
    contatosParaSequencia: (runId, agenteId, targetAccountId) =>
      chamar<unknown>('agent_read_sequence_contacts', {
        p_run_id: runId,
        p_agent_id: agenteId,
        p_target_account_id: targetAccountId,
      }),
    async sugerirTemplate(runId, agenteId, targetAccountId) {
      const linha = primeira<{ template_id: string | null; justification: string; outcome: string }>(
        await chamar('agent_suggest_althius_sequence_template', {
          p_run_id: runId,
          p_agent_id: agenteId,
          p_target_account_id: targetAccountId,
        }),
      )
      return {
        templateId: linha.template_id,
        justificativa: linha.justification ?? '',
        outcome: linha.outcome,
      }
    },
    async sugerirTemplateProprio(runId, agenteId, targetAccountId) {
      const linha = primeira<{ template_id: string | null; justification: string; outcome: string }>(
        await chamar('agent_suggest_own_sequence_template', {
          p_run_id: runId,
          p_agent_id: agenteId,
          p_target_account_id: targetAccountId,
        }),
      )
      return {
        templateId: linha.template_id,
        justificativa: linha.justification ?? '',
        outcome: linha.outcome,
      }
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// A ponte para motores sem as nossas ferramentas (o Hermes, pela API de runs): o Agente pede em JSON estruturado e o
// servidor executa. O formato é um objeto só, sem texto fora dele: {"ferramenta": "<nome>", "entrada": {...}}.

/** As instruções que ensinam o pedido de ferramenta, com as que o Agente da vez pode usar. Vazio sem ferramentas. */
export function instrucoesDasFerramentas(ferramentas: FerramentaParaOModelo[]): string {
  if (ferramentas.length === 0) return ''
  const lista = ferramentas.map((f) => `### ${f.nome}\n${f.descricao}\nEntrada (JSON Schema): ${JSON.stringify(f.esquema)}`)
  return [
    'Você tem ferramentas da Althius para agir. Para usar uma, responda SÓ com um objeto JSON, sem nenhum texto fora ' +
    'dele: {"ferramenta": "<nome>", "entrada": {...}}. Você recebe o resultado e continua; use uma ferramenta por ' +
    'vez. Quando terminar, responda em texto normal, com a linha de STATUS no fim.',
    ...lista,
  ].join('\n\n')
}

/** O pedido de ferramenta na saída do motor, ou null quando a saída é a resposta em texto. */
export function lerPedidoDeFerramenta(saida: string): { nome: string; entrada: unknown } | null {
  const limpa = saida.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1').trim()
  if (!limpa.startsWith('{') || !limpa.endsWith('}')) return null
  try {
    const dado = JSON.parse(limpa) as { ferramenta?: unknown; entrada?: unknown }
    if (typeof dado?.ferramenta !== 'string' || !dado.ferramenta.trim()) return null
    return { nome: dado.ferramenta.trim(), entrada: dado.entrada ?? {} }
  } catch {
    return null
  }
}
