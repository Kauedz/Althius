import { Route } from 'lucide-react'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { useDadosDeSequencias } from '@/fonte/contexto'

export function PaginaSequencias() {
  const { dados: sequencias, carregando, erro, recarregar } = useDadosDeSequencias(
    (f) => f.sequencias(),
    [],
  )

  return (
    <Pagina titulo="Sequências" icone={Route}>
      <div className="flex flex-col gap-1">
        <h2 className="sr-only">Planos de Sequência</h2>
        <p className="text-sm text-al-muted">
          Planos de abordagem por Conta-alvo. Uma sequência por Conta; qualquer resposta pausa a Conta inteira.
        </p>
        {sequencias && (
          <span className="rotulo text-xs text-al-muted">
            {sequencias.length} {sequencias.length === 1 ? 'sequência' : 'sequências'}
          </span>
        )}
      </div>

      {carregando && <Carregando />}

      {erro && (
        <div role="alert" className="flex flex-col items-start gap-3 py-6">
          <p className="text-sm text-al-muted">Não foi possível carregar as sequências.</p>
          <Button
            type="button"
            variant="outline"
            onClick={recarregar}
            className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {!carregando && !erro && sequencias && sequencias.length === 0 && (
        <p className="py-12 text-sm text-al-muted">
          Nenhuma sequência ainda. Crie uma nova sequência para uma Conta-alvo ou solicite ao Rhetor na Conversa.
        </p>
      )}

      {!carregando && !erro && sequencias && sequencias.length > 0 && (
        <div className="flex flex-col gap-3 py-4">
          <ul aria-label="Lista de Sequências" className="flex flex-col gap-2">
            {sequencias.map((seq) => (
              <li
                key={seq.id}
                className="flex items-center justify-between border border-al-line bg-al-surface p-4"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-al-ink">{seq.contaId}</span>
                  <span className="text-xs text-al-muted">
                    {seq.totalParticipantes} {seq.totalParticipantes === 1 ? 'participante' : 'participantes'} · {seq.steps.length} steps
                  </span>
                </div>
                <span className="selo">{seq.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Pagina>
  )
}
