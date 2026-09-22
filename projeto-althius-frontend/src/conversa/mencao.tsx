import { useState, type KeyboardEvent } from 'react'
import { IconeAgente } from '@/components/marca'
import type { Agente } from '@/fonte/tipos'
import { cn } from '@/lib/utils'

const TOKEN_DE_MENCAO = /@(\p{L}*)$/u

/** Primeiro Agente mencionado com @Nome num texto. */
export function primeiroMencionado(texto: string, agentes: Agente[]): Agente | undefined {
  for (const [, nome] of texto.matchAll(/@(\p{L}+)/gu)) {
    const agente = agentes.find((a) => a.nome.toLowerCase() === nome.toLowerCase())
    if (agente) return agente
  }
  return undefined
}

/**
 * Autocompletar de @menção: abre quando a última palavra começa com @ e
 * troca a palavra pelo nome do Agente escolhido.
 */
export function useMencao(valor: string, setValor: (valor: string) => void, agentes: Agente[]) {
  const [destacada, setDestacada] = useState(0)
  const [fechadaEm, setFechadaEm] = useState<string | null>(null)

  const token = valor.match(TOKEN_DE_MENCAO)?.[1]
  const opcoes =
    token === undefined ? [] : agentes.filter((a) => a.nome.toLowerCase().startsWith(token.toLowerCase()))
  const aberta = opcoes.length > 0 && fechadaEm !== valor
  const indice = Math.min(destacada, Math.max(opcoes.length - 1, 0))

  function selecionar(agente: Agente) {
    setValor(valor.replace(TOKEN_DE_MENCAO, `@${agente.nome} `))
    setDestacada(0)
  }

  /** Trata o teclado da lista. Devolve true quando consumiu a tecla. */
  function aoTeclar(evento: KeyboardEvent): boolean {
    if (!aberta) return false
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault()
      const passo = evento.key === 'ArrowDown' ? 1 : -1
      setDestacada((indice + passo + opcoes.length) % opcoes.length)
      return true
    }
    if (evento.key === 'Enter' || evento.key === 'Tab') {
      evento.preventDefault()
      selecionar(opcoes[indice])
      return true
    }
    if (evento.key === 'Escape') {
      evento.preventDefault()
      setFechadaEm(valor)
      return true
    }
    return false
  }

  return { aberta, opcoes, indice, selecionar, aoTeclar }
}

export function ListaDeMencoes({
  id,
  opcoes,
  indice,
  aoSelecionar,
  className,
}: {
  id: string
  opcoes: Agente[]
  indice: number
  aoSelecionar: (agente: Agente) => void
  className?: string
}) {
  return (
    <ul id={id} role="listbox" aria-label="Agentes" className={cn('border border-al-line bg-al-surface', className)}>
      {opcoes.map((agente, i) => (
        <li
          key={agente.id}
          id={`${id}-${agente.id}`}
          role="option"
          aria-selected={i === indice}
          onMouseDown={(evento) => evento.preventDefault()}
          onClick={() => aoSelecionar(agente)}
          className={cn(
            'flex cursor-pointer items-center gap-4 px-4 py-2',
            i === indice && 'bg-al-line',
          )}
        >
          <IconeAgente id={agente.id} />
          <span className="font-normal">{agente.nome}</span>
          <span className="text-sm text-al-muted">{agente.especialidade}</span>
        </li>
      ))}
    </ul>
  )
}
