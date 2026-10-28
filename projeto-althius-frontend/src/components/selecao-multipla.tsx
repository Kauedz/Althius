import { X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'

const LIMITE_DE_SUGESTOES = 50

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export interface OpcaoDaSelecao {
  valor: string
  detalhe?: string
}

/** Escolha de vários itens com busca: as escolhas viram etiquetas removíveis acima do campo. */
export function SelecaoMultipla({
  rotulo,
  opcoes,
  selecionadas,
  aoMudar,
  dica,
}: {
  rotulo: string
  opcoes: OpcaoDaSelecao[]
  selecionadas: string[]
  aoMudar: (selecionadas: string[]) => void
  dica?: string
}) {
  const id = useId()
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState(false)
  const detalhes = useMemo(() => new Map(opcoes.map((o) => [o.valor, o.detalhe])), [opcoes])

  const termo = normalizar(busca.trim())
  const encontradas = opcoes.filter(
    (o) => !selecionadas.includes(o.valor) && (!termo || normalizar(`${o.valor} ${o.detalhe ?? ''}`).includes(termo)),
  )
  const visiveis = encontradas.slice(0, LIMITE_DE_SUGESTOES)

  const escolher = (valor: string) => {
    aoMudar([...selecionadas, valor])
    setBusca('')
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="rotulo text-al-ink">
        {rotulo}
      </label>
      {selecionadas.length > 0 && (
        <ul aria-label={`${rotulo} escolhidas`} className="flex flex-wrap gap-1.5">
          {selecionadas.map((valor) => (
            <li key={valor} className="rounded-md flex max-w-full items-center gap-1 border border-al-accent/60 bg-al-accent/10 py-0.5 pr-1 pl-2 text-xs">
              <span className="truncate" title={detalhes.get(valor) ? `${valor} · ${detalhes.get(valor)}` : valor}>
                {valor}
                {detalhes.get(valor) && (
                  <>
                    {' · '}
                    <span className="text-al-muted">{detalhes.get(valor)}</span>
                  </>
                )}
              </span>
              <button
                type="button"
                aria-label={`Remover ${valor}`}
                onClick={() => aoMudar(selecionadas.filter((s) => s !== valor))}
                className="grid size-5 shrink-0 place-items-center text-al-muted hover:text-al-ink"
              >
                <X strokeWidth={1.8} className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={aberta}
          aria-controls={`${id}-opcoes`}
          aria-autocomplete="list"
          value={busca}
          placeholder={dica ?? `Buscar e adicionar (${(opcoes.length - selecionadas.length).toLocaleString('pt-BR')})`}
          onChange={(e) => {
            setBusca(e.target.value)
            setAberta(true)
          }}
          onFocus={() => setAberta(true)}
          onBlur={() => setAberta(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAberta(false)
            if (e.key === 'Enter' && visiveis[0]) {
              e.preventDefault()
              escolher(visiveis[0].valor)
            }
          }}
          className="campo h-10 text-sm placeholder:text-al-muted"
        />
        {aberta && (
          <ul
            id={`${id}-opcoes`}
            role="listbox"
            aria-label={`Opções de ${rotulo}`}
            className="rounded-lg absolute inset-x-0 top-full z-20 max-h-72 overflow-y-auto border border-al-line bg-al-surface shadow-lg"
          >
            {visiveis.map((opcao) => (
              <li
                key={opcao.valor}
                role="option"
                aria-selected={false}
                // Evita que o campo perca o foco antes do clique.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(opcao.valor)}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-al-bg"
              >
                {opcao.valor}
                {opcao.detalhe && (
                  <>
                    {' '}
                    <span className="text-al-muted">{opcao.detalhe}</span>
                  </>
                )}
              </li>
            ))}
            {visiveis.length === 0 && <li className="px-3 py-2 text-sm text-al-muted">Nada encontrado.</li>}
            {encontradas.length > visiveis.length && (
              <li className="px-3 py-2 text-xs text-al-muted">
                Mostrando {visiveis.length} de {encontradas.length.toLocaleString('pt-BR')}. Digite para refinar.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
