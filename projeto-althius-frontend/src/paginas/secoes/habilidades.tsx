import { Carregando } from '@/components/marca'
import { Switch } from '@/components/ui/switch'
import { useDados, useFonte } from '@/fonte/contexto'
import { criteriosDaAderencia, variacoesPorPersona } from '@/fonte/regras-memoria'
import type { Agente } from '@/fonte/tipos'

export function SecaoHabilidades({ agente }: { agente: Agente }) {
  const fonte = useFonte()
  const habilidades = useDados((f) => f.habilidades(agente.id), [agente.id])
  const memoria = useDados((f) => f.memoriaDoWorkspace(), [])

  return (
    <section aria-labelledby="titulo-habilidades" className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="titulo-habilidades" className="titulo-secao text-3xl">
          Habilidades
        </h2>
        <p className="text-al-muted">Procedimentos que {agente.nome} criou ou refinou com o uso e passa a reaplicar.</p>
      </div>
      {!habilidades ? (
        <Carregando />
      ) : (
        <ul className="flex flex-col border-t border-al-line">
          {habilidades.map((habilidade) => (
            <li key={habilidade.id} aria-label={habilidade.nome} className="flex items-start gap-6 border-b border-al-line py-4">
              <div className="flex flex-1 flex-col gap-1">
                <span className="font-normal">{habilidade.nome}</span>
                <p className="text-al-muted">{habilidade.descricao}</p>
                {habilidade.usaIcp && memoria && (
                  <p className="text-sm">
                    <span className="rotulo mr-2">ICP vigente</span>
                    {criteriosDaAderencia(memoria.icp.secoes)}
                  </p>
                )}
                {habilidade.usaPersonas && memoria && (
                  <p className="text-sm">
                    <span className="rotulo mr-2">Personas vigentes</span>
                    {variacoesPorPersona(memoria.personas.secoes)}
                  </p>
                )}
                <span className="text-sm text-al-muted">
                  {habilidade.usos} usos · melhorada em {habilidade.ultimaMelhoria}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rotulo">{habilidade.ativa ? 'Ativa' : 'Inativa'}</span>
                <Switch
                  aria-label={habilidade.nome}
                  checked={habilidade.ativa}
                  onCheckedChange={(ativa) => fonte.definirHabilidadeAtiva(habilidade.id, ativa)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
