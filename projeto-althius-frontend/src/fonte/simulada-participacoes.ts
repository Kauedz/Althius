// Participações da fonte simulada: Contas de usuário, o Workspace atual e as Participações que ligam uma
// ao outro. O papel é da Participação, não da Conta de usuário; remover alguém encerra só a Participação.
import * as demo from './dados-demo'
import { diaIso } from './formatar-data'
import type { RegistroDeParticipacao } from './dados-demo'
import {
  ehEmailValido,
  ERRO_DE_EMAIL,
  ERRO_DE_PAPEL,
  ERRO_SEM_PARTICIPACAO,
  ERRO_SO_ADMINISTRADOR,
  ERRO_ULTIMO_ADMINISTRADOR,
  PAPEIS,
} from './regras'
import type {
  ContaComParticipacoes,
  ContaDeUsuario,
  ContaDeUsuarioId,
  Convite,
  ExecucoesNoPeriodo,
  InformacoesDoWorkspace,
  NovasInformacoesDoWorkspace,
  NovoConvite,
  Papel,
  ParticipacaoAtiva,
  ParticipacaoDaConta,
  ParticipantesDoWorkspace,
  Perfil,
  PlanoDoWorkspace,
  Preferencias,
} from './tipos'

const CHAVE_DO_WORKSPACE = `althius:workspace:${demo.WORKSPACE_ATUAL}`
/** O perfil é de cada Conta de usuário: outra sessão no mesmo navegador não herda o que esta salvou. */
const chaveDoPerfil = (contaId: ContaDeUsuarioId) => `althius:perfil:${contaId}`
/** As preferências também são de cada Conta de usuário, e não do Workspace. */
const chaveDasPreferencias = (contaId: ContaDeUsuarioId) => `althius:preferencias:${contaId}`

/** Onde os dados demonstrativos não secretos sobrevivem a um refresh (o `localStorage`, no navegador). */
export interface ArmazenamentoDemonstrativo {
  getItem(chave: string): string | null
  setItem(chave: string, valor: string): void
}

/** Quem está usando o aplicativo: escolhido só na preparação (testes), nunca por um seletor na interface. */
export interface Sessao {
  contaId: ContaDeUsuarioId
  /**
   * Troca o papel da Participação da sessão nos dados de exemplo, para o cenário. Um Workspace já salvo
   * no armazenamento prevalece, para a escolha do cenário não virar estado persistido.
   */
  papel?: Papel
}

/** O que é do Workspace atual e persiste associado a ele. */
interface EstadoDoWorkspace {
  informacoes: InformacoesDoWorkspace
  participacoes: ParticipacaoAtiva[]
  convites: Convite[]
}

const ehTexto = (valor: unknown): valor is string => typeof valor === 'string'
const ehPapel = (valor: unknown): valor is Papel => PAPEIS.includes(valor as Papel)
const temAdministrador = (participacoes: ParticipacaoAtiva[]) =>
  participacoes.some((p) => p.papel === 'administrador')

function ler(armazenamento: ArmazenamentoDemonstrativo | null, chave: string): Record<string, unknown> | null {
  try {
    const bruto = armazenamento?.getItem(chave)
    return bruto ? (JSON.parse(bruto) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Lê o perfil salvo, ignorando o que não reconhece; sem armazenamento ou sem valor salvo, nada muda. */
function perfilSalvo(armazenamento: ArmazenamentoDemonstrativo | null, contaId: ContaDeUsuarioId): Partial<Perfil> {
  const lido = ler(armazenamento, chaveDoPerfil(contaId))
  if (!lido) return {}
  const perfil: Partial<Perfil> = {}
  if (ehTexto(lido.nome)) perfil.nome = lido.nome
  if (ehTexto(lido.email)) perfil.email = lido.email
  if (ehTexto(lido.foto)) perfil.foto = lido.foto
  return perfil
}

/** Lê o Workspace salvo; se algo não for reconhecido ou faltar Administrador, volta aos dados de exemplo. */
function workspaceSalvo(
  armazenamento: ArmazenamentoDemonstrativo | null,
  contasDeUsuario: ContaDeUsuario[],
): EstadoDoWorkspace | null {
  const lido = ler(armazenamento, CHAVE_DO_WORKSPACE)
  if (!lido) return null
  const informacoes = lido.informacoes as Record<string, unknown> | undefined
  const participacoes = lido.participacoes
  const convites = lido.convites
  if (!informacoes || !ehTexto(informacoes.nome) || !ehTexto(informacoes.descricao) || !ehTexto(informacoes.criadoEm)) return null
  if (!Array.isArray(participacoes) || !Array.isArray(convites)) return null
  const participacoesValidas = participacoes.every(
    (p) => contasDeUsuario.some((c) => c.id === p?.contaId) && ehPapel(p?.papel),
  )
  const semRepeticao = new Set(participacoes.map((p) => p.contaId)).size === participacoes.length
  const convitesValidos = convites.every(
    (c) => ehTexto(c?.id) && ehTexto(c?.email) && ehPapel(c?.papel) && ehTexto(c?.registradoEm),
  )
  if (!participacoesValidas || !semRepeticao || !convitesValidos || !temAdministrador(participacoes)) return null
  return {
    informacoes: { nome: informacoes.nome, descricao: informacoes.descricao, criadoEm: informacoes.criadoEm },
    participacoes: participacoes.map(({ contaId, papel }) => ({ contaId, papel })),
    // A Demonstração só guarda pendentes; o que foi salvo antes do estado existir também é pendente.
    convites: convites.map(({ id, email, papel, registradoEm }) => ({ id, email, papel, registradoEm, estado: 'pendente' as const })),
  }
}

function dadosDeExemplo(sessao: Sessao): EstadoDoWorkspace {
  const participacoes = demo.participacoes
    .filter((p) => p.workspaceId === demo.WORKSPACE_ATUAL)
    .map(({ contaId, papel }) => ({ contaId, papel: contaId === sessao.contaId && sessao.papel ? sessao.papel : papel }))
  if (!temAdministrador(participacoes)) throw new Error('A preparação deixou o Workspace sem Administrador.')
  return {
    informacoes: structuredClone(demo.workspaces[demo.WORKSPACE_ATUAL]),
    participacoes,
    convites: structuredClone(demo.convites),
  }
}

/**
 * O estado das Participações da demonstração, com as regras de acesso aplicadas nas próprias operações
 * (não só na interface). As operações são síncronas e lançam um erro com a mensagem para o usuário.
 */
export function criarParticipacoesSimuladas({
  armazenamento,
  sessao = { contaId: demo.CONTA_DA_SESSAO },
  hoje,
}: {
  armazenamento: ArmazenamentoDemonstrativo | null
  sessao?: Sessao
  /** O dia de referência da demonstração, o mesmo do Plano: dá a data dos convites. */
  hoje: Date
}) {
  const contasDeUsuario = structuredClone(demo.contasDeUsuario)
  const contaDaSessao = contasDeUsuario.find((c) => c.id === sessao.contaId)
  if (!contaDaSessao) throw new Error(`Conta de usuário desconhecida: ${sessao.contaId}`)
  Object.assign(contaDaSessao, perfilSalvo(armazenamento, contaDaSessao.id))

  // As Participações nos outros Workspaces não mudam por aqui: só as deste Workspace persistem com ele.
  const deOutrosWorkspaces: RegistroDeParticipacao[] = structuredClone(
    demo.participacoes.filter((p) => p.workspaceId !== demo.WORKSPACE_ATUAL),
  )
  const workspace = workspaceSalvo(armazenamento, contasDeUsuario) ?? dadosDeExemplo(sessao)
  const preferenciasSalvas = ler(armazenamento, chaveDasPreferencias(contaDaSessao.id))
  let preferencias: Preferencias = { notificacoesDoNavegador: preferenciasSalvas?.notificacoesDoNavegador === true }

  function gravarWorkspace() {
    armazenamento?.setItem(CHAVE_DO_WORKSPACE, JSON.stringify(workspace))
  }

  function contaDeUsuario(contaId: ContaDeUsuarioId): ContaDeUsuario {
    const encontrada = contasDeUsuario.find((c) => c.id === contaId)
    if (!encontrada) throw new Error('Conta de usuário não encontrada.')
    return encontrada
  }

  function papelDaSessao(): Papel | null {
    return workspace.participacoes.find((p) => p.contaId === sessao.contaId)?.papel ?? null
  }

  /** A sessão precisa participar do Workspace; devolve o papel dela. */
  function exigirParticipacao(): Papel {
    const papel = papelDaSessao()
    if (papel === null) throw new Error(ERRO_SEM_PARTICIPACAO)
    return papel
  }

  /** Toda operação administrativa começa aqui: a sessão precisa participar do Workspace como Administrador. */
  function exigirAdministrador() {
    if (exigirParticipacao() !== 'administrador') throw new Error(ERRO_SO_ADMINISTRADOR)
  }

  function participacao(contaId: ContaDeUsuarioId) {
    const encontrada = workspace.participacoes.find((p) => p.contaId === contaId)
    if (!encontrada) throw new Error('Esta pessoa não participa deste Workspace.')
    return encontrada
  }

  function ehUltimoAdministrador(contaId: ContaDeUsuarioId) {
    const administradores = workspace.participacoes.filter((p) => p.papel === 'administrador')
    return administradores.length === 1 && administradores[0].contaId === contaId
  }

  function participacoesDe(contaId: ContaDeUsuarioId): ParticipacaoDaConta[] {
    const registros: RegistroDeParticipacao[] = [
      ...workspace.participacoes.map((p) => ({ ...p, workspaceId: demo.WORKSPACE_ATUAL })),
      ...deOutrosWorkspaces,
    ]
    return registros
      .filter((p) => p.contaId === contaId)
      .map(({ workspaceId, papel }) => {
        const atual = workspaceId === demo.WORKSPACE_ATUAL
        const nomeDoWorkspace = atual ? workspace.informacoes.nome : demo.workspaces[workspaceId].nome
        return { workspaceId, nomeDoWorkspace, papel, atual }
      })
  }

  return {
    usuario: (): ContaDeUsuario => contaDaSessao,
    papelDaSessao,
    exigirParticipacao,
    /** As Participações ativas neste Workspace, com o papel de cada uma. */
    participacoesAtivas: (): ParticipacaoAtiva[] => workspace.participacoes,
    informacoes: () => workspace.informacoes,

    /** Quem não participa do Workspace vê só as informações gerais, sem a lista de Participantes e convites. */
    participantesDoWorkspace(): ParticipantesDoWorkspace {
      const papel = papelDaSessao()
      return {
        informacoes: workspace.informacoes,
        contaId: sessao.contaId,
        papel,
        participantes:
          papel === null
            ? []
            : workspace.participacoes.map(({ contaId, papel: papelDoParticipante }) => ({
                conta: contaDeUsuario(contaId),
                papel: papelDoParticipante,
                ultimoAdministrador: ehUltimoAdministrador(contaId),
                outrasParticipacoes: participacoesDe(contaId).filter((p) => !p.atual),
              })),
        convites: papel === null ? [] : workspace.convites,
      }
    },

    /** O plano do Workspace com o uso dele; quem não participa vê só o plano, como em Pessoas e acesso. */
    plano(execucoes: ExecucoesNoPeriodo): PlanoDoWorkspace {
      return {
        nome: demo.planos[demo.WORKSPACE_ATUAL],
        nomeDoWorkspace: workspace.informacoes.nome,
        uso:
          papelDaSessao() === null
            ? null
            : { participantes: workspace.participacoes.length, convitesPendentes: workspace.convites.length, execucoes },
      }
    },

    contaComParticipacoes: (contaId: ContaDeUsuarioId): ContaComParticipacoes => ({
      conta: contaDeUsuario(contaId),
      participacoes: participacoesDe(contaId),
    }),

    salvarPerfil(perfil: Perfil) {
      const nome = perfil.nome.trim()
      if (!nome) throw new Error('Informe seu nome.')
      const email = perfil.email.trim().toLowerCase()
      if (!ehEmailValido(email)) throw new Error(ERRO_DE_EMAIL)
      if (contasDeUsuario.some((c) => c.id !== contaDaSessao.id && c.email.toLowerCase() === email)) {
        throw new Error('Este e-mail já pertence a outra Conta de usuário.')
      }
      Object.assign(contaDaSessao, { nome, email, foto: perfil.foto })
      armazenamento?.setItem(chaveDoPerfil(contaDaSessao.id), JSON.stringify({ nome, email, foto: perfil.foto }))
    },

    preferencias: (): Preferencias => preferencias,

    /** Grava e só então adota: se o navegador não gravar, a preferência continua como estava. */
    salvarPreferencias({ notificacoesDoNavegador = preferencias.notificacoesDoNavegador }: Partial<Preferencias>) {
      const novas: Preferencias = { notificacoesDoNavegador: notificacoesDoNavegador === true }
      try {
        armazenamento?.setItem(chaveDasPreferencias(contaDaSessao.id), JSON.stringify(novas))
      } catch {
        throw new Error('Não foi possível salvar a preferência neste navegador. Nada mudou.')
      }
      preferencias = novas
    },

    /** O nome é também como os Agentes chamam o Cliente: muda em todo o aplicativo, que o lê daqui. */
    salvarInformacoes({ nome, descricao }: NovasInformacoesDoWorkspace) {
      exigirAdministrador()
      if (!nome.trim()) throw new Error('Informe o nome do Workspace.')
      workspace.informacoes = { ...workspace.informacoes, nome: nome.trim(), descricao: descricao.trim() }
      gravarWorkspace()
    },

    convidar({ email, papel }: NovoConvite): Convite {
      exigirAdministrador()
      if (!ehPapel(papel)) throw new Error(ERRO_DE_PAPEL)
      const normalizado = email.trim().toLowerCase()
      if (!ehEmailValido(normalizado)) throw new Error(ERRO_DE_EMAIL)
      if (workspace.participacoes.some((p) => contaDeUsuario(p.contaId).email.toLowerCase() === normalizado)) {
        throw new Error(`${normalizado} já participa deste Workspace.`)
      }
      if (workspace.convites.some((c) => c.email === normalizado)) {
        throw new Error(`Já existe um convite pendente para ${normalizado}.`)
      }
      let numero = workspace.convites.length + 1
      while (workspace.convites.some((c) => c.id === `convite-${numero}`)) numero++
      const convite: Convite = { id: `convite-${numero}`, email: normalizado, papel, registradoEm: diaIso(hoje), estado: 'pendente' }
      workspace.convites.push(convite)
      gravarWorkspace()
      return convite
    },

    cancelarConvite(conviteId: string) {
      exigirAdministrador()
      if (!workspace.convites.some((c) => c.id === conviteId)) throw new Error('Convite não encontrado.')
      workspace.convites = workspace.convites.filter((c) => c.id !== conviteId)
      gravarWorkspace()
    },

    mudarPapel(contaId: ContaDeUsuarioId, papel: Papel) {
      exigirAdministrador()
      if (!ehPapel(papel)) throw new Error(ERRO_DE_PAPEL)
      const alvo = participacao(contaId)
      if (papel === 'membro' && ehUltimoAdministrador(contaId)) throw new Error(ERRO_ULTIMO_ADMINISTRADOR)
      alvo.papel = papel
      gravarWorkspace()
    },

    remover(contaId: ContaDeUsuarioId) {
      exigirAdministrador()
      participacao(contaId)
      if (ehUltimoAdministrador(contaId)) throw new Error(ERRO_ULTIMO_ADMINISTRADOR)
      if (contaId === sessao.contaId) throw new Error('Você não pode remover a si mesmo por aqui.')
      workspace.participacoes = workspace.participacoes.filter((p) => p.contaId !== contaId)
      gravarWorkspace()
    },
  }
}
