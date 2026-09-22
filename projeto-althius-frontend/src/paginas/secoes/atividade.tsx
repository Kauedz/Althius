import { useState } from 'react'
import { Carregando } from '@/components/marca'
import { useDados } from '@/fonte/contexto'
import type { Agente, Gatilho } from '@/fonte/tipos'
import { ROTULO_DO_GATILHO } from '@/paginas/rotulos'

export function SecaoAtividade({ agente }: { agente: Agente }) {
  const [gatilho, setGatilho] = useState<Gatilho | ''>('')
  const itens = useDados((fonte) => fonte.atividade(agente.id, gatilho || undefined), [agente.id, gatilho])

  return (
    <section aria-labelledby="titulo-atividade" className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h2 id="titulo-atividade" className="titulo-secao text-3xl">
            Atividade
          </h2>
          <p className="text-al-muted">Tudo que {agente.nome} fez, e o que disparou cada ação.</p>
        </div>
        <label className="flex flex-col gap-2">
          <span className="rotulo">Gatilho</span>
          <select
            value={gatilho}
            onChange={(e) => setGatilho(e.target.value as Gatilho | '')}
            className="border border-al-line bg-al-bg px-4 py-2 outline-none focus-visible:border-al-accent"
          >
            <option value="">Todos</option>
            {Object.entries(ROTULO_DO_GATILHO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!itens ? (
        <Carregando />
      ) : itens.length === 0 ? (
        <p className="text-al-muted">Nada por aqui com esse filtro.</p>
      ) : (
        <ul aria-label="Linha do tempo" className="flex flex-col border-t border-al-line">
          {itens.map((item) => (
            <li key={item.id} className="grid grid-cols-[8rem_1fr] gap-6 border-b border-al-line py-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-al-muted">{item.quando}</span>
                <span className="rotulo">{ROTULO_DO_GATILHO[item.gatilho]}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-normal">{item.descricao}</span>
                <span className="text-al-muted">{item.resultado}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
