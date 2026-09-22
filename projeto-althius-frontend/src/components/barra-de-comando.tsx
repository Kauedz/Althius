import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useConversas } from '@/conversa/contexto'
import { ListaDeMencoes, primeiroMencionado, useMencao } from '@/conversa/mencao'
import { useDados } from '@/fonte/contexto'

/** Barra de comando global (Ctrl/Cmd+K): @mencione um Agente com um pedido. */
export function BarraDeComando({ aberta, aoMudar }: { aberta: boolean; aoMudar: (aberta: boolean) => void }) {
  const agentes = useDados((fonte) => fonte.agentes(), []) ?? []
  const conversas = useConversas()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const mencao = useMencao(texto, setTexto, agentes)

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    const agente = primeiroMencionado(texto, agentes)
    if (!agente) {
      setErro('Mencione um agente com @, por exemplo: @Rhetor escreva um e-mail.')
      return
    }
    conversas.enviar(agente.id, { texto: texto.trim() })
    navegar(`/agentes/${agente.id}/conversa`)
    setTexto('')
    setErro('')
    aoMudar(false)
  }

  return (
    <Dialog open={aberta} onOpenChange={aoMudar}>
      <DialogContent className="top-32 translate-y-0 gap-4 p-6 sm:max-w-xl">
        <DialogTitle className="rotulo">Barra de comando</DialogTitle>
        <DialogDescription className="text-al-muted">
          Mencione um agente com @ e escreva o pedido.
        </DialogDescription>
        <form onSubmit={enviar} className="flex flex-col gap-2">
          <input
            role="combobox"
            aria-label="Comando"
            aria-expanded={mencao.aberta}
            aria-controls="comando-mencoes"
            aria-autocomplete="list"
            aria-activedescendant={mencao.aberta ? `comando-mencoes-${mencao.opcoes[mencao.indice]?.id}` : undefined}
            autoFocus
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value)
              setErro('')
            }}
            onKeyDown={(evento) => mencao.aoTeclar(evento)}
            placeholder="@Oraculum como estamos no Perplexity?"
            className="campo py-4 text-lg"
          />
          {mencao.aberta && (
            <ListaDeMencoes
              id="comando-mencoes"
              opcoes={mencao.opcoes}
              indice={mencao.indice}
              aoSelecionar={mencao.selecionar}
            />
          )}
          {erro && (
            <p role="alert" className="text-sm text-al-erro">
              {erro}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
