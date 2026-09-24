import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  aplicarMudancas,
  CONVITES_INICIAIS,
  DOCUMENTOS,
  HOJE,
  ATUALIZACOES_DA_IA,
  MEMORIA_INICIAL,
  PALAVRAS_DO_RESUMO,
  RESUMO_INICIAL,
  PARTICIPANTES_INICIAIS,
  ROTEIROS,
  type Convite,
  type Documento,
  type DocumentoId,
  type Papel,
  type Participante,
  type Resumo,
  type Secao,
} from './dados'

export type Tema = 'escuro' | 'claro'

/** A permissão simulada do navegador. O mockup nunca chama a API real de notificações. */
export type PermissaoDoNavegador = 'perguntar' | 'concedida' | 'negada' | 'indisponivel'

export type EstadoDasNotificacoes = 'desligado' | 'ativado' | 'bloqueado' | 'nao-suportado'

export interface Proposta {
  id: string
  documentoId: DocumentoId
  pedido: string
  resposta: string
  solicitanteId: string
  criadaEm: string
  /** O documento inteiro como ficaria: a decisão troca o vigente por este de uma vez. */
  secoes: Secao[]
  /** As seções que mudam em relação ao vigente no momento do pedido. */
  vigenteNoPedido: Secao[]
  estado: 'pendente' | 'aprovada' | 'recusada'
  decididaPor?: string
}

/** Um aviso do navegador, simulado, para as pessoas em `para`: aparece quando uma delas está vendo a tela. */
export interface Aviso {
  id: number
  titulo: string
  texto: string
  para: string[]
}

interface Estado {
  visitanteId: string
  participantes: Participante[]
  convites: Convite[]
  tema: Tema
  notificacoes: { preferencia: boolean; navegador: PermissaoDoNavegador }
  memoria: Record<DocumentoId, Documento>
  resumo: Resumo
  propostas: Proposta[]
  avisos: Aviso[]
}

function estadoInicial(tema: Tema): Estado {
  return {
    visitanteId: 'marina',
    participantes: PARTICIPANTES_INICIAIS,
    convites: CONVITES_INICIAIS,
    tema,
    notificacoes: { preferencia: false, navegador: 'perguntar' },
    memoria: MEMORIA_INICIAL,
    resumo: RESUMO_INICIAL,
    propostas: [],
    avisos: [],
  }
}

type Erro = string | null

interface MockupDeConfiguracoes extends Estado {
  visitante: Participante
  ehAdministrador: boolean
  estadoDasNotificacoes: EstadoDasNotificacoes
  verComo: (id: string) => void
  salvarPerfil: (dados: Pick<Participante, 'nome' | 'email' | 'foto'>) => void
  mudarTema: (tema: Tema) => void
  simularNavegador: (permissao: PermissaoDoNavegador) => void
  ligarNotificacoes: (ligar: boolean) => void
  convidar: (email: string, papel: Papel) => Erro
  cancelarConvite: (id: string) => void
  simularAceite: (id: string) => void
  mudarPapel: (id: string, papel: Papel) => Erro
  remover: (id: string) => Erro
  solicitarRevisao: (documentoId: DocumentoId, pedido: string) => Promise<Proposta>
  decidir: (propostaId: string, decisao: 'aprovada' | 'recusada') => Erro
  avisar: (titulo: string, texto: string, para?: string[]) => void
  dispensarAviso: (id: number) => void
  /** Uma pergunta é respondida pelo resumo; um pedido de atualização só vale para Administradores. */
  conversarComOResumo: (mensagem: string) => string
  editarResumo: (secoes: Secao[]) => Erro
  simularAtualizacaoDaIA: () => void
  recomecar: () => void
}

const Contexto = createContext<MockupDeConfiguracoes | null>(null)

export const CHAVE_DO_TEMA = 'althius-mockup-configuracoes-tema'

export const ERRO_ULTIMO_ADMINISTRADOR = 'O Workspace precisa de pelo menos um Administrador. Torne outra pessoa Administrador antes.'
export const ERRO_SO_ADMINISTRADOR = 'Somente Administradores podem fazer isso.'

function administradores(participantes: Participante[]) {
  return participantes.filter((p) => p.papel === 'administrador')
}

export function ehUltimoAdministrador(participantes: Participante[], id: string) {
  const admins = administradores(participantes)
  return admins.length === 1 && admins[0].id === id
}

/** Guarda em memória o estado do mockup; recarregar a página recomeça. */
export function MockupProvider({ atrasoMs, temaInicial, children }: { atrasoMs: number; temaInicial: Tema; children: ReactNode }) {
  const [estado, setEstadoReact] = useState(() => estadoInicial(temaInicial))
  // As operações validam sobre o estado mais recente, como faria a fonte, e não sobre o da renderização.
  const atual = useRef(estado)
  const proximoId = useRef(1)
  const proximaAtualizacaoDaIA = useRef(0)

  const setEstado = useCallback((mudar: (e: Estado) => Estado) => {
    atual.current = mudar(atual.current)
    setEstadoReact(atual.current)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = estado.tema
    try {
      localStorage.setItem(CHAVE_DO_TEMA, estado.tema)
    } catch {
      // Sem armazenamento, o tema vale até recarregar.
    }
  }, [estado.tema])

  const visitanteDe = (e: Estado) => e.participantes.find((p) => p.id === e.visitanteId) ?? e.participantes[0]
  const notificacoesAtivas = (e: Estado) => e.notificacoes.preferencia && e.notificacoes.navegador === 'concedida'

  const avisar = useCallback(
    (titulo: string, texto: string, para?: string[]) => {
      const id = proximoId.current++
      setEstado((e) => ({ ...e, avisos: [...e.avisos, { id, titulo, texto, para: para ?? [e.visitanteId] }] }))
    },
    [setEstado],
  )

  const exigirAdministrador = (): Erro =>
    visitanteDe(atual.current).papel === 'administrador' ? null : ERRO_SO_ADMINISTRADOR

  const valor = useMemo<MockupDeConfiguracoes>(() => {
    const visitante = visitanteDe(estado)
    const { preferencia, navegador } = estado.notificacoes
    const estadoDasNotificacoes: EstadoDasNotificacoes =
      navegador === 'indisponivel'
        ? 'nao-suportado'
        : navegador === 'negada'
          ? 'bloqueado'
          : preferencia && navegador === 'concedida'
            ? 'ativado'
            : 'desligado'

    return {
      ...estado,
      visitante,
      ehAdministrador: visitante.papel === 'administrador',
      estadoDasNotificacoes,

      verComo: (id) => setEstado((e) => ({ ...e, visitanteId: id })),

      salvarPerfil: (dados) =>
        setEstado((e) => ({
          ...e,
          participantes: e.participantes.map((p) => (p.id === e.visitanteId ? { ...p, ...dados } : p)),
        })),

      mudarTema: (tema) => setEstado((e) => ({ ...e, tema })),

      simularNavegador: (permissao) =>
        setEstado((e) => ({ ...e, notificacoes: { ...e.notificacoes, navegador: permissao } })),

      ligarNotificacoes: (ligar) =>
        setEstado((e) => ({ ...e, notificacoes: { ...e.notificacoes, preferencia: ligar } })),

      convidar: (email, papel) => {
        const erro = exigirAdministrador()
        if (erro) return erro
        const normalizado = email.trim().toLowerCase()
        if (atual.current.participantes.some((p) => p.email === normalizado)) return 'Essa pessoa já participa do Workspace.'
        if (atual.current.convites.some((c) => c.email === normalizado)) return 'Já existe um convite pendente para esse e-mail.'
        const id = `convite-${proximoId.current++}`
        setEstado((e) => ({ ...e, convites: [...e.convites, { id, email: normalizado, papel, enviadoEm: HOJE }] }))
        return null
      },

      cancelarConvite: (id) => {
        if (exigirAdministrador()) return
        setEstado((e) => ({ ...e, convites: e.convites.filter((c) => c.id !== id) }))
      },

      simularAceite: (id) =>
        setEstado((e) => {
          const convite = e.convites.find((c) => c.id === id)
          if (!convite) return e
          const nome = convite.email
            .split('@')[0]
            .split('.')
            .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
            .join(' ')
          const novo: Participante = { id, nome, email: convite.email, papel: convite.papel, cargo: '', outrosWorkspaces: [] }
          return { ...e, convites: e.convites.filter((c) => c.id !== id), participantes: [...e.participantes, novo] }
        }),

      mudarPapel: (id, papel) => {
        const erro = exigirAdministrador()
        if (erro) return erro
        if (papel === 'membro' && ehUltimoAdministrador(atual.current.participantes, id)) return ERRO_ULTIMO_ADMINISTRADOR
        setEstado((e) => ({ ...e, participantes: e.participantes.map((p) => (p.id === id ? { ...p, papel } : p)) }))
        return null
      },

      remover: (id) => {
        const erro = exigirAdministrador()
        if (erro) return erro
        if (ehUltimoAdministrador(atual.current.participantes, id)) return ERRO_ULTIMO_ADMINISTRADOR
        if (id === atual.current.visitanteId) return 'Você não pode remover a si mesmo por aqui.'
        setEstado((e) => ({ ...e, participantes: e.participantes.filter((p) => p.id !== id) }))
        return null
      },

      solicitarRevisao: async (documentoId, pedido) => {
        await new Promise((resolver) => setTimeout(resolver, atrasoMs))
        const e = atual.current
        const vigente = e.memoria[documentoId]
        const feitas = e.propostas.filter((p) => p.documentoId === documentoId).length
        const roteiro = ROTEIROS[documentoId][feitas % ROTEIROS[documentoId].length]
        const proposta: Proposta = {
          id: `proposta-${proximoId.current++}`,
          documentoId,
          pedido,
          resposta: roteiro.resposta,
          solicitanteId: e.visitanteId,
          criadaEm: HOJE,
          secoes: aplicarMudancas(vigente.secoes, roteiro.mudancas),
          vigenteNoPedido: vigente.secoes,
          estado: 'pendente',
        }
        setEstado((anterior) => ({ ...anterior, propostas: [proposta, ...anterior.propostas] }))
        // O aviso para decidir vai aos Administradores; não dá a ninguém a capacidade de aprovar.
        if (notificacoesAtivas(e)) {
          avisar(
            `Revisão ${DOCUMENTOS[documentoId].comArtigo} aguardando Aprovação`,
            `${DOCUMENTOS[documentoId].agente} propôs uma nova versão a pedido de ${visitanteDe(e).nome}.`,
            administradores(e.participantes).map((p) => p.id),
          )
        }
        return proposta
      },

      decidir: (propostaId, decisao) => {
        const erro = exigirAdministrador()
        if (erro) return 'Somente Administradores aprovam ou recusam revisões do ICP e das Personas.'
        const e = atual.current
        const proposta = e.propostas.find((p) => p.id === propostaId)
        if (!proposta || proposta.estado !== 'pendente') return 'Essa proposta já foi decidida.'
        const decisor = visitanteDe(e)
        // Aprovar troca o documento vigente numa mudança só; as configurações dependentes leem o novo documento.
        setEstado((anterior) => ({
          ...anterior,
          propostas: anterior.propostas.map((p) => (p.id === propostaId ? { ...p, estado: decisao, decididaPor: decisor.nome } : p)),
          memoria:
            decisao === 'aprovada'
              ? {
                  ...anterior.memoria,
                  [proposta.documentoId]: {
                    id: proposta.documentoId,
                    secoes: proposta.secoes,
                    aprovadoEm: HOJE,
                    aprovadoPor: decisor.nome,
                    propostaId,
                  },
                }
              : anterior.memoria,
        }))
        if (notificacoesAtivas(e)) {
          avisar(
            `Sua revisão ${DOCUMENTOS[proposta.documentoId].comArtigo} foi ${decisao}`,
            decisao === 'aprovada' ? 'O novo contexto já vale para o Workspace.' : 'O contexto vigente continua o mesmo.',
            [proposta.solicitanteId],
          )
        }
        return null
      },

      avisar,
      dispensarAviso: (id) => setEstado((e) => ({ ...e, avisos: e.avisos.filter((a) => a.id !== id) })),
      conversarComOResumo: (mensagem) => {
        const e = atual.current
        const secao = secaoDoResumo(e.resumo, mensagem)
        const pedido = mensagem.trim().match(PEDIDO_DE_ATUALIZACAO)
        if (!pedido) {
          return secao
            ? `Segundo o resumo, em ${secao.titulo}: ${secao.texto}`
            : `Não encontrei isso no resumo. O mais próximo está na Visão geral: ${e.resumo.secoes[0].texto}`
        }
        if (visitanteDe(e).papel !== 'administrador') {
          return 'Só Administradores atualizam o resumo. Os Agentes também o atualizam sozinhos com o que aprendem nas Execuções.'
        }
        const acrescimo = frase(mensagem.trim().slice(pedido[0].length))
        const destino = secao ?? e.resumo.secoes[0]
        setEstado((anterior) => ({
          ...anterior,
          resumo: {
            secoes: anterior.resumo.secoes.map((s) => (s.titulo === destino.titulo ? { ...s, texto: `${s.texto} ${acrescimo}` } : s)),
            atualizadoEm: 'agora',
            atualizadoPor: visitanteDe(anterior).nome,
            automatico: false,
            secaoAtualizada: destino.titulo,
          },
        }))
        return `Atualizei ${destino.titulo}: “${acrescimo}” Já vale para os Agentes do Workspace.`
      },

      editarResumo: (secoes) => {
        const erro = exigirAdministrador()
        if (erro) return 'Só Administradores editam o resumo.'
        setEstado((e) => ({
          ...e,
          resumo: { secoes, atualizadoEm: 'agora', atualizadoPor: visitanteDe(e).nome, automatico: false },
        }))
        return null
      },

      simularAtualizacaoDaIA: () => {
        const atualizacao = ATUALIZACOES_DA_IA[proximaAtualizacaoDaIA.current++ % ATUALIZACOES_DA_IA.length]
        setEstado((e) => ({
          ...e,
          resumo: {
            secoes: e.resumo.secoes.map((s) => (s.titulo === atualizacao.secao ? { ...s, texto: `${s.texto} ${atualizacao.acrescimo}` } : s)),
            atualizadoEm: 'agora',
            atualizadoPor: atualizacao.agente,
            automatico: true,
            secaoAtualizada: atualizacao.secao,
          },
        }))
      },

      recomecar: () => setEstado((e) => estadoInicial(e.tema)),
    }
  }, [estado, atrasoMs, avisar, setEstado])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** Pedidos que acrescentam ao resumo; o resto da conversa é pergunta. */
const PEDIDO_DE_ATUALIZACAO = /^(adicione|inclua|acrescente|registre|anote|atualize)\s+(que\s+)?/i

/** A seção com mais palavras em comum com a mensagem, se houver alguma. */
function secaoDoResumo(resumo: Resumo, mensagem: string): Secao | undefined {
  const texto = mensagem.toLowerCase()
  const pontos = resumo.secoes.map((s) => (PALAVRAS_DO_RESUMO[s.titulo] ?? []).filter((p) => texto.includes(p)).length)
  const melhor = Math.max(...pontos)
  return melhor > 0 ? resumo.secoes[pontos.indexOf(melhor)] : undefined
}

function frase(texto: string): string {
  const limpo = texto.trim()
  const comMaiuscula = limpo.charAt(0).toUpperCase() + limpo.slice(1)
  return /[.!?]$/.test(comMaiuscula) ? comMaiuscula : `${comMaiuscula}.`
}

export function useMockup(): MockupDeConfiguracoes {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useMockup precisa de um MockupProvider')
  return valor
}
