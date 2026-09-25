import { Button } from '@/components/ui/button'
import { useFonte } from '@/fonte/contexto'
import { ROTULO_DA_DECISAO } from '@/fonte/regras'
import type { AprovacaoDeAcao, LugarDaDecisao } from '@/fonte/tipos'
import { cn } from '@/lib/utils'

/** Aprovar ou Recusar uma proposta; depois de decidida, mostra o resultado. */
export function DecisaoDeAprovacao({ aprovacao, onde }: { aprovacao: AprovacaoDeAcao; onde: LugarDaDecisao }) {
  const fonte = useFonte()

  if (aprovacao.estado !== 'pendente') {
    return (
      <span className={cn('rotulo', aprovacao.estado === 'aprovada' ? 'text-al-sucesso' : 'text-al-erro')}>
        {ROTULO_DA_DECISAO[aprovacao.estado]}
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
