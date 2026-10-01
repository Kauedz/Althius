import { useEffect, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { type AcessoAoWorkspace, lerAcessoAoWorkspace, pedirAoStripe } from '@/fonte/supabase-assinatura'

/** O acesso ao Workspace operacional, lido uma vez por Workspace. Enquanto lê, ou se a leitura falha, fica nulo. */
export function useAcessoAoWorkspace(cliente: SupabaseClient, workspaceId: string): AcessoAoWorkspace | null {
  const [acesso, setAcesso] = useState<{ workspaceId: string; valor: AcessoAoWorkspace | null }>()
  useEffect(() => {
    let ativo = true
    void lerAcessoAoWorkspace(cliente, workspaceId).then((valor) => {
      if (ativo) setAcesso({ workspaceId, valor })
    })
    return () => {
      ativo = false
    }
  }, [cliente, workspaceId])
  return acesso?.workspaceId === workspaceId ? acesso.valor : null
}

/** Para onde o navegador vai depois que o Stripe devolve o endereço; um objeto, para o teste trocar a ida. */
export const idaAoStripe = { ir: (url: string) => window.location.assign(url) }

function useAcaoDoStripe(cliente: SupabaseClient, workspaceId: string) {
  const [pedindo, setPedindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  async function pedir(action: 'checkout' | 'portal' | 'seats', aoTerminar?: (seats?: number) => void) {
    setPedindo(true)
    setErro(null)
    try {
      const resposta = await pedirAoStripe(cliente, workspaceId, action)
      if (resposta.url) idaAoStripe.ir(resposta.url)
      else aoTerminar?.(resposta.seats)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível falar com o Stripe agora.')
    } finally {
      setPedindo(false)
    }
  }
  return { pedindo, erro, pedir }
}

/**
 * Sem assinatura ativa, o Workspace operacional fica fechado (ticket 06): o Administrador assina pelo Stripe, com um
 * assento por Participante ativo; os outros pedem ao Administrador. A Demonstração continua aberta.
 */
export function TelaDeAssinatura({
  cliente,
  workspaceId,
  nomeDoWorkspace,
  administrador,
  acesso,
  aoAcessarDemonstracao,
  aoTrocarDeWorkspace,
  sair,
}: {
  cliente: SupabaseClient
  workspaceId: string
  nomeDoWorkspace: string
  administrador: boolean
  acesso: AcessoAoWorkspace
  aoAcessarDemonstracao?: () => void
  aoTrocarDeWorkspace?: () => void
  sair: ReactNode
}) {
  const { pedindo, erro, pedir } = useAcaoDoStripe(cliente, workspaceId)
  const assentos = Math.max(1, acesso.assentosEmUso)
  const titulo =
    acesso.motivo === 'cancelada'
      ? 'O plano deste Workspace foi cancelado'
      : acesso.motivo === 'atrasada'
        ? 'O pagamento deste Workspace está atrasado'
        : `Contrate o plano para usar o ${nomeDoWorkspace}`
  return (
    <main className="grid min-h-screen place-items-center bg-al-bg p-6 text-al-ink">
      <section aria-label="Plano do Workspace" className="flex max-w-xl flex-col items-start gap-4">
        <h1 className="titulo-secao text-3xl">{titulo}</h1>
        <p className="text-al-muted">
          O plano é por usuário: cada Participante ativo é um assento, e cada assento traz créditos para o saldo do
          Workspace. {nomeDoWorkspace} tem hoje {assentos} {assentos === 1 ? 'assento' : 'assentos'}.
        </p>
        {administrador ? (
          acesso.motivo === 'sem_assinatura' || acesso.motivo === 'cancelada' ? (
            <Button disabled={pedindo} onClick={() => void pedir('checkout')}>
              {pedindo ? 'Abrindo o Stripe...' : 'Contratar o plano'}
            </Button>
          ) : (
            <Button disabled={pedindo} onClick={() => void pedir('portal')}>
              {pedindo ? 'Abrindo o Stripe...' : 'Atualizar o pagamento'}
            </Button>
          )
        ) : (
          <p>Peça a um Administrador do Workspace para contratar o plano.</p>
        )}
        {erro && (
          <p role="alert" className="text-sm text-al-atencao">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {aoAcessarDemonstracao && (
            <Button variant="outline" onClick={aoAcessarDemonstracao}>
              Abrir Demonstração
            </Button>
          )}
          {aoTrocarDeWorkspace && (
            <Button variant="outline" onClick={aoTrocarDeWorkspace}>
              Trocar de Workspace
            </Button>
          )}
          {sair}
        </div>
      </section>
    </main>
  )
}

/**
 * Na barra do Workspace operacional, para o Administrador de um Workspace pago: abrir o portal do Stripe e, quando há
 * mais Participantes que assentos pagos, ajustar os assentos (cobrança proporcional).
 */
export function BotoesDaAssinatura({
  cliente,
  workspaceId,
  acesso,
}: {
  cliente: SupabaseClient
  workspaceId: string
  acesso: AcessoAoWorkspace
}) {
  const { pedindo, erro, pedir } = useAcaoDoStripe(cliente, workspaceId)
  const [ajustados, setAjustados] = useState<number | null>(null)
  if (acesso.motivo !== 'ativa' && acesso.motivo !== 'atrasada') return null
  const pagos = ajustados ?? acesso.assentosPagos ?? 0
  return (
    <>
      {acesso.assentosEmUso !== pagos && (
        <Button variant="outline" disabled={pedindo} onClick={() => void pedir('seats', (s) => setAjustados(s ?? null))}>
          Ajustar assentos ({pagos} → {acesso.assentosEmUso})
        </Button>
      )}
      <Button variant="outline" disabled={pedindo} onClick={() => void pedir('portal')}>
        Plano
      </Button>
      {erro && <span role="alert" className="text-al-atencao">{erro}</span>}
    </>
  )
}
