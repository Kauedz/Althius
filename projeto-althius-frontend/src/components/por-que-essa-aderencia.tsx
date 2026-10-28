// "Por que essa Aderência?": pede a explicação da Descoberta e mostra o texto. A nota não muda; quando o texto é da IA,
// a tela diz isso. Aparece no detalhe de cada candidata da Caixa de Descobertas.
import { Info } from 'lucide-react'
import { useState } from 'react'
import { BOTAO_DISCRETO } from '@/components/botoes'
import type { ExplicacaoDeAderencia } from '@/fonte/aderencia-explicada'

export function PorQueEssaAderencia({ explicar }: { explicar: () => Promise<ExplicacaoDeAderencia> }) {
  const [estado, setEstado] = useState<
    { tipo: 'fechado' } | { tipo: 'carregando' } | { tipo: 'pronto'; resultado: ExplicacaoDeAderencia } | { tipo: 'erro'; mensagem: string }
  >({ tipo: 'fechado' })

  async function abrir() {
    setEstado({ tipo: 'carregando' })
    try {
      setEstado({ tipo: 'pronto', resultado: await explicar() })
    } catch (erro) {
      setEstado({ tipo: 'erro', mensagem: erro instanceof Error ? erro.message : 'Não deu para explicar a Aderência agora. Tente de novo.' })
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {estado.tipo !== 'pronto' && (
        <button type="button" className={BOTAO_DISCRETO} onClick={abrir} disabled={estado.tipo === 'carregando'}>
          <Info strokeWidth={1.8} className="size-3.5" aria-hidden />
          {estado.tipo === 'carregando' ? 'Explicando…' : 'Por que essa Aderência?'}
        </button>
      )}
      {estado.tipo === 'pronto' && (
        <div role="status" className="flex flex-col gap-1">
          <p className="text-sm text-al-ink">{estado.resultado.explicacao}</p>
          {estado.resultado.origem === 'ia' && <p className="text-xs text-al-muted">Escrita por IA; a nota não muda.</p>}
        </div>
      )}
      {estado.tipo === 'erro' && <p role="alert" className="text-xs text-al-muted">{estado.mensagem}</p>}
    </div>
  )
}
