// O item 3 do checklist dentro da experiência de Sinais: abrir Sinais conclui o item e oferece a volta.
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useDados, useFonteDeOnboarding } from '@/fonte/contexto'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from './componentes'

/** Marca o item de Sinal quando a experiência de Sinais abre. Não cria Monitoramento. */
export function RegistrarAberturaDeSinais() {
  const fonte = useFonteDeOnboarding()
  useEffect(() => {
    void fonte.registrarVisitaASinais()
  }, [fonte])
  return null
}

/** Volta ao checklist ou à home depois de abrir Sinais a partir do item 3. */
export function RetornoDoChecklist() {
  const fonte = useFonteDeOnboarding()
  const estado = useDados(fonte, (f) => f.ler(), [])
  if (!estado?.retornoAoChecklist) return null

  return (
    <div
      role="region"
      aria-label="Retorno do checklist"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-al-line px-10 py-3"
    >
      <p className="text-sm">Você abriu Sinais. Isso conclui o item de Sinal, sem criar um Monitoramento.</p>
      <div className="flex flex-wrap gap-2">
        <Link to="/onboarding" className={BOTAO_SECUNDARIO} onClick={() => void fonte.dispensarRetorno()}>
          Voltar ao checklist
        </Link>
        <Link to="/" className={BOTAO_PRIMARIO} onClick={() => void fonte.dispensarRetorno()}>
          Ir para a home
        </Link>
      </div>
    </div>
  )
}
