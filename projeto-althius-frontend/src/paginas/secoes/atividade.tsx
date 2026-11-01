import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { useAmbiente, useDados, useFonte } from '@/fonte/contexto'
import type { Agente, Gatilho } from '@/fonte/tipos'
import { ROTULO_DO_GATILHO } from '@/paginas/rotulos'

export function SecaoAtividade({ agente }: { agente: Agente }) {
  const [gatilho, setGatilho] = useState<Gatilho | ''>('')
  const [tentando, setTentando] = useState<string | null>(null)
  const [retomada, setRetomada] = useState<string | null>(null)
  const [falhaNaRetomada, setFalhaNaRetomada] = useState<string | null>(null)
  const itens = useDados((fonte) => fonte.atividade(agente.id, gatilho || undefined), [agente.id, gatilho])
  const fonte = useFonte()
  const { disponivel } = useAmbiente()

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
            className="campo w-auto"
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
        <p className="text-al-muted">
          {disponivel('conversas')
            ? 'Nada por aqui com esse filtro.'
            : `Ainda não há atividade: ${agente.nome} não executou nada neste Workspace, e executar um Agente ainda não está disponível.`}
        </p>
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
                {item.tentarDeNovo && (
                  <button
                    type="button"
                    className="self-start text-sm underline underline-offset-4"
                    disabled={tentando === item.id}
                    onClick={async () => {
                      setTentando(item.id)
                      setFalhaNaRetomada(null)
                      try {
                        await fonte.tentarDeNovo?.(item.id)
                        setRetomada(item.id)
                      } catch {
                        setFalhaNaRetomada(item.id)
                      } finally {
                        setTentando(null)
                      }
                    }}
                  >
                    {tentando === item.id ? 'Enviando…' : 'Tentar de novo'}
                  </button>
                )}
                {retomada === item.id && <span role="status">Nova Execução na fila.</span>}
                {falhaNaRetomada === item.id && (
                  <span role="alert">Não foi possível tentar de novo agora. Tente outra vez em alguns minutos.</span>
                )}
                {item.link && (
                  <Link to={item.link.para} className="text-sm underline underline-offset-4">
                    {item.link.rotulo}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
