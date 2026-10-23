import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { App } from '@/App'
import { criarAmbienteDoWorkspace } from '@/fonte/composicao'
import { conversasDisponiveis } from '@/fonte/supabase-conversas'
import { sinaisDisponiveis } from '@/fonte/supabase-sinais'
import { anexosDisponiveis } from '@/fonte/supabase-sequencias'
import { aceitarConvite, lerPreviaDoConvite } from '@/fonte/supabase-participantes'
import { lerWorkspacesContratados } from '@/fonte/supabase-contrato'
import { viewerEhDaEquipeAlthius } from '@/fonte/supabase-equipe'
import { BotoesDaAssinatura, TelaDeAssinatura, useAcessoAoWorkspace } from './assinatura'
import { ContextoDeAutenticacao, useAutenticacao } from './contexto'
import { carregarDemonstracaoDaEquipe } from './carregar-demonstracao'
import { destinoDepoisDoAcesso, enderecoDeEntrada, tokenDoConviteNoEndereco } from './destino'
import { ehCaminhoDaDemonstracao } from './rota-da-demonstracao'
import type { ServicosDoNavegador } from './servicos-do-navegador'
import { VERSAO_DOS_TERMOS } from './termos'
import { TelaDeNovaSenha } from './tela-esqueci-a-senha'
import { CascaDeAcesso, TelasDeAcesso } from './telas-de-acesso'
import { AplicativoDoVisitante } from './visitante'

/** A Demonstração da equipe só é baixada depois de o banco confirmar a equipe: antes, ela nem está no navegador. */
const AplicativoDaDemonstracaoDaEquipe = lazy(() =>
  carregarDemonstracaoDaEquipe().then((modulo) => ({ default: modulo.AplicativoDaDemonstracaoDaEquipe })),
)

/** O Workspace escolhido nesta aba, para um refresh não pedir a escolha de novo. */
const CHAVE_DO_WORKSPACE = 'althius:workspace'

/** O último Workspace que a Conta de usuário usou neste navegador, para o próximo login voltar a ele. */
const chaveDoUltimoWorkspace = (usuarioId: string) => `althius:ultimo-workspace:${usuarioId}`

function lerUltimoWorkspace(usuarioId: string): string | null {
  try {
    return localStorage.getItem(chaveDoUltimoWorkspace(usuarioId))
  } catch {
    return null
  }
}

function lembrarUltimoWorkspace(usuarioId: string, workspaceId: string) {
  try {
    localStorage.setItem(chaveDoUltimoWorkspace(usuarioId), workspaceId)
  } catch {
    // Sem armazenamento, o próximo login só não volta a este Workspace.
  }
}

interface Participacao {
  workspace_id: string
  role: 'member' | 'admin'
  /**
   * O nome do Workspace; falta só se a leitura dos Workspaces falhar. Aí o seletor mostra o identificador e a
   * navegação, o rótulo genérico "Workspace".
   */
  nome?: string
  /** Como o seletor apresenta o Workspace: o nome e, se outro Workspace tiver o mesmo nome, o início do identificador. */
  rotulo?: string
}

const rotuloDoWorkspace = (p: Participacao) => p.rotulo ?? p.nome ?? p.workspace_id

/** Rotula as Participações pelo nome do Workspace; dois Workspaces com o mesmo nome ganham o início do identificador. */
function rotularParticipacoes(participacoes: Participacao[]) {
  const repeticoes = new Map<string, number>()
  for (const { nome } of participacoes) if (nome) repeticoes.set(nome, (repeticoes.get(nome) ?? 0) + 1)
  return participacoes
    .map((p) => ({
      ...p,
      rotulo: p.nome && (repeticoes.get(p.nome) ?? 0) > 1 ? `${p.nome} (${p.workspace_id.slice(0, 8)})` : p.nome,
    }))
    .sort((a, b) => rotuloDoWorkspace(a).localeCompare(rotuloDoWorkspace(b), 'pt-BR'))
}

/** Um Workspace como a entrada o lê: o identificador e o nome. */
interface WorkspaceLido {
  id: string
  name: string
}

/** O Workspace pessoal que a Conta de usuário já tinha antes do fechamento do acesso; o bootstrap não cria mais um. */
type WorkspacePessoal = WorkspaceLido

export function AplicativoAutenticado({
  cliente,
  servicos,
  aoAcessarDemonstracao,
}: {
  cliente: SupabaseClient
  servicos: ServicosDoNavegador
  aoAcessarDemonstracao?: () => void
}) {
  return (
    <ContextoDeAutenticacao cliente={cliente} servicos={servicos}>
      <EntradaDoAplicativo aoAcessarDemonstracao={aoAcessarDemonstracao} />
    </ContextoDeAutenticacao>
  )
}

function EntradaDoAplicativo({ aoAcessarDemonstracao }: { aoAcessarDemonstracao?: () => void }) {
  const { cliente, sessao, carregandoSessao, redefinindoSenha } = useAutenticacao()
  /** O bootstrap (o aceite dos Termos) já respondeu. */
  const [preparado, setPreparado] = useState(false)
  const [erroWorkspacePessoal, setErroWorkspacePessoal] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [participacoes, setParticipacoes] = useState<Participacao[] | null>(null)
  /** Os Workspaces com contrato ativo em que a pessoa participa. Sem nenhum, ela cai no Workspace visitante. */
  const [contratados, setContratados] = useState<Set<string> | null>(null)
  const [erroParticipacoes, setErroParticipacoes] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState('')
  const [recusaDoConvite, setRecusaDoConvite] = useState<string | null>(null)
  /** Na recusa, o convite ainda pendente: de qual Workspace é e para qual e-mail, para a pessoa saber com qual entrar. */
  const [conviteRecusado, setConviteRecusado] = useState<{ workspace: string; email: string } | null>(null)
  /** A resposta do banco sobre a Demonstração da equipe, para esta Conta de usuário. */
  const [demonstracao, setDemonstracao] = useState<{ usuarioId: string; liberada: boolean } | null>(null)
  // A renovação do token troca o objeto da sessão; só outra Conta de usuário recarrega as Participações.
  const usuarioId = sessao?.user.id

  // Quem acabou de entrar sai da tela de acesso para o endereço que tentou abrir, antes de o Workspace montar as rotas.
  useEffect(() => {
    if (!usuarioId) return
    const destino = destinoDepoisDoAcesso()
    if (destino) window.history.replaceState(null, '', destino)
  }, [usuarioId])

  // /demonstracao só abre para a equipe Althius, pela função do banco. Quem não é da equipe cai no início, como numa
  // rota que não existe: nada na tela diz que a Demonstração existe.
  useEffect(() => {
    if (!usuarioId || !ehCaminhoDaDemonstracao(window.location.pathname)) return
    let ativo = true
    void viewerEhDaEquipeAlthius(cliente).then((daEquipe) => {
      if (!ativo) return
      if (!daEquipe) window.history.replaceState(null, '', '/')
      setDemonstracao({ usuarioId, liberada: daEquipe })
    })
    return () => { ativo = false }
  }, [cliente, usuarioId])

  // O acesso é fechado: o bootstrap só grava o aceite dos Termos e devolve o Workspace pessoal que a Conta de usuário já
  // tinha, se tinha; nunca cria Workspace. O Workspace da empresa só nasce do contrato, e só a Althius o cria.
  useEffect(() => {
    let ativo = true
    setPreparado(false)
    setErroWorkspacePessoal(null)
    setParticipacoes(null)
    setContratados(null)
    setErroParticipacoes(null)
    setWorkspaceId('')
    setRecusaDoConvite(null)
    setConviteRecusado(null)
    if (!usuarioId) return () => { ativo = false }
    // O link do convite, já no endereço depois do login: o convite é aceito depois do Workspace pessoal.
    const tokenDoConvite = tokenDoConviteNoEndereco()

    void (async () => {
      const bootstrap = await cliente.rpc('bootstrap_personal_workspace', { p_terms_version: VERSAO_DOS_TERMOS })
      if (!ativo) return
      if (bootstrap.error) {
        setErroWorkspacePessoal(bootstrap.error.message)
        return
      }
      const devolvido = bootstrap.data as Partial<WorkspacePessoal> | null
      const pessoal = devolvido?.id ? (devolvido as WorkspacePessoal) : null
      setPreparado(true)

      let workspaceDoConvite: string | null = null
      if (tokenDoConvite) {
        // O endereço do convite fica: recusado o aceite, "Sair" o mantém como destino para entrar com o e-mail
        // convidado; aceito ou dispensado, as rotas do Workspace levam ao início.
        const aceite = await aceitarConvite(cliente, tokenDoConvite)
        if (!ativo) return
        if ('recusa' in aceite) {
          setRecusaDoConvite(aceite.recusa)
          // Sem a prévia, a recusa continua explicada, só sem o Workspace e o e-mail do convite.
          lerPreviaDoConvite(cliente, tokenDoConvite).then(
            (previa) => {
              if (ativo && previa.estado === 'pendente') setConviteRecusado({ workspace: previa.workspace, email: previa.email })
            },
            () => {},
          )
        } else {
          workspaceDoConvite = aceite.workspaceId
          sessionStorage.setItem(CHAVE_DO_WORKSPACE, workspaceDoConvite)
        }
      }

      // O RLS só devolve os Workspaces em que a Conta de usuário tem Participação ativa.
      const [{ data, error }, workspaces, contratadosLidos] = await Promise.all([
        cliente.from('workspace_memberships').select('workspace_id, role').eq('user_id', usuarioId).eq('active', true),
        cliente.from('workspaces').select('id, name'),
        lerWorkspacesContratados(cliente).catch((falha: unknown) => (falha instanceof Error ? falha : new Error(String(falha)))),
      ])
      if (!ativo) return
      if (error) {
        setErroParticipacoes(error.message)
        return
      }
      if (contratadosLidos instanceof Error) {
        setErroParticipacoes(contratadosLidos.message)
        return
      }
      // Sem os nomes, a entrada continua: o seletor mostra o identificador e a navegação, o rótulo genérico.
      const nomes = new Map<string, string>(pessoal ? [[pessoal.id, pessoal.name]] : [])
      for (const w of (workspaces.data ?? []) as WorkspaceLido[]) nomes.set(w.id, w.name)
      const lista = rotularParticipacoes(
        ((data ?? []) as Participacao[]).map((p) => ({ ...p, nome: nomes.get(p.workspace_id) })),
      )
      setParticipacoes(lista)
      setContratados(contratadosLidos)
      // Ordem de entrada: o Workspace do convite aceito agora, o desta aba, o último usado pela Conta de usuário e, sem
      // outro destino, o pessoal. Só vale um Workspace contratado com Participação ativa; sem nenhum, a pessoa é visitante.
      const elegiveis = lista.filter((p) => contratadosLidos.has(p.workspace_id))
      const salvo = sessionStorage.getItem(CHAVE_DO_WORKSPACE)
      const destino = [workspaceDoConvite, salvo, lerUltimoWorkspace(usuarioId), pessoal?.id].find((id) =>
        elegiveis.some((p) => p.workspace_id === id),
      )
      setWorkspaceId(destino ?? (elegiveis.length === 1 ? elegiveis[0].workspace_id : ''))
    })()

    return () => { ativo = false }
  }, [cliente, usuarioId, tentativa])

  useEffect(() => {
    if (usuarioId && workspaceId) lembrarUltimoWorkspace(usuarioId, workspaceId)
  }, [usuarioId, workspaceId])

  if (carregandoSessao) return <TelaDeEstado>Verificando sessão…</TelaDeEstado>
  if (!sessao) return <TelasDeAcesso aoAcessarDemonstracao={aoAcessarDemonstracao} />
  // Quem entrou pelo código ou link de redefinição define a nova senha antes de abrir o Workspace de entrada.
  if (redefinindoSenha) return <CascaDeAcesso><TelaDeNovaSenha /></CascaDeAcesso>
  if (ehCaminhoDaDemonstracao(window.location.pathname)) {
    if (demonstracao?.usuarioId !== sessao.user.id) return <TelaDeEstado>Preparando seu acesso…</TelaDeEstado>
    if (demonstracao.liberada) {
      const sairDaDemonstracao = () => {
        window.history.pushState(null, '', '/')
        setDemonstracao(null)
      }
      return (
        <Suspense fallback={<TelaDeEstado>Preparando seu acesso…</TelaDeEstado>}>
          <AplicativoDaDemonstracaoDaEquipe aoSair={sairDaDemonstracao} />
        </Suspense>
      )
    }
  }
  if (erroWorkspacePessoal) {
    return (
      <TelaDeEstado>
        <p role="alert">Não foi possível preparar seu acesso. Verifique sua conexão e tente novamente.</p>
        <div className="flex gap-2">
          <Button onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</Button>
          <Sair />
        </div>
      </TelaDeEstado>
    )
  }
  if (erroParticipacoes) {
    return (
      <TelaDeEstado>
        <p role="alert">Não foi possível validar seu acesso ao Workspace. Confirme que a migração de acesso real foi aplicada e tente novamente.</p>
        <p className="text-xs text-al-muted">{erroParticipacoes}</p>
        <div className="flex gap-2">
          {aoAcessarDemonstracao && (
            <Button variant="outline" onClick={aoAcessarDemonstracao}>Acessar modo protótipo</Button>
          )}
          <Sair />
        </div>
      </TelaDeEstado>
    )
  }
  if (!preparado) return <TelaDeEstado>Preparando seu acesso…</TelaDeEstado>
  if (recusaDoConvite) {
    // A conta da sessão (de senha, código ou Google) não é a do e-mail convidado: a pessoa pode entrar com outra.
    const conviteDeOutroEmail =
      conviteRecusado && conviteRecusado.email.toLowerCase() !== sessao.user.email?.toLowerCase() ? conviteRecusado : null
    return (
      <TelaDeEstado>
        <h1 className="titulo-secao text-2xl">Convite não aceito</h1>
        <p role="alert">{recusaDoConvite}</p>
        <p className="text-sm text-al-muted">Você entrou como {sessao.user.email}. Nenhuma Participação foi criada no Workspace do convite.</p>
        {conviteDeOutroEmail && (
          <p className="text-sm">
            Este convite do Workspace <strong>{conviteDeOutroEmail.workspace}</strong> é para{' '}
            <strong>{conviteDeOutroEmail.email}</strong>. Saia e entre com esse e-mail para aceitá-lo.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {conviteDeOutroEmail && <EntrarComOutraConta />}
          <Button variant={conviteDeOutroEmail ? 'outline' : 'default'} onClick={() => setRecusaDoConvite(null)}>
            Continuar sem o convite
          </Button>
          <Sair />
        </div>
      </TelaDeEstado>
    )
  }
  if (participacoes === null || contratados === null) return <TelaDeEstado>Carregando seus Workspaces…</TelaDeEstado>
  // Sem Participação num Workspace contratado, a pessoa é visitante: vê a demonstração, só leitura, ou só o pedido à
  // equipe, conforme VISITANTE_VE_DEMONSTRACAO. O contrato abre o Workspace.
  if (!participacoes.some((p) => contratados.has(p.workspace_id))) {
    return (
      <Suspense fallback={<TelaDeEstado>Preparando seu acesso…</TelaDeEstado>}>
        <AplicativoDoVisitante cliente={cliente} email={sessao.user.email ?? ''} sair={<Sair />} />
      </Suspense>
    )
  }
  if (!workspaceId) {
    return (
      <TelaDeEstado>
        <label htmlFor="workspace-ativo" className="rotulo">Selecione o Workspace</label>
        <select id="workspace-ativo" className="campo h-10 min-w-72 bg-al-bg text-al-ink" value="" onChange={(e) => {
          sessionStorage.setItem(CHAVE_DO_WORKSPACE, e.target.value)
          setWorkspaceId(e.target.value)
        }}>
          <option value="" disabled>Escolher participação…</option>
          {participacoes.map((p) => (
            <option key={p.workspace_id} value={p.workspace_id}>
              {contratados.has(p.workspace_id) ? rotuloDoWorkspace(p) : `${rotuloDoWorkspace(p)} (sem contrato)`}
            </option>
          ))}
        </select>
        <Sair />
      </TelaDeEstado>
    )
  }

  const participacao = participacoes.find((p) => p.workspace_id === workspaceId)!
  const trocarDeWorkspace = () => {
    sessionStorage.removeItem(CHAVE_DO_WORKSPACE)
    setWorkspaceId('')
  }
  return (
    <AplicativoDoWorkspace
      key={`${sessao.user.id}:${workspaceId}`}
      sessao={sessao}
      participacao={participacao}
      cliente={cliente}
      aoTrocarDeWorkspace={participacoes.length > 1 ? trocarDeWorkspace : undefined}
    />
  )
}

/** O Workspace operacional escolhido: as fontes nascem com ele e morrem ao trocar de Workspace ou de sessão. */
function AplicativoDoWorkspace({
  sessao,
  participacao,
  cliente,
  aoTrocarDeWorkspace,
}: {
  sessao: Session
  participacao: Participacao
  cliente: SupabaseClient
  aoTrocarDeWorkspace?: () => void
}) {
  const { id: usuarioId, email = '' } = sessao.user
  const { workspace_id: workspaceId, role, nome: nomeDoWorkspace = 'Workspace' } = participacao
  // As Conversas dependem do modelo configurado no backend: até a função confirmar, ficam indisponíveis.
  const [comConversas, setComConversas] = useState(false)
  // Os Sinais dependem de um actor que passou no teste: até o registro confirmar, ficam indisponíveis.
  const [comSinais, setComSinais] = useState(false)
  // Os anexos dos passos dependem do módulo ligado no backend (canais-10): até lá, ficam indisponíveis.
  const [comAnexos, setComAnexos] = useState(false)
  useEffect(() => {
    let ativo = true
    void conversasDisponiveis(cliente).then((disponivel) => {
      if (ativo) setComConversas(disponivel)
    })
    void sinaisDisponiveis(cliente).then((disponivel) => {
      if (ativo) setComSinais(disponivel)
    })
    void anexosDisponiveis(cliente).then((disponivel) => {
      if (ativo) setComAnexos(disponivel)
    })
    return () => {
      ativo = false
    }
  }, [cliente])
  const ambiente = useMemo(
    () =>
      criarAmbienteDoWorkspace({
        cliente,
        usuario: { id: usuarioId, email },
        participacao: { workspaceId, nomeDoWorkspace, papel: role === 'admin' ? 'administrador' : 'membro' },
        conversasDisponiveis: comConversas,
        sinaisDisponiveis: comSinais,
        // A fila de Aprovações (CRM-15) liga com as Conversas: é nelas que os Agentes pedem Aprovações, e o crm-handoff
        // que executa o envio aprovado é publicado junto com o agent-conversation.
        aprovacoesDisponiveis: comConversas,
        anexosDisponiveis: comAnexos,
      }),
    [cliente, usuarioId, email, workspaceId, nomeDoWorkspace, role, comConversas, comSinais, comAnexos],
  )

  // A assinatura (creditos-e-planos 06): o Workspace abre enquanto o banco responde, e fecha só quando ele diz que não
  // há assinatura ativa nem liberação manual.
  const acesso = useAcessoAoWorkspace(cliente, workspaceId)
  if (acesso && !acesso.liberado) {
    return (
      <TelaDeAssinatura
        cliente={cliente}
        workspaceId={workspaceId}
        nomeDoWorkspace={nomeDoWorkspace}
        administrador={role === 'admin'}
        acesso={acesso}
        aoTrocarDeWorkspace={aoTrocarDeWorkspace}
        sair={<Sair />}
      />
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-3 border-b border-al-line px-4 py-2 text-xs text-al-muted">
        <span>Workspace operacional</span>
        <span>{sessao.user.email}</span>
        {acesso && role === 'admin' && <BotoesDaAssinatura cliente={cliente} workspaceId={workspaceId} acesso={acesso} />}
        {aoTrocarDeWorkspace && <Button variant="outline" onClick={aoTrocarDeWorkspace}>Trocar de Workspace</Button>}
        <Sair />
      </div>
      <App ambiente={ambiente} />
    </>
  )
}

function Sair() {
  const { sair, carregando } = useAutenticacao()
  return <Button variant="outline" disabled={carregando} onClick={() => void sair()}>Sair</Button>
}

/**
 * Na recusa, ainda no link do convite: sai e abre a entrada com o convite como destino, o e-mail convidado travado e,
 * com o Client ID configurado, o Google para escolher outra conta. O endereço muda antes de a sessão acabar, para as
 * telas de acesso já abrirem nele, e não na tela do convite; se a saída falhar, volta ao link do convite.
 */
function EntrarComOutraConta() {
  const { sair, carregando } = useAutenticacao()
  const entrarComOutraConta = () => {
    const linkDoConvite = window.location.pathname
    window.history.replaceState(null, '', enderecoDeEntrada(linkDoConvite))
    sair().catch(() => window.history.replaceState(null, '', linkDoConvite))
  }
  return <Button disabled={carregando} onClick={entrarComOutraConta}>Entrar com outra conta</Button>
}

function TelaDeEstado({ children }: { children: ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-al-bg p-6 text-al-ink"><div className="flex max-w-xl flex-col items-start gap-4">{children}</div></main>
}
