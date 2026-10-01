import { Button } from '@/components/ui/button'
import { useFonte } from '@/fonte/contexto'
import { rotuloDoEstadoDaAprovacao } from '@/fonte/regras'
import type { AprovacaoDeAcao, LugarDaDecisao } from '@/fonte/tipos'
import { cn } from '@/lib/utils'

/** Aprovar ou Recusar uma proposta; depois de decidida, mostra o resultado. */
export function DecisaoDeAprovacao({ aprovacao, onde }: { aprovacao: AprovacaoDeAcao; onde: LugarDaDecisao }) {
  const fonte = useFonte()

  if (aprovacao.estado !== 'pendente') {
    return (
      <span
        className={cn(
          'rotulo',
          aprovacao.estado === 'aprovada' && aprovacao.execucao !== 'falhou' ? 'text-al-sucesso' : 'text-al-erro',
        )}
        title={aprovacao.falha}
      >
        {rotuloDoEstadoDaAprovacao(aprovacao)}
      </span>
    )
  }
  return (
    <div className="flex gap-2">
      <Button onClick={() => fonte.decidirAprovacao(aprovacao.id, 'aprovada', onde)} className="px-6 tracking-rotulo uppercase">
        Aprovar
      </Button>
      <Button
        variant="outline"
        onClick={() => fonte.decidirAprovacao(aprovacao.id, 'rejeitada', onde)}
        className="px-6 tracking-rotulo uppercase"
      >
        Recusar
      </Button>
    </div>
  )
}
