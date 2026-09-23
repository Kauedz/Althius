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
  RESPOSTA_DIRETA,
  respostaDeMencao,
  respostaGenerica,
  roteiros,
  roteirosCoordenados,
  type PassoDeRoteiro,
  type PassoDeRoteiroCoordenado,
} from './roteiros'
import type {
  AcaoProposta,
  Agente,
  AgenteId,
  CanalId,
  EspecialidadeId,
  FonteDeAgentes,
  IntegracaoId,
  ItemDeAtividade,
  NovaRotina,
  Origem,
  PassoDaConversa,
  PassoDaCoordenacao,
} from './tipos'

interface Opcoes {
  /** Atraso simulado de cada resposta e de cada passo da Conversa. */
  atrasoMs?: number
}

export function criarFonteSimulada({ atrasoMs = 450 }: Opcoes = {}): FonteDeAgentes {
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

  function registrarAtividade(item: Omit<ItemDeAtividade, 'id' | 'quando'>) {
    estado.atividade.unshift({ ...item, id: novoId('atividade'), quando: 'Agora' })
  }

  function nomeDe(id: AgenteId) {
    return buscar(estado.agentes, id).nome
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
        : { ...passo, agenteId: quem(passo.agenteId) },
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

  /** Cria a Aprovação de uma ação proposta; fora da Althius, ela também chega no Canal de origem, com os botões de decisão. */
  function criarAprovacao(agenteId: AgenteId, acao: AcaoProposta, origem: Origem): string {
    const aprovacaoId = novoId('aprovacao')
    estado.aprovacoes.unshift({ ...acao, id: aprovacaoId, agenteId, origem, estado: 'pendente' })
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

  /**
   * O plano de uma Conversa coordenada (ADR 0004): o roteiro do pedido, se houver, com os Agentes
   * @mencionados sempre incluídos; sem roteiro, a resposta genérica de cada mencionado; e sem @, a
   * resposta direta, sem chamar nenhum Agente.
   */
  function planoCoordenado(texto: string, sugestaoId?: string): PassoDeRoteiroCoordenado<AgenteId>[] {
    const mencionados = reconhecerMencoes(texto, estado.agentes)
    const pedido = normalizarNome(texto)
    const roteiro = roteirosCoordenados.find(
      ({ pedido: sugestao }) => sugestao.id === sugestaoId || pedido.includes(normalizarNome(sugestao.texto)),
    )
    if (!roteiro) {
      if (mencionados.length === 0) return [RESPOSTA_DIRETA]
      return [...mencionados.flatMap(etapaGenerica), consolidadaGenerica(mencionados.map((a) => a.nome))]
    }

    // Quando precisa de uma Especialidade, chama o Agente padrão, a menos que o pedido mencione um Agente criado dela.
    const quem = (especialidadeId: EspecialidadeId) =>
      (mencionados.find((a) => a.tipo === 'criado' && a.especialidadeId === especialidadeId) ?? agentePadrao(especialidadeId)).id
    const passos = roteiro.passos.map((passo) =>
      passo.tipo === 'resposta' ? passo : { ...passo, agenteId: quem(passo.agenteId) },
    )
    const chamados = new Set(passos.flatMap((passo) => (passo.tipo === 'chamada' ? [passo.agenteId] : [])))
    const extras = mencionados.filter((a) => !chamados.has(a.id)).flatMap(etapaGenerica)
    const indiceDaResposta = passos.findIndex((passo) => passo.tipo === 'resposta')
    return [...passos.slice(0, indiceDaResposta), ...extras, ...passos.slice(indiceDaResposta)]
  }

  /** A Permissão do Agente na Integração decide: Propor vira Aprovação, Executar age sozinho, Ler não age. */
  function agir(agenteId: AgenteId, acao: AcaoProposta): PassoDaCoordenacao {
    const permissao = estado.personalizacoes[agenteId].permissoes[acao.integracaoId]
    if (permissao === 'propor') {
      return { tipo: 'aprovacao', agenteId, aprovacaoId: criarAprovacao(agenteId, acao, 'althius') }
    }
    const executada = permissao === 'executar'
    if (executada) {
      registrarAtividade({
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
        ...demo.workspace,
        aprovacoesPendentes: estado.aprovacoes.filter((a) => a.estado === 'pendente').length,
      })),

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
          .map((h) => ({ ...h, id: novoId('habilidade'), agenteId: id, usos: 0 })),
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
        registrarAtividade({
          agenteId: aprovacao.agenteId,
          gatilho: onde === 'althius' ? 'conversa' : 'canal',
          descricao: `${ROTULO_DA_DECISAO[decisao]}: ${aprovacao.acao}`,
          resultado: decisao === 'aprovada' ? 'Ação executada.' : 'Nada foi alterado.',
          link: { rotulo: 'Ver Aprovações', para: '/aprovacoes' },
        })
      }),

    async *conversar(id, { texto, sugestaoId }): AsyncGenerator<PassoDaConversa> {
      const passos = roteiroPara(id, texto, sugestaoId)
      for (const passo of passos) {
        await esperar()
        if (passo.tipo === 'aprovacao') {
          const { origem, ...acao } = passo.aprovacao
          yield { tipo: 'aprovacao', agenteId: passo.agenteId, aprovacaoId: criarAprovacao(passo.agenteId, acao, origem) }
        } else {
          yield passo
        }
      }
      registrarAtividade({
        agenteId: id,
        gatilho: 'conversa',
        descricao: `Respondeu: "${texto}"`,
        resultado: `${passos.length} passos na Conversa.`,
      })
      const outro = mencionado(id, texto, sugestaoId)
      if (outro) {
        registrarAtividade({
          agenteId: outro.id,
          gatilho: 'mencao',
          descricao: `Foi mencionado por ${nomeDe(id)}: "${texto}"`,
          resultado: 'Entrou na Conversa e complementou a resposta.',
        })
      }
      avisar()
    },

    sugestoesCoordenadas: () => responder(() => roteirosCoordenados.map((roteiro) => roteiro.pedido)),

    async *conversarCoordenado({ texto, sugestaoId }): AsyncGenerator<PassoDaCoordenacao> {
      for (const passo of planoCoordenado(texto, sugestaoId)) {
        await esperar()
        if (passo.tipo === 'acao') {
          yield agir(passo.agenteId, passo.acao)
          continue
        }
        if (passo.tipo === 'feito') {
          // Quem trabalha é o Agente chamado: o trabalho entra na Atividade dele.
          registrarAtividade({
            agenteId: passo.agenteId,
            gatilho: 'coordenacao',
            descricao: `Chamado pela Coordenação: "${texto}"`,
            resultado: passo.resumo,
          })
          avisar()
        }
        yield passo
      }
    },
  }
}
