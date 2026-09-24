// Implementação simulada da fonte de dados dos Agentes. O estado vive em memória:
// as mudanças valem até recarregar a página.
import * as demo from './dados-demo'
import type { RegistroDeAgente } from './dados-demo'
import { especialidade, especialidades } from './especialidades'
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
import { criarParticipacoesSimuladas, type ArmazenamentoDemonstrativo, type Sessao } from './simulada-participacoes'
import type {
  AcaoProposta,
  Agente,
  AgenteId,
  Aprovacao,
  CanalId,
  EspecialidadeId,
  EstadoAgente,
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
   * Quando presente, o perfil pessoal (nome, e-mail, foto), associado à Conta de usuário, e o Workspace
   * (informações, Participações e convites), associado ao Workspace, sobrevivem a um refresh. Sem isso,
   * valem só na instância — útil para isolar os testes.
   */
  armazenamento?: ArmazenamentoDemonstrativo | null
  /** A Conta de usuário da sessão e, se preciso, o seu papel: só para preparar cenários de teste. */
  sessao?: Sessao
}

export function criarFonteSimulada({
  atrasoMs = 450,
  armazenamento = null,
  sessao,
}: OpcoesFonteSimulada = {}): FonteDeAgentes {
  const participacoes = criarParticipacoesSimuladas({ armazenamento, sessao })
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
  const ouvintes = new Set<() => void>()
  let proximoId = 1

  const novoId = (prefixo: string) => `${prefixo}-${proximoId++}`
  const esperar = (ms = atrasoMs) => new Promise<void>((resolver) => setTimeout(resolver, ms))
  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte())

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

  /** Registra uma Execução na Atividade do Agente: é só aqui que as execuções dele sobem. */
  function registrarExecucao(item: NovoItem) {
    estado.atividade.unshift({ ...item, tipo: 'execucao', id: novoId('atividade'), quando: 'Agora' })
    buscar(estado.agentes, item.agenteId).execucoes++
  }

  /** Registra uma ação dentro de uma Execução (agir pela Permissão Executar, decidir uma Aprovação). */
  function registrarAcao(item: NovoItem) {
    estado.atividade.unshift({ ...item, tipo: 'acao', id: novoId('atividade'), quando: 'Agora' })
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
    estado.aprovacoes.unshift({ ...acao, id: aprovacaoId, agenteId, origem, gatilho, estado: 'pendente' })
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

    workspace: () =>
      responder(() => ({
        cliente: participacoes.informacoes().nome,
        descricao: participacoes.informacoes().descricao,
        usuario: participacoes.usuario(),
        papel: participacoes.papelDaSessao(),
        aprovacoesPendentes: estado.aprovacoes.filter((a) => a.estado === 'pendente').length,
      })),
    salvarPerfil: (perfil) => mudar(() => participacoes.salvarPerfil(perfil)),

    participantesDoWorkspace: () => responder(() => participacoes.participantesDoWorkspace()),
    contaDeUsuario: (contaId) => responder(() => participacoes.contaComParticipacoes(contaId)),
    salvarDescricaoDoWorkspace: (descricao) => mudar(() => participacoes.salvarDescricao(descricao)),
    async convidarParaWorkspace(novo) {
      await esperar(Math.min(atrasoMs, 120))
      const convite = participacoes.convidar(novo)
      avisar()
      return structuredClone(convite)
    },
    cancelarConvite: (conviteId) => mudar(() => participacoes.cancelarConvite(conviteId)),
    mudarPapel: (contaId, papel) => mudar(() => participacoes.mudarPapel(contaId, papel)),
    removerDoWorkspace: (contaId) => mudar(() => participacoes.remover(contaId)),

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

    aprovacoes: () => responder(() => estado.aprovacoes),
    decidirAprovacao: (aprovacaoId, decisao, onde) =>
      mudar(() => {
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
      }),
    proporAprovacao: async (proposta) => {
      await esperar(Math.min(atrasoMs, 120))
      if (proposta.sequenciaId) {
        const existente = estado.aprovacoes.find((a) => a.sequenciaId === proposta.sequenciaId)
        if (existente) return structuredClone(existente)
      }
      const aprovacaoId = novoId('aprovacao')
      const nova: Aprovacao = {
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
