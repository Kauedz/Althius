import { useState } from 'react'
import { Carregando } from '@/components/marca'
import { Button } from '@/components/ui/button'
import { useDados, useFonte } from '@/fonte/contexto'
import type { Agente, Fato } from '@/fonte/tipos'

export function SecaoMemoria({ agente }: { agente: Agente }) {
  const fatos = useDados((fonte) => fonte.memoria(agente.id), [agente.id])

  return (
    <section aria-labelledby="titulo-memoria" className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="titulo-memoria" className="titulo-secao text-3xl">
          Memória
        </h2>
        <p className="text-al-muted">O que {agente.nome} aprendeu sobre a Databricks e sobre você. Corrija o que estiver errado.</p>
      </div>
      {!fatos ? (
        <Carregando />
      ) : fatos.length === 0 ? (
        <p className="text-al-muted">{agente.nome} ainda não guardou nenhum fato.</p>
      ) : (
        <ul className="flex flex-col border-t border-al-line">
          {fatos.map((fato) => (
            <ItemDeFato key={fato.id} fato={fato} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ItemDeFato({ fato }: { fato: Fato }) {
  const fonte = useFonte()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(fato.texto)

  async function salvar() {
    if (!texto.trim()) return
    await fonte.editarFato(fato.id, texto.trim())
    setEditando(false)
  }

  return (
    <li aria-label={fato.texto} className="flex items-start gap-6 border-b border-al-line py-4">
      <div className="flex flex-1 flex-col gap-1">
        {editando ? (
          <textarea
            aria-label="Fato"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            rows={2}
            className="w-full border border-al-line bg-transparent px-4 py-2 outline-none focus-visible:border-al-accent"
          />
        ) : (
          <p>{fato.texto}</p>
        )}
        <span className="text-sm text-al-muted">{fato.origem}</span>
      </div>
      <div className="flex gap-2">
        {editando ? (
          <>
            <Button onClick={salvar}>Salvar</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setTexto(fato.texto)
                setEditando(false)
              }}
            >
              Cancelar
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button variant="ghost" onClick={() => fonte.apagarFato(fato.id)}>
              Apagar
            </Button>
          </>
        )}
      </div>
    </li>
  )
}
