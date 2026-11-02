import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Aderencia, ContaAlvo } from '@/fonte/contas-tipos'
import { useFonteDeContas } from '@/fonte/contexto'
import { ROTULO_DA_ADERENCIA } from './ordem-da-aderencia'

const BOTAO_SECUNDARIO = 'h-9 border-al-line text-sm tracking-[0.04em] hover:bg-al-surface'
const BOTAO_PRIMARIO =
  'rounded-md h-9 border border-al-accent bg-al-accent px-4 text-sm font-medium tracking-[0.04em] text-al-on-accent hover:bg-al-accent-2 disabled:opacity-50'

const ROTULO = ROTULO_DA_ADERENCIA

/**
 * O Vendedor responsável define a Aderência da Conta-alvo (kanban-de-prospeccao 08): Fit ou Não fit, com o motivo.
 * Fit leva o cartão a Fit (se ele ainda não passou de lá); Não fit pede o motivo e a confirmação, porque leva o cartão
 * a Descartada. Sem o método na fonte (a Demonstração), para quem não é o responsável ou com a Conta arquivada, nada
 * aparece.
 */
export function DefinirAderencia({ conta }: { conta: ContaAlvo }) {
  const fonte = useFonteDeContas()
  const [escolha, setEscolha] = useState<Aderencia | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  if (!fonte.definirAderencia || conta.sobMinhaResponsabilidade !== true || conta.arquivadaEm) return null

  return (
    <div className="rounded-xl mt-4 flex flex-col gap-2 border border-al-line bg-al-surface p-3 text-sm">
      <p>
        {conta.aderencia ? (
          <>
            Aderência <strong className="font-normal">{ROTULO[conta.aderencia]}</strong>
            {conta.motivoDaAderencia && (
              <>
                {' · '}
                <span className="text-al-muted">{conta.motivoDaAderencia}</span>
              </>
            )}
          </>
        ) : (
          'Aderência sem avaliação'
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {(['fit', 'nao-fit'] as const).map((aderencia) => (
          <Button
            key={aderencia}
            type="button"
            variant="outline"
            onClick={() => setEscolha(aderencia)}
            className={BOTAO_SECUNDARIO}
          >
            Marcar {ROTULO[aderencia]}
          </Button>
        ))}
      </div>
      {resultado && (
        <p role="status" className="text-xs text-al-muted">
          {resultado}
        </p>
      )}
      <Dialog open={escolha !== null} onOpenChange={(aberto) => !aberto && setEscolha(null)}>
        <DialogContent className="gap-5 p-6 sm:max-w-lg">
          {escolha && (
            <FormularioDaAderencia
              conta={conta}
              aderencia={escolha}
              aoConcluir={() => {
                setResultado(`${ROTULO[escolha]} gravado, com o motivo e quem avaliou.`)
                setEscolha(null)
              }}
              aoCancelar={() => setEscolha(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FormularioDaAderencia({
  conta,
  aderencia,
  aoConcluir,
  aoCancelar,
}: {
  conta: ContaAlvo
  aderencia: Aderencia
  aoConcluir: () => void
  aoCancelar: () => void
}) {
  const fonte = useFonteDeContas()
  const [motivo, setMotivo] = useState(aderencia === conta.aderencia ? (conta.motivoDaAderencia ?? '') : '')
  const [agindo, setAgindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const naoFit = aderencia === 'nao-fit'
  const podeEnviar = (!naoFit || motivo.trim() !== '') && !agindo

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!podeEnviar) return
    setAgindo(true)
    setErro(null)
    try {
      await fonte.definirAderencia!(conta.id, aderencia, motivo.trim())
      aoConcluir()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível gravar a Aderência.')
      setAgindo(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Marcar {ROTULO[aderencia]}</DialogTitle>
        <DialogDescription className="text-sm text-al-muted">
          {naoFit
            ? `${conta.nome} não encaixa no ICP: o cartão vai para Descartada e só sai de lá à mão. Diga o motivo.`
            : `${conta.nome} encaixa no ICP: o cartão vai para Fit, se ainda não passou de lá.`}
        </DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-1.5 text-xs text-al-muted">
        {naoFit ? 'Motivo' : 'Motivo (opcional)'}
        <textarea
          aria-label="Motivo da Aderência"
          value={motivo}
          maxLength={500}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          className="rounded-md border border-al-line bg-al-bg px-3 py-2 text-sm text-al-ink"
        />
      </label>
      {erro && (
        <p role="alert" className="text-sm text-al-atencao">
          {erro}
        </p>
      )}
      <DialogFooter className="mt-1 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={aoCancelar} className={BOTAO_SECUNDARIO}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!podeEnviar} className={BOTAO_PRIMARIO}>
          {agindo ? 'Aguarde...' : `Marcar ${ROTULO[aderencia]}`}
        </Button>
      </DialogFooter>
    </form>
  )
}
