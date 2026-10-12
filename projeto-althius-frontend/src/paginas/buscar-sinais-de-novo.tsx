import { RefreshCw } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useDadosDeContas, useFonteDeContas } from '@/fonte/contexto'
import { formatarDataDoModulo } from '@/fonte/formatar-data'

/** De quanto em quanto tempo a tela confere se a busca em andamento terminou. */
const INTERVALO_DA_CONFERENCIA_EM_MS = 8_000

const creditos = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'crédito' : 'créditos'}`

/**
 * "Buscar Sinais de novo" (sinais-reais, ticket 08): varre a Conta com todos os Monitoramentos ativos do Workspace, sob
 * pedido. O custo em créditos aparece antes de a pessoa clicar; o clique é a confirmação. Enquanto a busca está em
 * andamento a tela a confere de tempos em tempos e avisa quando ela termina, para os Sinais novos aparecerem.
 */
export function BuscarSinaisDeNovo({ contaId, aoTerminar }: { contaId: string; aoTerminar: () => void }) {
  const fonte = useFonteDeContas()
  const { dados: custo, recarregar } = useDadosDeContas((f) => f.custoDeBuscarSinais!(contaId), [contaId])
  const [pedindo, setPedindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const custoId = useId()
  const emAndamento = custo?.emAndamento ?? false

  useEffect(() => {
    if (!emAndamento) return
    const conferencia = setInterval(recarregar, INTERVALO_DA_CONFERENCIA_EM_MS)
    return () => clearInterval(conferencia)
  }, [emAndamento, recarregar])

  // Quando a busca termina, os Sinais da Conta podem ter mudado.
  const estavaEmAndamento = useRef(false)
  useEffect(() => {
    if (estavaEmAndamento.current && !emAndamento) aoTerminar()
    estavaEmAndamento.current = emAndamento
  }, [emAndamento, aoTerminar])

  if (!custo) return null

  const semMonitoramento = custo.monitoramentos === 0
  const semSaldo = !semMonitoramento && custo.saldo < custo.creditos
  const motivoDeEstarDesligado = semMonitoramento
    ? 'Nenhum Monitoramento ativo para buscar.'
    : semSaldo
    ? `Sem créditos suficientes: o saldo é ${custo.saldo.toLocaleString('pt-BR')}.`
    : null

  async function pedir() {
    setPedindo(true)
    setErro(null)
    try {
      await fonte.buscarSinaisDeNovo!(contaId)
      recarregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível pedir a busca.')
    } finally {
      setPedindo(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={pedindo || emAndamento || !!motivoDeEstarDesligado}
          onClick={pedir}
          aria-describedby={semMonitoramento ? undefined : custoId}
          className="h-8 border-al-line text-sm tracking-[0.04em] hover:bg-al-surface"
        >
          <RefreshCw strokeWidth={1.8} className="size-3.5" aria-hidden />
          Buscar Sinais de novo
        </Button>
        {!semMonitoramento && (
          <span id={custoId} className="text-xs text-al-muted">
            {creditos(custo.creditos)}
          </span>
        )}
        {emAndamento && (
          <span role="status" className="text-xs text-al-muted">
            Buscando Sinais…
          </span>
        )}
      </div>
      {motivoDeEstarDesligado && !emAndamento && <p className="text-xs text-al-muted">{motivoDeEstarDesligado}</p>}
      {semMonitoramento && (
        // A busca só usa os Monitoramentos com fornecedor; os internos (CRM-10) avaliam as Interações sozinhos.
        <p className="text-xs text-al-muted">
          Os Sinais internos não entram nesta busca: o Monitoramento interno avalia as Interações sozinho, todo dia.
        </p>
      )}
      {!emAndamento && custo.terminouEm && (
        <p className="text-xs text-al-muted">Última busca: {formatarDataDoModulo(custo.terminouEm, fonte.hoje())}</p>
      )}
      {!emAndamento && custo.motivo && <p className="text-xs text-al-muted">{custo.motivo}</p>}
      {erro && (
        <p role="alert" className="text-sm text-al-atencao">
          {erro}
        </p>
      )}
    </div>
  )
}
