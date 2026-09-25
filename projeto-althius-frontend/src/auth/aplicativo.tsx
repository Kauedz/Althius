import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { App } from '@/App'
import { criarAmbienteDoWorkspace } from '@/fonte/composicao'
import { ContextoDeAutenticacao, useAutenticacao } from './contexto'
import { destinoDepoisDoAcesso } from './destino'
import { TelasDeAcesso } from './telas-de-acesso'

/** O Workspace escolhido nesta aba, para um refresh não pedir a escolha de novo. */
const CHAVE_DO_WORKSPACE = 'althius:workspace'

interface Participacao {
  workspace_id: string
  role: 'member' | 'admin'
}

export function AplicativoAutenticado({
  cliente,
  aoAcessarDemonstracao,
}: {
  cliente: SupabaseClient
  aoAcessarDemonstracao?: () => void
}) {
  return (
    <ContextoDeAutenticacao cliente={cliente}>
      <EntradaDoAplicativo aoAcessarDemonstracao={aoAcessarDemonstracao} />
    </ContextoDeAutenticacao>
  )
}

function EntradaDoAplicativo({ aoAcessarDemonstracao }: { aoAcessarDemonstracao?: () => void }) {
  const { cliente, sessao, carregandoSessao } = useAutenticacao()
  const [participacoes, setParticipacoes] = useState<Participacao[] | null>(null)
  const [erroParticipacoes, setErroParticipacoes] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState('')
  // A renovação do token troca o objeto da sessão; só outra Conta de usuário recarrega as Participações.
  const usuarioId = sessao?.user.id

  useEffect(() => {
    let ativo = true
    setParticipacoes(null)
    setErroParticipacoes(null)
    setWorkspaceId('')
    if (!usuarioId) return () => { ativo = false }
    // Quem acabou de entrar sai da tela de acesso para o endereço que tentou abrir, antes de o Workspace montar as rotas.
    const destino = destinoDepoisDoAcesso()
    if (destino) window.history.replaceState(null, '', destino)

    void cliente
      .from('workspace_memberships')
      .select('workspace_id, role')
      .eq('user_id', usuarioId)
      .eq('active', true)
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) {
          setErroParticipacoes(error.message)
          return
        }
        const lista = (data ?? []) as Participacao[]
        setParticipacoes(lista)
        const salvo = sessionStorage.getItem(CHAVE_DO_WORKSPACE)
        setWorkspaceId(lista.find((p) => p.workspace_id === salvo)?.workspace_id ?? (lista.length === 1 ? lista[0].workspace_id : ''))
      })

    return () => { ativo = false }
  }, [cliente, usuarioId])

  if (carregandoSessao) return <TelaDeEstado>Verificando sessão…</TelaDeEstado>
  if (!sessao) return <TelasDeAcesso aoAcessarDemonstracao={aoAcessarDemonstracao} />
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
          {participacoes.map((p) => <option key={p.workspace_id} value={p.workspace_id}>{p.workspace_id}</option>)}
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
  const { workspace_id: workspaceId, role } = participacao
  const ambiente = useMemo(
    () =>
      criarAmbienteDoWorkspace({
        cliente,
        usuario: { id: usuarioId, email },
        participacao: { workspaceId, papel: role === 'admin' ? 'administrador' : 'membro' },
      }),
    [cliente, usuarioId, email, workspaceId, role],
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
