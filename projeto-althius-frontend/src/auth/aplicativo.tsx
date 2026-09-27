import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { App } from '@/App'
import { criarAmbienteDoWorkspace } from '@/fonte/composicao'
import { ContextoDeAutenticacao, useAutenticacao } from './contexto'
import { destinoDepoisDoAcesso } from './destino'
import type { ServicosDoNavegador } from './servicos-do-navegador'
import { VERSAO_DOS_TERMOS } from './termos'
import { TelaDeNovaSenha } from './tela-esqueci-a-senha'
import { CascaDeAcesso, TelasDeAcesso } from './telas-de-acesso'

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

/** O Workspace pessoal que o bootstrap garante à Conta de usuário da sessão. */
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
  const [workspacePessoal, setWorkspacePessoal] = useState<WorkspacePessoal | null>(null)
  const [erroWorkspacePessoal, setErroWorkspacePessoal] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [participacoes, setParticipacoes] = useState<Participacao[] | null>(null)
  const [erroParticipacoes, setErroParticipacoes] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState('')
  // A renovação do token troca o objeto da sessão; só outra Conta de usuário recarrega as Participações.
  const usuarioId = sessao?.user.id

  // Quem acabou de entrar sai da tela de acesso para o endereço que tentou abrir, antes de o Workspace montar as rotas.
  useEffect(() => {
    if (!usuarioId) return
    const destino = destinoDepoisDoAcesso()
    if (destino) window.history.replaceState(null, '', destino)
  }, [usuarioId])

  // Toda Conta de usuário verificada tem seu Workspace pessoal: o bootstrap o garante antes de ler as Participações,
  // e repeti-lo (novo login, refresh, nova tentativa) não cria outro.
  useEffect(() => {
    let ativo = true
    setWorkspacePessoal(null)
    setErroWorkspacePessoal(null)
    setParticipacoes(null)
    setErroParticipacoes(null)
    setWorkspaceId('')
    if (!usuarioId) return () => { ativo = false }

    void (async () => {
      const bootstrap = await cliente.rpc('bootstrap_personal_workspace', { p_terms_version: VERSAO_DOS_TERMOS })
      if (!ativo) return
      if (bootstrap.error) {
        setErroWorkspacePessoal(bootstrap.error.message)
        return
      }
      const pessoal = bootstrap.data as WorkspacePessoal
      setWorkspacePessoal(pessoal)

      // O RLS só devolve os Workspaces em que a Conta de usuário tem Participação ativa.
      const [{ data, error }, workspaces] = await Promise.all([
        cliente.from('workspace_memberships').select('workspace_id, role').eq('user_id', usuarioId).eq('active', true),
        cliente.from('workspaces').select('id, name'),
      ])
      if (!ativo) return
      if (error) {
        setErroParticipacoes(error.message)
        return
      }
      // Sem os nomes, a entrada continua: o seletor mostra o identificador e a navegação, o rótulo genérico.
      const nomes = new Map([[pessoal.id, pessoal.name]])
      for (const w of (workspaces.data ?? []) as WorkspaceLido[]) nomes.set(w.id, w.name)
      const lista = rotularParticipacoes(
        ((data ?? []) as Participacao[]).map((p) => ({ ...p, nome: nomes.get(p.workspace_id) })),
      )
      setParticipacoes(lista)
      // Ordem de entrada: o Workspace desta aba, o último usado pela Conta de usuário e, sem outro destino, o pessoal.
      // Só vale um Workspace com Participação ativa.
      const salvo = sessionStorage.getItem(CHAVE_DO_WORKSPACE)
      const destino = [salvo, lerUltimoWorkspace(usuarioId), pessoal.id].find((id) => lista.some((p) => p.workspace_id === id))
      setWorkspaceId(destino ?? (lista.length === 1 ? lista[0].workspace_id : ''))
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
  if (erroWorkspacePessoal) {
    return (
      <TelaDeEstado>
        <p role="alert">Não foi possível preparar seu Workspace pessoal. Verifique sua conexão e tente novamente.</p>
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
  if (workspacePessoal === null) return <TelaDeEstado>Preparando seu Workspace pessoal…</TelaDeEstado>
  if (participacoes === null) return <TelaDeEstado>Carregando seus Workspaces…</TelaDeEstado>
  if (participacoes.length === 0) {
    return (
      <TelaDeEstado>
        <h1 className="titulo-secao text-2xl">Nenhum Workspace ativo</h1>
        <p className="max-w-lg text-sm text-al-muted">Sua conta está autenticada, mas ainda não foi adicionada a um Workspace. Peça ao administrador para provisionar sua participação.</p>
        <div className="flex gap-2">
          {aoAcessarDemonstracao && (
            <Button variant="outline" onClick={aoAcessarDemonstracao}>Acessar modo protótipo</Button>
          )}
          <Sair />
        </div>
      </TelaDeEstado>
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
          {participacoes.map((p) => <option key={p.workspace_id} value={p.workspace_id}>{rotuloDoWorkspace(p)}</option>)}
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
      aoAcessarDemonstracao={aoAcessarDemonstracao}
    />
  )
}

/** O Workspace operacional escolhido: as fontes nascem com ele e morrem ao trocar de Workspace ou de sessão. */
function AplicativoDoWorkspace({
  sessao,
  participacao,
  cliente,
  aoTrocarDeWorkspace,
  aoAcessarDemonstracao,
}: {
  sessao: Session
  participacao: Participacao
  cliente: SupabaseClient
  aoTrocarDeWorkspace?: () => void
  aoAcessarDemonstracao?: () => void
}) {
  const { id: usuarioId, email = '' } = sessao.user
  const { workspace_id: workspaceId, role, nome: nomeDoWorkspace = 'Workspace' } = participacao
  const ambiente = useMemo(
    () =>
      criarAmbienteDoWorkspace({
        cliente,
        usuario: { id: usuarioId, email },
        participacao: { workspaceId, nomeDoWorkspace, papel: role === 'admin' ? 'administrador' : 'membro' },
      }),
    [cliente, usuarioId, email, workspaceId, nomeDoWorkspace, role],
  )

  return (
    <>
      <div className="flex items-center justify-end gap-3 border-b border-al-line px-4 py-2 text-xs text-al-muted">
        <span>Workspace operacional</span>
        <span>{sessao.user.email}</span>
        {aoTrocarDeWorkspace && <Button variant="outline" onClick={aoTrocarDeWorkspace}>Trocar de Workspace</Button>}
        {aoAcessarDemonstracao && <Button variant="outline" onClick={aoAcessarDemonstracao}>Abrir Demonstração</Button>}
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

function TelaDeEstado({ children }: { children: ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-al-bg p-6 text-al-ink"><div className="flex max-w-xl flex-col items-start gap-4">{children}</div></main>
}
