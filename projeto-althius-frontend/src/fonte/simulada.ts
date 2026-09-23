// Implementação simulada da fonte de dados dos Agentes. O estado vive em memória:
// as mudanças valem até recarregar a página.
import * as demo from './dados-demo'
import type { RegistroDeAgente } from './dados-demo'
import { especialidade, especialidades } from './especialidades'
import { nomeDeAgenteCriado, ROTULO_DA_DECISAO } from './regras'
import { respostaDeMencao, respostaGenerica, roteiros, type PassoDeRoteiro } from './roteiros'
import type {
  Agente,
  AgenteId,
  CanalId,
  EspecialidadeId,
  FonteDeAgentes,
  IntegracaoId,
  ItemDeAtividade,
  NovaRotina,
  PassoDaConversa,
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

  /** Agentes mencionados com @Nome no texto, na ordem em que aparecem. */
  function mencoes(texto: string): RegistroDeAgente[] {
    return [...texto.matchAll(/@(\p{L}+)/gu)]
      .map(([, nome]) => estado.agentes.find((a) => a.nome.toLowerCase() === nome.toLowerCase()))
      .filter((agente): agente is RegistroDeAgente => agente !== undefined)
  }

  function roteiroPara(id: AgenteId, texto: string, sugestaoId?: string): PassoDeRoteiro<AgenteId>[] {
    const atual = buscar(estado.agentes, id)
    if (sugestaoId && roteiros[sugestaoId]) return atribuir(roteiros[sugestaoId], atual)
    const outro = mencoes(texto).find((mencionado) => mencionado.id !== id)
    if (outro) return respostaDeMencao(id, outro)
    return atribuir(respostaGenerica(atual.especialidadeId, atual.nome), atual)
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
          const aprovacaoId = novoId('aprovacao')
          estado.aprovacoes.unshift({ ...passo.aprovacao, id: aprovacaoId, agenteId: passo.agenteId, estado: 'pendente' })
          // A Aprovação também chega no Canal de origem, com os botões de decisão.
          const origem = passo.aprovacao.origem
          if (origem !== 'althius') {
            estado.previas
              .find((p) => p.canalId === origem)
              ?.mensagens.push({
                autor: nomeDe(passo.agenteId),
                ehAgente: true,
                texto: `Preparei uma proposta: ${passo.aprovacao.acao}. Posso seguir?`,
                aprovacaoId,
              })
          }
          avisar()
          yield { tipo: 'aprovacao', agenteId: passo.agenteId, aprovacaoId }
        } else {
          yield passo
        }
      }
      registrarAtividade({
        agenteId: id,
        gatilho: mencoes(texto).some((m) => m.id !== id) ? 'mencao' : 'conversa',
        descricao: `Respondeu: "${texto}"`,
        resultado: `${passos.length} passos na Conversa.`,
      })
      avisar()
    },
  }
}
