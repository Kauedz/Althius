// Implementação simulada da fonte de dados dos Agentes. O estado vive em memória:
// as mudanças valem até recarregar a página.
import * as demo from './dados-demo'
import type { RegistroDeAgente } from './dados-demo'
import { especialidade, especialidades } from './especialidades'
import { diaIso } from './formatar-data'
import { normalizarNome, reconhecerMencoes } from './mencoes'
import { nomeDeAgenteCriado, ROTULO_DA_DECISAO } from './regras'
import {
  consolidadaGenerica,
  etapaGenerica,
  respostaDeMencao,
  respostaDireta,
  respostaGenerica,
  roteiros,
  roteirosCoordenados,
  type PassoDeRoteiro,
  type PassoDeRoteiroCoordenado,
  type RoteiroCoordenado,
} from './roteiros'
import {
  avisoDeAprovacaoDecidida,
  avisoDeAprovacaoSolicitada,
  avisoDeFalha,
  avisoDeRevisaoDecidida,
  type NovoAviso,
} from './regras-avisos'
import { DOCUMENTOS_DA_MEMORIA, efeitoDaDecisao, frasesDo, maiuscula } from './regras-memoria'
import { criarMemoriaSimulada, FalhaAoGravar } from './simulada-memoria'
import { criarParticipacoesSimuladas, type ArmazenamentoDemonstrativo, type Sessao } from './simulada-participacoes'
import type {
  AcaoProposta,
  Agente,
  AgenteId,
  Aprovacao,
  AprovacaoDeAcao,
  AprovacaoDeRevisaoDecidida,
  AprovacaoDeRevisaoPendente,
  AvisoDoWorkspace,
  CanalId,
  Decisao,
  EspecialidadeId,
  EstadoAgente,
  ExecucoesNoPeriodo,
  FonteDeAgentes,
  Gatilho,
  IntegracaoId,
  ItemDeAtividade,
  LugarDaDecisao,
  Mensagem,
  NovaRotina,
  Origem,
  PassoDaConversa,
  PassoDaCoordenacao,
} from './tipos'

export type { ArmazenamentoDemonstrativo, Sessao } from './simulada-participacoes'

export interface OpcoesFonteSimulada {
  /** Atraso simulado de cada resposta e de cada passo da Conversa. */
  atrasoMs?: number
  /**
   * Quando presente, o perfil pessoal (nome, e-mail, foto) e as preferências, associados à Conta de usuário, e o
   * Workspace (informações, Participações, convites e a Memória do Workspace com as revisões propostas), associado ao
   * Workspace, sobrevivem a um refresh. Sem isso,
   * valem só na instância — útil para isolar os testes.
   */
  armazenamento?: ArmazenamentoDemonstrativo | null
  /** A Conta de usuário da sessão e, se preciso, o seu papel: só para preparar cenários de teste. */
  sessao?: Sessao
  /** O dia de referência do período do Plano, que vai do começo do mês até ele. Os testes o fixam. */
  hoje?: Date
}

export function criarFonteSimulada({
  atrasoMs = 450,
  armazenamento = null,
  sessao,
  hoje = new Date(),
}: OpcoesFonteSimulada = {}): FonteDeAgentes {
  const participacoes = criarParticipacoesSimuladas({ armazenamento, sessao, hoje })
  const memoriaDoWorkspace = criarMemoriaSimulada({ armazenamento, participacoes, hoje })
  const estado = structuredClone({
    agentes: demo.agentes,
    fatos: demo.fatos,
    habilidades: demo.habilidades,
    rotinas: demo.rotinas,
    atividade: demo.atividade,
    canais: demo.canais,
    integracoes: demo.integracoes,
    personalizacoes: demo.personalizacoes,
    aprovacoes: demo.aprovacoes,
    previas: demo.previas,
  })
  /**
   * As Execuções desta sessão por Especialidade, que somam às do mês nos dados de exemplo. As que propuseram uma
   * revisão da Memória do Workspace não entram aqui: contam pela revisão, que persiste com o Workspace.
   */
  const execucoesNaSessao = new Map<EspecialidadeId, number>()
  const ouvintes = new Set<() => void>()
  const ouvintesDeAvisos = new Set<(aviso: AvisoDoWorkspace) => void>()
  /** Quem pediu ao Agente, na Althius, o trabalho que propôs cada Aprovação: é quem recebe o resultado. */
  const solicitantes = new Map<string, string>()
  let proximoId = 1

  const novoId = (prefixo: string) => `${prefixo}-${proximoId++}`
  const esperar = (ms = atrasoMs) => new Promise<void>((resolver) => setTimeout(resolver, ms))
  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte())

  /** Entrega o aviso a quem observa. O erro de um ouvinte fica com ele: a operação que gerou o aviso já terminou. */
  function emitirAviso(novo: NovoAviso) {
    const aviso: AvisoDoWorkspace = { ...novo, id: novoId('aviso') }
    ouvintesDeAvisos.forEach((ouvinte) => {
      try {
        ouvinte(structuredClone(aviso))
      } catch (erro) {
        console.error(erro)
      }
    })
  }

  /** Uma Aprovação pedida pela sessão entrou na fila: guarda quem pediu e emite o aviso a quem pode decidir. */
  function emitirAvisoDeSolicitacao(aprovacao: Aprovacao) {
    solicitantes.set(aprovacao.id, participacoes.usuario().id)
    emitirAviso(avisoDeAprovacaoSolicitada(aprovacao, nomeDe(aprovacao.agenteId), participacoes.participacoesAtivas()))
  }

  async function responder<T>(valor: () => T): Promise<T> {
    await esperar(Math.min(atrasoMs, 120))
    return structuredClone(valor())
  }

  async function mudar(alteracao: () => void): Promise<void> {
    await esperar(Math.min(atrasoMs, 120))
    alteracao()
    avisar()
  }

  function buscar<T extends { id: string }>(lista: T[], id: string): T {
    const item = lista.find((i) => i.id === id)
    if (!item) throw new Error(`Não encontrado: ${id}`)
    return item
  }

  type NovoItem = Omit<ItemDeAtividade, 'id' | 'quando' | 'tipo'>

  /**
   * Põe o item na Atividade; uma falha também é avisada a quem pediu o trabalho. Hoje toda falha nasce de um pedido
   * da sessão (uma revisão ou uma decisão); uma falha de Rotina ou de Canal precisaria de outro destinatário.
   */
  function registrarNaAtividade(item: ItemDeAtividade) {
    estado.atividade.unshift(item)
    if (!item.falhou) return
    const quemPediu = participacoes.usuario().id
    emitirAviso(avisoDeFalha(item, nomeDe(item.agenteId), quemPediu, participacoes.participacoesAtivas()))
  }

  function novaExecucao(item: NovoItem): ItemDeAtividade {
    return { ...item, tipo: 'execucao', id: novoId('atividade'), quando: 'Agora' }
  }

  /**
   * Registra uma Execução na Atividade do Agente e a conta nas dele e nas do mês no Plano. A que propõe uma revisão da
   * Memória do Workspace só entra na Atividade: conta pela revisão (`revisoesDoAgente`).
   */
  function registrarExecucao(item: NovoItem) {
    registrarNaAtividade(novaExecucao(item))
    const agente = buscar(estado.agentes, item.agenteId)
    agente.execucoes++
    execucoesNaSessao.set(agente.especialidadeId, (execucoesNaSessao.get(agente.especialidadeId) ?? 0) + 1)
  }

  /** As revisões da Memória do Workspace propostas pelo Agente: cada uma é o resultado de uma Execução dele. */
  const revisoesDoAgente = (agenteId: AgenteId) => memoriaDoWorkspace.revisoes().filter((r) => r.agenteId === agenteId)

  /**
   * As Execuções do começo do mês até hoje: as dos dados de exemplo, um tanto por dia, as desta sessão e as que
   * propuseram as revisões pedidas no período, que continuam na fila depois de recarregar.
   */
  function execucoesNoMes(): ExecucoesNoPeriodo {
    const inicio = diaIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
    const fim = diaIso(hoje)
    const revisoesNoPeriodo = memoriaDoWorkspace
      .revisoes()
      .filter(({ revisao }) => revisao.pedidaEm >= inicio && revisao.pedidaEm <= fim)
    const porEspecialidade = especialidades.map(({ id, nome }) => ({
      especialidadeId: id,
      nome,
      total:
        demo.execucoesPorDia[id] * hoje.getDate() +
        (execucoesNaSessao.get(id) ?? 0) +
        revisoesNoPeriodo.filter(({ revisao }) => DOCUMENTOS_DA_MEMORIA[revisao.documento].especialidade === id).length,
    }))
    return { inicio, fim, total: porEspecialidade.reduce((soma, { total }) => soma + total, 0), porEspecialidade }
  }

  /** Registra uma ação dentro de uma Execução (agir pela Permissão Executar, decidir uma Aprovação). */
  function registrarAcao(item: NovoItem) {
    registrarNaAtividade({ ...item, tipo: 'acao', id: novoId('atividade'), quando: 'Agora' })
  }

  /** O lugar da decisão, para a descrição na Atividade (ex.: "na fila", "no Slack"). */
  function ondeFoiDecidida(onde: LugarDaDecisao) {
    if (onde === 'fila') return 'na fila'
    if (onde === 'conversa') return 'na Conversa'
    return `no ${buscar(estado.canais, onde).nome}`
  }

  function nomeDe(id: AgenteId) {
    return buscar(estado.agentes, id).nome
  }

  function gravarEstado(id: AgenteId, novo: EstadoAgente) {
    const agente = buscar(estado.agentes, id)
    if (agente.estado === novo) return false
    agente.estado = novo
    return true
  }

  /** A primeira linha do que o Agente entregou neste roteiro. */
  function resultadoDe(passos: PassoDeRoteiro<AgenteId>[], agenteId: AgenteId): string {
    for (const passo of passos) {
      if (passo.tipo === 'texto' && passo.ator === agenteId) {
        return passo.texto.split('\n').find((linha) => linha.trim())?.trim() ?? passo.texto
      }
    }
    for (const passo of passos) {
      if (passo.tipo === 'repasse' && passo.de === agenteId) return passo.resumo
    }
    return 'Complementou a Conversa.'
  }

  function participantesDe(passos: PassoDeRoteiro<AgenteId>[]): AgenteId[] {
    const ids: AgenteId[] = []
    const visto = new Set<AgenteId>()
    const incluir = (id: AgenteId) => {
      if (visto.has(id)) return
      visto.add(id)
      ids.push(id)
    }
    for (const passo of passos) {
      if (passo.tipo === 'repasse') {
        incluir(passo.de)
        incluir(passo.para)
      } else incluir(passo.ator)
    }
    return ids
  }

  function linkDaConversa(agenteId: AgenteId) {
    return { rotulo: 'Ver Conversa', para: `/agentes/${agenteId}/conversa` }
  }

  function montarAgente({ especialidadeId, ...agente }: RegistroDeAgente): Agente {
    const daEspecialidade = especialidade(especialidadeId)
    const personalizacao = estado.personalizacoes[agente.id]
    return {
      ...agente,
      execucoes: agente.execucoes + revisoesDoAgente(agente.id).length,
      especialidade: daEspecialidade,
      descricao: (agente.tipo === 'criado' && personalizacao.instrucoes) || daEspecialidade.descricao,
      rotinaAtiva: estado.rotinas.find((r) => r.agenteId === agente.id && !r.pausada) ?? null,
      integracoes: Object.keys(personalizacao.permissoes) as IntegracaoId[],
    }
  }

  function agentePadrao(especialidadeId: EspecialidadeId): RegistroDeAgente {
    const padrao = estado.agentes.find((a) => a.tipo === 'padrao' && a.especialidadeId === especialidadeId)
    if (!padrao) throw new Error(`Sem Agente padrão para: ${especialidadeId}`)
    return padrao
  }

  /**
   * Troca a Especialidade de cada passo pelo Agente que o faz: o próprio Agente da Conversa
   * nos passos da sua Especialidade, e o Agente padrão nos das outras.
   */
  function atribuir(passos: PassoDeRoteiro[], atual: RegistroDeAgente): PassoDeRoteiro<AgenteId>[] {
    const quem = (especialidadeId: EspecialidadeId) =>
      especialidadeId === atual.especialidadeId ? atual.id : agentePadrao(especialidadeId).id
    return passos.map((passo) =>
      passo.tipo === 'repasse'
        ? { ...passo, de: quem(passo.de), para: quem(passo.para) }
        : { ...passo, ator: quem(passo.ator) },
    )
  }

  /** O outro Agente que a mensagem traz para a Conversa com @, se houver. */
  function mencionado(id: AgenteId, texto: string, sugestaoId?: string): RegistroDeAgente | undefined {
    if (sugestaoId && roteiros[sugestaoId]) return undefined
    return reconhecerMencoes(texto, estado.agentes).find((agente) => agente.id !== id)
  }

  function roteiroPara(id: AgenteId, texto: string, sugestaoId?: string): PassoDeRoteiro<AgenteId>[] {
    const atual = buscar(estado.agentes, id)
    if (sugestaoId && roteiros[sugestaoId]) return atribuir(roteiros[sugestaoId], atual)
    const outro = mencionado(id, texto)
    if (outro) return respostaDeMencao(id, outro)
    return atribuir(respostaGenerica(atual.especialidadeId, atual.nome), atual)
  }

  /**
   * Cria a Aprovação de uma ação proposta na Execução acionada pelo gatilho; fora da Althius, ela
   * também chega no Canal de origem, com os botões de decisão.
   */
  function criarAprovacao(agenteId: AgenteId, acao: AcaoProposta, origem: Origem, gatilho: Gatilho): string {
    const aprovacaoId = novoId('aprovacao')
    const aprovacao: AprovacaoDeAcao = { ...acao, id: aprovacaoId, agenteId, origem, gatilho, estado: 'pendente' }
    estado.aprovacoes.unshift(aprovacao)
    if (origem !== 'althius') {
      estado.previas
        .find((p) => p.canalId === origem)
        ?.mensagens.push({
          autor: nomeDe(agenteId),
          ehAgente: true,
          texto: `Preparei uma proposta: ${acao.acao}. Posso seguir?`,
          aprovacaoId,
        })
    }
    avisar()
    emitirAvisoDeSolicitacao(aprovacao)
    return aprovacaoId
  }

  /** O roteiro coordenado de um pedido: o da sugestão clicada, ou o da sugestão escrita no texto. */
  function roteiroDo({ texto, sugestaoId }: Mensagem): RoteiroCoordenado | undefined {
    if (sugestaoId) {
      const porId = roteirosCoordenados.find((r) => r.pedido.id === sugestaoId)
      if (porId) return porId
    }
    const pedido = normalizarNome(texto)
    if (pedido.includes('sequencia') || pedido.includes('sequencias')) {
      if (pedido.includes('okta') || pedido.includes('1 contato') || pedido.includes('um contato')) {
        return roteirosCoordenados.find((r) => r.pedido.id === 'coordenacao-sequencia-okta')
      }
      if (pedido.includes('openai') || pedido.includes('sinal') || pedido.includes('quente')) {
        return roteirosCoordenados.find((r) => r.pedido.id === 'coordenacao-sequencia-sinal')
      }
    }
    return roteirosCoordenados.find(
      ({ pedido: sugestao }) => pedido.includes(normalizarNome(sugestao.texto)),
    )
  }

  /**
   * Os passos roteirizados de um pedido: os do roteiro dele ou, num pedido seguinte da Conversa, a
   * continuação do último roteiro da Conversa que reconhece o pedido.
   */
  function passosRoteirizados(pedido: Mensagem, anteriores: Mensagem[]): PassoDeRoteiroCoordenado[] | undefined {
    const roteiro = roteiroDo(pedido)
    if (roteiro) return roteiro.passos
    const palavras = normalizarNome(pedido.texto).split(/[^\p{L}\p{N}]+/u)
    const roteiroAnterior = anteriores.map(roteiroDo).findLast((r) => r !== undefined)
    return roteiroAnterior?.continuacoes?.find(({ termo }) => palavras.includes(termo))?.passos
  }

  /**
   * O plano de uma Conversa coordenada (ADR 0004): o roteiro do pedido ou a continuação da Conversa, se
   * houver, com os Agentes @mencionados sempre incluídos; sem roteiro, a resposta genérica de cada
   * mencionado; e sem @, a resposta direta, sem chamar nenhum Agente.
   */
  function planoCoordenado(pedido: Mensagem, anteriores: Mensagem[]): PassoDeRoteiroCoordenado<AgenteId>[] {
    const mencionadosNaConversa = [...anteriores, pedido].map((mensagem) => reconhecerMencoes(mensagem.texto, estado.agentes))
    const mencionados = mencionadosNaConversa.at(-1) ?? []
    const roteirizados = passosRoteirizados(pedido, anteriores)
    if (!roteirizados) {
      if (mencionados.length === 0) return [respostaDireta(pedido.texto)]
      return [...mencionados.flatMap(etapaGenerica), consolidadaGenerica(mencionados.map((a) => a.nome))]
    }

    // Quando precisa de uma Especialidade, chama o Agente padrão, a menos que a Conversa mencione um Agente
    // criado dela: o mais recente, para a continuação seguir com quem já trabalhou no pedido.
    const quem = (especialidadeId: EspecialidadeId) =>
      (mencionadosNaConversa.flat().findLast((a) => a.tipo === 'criado' && a.especialidadeId === especialidadeId) ??
        agentePadrao(especialidadeId)).id
    const passos = roteirizados.map((passo) =>
      passo.tipo === 'resposta' ? passo : { ...passo, ator: quem(passo.ator) },
    )
    const chamados = new Set(passos.flatMap((passo) => (passo.tipo === 'chamada' ? [passo.ator] : [])))
    const extras = mencionados.filter((a) => !chamados.has(a.id)).flatMap(etapaGenerica)
    const indiceDaResposta = passos.findIndex((passo) => passo.tipo === 'resposta')
    return [...passos.slice(0, indiceDaResposta), ...extras, ...passos.slice(indiceDaResposta)]
  }

  /** Toda a fila: as revisões da Memória do Workspace, que persistem com ele, e as demais Aprovações. */
  function todasAsAprovacoes(): Aprovacao[] {
    return [...memoriaDoWorkspace.revisoes(), ...estado.aprovacoes]
  }

  /**
   * Decide uma revisão da Memória do Workspace. Como toda decisão, é uma ação da Execução que a propôs; se a
   * gravação falhar, a falha entra na Atividade e nada muda.
   */
  function decidirRevisao(aprovacaoId: string, decisao: Decisao, onde: LugarDaDecisao) {
    const { agenteId, gatilho, acao, revisao } = buscar(memoriaDoWorkspace.revisoes(), aprovacaoId)
    const { documento } = revisao
    const { oVigente, dele } = frasesDo(documento)
    const dependem = `as configurações que dependem ${dele}`
    const link = { rotulo: 'Ver Memória do Workspace', para: `/configuracoes/memoria/${documento}` }
    let decidida: AprovacaoDeRevisaoDecidida
    try {
      decidida = memoriaDoWorkspace.decidir(aprovacaoId, decisao)
    } catch (erro) {
      if (!(erro instanceof FalhaAoGravar)) throw erro
      registrarAcao({
        agenteId,
        gatilho,
        descricao: `Falhou ao decidir ${ondeFoiDecidida(onde)}: ${acao}`,
        resultado: `Nada foi alterado: ${oVigente} e ${dependem} continuam como estavam.`,
        link,
        falhou: true,
      })
      avisar()
      throw new Error(
        `Não foi possível concluir a decisão. ${maiuscula(oVigente)} e ${dependem} continuam como estavam; a proposta segue pendente.`,
      )
    }
    registrarAcao({
      agenteId,
      gatilho,
      descricao: `${ROTULO_DA_DECISAO[decisao]} ${ondeFoiDecidida(onde)}: ${acao}`,
      resultado:
        decisao === 'aprovada'
          ? `${efeitoDaDecisao(documento, decisao)} Nenhuma ação externa foi refeita.`
          : efeitoDaDecisao(documento, decisao),
      link,
    })
    emitirAviso(avisoDeRevisaoDecidida(decisao, decidida.revisao, participacoes.participacoesAtivas()))
  }

  /** A Permissão do Agente na Integração decide: Propor vira Aprovação, Executar age sozinho, Ler não age. */
  function agir(agenteId: AgenteId, acao: AcaoProposta): PassoDaCoordenacao {
    const permissao = estado.personalizacoes[agenteId].permissoes[acao.integracaoId]
    if (permissao === 'propor') {
      return { tipo: 'aprovacao', agenteId, aprovacaoId: criarAprovacao(agenteId, acao, 'althius', 'coordenacao') }
    }
    const executada = permissao === 'executar'
    if (executada) {
      registrarAcao({
        agenteId,
        gatilho: 'coordenacao',
        descricao: `Executou: ${acao.acao}`,
        resultado: 'Feito sem Aprovação, pela Permissão Executar.',
      })
      avisar()
    }
    return { tipo: 'acao', agenteId, acao, executada }
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    observarAvisos(ouvinte) {
      ouvintesDeAvisos.add(ouvinte)
      return () => ouvintesDeAvisos.delete(ouvinte)
    },

    workspace: () =>
      responder(() => ({
        cliente: participacoes.informacoes().nome,
        descricao: participacoes.informacoes().descricao,
        usuario: participacoes.usuario(),
        papel: participacoes.papelDaSessao(),
        aprovacoesPendentes: todasAsAprovacoes().filter((a) => a.estado === 'pendente').length,
      })),
    perfil: () =>
      responder(() => {
        const { nome, email, foto } = participacoes.usuario()
        return { nome, email, foto }
      }),
    salvarPerfil: (perfil) => mudar(() => participacoes.salvarPerfil(perfil)),
    preferencias: () => responder(() => participacoes.preferencias()),
    salvarPreferencias: (preferencias) => mudar(() => participacoes.salvarPreferencias(preferencias)),

    participantesDoWorkspace: () => responder(() => participacoes.participantesDoWorkspace()),
    contaDeUsuario: (contaId) => responder(() => participacoes.contaComParticipacoes(contaId)),
    salvarInformacoesDoWorkspace: (informacoes) => mudar(() => participacoes.salvarInformacoes(informacoes)),
    async convidarParaWorkspace(novo) {
      await esperar(Math.min(atrasoMs, 120))
      const convite = participacoes.convidar(novo)
      avisar()
      return structuredClone(convite)
    },
    cancelarConvite: (conviteId) => mudar(() => participacoes.cancelarConvite(conviteId)),
    mudarPapel: (contaId, papel) => mudar(() => participacoes.mudarPapel(contaId, papel)),
    removerDoWorkspace: (contaId) => mudar(() => participacoes.remover(contaId)),

    plano: () => responder(() => participacoes.plano(execucoesNoMes())),
    saldoDeCreditos: () => responder(() => ({ lancado: 4380, reservado: 120, disponivel: 4260, ilimitado: false })),
    precosDeCreditos: () => responder(() => [{ acao: 'agent_round', creditos: 1, descricao: 'Uma rodada de Agente' }, { acao: 'account_scan', creditos: 1, descricao: 'Uma Conta varrida por um Sinal' }, { acao: 'email_revealed', creditos: 2, descricao: 'Um e-mail revelado' }, { acao: 'phone_revealed', creditos: 5, descricao: 'Um telefone revelado' }]),
    extratoDeCreditos: () => responder(() => [{ id: 'demo-1', creditos: -2, tipo: 'acao', acao: 'email_revealed', sinal: 'Sinal de intenção de compra', criadoEm: '2026-09-23T12:00:00Z' }, { id: 'demo-2', creditos: 4500, tipo: 'plano', acao: null, sinal: null, criadoEm: '2026-09-01T12:00:00Z' }]),

    especialidades: () => responder(() => especialidades),

    agentes: () => responder(() => estado.agentes.map(montarAgente)),
    agente: (id) => responder(() => montarAgente(buscar(estado.agentes, id))),
    async criarAgente({ especialidadeId, complemento, instrucoes }) {
      await esperar(Math.min(atrasoMs, 120))
      if (!complemento.trim()) throw new Error('O Agente criado precisa de um complemento no nome.')
      const nome = nomeDeAgenteCriado(especialidade(especialidadeId), complemento)
      if (estado.agentes.some((a) => a.nome === nome)) throw new Error(`Já existe um Agente chamado ${nome}.`)

      const padrao = agentePadrao(especialidadeId)
      const id = novoId(`agente-${especialidadeId}`)
      estado.agentes.push({ id, nome, tipo: 'criado', especialidadeId, estado: 'ocioso', execucoes: 0 })
      const personalizacao = structuredClone(estado.personalizacoes[padrao.id])
      estado.personalizacoes[id] = { ...personalizacao, instrucoes: instrucoes.trim() || personalizacao.instrucoes }
      estado.habilidades.push(
        ...estado.habilidades
          .filter((h) => h.agenteId === padrao.id)
          .map((h) => ({ ...h, id: novoId('habilidade'), agenteId: id })),
      )
      avisar()
      return structuredClone(montarAgente(buscar(estado.agentes, id)))
    },
    excluirAgente: (id) =>
      mudar(() => {
        if (buscar(estado.agentes, id).tipo === 'padrao') throw new Error('O Agente padrão não pode ser excluído.')
        const deOutro = <T extends { agenteId: AgenteId }>(item: T) => item.agenteId !== id
        estado.agentes = estado.agentes.filter((a) => a.id !== id)
        estado.fatos = estado.fatos.filter(deOutro)
        estado.habilidades = estado.habilidades.filter(deOutro)
        estado.rotinas = estado.rotinas.filter(deOutro)
        estado.atividade = estado.atividade.filter(deOutro)
        estado.aprovacoes = estado.aprovacoes.filter(deOutro)
        delete estado.personalizacoes[id]
      }),

    memoria: (id) => responder(() => estado.fatos.filter((f) => f.agenteId === id)),
    editarFato: (fatoId, texto) =>
      mudar(() => {
        buscar(estado.fatos, fatoId).texto = texto
      }),
    apagarFato: (fatoId) =>
      mudar(() => {
        estado.fatos = estado.fatos.filter((f) => f.id !== fatoId)
      }),

    habilidades: (id) => responder(() => estado.habilidades.filter((h) => h.agenteId === id)),
    definirHabilidadeAtiva: (habilidadeId, ativa) =>
      mudar(() => {
        buscar(estado.habilidades, habilidadeId).ativa = ativa
      }),

    rotinas: (id) => responder(() => estado.rotinas.filter((r) => r.agenteId === id)),
    criarRotina: (rotina: NovaRotina) =>
      mudar(() => {
        estado.rotinas.push({ ...rotina, id: novoId('rotina'), pausada: false })
      }),
    editarRotina: (rotinaId, rotina) =>
      mudar(() => {
        Object.assign(buscar(estado.rotinas, rotinaId), rotina)
      }),
    definirRotinaPausada: (rotinaId, pausada) =>
      mudar(() => {
        buscar(estado.rotinas, rotinaId).pausada = pausada
      }),
    excluirRotina: (rotinaId) =>
      mudar(() => {
        estado.rotinas = estado.rotinas.filter((r) => r.id !== rotinaId)
      }),

    atividade: (id, gatilho) =>
      responder(() => estado.atividade.filter((a) => a.agenteId === id && (!gatilho || a.gatilho === gatilho))),

    personalizacao: (id) => responder(() => estado.personalizacoes[id]),
    salvarPersonalizacao: (id, personalizacao) =>
      mudar(() => {
        estado.personalizacoes[id] = structuredClone(personalizacao)
      }),

    canais: () => responder(() => estado.canais),
    integracoes: () => responder(() => estado.integracoes),
    integracoesFuturas: () => responder(() => demo.integracoesFuturas),
    conectar: (conexao: CanalId | IntegracaoId) =>
      mudar(() => {
        const canal = estado.canais.find((c) => c.id === conexao)
        if (canal) canal.conectado = true
        const integracao = estado.integracoes.find((i) => i.id === conexao)
        if (integracao) integracao.conectada = true
      }),
    previaDeCanal: (canalId) =>
      responder(() => {
        const previa = estado.previas.find((p) => p.canalId === canalId)
        if (!previa) throw new Error(`Sem prévia para o canal: ${canalId}`)
        return previa
      }),

    memoriaDoWorkspace: () => responder(() => memoriaDoWorkspace.memoria()),
    async solicitarRevisao(documento, pedido) {
      await esperar()
      const { agenteId } = DOCUMENTOS_DA_MEMORIA[documento]
      const { oVigente, naoMudou } = frasesDo(documento)
      const oVigenteNaoMudou = `${oVigente} ${naoMudou}`
      let aprovacao: AprovacaoDeRevisaoPendente
      try {
        aprovacao = memoriaDoWorkspace.solicitar(documento, pedido)
      } catch (erro) {
        if (!(erro instanceof FalhaAoGravar)) throw erro
        registrarExecucao({
          agenteId,
          gatilho: 'conversa',
          descricao: `Respondeu a um pedido de revisão: "${pedido.trim()}"`,
          resultado: `Não registrou a proposta: ${oVigenteNaoMudou}.`,
          falhou: true,
        })
        avisar()
        throw new Error(`Não foi possível registrar a proposta. ${maiuscula(oVigenteNaoMudou)}; tente de novo.`)
      }
      const { revisao } = aprovacao
      // O pedido é uma Conversa com o Agente: a proposta é o resultado dessa Execução, que conta pela revisão.
      registrarNaAtividade(
        novaExecucao({
          agenteId,
          gatilho: 'conversa',
          descricao: `Respondeu ao pedido de revisão de ${revisao.solicitante.nome}: "${revisao.pedido}"`,
          resultado: `Propôs: ${aprovacao.acao}. Aguardando a decisão de um Administrador.`,
          link: { rotulo: 'Ver Aprovações', para: '/aprovacoes' },
        }),
      )
      avisar()
      emitirAvisoDeSolicitacao(aprovacao)
      return structuredClone(aprovacao)
    },

    aprovacoes: () => responder(todasAsAprovacoes),
    decidirAprovacao: (aprovacaoId, decisao, onde) =>
      mudar(() => {
        if (memoriaDoWorkspace.ehRevisao(aprovacaoId)) return decidirRevisao(aprovacaoId, decisao, onde)
        const aprovacao = buscar(estado.aprovacoes, aprovacaoId)
        aprovacao.estado = decisao
        registrarAcao({
          agenteId: aprovacao.agenteId,
          gatilho: aprovacao.gatilho,
          descricao: `${ROTULO_DA_DECISAO[decisao]} ${ondeFoiDecidida(onde)}: ${aprovacao.acao}`,
          resultado: decisao === 'aprovada' ? 'Ação executada.' : 'Nada foi alterado.',
          link: aprovacao.sequenciaId
            ? { rotulo: 'Ver sequência', para: `/sequencias/${aprovacao.sequenciaId}` }
            : { rotulo: 'Ver Aprovações', para: '/aprovacoes' },
        })
        const { id: contaId, nome } = participacoes.usuario()
        const decisaoDaSessao = { solicitanteId: solicitantes.get(aprovacaoId), decididaPor: { contaId, nome } }
        emitirAviso(
          avisoDeAprovacaoDecidida(
            aprovacao,
            decisao,
            { ...decisaoDaSessao, onde: ondeFoiDecidida(onde) },
            participacoes.participacoesAtivas(),
          ),
        )
      }),
    proporAprovacao: async (proposta) => {
      await esperar(Math.min(atrasoMs, 120))
      if (proposta.sequenciaId) {
        const existente = estado.aprovacoes.find((a) => a.sequenciaId === proposta.sequenciaId)
        if (existente) return structuredClone(existente)
      }
      const aprovacaoId = novoId('aprovacao')
      const nova: AprovacaoDeAcao = {
        id: aprovacaoId,
        agenteId: proposta.agenteId,
        acao: proposta.acao,
        integracaoId: proposta.integracaoId ?? 'hubspot',
        impacto: proposta.impacto,
        justificativa: proposta.justificativa,
        origem: proposta.origem ?? 'althius',
        gatilho: proposta.gatilho ?? 'conversa',
        estado: 'pendente',
        contaId: proposta.contaId,
        contaNome: proposta.contaNome,
        sequenciaId: proposta.sequenciaId,
      }
      estado.aprovacoes.unshift(nova)
      if (nova.origem !== 'althius') {
        estado.previas
          .find((p) => p.canalId === nova.origem)
          ?.mensagens.push({
            autor: nomeDe(proposta.agenteId),
            ehAgente: true,
            texto: `Preparei uma proposta: ${proposta.acao}. Posso seguir?`,
            aprovacaoId,
          })
      }
      avisar()
      emitirAvisoDeSolicitacao(nova)
      return structuredClone(nova)
    },

    async *conversar(id, { texto, sugestaoId }): AsyncGenerator<PassoDaConversa> {
      const passos = roteiroPara(id, texto, sugestaoId)
      const roteirizado = Boolean(sugestaoId && roteiros[sugestaoId])
      const participantes = participantesDe(passos)
      const anteriores = new Map(participantes.map((agenteId) => [agenteId, buscar(estado.agentes, agenteId).estado]))
      if (participantes.some((agenteId) => gravarEstado(agenteId, 'trabalhando'))) avisar()
      for (const passo of passos) {
        await esperar()
        if (passo.tipo === 'aprovacao') {
          const { origem, ...acao } = passo.aprovacao
          yield { tipo: 'aprovacao', agenteId: passo.ator, aprovacaoId: criarAprovacao(passo.ator, acao, origem, 'conversa') }
        } else if (passo.tipo === 'repasse') {
          yield passo
        } else {
          const { ator, ...resto } = passo
          yield { ...resto, agenteId: ator }
        }
      }
      const mencionadoId = mencionado(id, texto, sugestaoId)?.id
      for (const agenteId of participantes) {
        const anfitriao = agenteId === id
        registrarExecucao({
          agenteId,
          gatilho: anfitriao ? 'conversa' : 'mencao',
          descricao: anfitriao
            ? `Respondeu: "${texto}"`
            : agenteId === mencionadoId
              ? `Foi mencionado por ${nomeDe(id)}: "${texto}"`
              : `Entrou na Conversa de ${nomeDe(id)}: "${texto}"`,
          resultado: resultadoDe(passos, agenteId),
          link: linkDaConversa(id),
        })
        gravarEstado(agenteId, roteirizado ? 'detectou' : anteriores.get(agenteId)!)
      }
      avisar()
    },

    sugestoesCoordenadas: () => responder(() => roteirosCoordenados.map((roteiro) => roteiro.pedido)),

    async *conversarCoordenado(pedido, anteriores): AsyncGenerator<PassoDaCoordenacao> {
      const plano = planoCoordenado(pedido, anteriores)
      const chamados = new Set(
        plano.flatMap((passo) => (passo.tipo === 'resposta' ? [] : [passo.ator])),
      )
      const antes = new Map([...chamados].map((agenteId) => [agenteId, buscar(estado.agentes, agenteId).estado]))
      const comFeito = new Set<AgenteId>()
      if ([...chamados].some((agenteId) => gravarEstado(agenteId, 'trabalhando'))) avisar()
      for (const passo of plano) {
        await esperar()
        if (passo.tipo === 'resposta') {
          yield passo
          continue
        }
        if (passo.tipo === 'acao') {
          yield agir(passo.ator, passo.acao)
          continue
        }
        if (passo.tipo === 'nascimento-sequencia') {
          yield {
            tipo: 'nascimento-sequencia',
            agenteId: passo.ator,
            contaId: passo.contaId,
            sinal: passo.sinal,
            sequenciaId: passo.sequenciaId,
          }
          continue
        }
        if (passo.tipo === 'feito') {
          comFeito.add(passo.ator)
          // Quem trabalha é o Agente chamado: o trabalho entra na Atividade dele.
          registrarExecucao({
            agenteId: passo.ator,
            gatilho: 'coordenacao',
            descricao: `Chamado pela Coordenação: "${pedido.texto}"`,
            resultado: passo.resumo,
            link: { rotulo: 'Ver Conversa', para: '/conversa' },
          })
          avisar()
        }
        const { ator, ...resto } = passo
        yield { ...resto, agenteId: ator }
      }
      for (const agenteId of chamados) {
        gravarEstado(agenteId, comFeito.has(agenteId) ? 'detectou' : antes.get(agenteId)!)
      }
      if (chamados.size > 0) avisar()
    },
  }
}
