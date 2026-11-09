// "Por que essa Aderência?": pede a explicação da Descoberta e mostra o texto. A nota não muda; quando o texto é da IA,
// a tela diz isso. Aparece no detalhe de cada candidata da Caixa de Descobertas. Quando a função devolve os critérios
// em grupos (contexto-da-empresa 05), atende, não atende, sem dado e a verificar aparecem separados, com o contexto
// (versão e trechos do Perfil de cliente ideal) que a busca usou.
import { Info } from 'lucide-react'
import { useState } from 'react'
import { BOTAO_DISCRETO } from '@/components/botoes'
import type { ExplicacaoDeAderencia } from '@/fonte/aderencia-explicada'
import type { CriteriosDaAderencia } from '@/fonte/aderencia-pelos-criterios'

const GRUPOS: { chave: keyof CriteriosDaAderencia; rotulo: string }[] = [
  { chave: 'atendidos', rotulo: 'Atende' },
  { chave: 'naoAtendidos', rotulo: 'Não atende' },
  { chave: 'semDado', rotulo: 'Sem dado' },
  { chave: 'aVerificar', rotulo: 'A verificar' },
]

function GruposDeCriterios({ criterios }: { criterios: CriteriosDaAderencia }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      {GRUPOS.filter((g) => criterios[g.chave].length > 0).map((g) => (
        <div key={g.chave}>
          <span className="font-medium text-al-ink">{g.rotulo}</span>
          <ul aria-label={g.rotulo} className="list-disc pl-4 text-al-muted">
            {criterios[g.chave].map((texto) => <li key={texto}>{texto}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}

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
          {estado.resultado.criterios && <GruposDeCriterios criterios={estado.resultado.criterios} />}
          {estado.resultado.contexto && (
            <p className="text-xs text-al-muted">
              Avaliada contra a versão {estado.resultado.contexto.versao} do Perfil de cliente ideal
              {estado.resultado.contexto.perfis.length > 0 && ` (${estado.resultado.contexto.perfis.join(', ')})`}
              {estado.resultado.contexto.trechos.length > 0 && `: ${estado.resultado.contexto.trechos.map((t) => `“${t}”`).join(', ')}`}.
            </p>
          )}
          {estado.resultado.origem === 'ia' && <p className="text-xs text-al-muted">Escrita por IA; a nota não muda.</p>}
        </div>
      )}
      {estado.tipo === 'erro' && <p role="alert" className="text-xs text-al-muted">{estado.mensagem}</p>}
    </div>
  )
}
