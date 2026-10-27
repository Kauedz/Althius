import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'

interface Acao {
  workspace_id: string
  tool: string
  action: Record<string, unknown>
  state: string
  expires_at: string
}

const rotulos: Record<string, string> = {
  ativar_sequencia: 'Ativar Sequência', apagar_conta: 'Apagar Conta-alvo', apagar_contato: 'Apagar Contato',
  mudar_papel: 'Mudar papel de Participação', remover_participacao: 'Remover Participação',
  conectar_integracao: 'Conectar Integração', desconectar_integracao: 'Desconectar Integração',
  enviar_mensagem: 'Enviar mensagem',
}

export function PaginaLinkDeAcao({ cliente, token }: { cliente: SupabaseClient; token: string }) {
  const [acao, setAcao] = useState<Acao | null>(null)
  const [estado, setEstado] = useState('carregando')
  const [ocupado, setOcupado] = useState(false)
  const [erroOAuth, setErroOAuth] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    void cliente.rpc('get_whatsapp_action_link', { p_token: token }).then(({ data, error }) => {
      if (!ativo) return
      const linha = Array.isArray(data) ? data[0] as Acao | undefined : undefined
      setAcao(linha ?? null)
      setEstado(error ? 'erro' : linha?.state ?? 'invalido')
    })
    return () => { ativo = false }
  }, [cliente, token])

  async function decidir(decisao: 'aprovar' | 'recusar') {
    setOcupado(true)
    const { data, error } = await cliente.rpc('decide_whatsapp_action_link', { p_token: token, p_decision: decisao })
    setOcupado(false)
    setEstado(error ? 'erro' : String(data))
  }

  async function conectarPorOAuth() {
    const integrationId = acao?.action.integrationId
    if (typeof integrationId !== 'string' || !acao) return
    setOcupado(true)
    setErroOAuth(null)
    try {
      const { data, error } = await cliente.functions.invoke('integration-connect', {
        body: { action: 'iniciar', workspaceId: acao.workspace_id, integrationId },
      })
      const url = data && typeof data.url === 'string' ? data.url : null
      if (error || !url || new URL(url).protocol !== 'https:') throw new Error('OAuth indisponível')
      window.location.assign(url)
    } catch {
      setOcupado(false)
      setErroOAuth('Não foi possível iniciar a autorização OAuth. Tente novamente.')
      return
    }
    setOcupado(false)
  }

  async function entrarNovamente() {
    await cliente.auth.signOut()
    const destino = `${window.location.pathname}${window.location.search}`
    window.location.assign(`/entrar?destino=${encodeURIComponent(destino)}`)
  }

  const mensagens: Record<string, string> = {
    carregando: 'Carregando a ação…', erro: 'Não foi possível validar este link. Tente novamente.',
    invalido: 'Este link não existe ou pertence a outra Conta.', expirado: 'Este link venceu. Peça um novo link pelo WhatsApp.',
    usado: 'Este link já foi usado.', alterado: 'O conteúdo da ação mudou. Peça uma nova confirmação.',
    login_recente: 'Para confirmar, saia da Althius e entre novamente. A confirmação exige login feito nos últimos 12 horas.',
    aprovado: 'Confirmação registrada. Você pode voltar ao WhatsApp.', recusado: 'Ação recusada. Você pode voltar ao WhatsApp.',
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 p-6">
      <h1 className="text-2xl font-semibold">Confirmar ação</h1>
      {acao && <section className="rounded-lg border p-4" aria-label="Ação solicitada">
        <p className="font-medium">{rotulos[acao.tool] ?? acao.tool}</p>
        <p className="mt-2 text-sm">Workspace: {acao.workspace_id}</p>
        <pre className="mt-3 whitespace-pre-wrap break-words text-sm">{JSON.stringify(acao.action, null, 2)}</pre>
      </section>}
      <p role="status">{mensagens[estado] ?? 'Esta ação não pode mais ser confirmada.'}</p>
      {acao?.tool === 'conectar_integracao' && estado === 'pendente' && (
        <div className="grid gap-3">
          <p>Conexões são autorizadas sempre pelo OAuth oficial da Integração. Nenhuma chave de API é solicitada nesta página.</p>
          <Button disabled={ocupado} onClick={() => void conectarPorOAuth()}>Continuar para autorização OAuth</Button>
          {erroOAuth && <p role="alert">{erroOAuth}</p>}
        </div>
      )}
      {estado === 'login_recente' && <Button onClick={() => void entrarNovamente()}>Sair e entrar novamente</Button>}
      {estado === 'pendente' && acao?.tool !== 'conectar_integracao' && <div className="flex gap-3">
        <Button disabled={ocupado} onClick={() => void decidir('aprovar')}>Aprovar</Button>
        <Button variant="outline" disabled={ocupado} onClick={() => void decidir('recusar')}>Recusar</Button>
      </div>}
    </main>
  )
}
