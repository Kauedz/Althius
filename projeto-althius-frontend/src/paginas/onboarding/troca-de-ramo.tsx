import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { RAMOS_DE_ONBOARDING, type RamoDeOnboarding } from '@/fonte/onboarding-tipos'
import { cn } from '@/lib/utils'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, PARAMETRO_DE_CONVITE, type PropsDaEtapa } from './componentes'

const ROTULO_DO_RAMO: Record<RamoDeOnboarding, string> = {
  criador: 'Criador',
  convidado: 'Convidado',
}

/**
 * Só na demonstração, para smoke test: troca de ramo sem login, recomeçando o onboarding no outro caminho. O endereço
 * acompanha, com o parâmetro de convite só no ramo do convidado. Quando há algo a descartar, a troca pede confirmação.
 * Sem a troca na Fonte, nada aparece.
 */
export function TrocaDeRamoDaDemonstracao({ estado, fonte }: PropsDaEtapa) {
  const [, setParametros] = useSearchParams()
  const [aConfirmar, setAConfirmar] = useState<RamoDeOnboarding | null>(null)
  if (!fonte.trocarRamoDaDemonstracao) return null
  const descartaAlgo = estado.papel !== null || estado.concluido

  function trocar(ramo: RamoDeOnboarding) {
    setAConfirmar(null)
    setParametros(
      (anteriores) => {
        const parametros = new URLSearchParams(anteriores)
        if (ramo === 'convidado') parametros.set(PARAMETRO_DE_CONVITE, 'demo')
        else parametros.delete(PARAMETRO_DE_CONVITE)
        return parametros
      },
      { replace: true },
    )
    void fonte.trocarRamoDaDemonstracao?.(ramo)
  }

  function escolher(ramo: RamoDeOnboarding) {
    if (ramo === estado.ramo) return
    if (descartaAlgo) setAConfirmar(ramo)
    else trocar(ramo)
  }

  return (
    <div role="group" aria-label="Ramo da demonstração" className="flex items-center gap-2">
      <span className="rotulo" aria-hidden>
        Ver como
      </span>
      <div className="flex border border-al-line">
        {RAMOS_DE_ONBOARDING.map((ramo) => {
          const ativo = ramo === estado.ramo
          return (
            <button
              key={ramo}
              type="button"
              aria-pressed={ativo}
              onClick={() => escolher(ramo)}
              className={cn('px-2.5 py-1 text-xs', ativo ? 'bg-al-ink text-al-bg' : 'bg-al-surface hover:bg-al-bg')}
            >
              {ROTULO_DO_RAMO[ramo]}
            </button>
          )
        })}
      </div>
      <Dialog open={aConfirmar !== null} onOpenChange={(aberto) => !aberto && setAConfirmar(null)}>
        <DialogContent className="gap-5 p-6 sm:max-w-md">
          <DialogTitle className="titulo-secao text-2xl">
            Trocar para {aConfirmar && ROTULO_DO_RAMO[aConfirmar]}
          </DialogTitle>
          <DialogDescription className="text-al-muted">
            Na demonstração, a troca recomeça o onboarding do zero, sem login. O que foi preenchido é descartado.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <button type="button" className={BOTAO_SECUNDARIO} onClick={() => setAConfirmar(null)}>
              Cancelar
            </button>
            <button type="button" className={BOTAO_PRIMARIO} onClick={() => aConfirmar && trocar(aConfirmar)}>
              Trocar e recomeçar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
