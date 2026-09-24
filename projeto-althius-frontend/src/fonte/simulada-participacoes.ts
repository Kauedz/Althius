// Participações da fonte simulada: Contas de usuário, o Workspace atual e as Participações que ligam uma
// ao outro. O papel é da Participação, não da Conta de usuário; remover alguém encerra só a Participação.
import * as demo from './dados-demo'
import { dataDeHoje } from './formatar-data'
import type { RegistroDeParticipacao } from './dados-demo'
import { ehEmailValido, ERRO_DE_EMAIL, PAPEIS } from './regras'
import type {
  ContaComParticipacoes,
  ContaDeUsuario,
  Convite,
  InformacoesDoWorkspace,
  NovoConvite,
  Papel,
  ParticipacaoDaConta,
  ParticipantesDoWorkspace,
  Perfil,
} from './tipos'

const CHAVE_DO_WORKSPACE = `althius:workspace:${demo.WORKSPACE_ATUAL}`
/** O perfil é de cada Conta de usuário: outra sessão no mesmo navegador não herda o que esta salvou. */
const chaveDoPerfil = (contaId: string) => `althius:perfil:${contaId}`

export const ERRO_SO_ADMINISTRADOR = 'Só Administradores do Workspace podem fazer isso.'
export const ERRO_ULTIMO_ADMINISTRADOR =
  'O Workspace precisa de pelo menos um Administrador. Torne outra pessoa Administrador antes.'
const ERRO_DE_PAPEL = 'Escolha Administrador ou Membro.'

/** Onde os dados demonstrativos não secretos sobrevivem a um refresh (o `localStorage`, no navegador). */
export interface ArmazenamentoDemonstrativo {
  getItem(chave: string): string | null
  setItem(chave: string, valor: string): void
}

/** Quem está usando o aplicativo: escolhido só na preparação (testes), nunca por um seletor na interface. */
export interface Sessao {
  contaId: string
  /**
   * Troca o papel da Participação da sessão nos dados de exemplo, para o cenário. Um Workspace já salvo
   * no armazenamento prevalece, para a escolha do cenário não virar estado persistido.
   */
  papel?: Papel
}

/** O que é do Workspace atual e persiste associado a ele. */
interface EstadoDoWorkspace {
  informacoes: InformacoesDoWorkspace
  participacoes: { contaId: string; papel: Papel }[]
  convites: Convite[]
}

const ehTexto = (valor: unknown): valor is string => typeof valor === 'string'
const ehPapel = (valor: unknown): valor is Papel => PAPEIS.includes(valor as Papel)
const temAdministrador = (participacoes: EstadoDoWorkspace['participacoes']) =>
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
function perfilSalvo(armazenamento: ArmazenamentoDemonstrativo | null, contaId: string): Partial<Perfil> {
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
    convites: convites.map(({ id, email, papel, registradoEm }) => ({ id, email, papel, registradoEm })),
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
}: {
  armazenamento: ArmazenamentoDemonstrativo | null
  sessao?: Sessao
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

  function gravarWorkspace() {
    armazenamento?.setItem(CHAVE_DO_WORKSPACE, JSON.stringify(workspace))
  }

  function contaDeUsuario(contaId: string): ContaDeUsuario {
    const encontrada = contasDeUsuario.find((c) => c.id === contaId)
    if (!encontrada) throw new Error('Conta de usuário não encontrada.')
    return encontrada
  }

  function papelDaSessao(): Papel | null {
    return workspace.participacoes.find((p) => p.contaId === sessao.contaId)?.papel ?? null
  }

  /** Toda operação administrativa começa aqui: a sessão precisa participar do Workspace como Administrador. */
  function exigirAdministrador() {
    const papel = papelDaSessao()
    if (papel === null) throw new Error('Você não participa deste Workspace.')
    if (papel !== 'administrador') throw new Error(ERRO_SO_ADMINISTRADOR)
  }

  function participacao(contaId: string) {
    const encontrada = workspace.participacoes.find((p) => p.contaId === contaId)
    if (!encontrada) throw new Error('Esta pessoa não participa deste Workspace.')
    return encontrada
  }

  function ehUltimoAdministrador(contaId: string) {
    const administradores = workspace.participacoes.filter((p) => p.papel === 'administrador')
    return administradores.length === 1 && administradores[0].contaId === contaId
  }

  function participacoesDe(contaId: string): ParticipacaoDaConta[] {
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
                outrasParticipacoes: participacoesDe(contaId).filter((p) => !p.atual),
              })),
        convites: papel === null ? [] : workspace.convites,
      }
    },

    contaComParticipacoes: (contaId: string): ContaComParticipacoes => ({
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

    /** O nome do Workspace é o do Cliente, definido no onboarding; aqui se altera só a descrição. */
    salvarDescricao(descricao: string) {
      exigirAdministrador()
      workspace.informacoes = { ...workspace.informacoes, descricao: descricao.trim() }
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
      const convite: Convite = { id: `convite-${numero}`, email: normalizado, papel, registradoEm: dataDeHoje() }
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

    mudarPapel(contaId: string, papel: Papel) {
      exigirAdministrador()
      if (!ehPapel(papel)) throw new Error(ERRO_DE_PAPEL)
      const alvo = participacao(contaId)
      if (papel === 'membro' && ehUltimoAdministrador(contaId)) throw new Error(ERRO_ULTIMO_ADMINISTRADOR)
      alvo.papel = papel
      gravarWorkspace()
    },

    remover(contaId: string) {
      exigirAdministrador()
      participacao(contaId)
      if (ehUltimoAdministrador(contaId)) throw new Error(ERRO_ULTIMO_ADMINISTRADOR)
      if (contaId === sessao.contaId) throw new Error('Você não pode remover a si mesmo por aqui.')
      workspace.participacoes = workspace.participacoes.filter((p) => p.contaId !== contaId)
      gravarWorkspace()
    },
  }
}
