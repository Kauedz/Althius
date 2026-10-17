// A página pública do link de descadastro do rodapé dos e-mails da Sequência (/descadastro?t=<token>). Abrir não
// registra nada (leitores de link dos provedores abrem URLs sozinhos): a pessoa confirma num botão, e a Edge Function
// descadastro grava a Supressão. Confirmar de novo é idempotente.
import { useState } from 'react'

export type DesfechoDoDescadastro = 'registered' | 'already_registered' | 'invalid' | 'error'

/** O token quando o caminho é a página de descadastro; null em qualquer outro caminho. */
export function tokenDeDescadastroDoCaminho(caminho: string, busca: string): string | null {
  if (caminho.replace(/\/+$/, '') !== '/descadastro') return null
  return new URLSearchParams(busca).get('t') ?? ''
}

/** Chama a Edge Function descadastro com o token. */
export function confirmarDescadastroPelaFuncao(urlDoSupabase: string) {
  return async (token: string): Promise<DesfechoDoDescadastro> => {
    try {
      const resposta = await fetch(`${urlDoSupabase.replace(/\/+$/, '')}/functions/v1/descadastro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const corpo = await resposta.json().catch(() => ({}))
      const desfecho = corpo?.outcome
      return desfecho === 'registered' || desfecho === 'already_registered' || desfecho === 'invalid' ? desfecho : 'error'
    } catch {
      return 'error'
    }
  }
}

const MENSAGENS: Record<DesfechoDoDescadastro, string> = {
  registered: 'Pronto: você não vai mais receber estes e-mails.',
  already_registered: 'Pronto: você não vai mais receber estes e-mails.',
  invalid: 'Este link de descadastro não é válido.',
  error: 'Não foi possível confirmar agora. Tente de novo em instantes.',
}

export function PaginaDeDescadastro({
  token,
  confirmar,
}: {
  token: string
  confirmar: (token: string) => Promise<DesfechoDoDescadastro>
}) {
  const [desfecho, setDesfecho] = useState<DesfechoDoDescadastro | null>(null)
  const [enviando, setEnviando] = useState(false)
  const concluido = desfecho === 'registered' || desfecho === 'already_registered' || desfecho === 'invalid'

  async function aoConfirmar() {
    setEnviando(true)
    setDesfecho(token ? await confirmar(token) : 'invalid')
    setEnviando(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md space-y-4 rounded-lg border p-6">
        <h1 className="text-lg font-semibold">Descadastro</h1>
        {desfecho ? <p role="status">{MENSAGENS[desfecho]}</p> : (
          <p>Confirme para não receber mais e-mails desta empresa.</p>
        )}
        {!concluido && (
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60"
            onClick={aoConfirmar}
            disabled={enviando}
          >
            Confirmar descadastro
          </button>
        )}
      </div>
    </main>
  )
}
