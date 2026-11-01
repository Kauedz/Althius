import { X } from 'lucide-react'
import { useId, useState } from 'react'

/**
 * Lista livre em etiquetas, para o que não cabe numa lista fechada (palavras-chave, termos a excluir): digite e tecle
 * Enter ou vírgula; cada etiqueta sai pelo X.
 */
export function EtiquetasDeTexto({
  rotulo,
  valores,
  aoMudar,
}: {
  rotulo: string
  valores: string[]
  aoMudar: (valores: string[]) => void
}) {
  const id = useId()
  const [texto, setTexto] = useState('')

  const adicionar = (atuais: string[], novos: string[]) => {
    const lista = [...atuais]
    for (const valor of novos) {
      const limpo = valor.trim()
      if (limpo && !lista.some((v) => v.toLowerCase() === limpo.toLowerCase())) lista.push(limpo)
    }
    if (lista.length !== atuais.length) aoMudar(lista)
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="rotulo text-al-ink">
        {rotulo}
      </label>
      {valores.length > 0 && (
        <ul aria-label={`${rotulo} escolhidas`} className="flex flex-wrap gap-1.5">
          {valores.map((valor) => (
            <li key={valor} className="rounded-md flex max-w-full items-center gap-1 border border-al-accent/60 bg-al-accent/10 py-0.5 pr-1 pl-2 text-xs">
              <span className="truncate">{valor}</span>
              <button
                type="button"
                aria-label={`Remover ${valor}`}
                onClick={() => aoMudar(valores.filter((v) => v !== valor))}
                className="grid size-5 shrink-0 place-items-center text-al-muted hover:text-al-ink"
              >
                <X strokeWidth={1.8} className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        value={texto}
        placeholder="Digite e tecle Enter ou vírgula"
        onChange={(e) => {
          const partes = e.target.value.split(',')
          if (partes.length > 1) adicionar(valores, partes.slice(0, -1))
          setTexto(partes.at(-1) ?? '')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            adicionar(valores, [texto])
            setTexto('')
          }
        }}
        onBlur={() => {
          if (texto.trim()) {
            adicionar(valores, [texto])
            setTexto('')
          }
        }}
        className="campo h-10 text-sm placeholder:text-al-muted"
      />
    </div>
  )
}
