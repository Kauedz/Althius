import { MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BOTAO_SECUNDARIO } from '@/components/botoes'
import { Mensagem } from '@/components/mensagem'
import { useConversas } from '@/conversa/contexto'
import { useDados, useFonte } from '@/fonte/contexto'
import { formatarDataCompleta } from '@/fonte/formatar-data'
import { nomeDaConversa } from '@/fonte/tipos'
import { mensagemDeErro } from '@/lib/utils'

const QUANTAS = 8

/**
 * As Conversas coordenadas salvas de quem está na sessão, para reabrir e continuar de onde pararam. Só existe onde as
 * Conversas ficam no banco (o Workspace operacional); na Demonstração, a lista não aparece.
 */
export function ConversasSalvas() {
  const fonte = useFonte()
  if (!fonte.conversasSalvas) return null
  return <ListaDeConversas />
}

function ListaDeConversas() {
  const conversas = useConversas()
  const navegar = useNavigate()
  const { respondendo } = conversas.coordenada
  const salvas = useDados((fonte) => fonte.conversasSalvas?.() ?? Promise.resolve([]), [respondendo])
  const [erro, setErro] = useState('')
  if (!salvas || salvas.length === 0) return null

  async function abrir(id: string) {
    setErro('')
    try {
      await conversas.abrir(id)
      navegar('/conversa')
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <section aria-label="Conversas anteriores" className="flex flex-col gap-3">
      <h2 className="rotulo">Conversas anteriores</h2>
      <Mensagem tipo="erro">{erro}</Mensagem>
      <ul className="flex flex-col divide-y divide-al-line border border-al-line">
        {salvas.slice(0, QUANTAS).map((conversa) => (
          <li key={conversa.id} className="flex items-center justify-between gap-6 py-3 pr-4 pl-5">
            <span className="flex min-w-0 items-center gap-3">
              <MessageSquare strokeWidth={1.8} className="size-4 shrink-0 text-al-muted" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{nomeDaConversa(conversa)}</span>
                <span className="text-sm text-al-muted">
                  {formatarDataCompleta(conversa.atualizadaEm)}
                  {conversa.emAndamento && ' · respondendo'}
                </span>
              </span>
            </span>
            <button
              type="button"
              onClick={() => abrir(conversa.id)}
              aria-label={`Abrir a Conversa ${nomeDaConversa(conversa)}`}
              className={BOTAO_SECUNDARIO}
            >
              Abrir
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
