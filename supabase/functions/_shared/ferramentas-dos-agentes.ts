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
//                            Rhetor; Propor+)    Executar, ela nasce liberada e o executor das Aprovações envia.
//
// O que pode ser feito é sempre conferido de novo no banco (a Especialidade, a Permissão, a Participação, a Integração
// ligada) e no Acesso (`chamarFerramenta` com o `agenteId`). Uma falha de ferramenta vira texto para o Agente, nunca
// derruba o pedido. O banco, o Acesso e o executor entram por injeção, para o teste rodar sem rede.
import type { DesfechoDoEnvioAprovado } from './executor-de-aprovacoes.ts'
import { chamarFerramenta, type DepsDeAcesso, ErroDoBanco, listarFerramentas, type Permissao } from './integration-access.ts'
import { perfilDaIntegracao } from './integracoes/perfis.ts'
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
}

export interface DepsDasFerramentas {
  banco: BancoDasFerramentas
  /** O Acesso às Integrações; sem ele, `consultar_integracao` não é oferecida. */
  acesso?: DepsDeAcesso
  /** O executor das Aprovações de envio, para a proposta que nasce liberada (Executar). Sem ele, ela espera a tela. */
  executarAprovacao?: (approvalId: string) => Promise<DesfechoDoEnvioAprovado>
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

function cortar(dado: unknown): string {
  const json = JSON.stringify(dado ?? null)
  return json.length > TAMANHO_DO_RESULTADO ? `${json.slice(0, TAMANHO_DO_RESULTADO)}…[cortado]` : json
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function falhou(descricao: string, paraOAgente: string): ResultadoDaFerramentaDoAgente {
  return { erro: true, paraOAgente, passo: { descricao, estado: 'falhou' } }
}

/** O motivo do banco em palavras para o Agente, sem detalhe interno. */
function motivoDoBanco(erro: unknown): string {
  if (erro instanceof ErroDoBanco) {
    const m = erro.message
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
    if (m.includes('invalid')) return 'A entrada da ferramenta é inválida.'
  }
  return 'A ferramenta falhou agora. Não use dados dela e siga com o que você tem.'
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
      const actor = r.estadoDoActor === 'available' ? '' : ' A busca de empresas ainda não está liberada no Workspace (o Actor está em teste ou fora do ar).'
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

export const CATALOGO: readonly FerramentaDoAgente[] = [LER_CONTAS, BUSCAR_PELO_ICP, CONSULTAR_INTEGRACAO, PROPOR_ENVIO]

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
    CATALOGO.filter((f) => f.especialidades.includes(agente.specialty) && f.disponivel(agente, ctx, deps))

  return {
    paraOAgente: (agente) =>
      permitidas(agente).map((f) => ({ nome: f.nome, descricao: f.descricaoPara?.(agente, ctx) ?? f.descricao, esquema: f.esquema })),
    conhece: (nome) => CATALOGO.some((f) => f.nome === nome),
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
  }
}
