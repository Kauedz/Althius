import { Navigate, Outlet } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { useAmbiente, useCarregamento, useFonteDeOnboarding } from '@/fonte/contexto'
import { precisaDoOnboarding } from '@/fonte/regras-onboarding'

/** A Casca operacional aguarda o backend: falha ou carregamento não equivalem a Day0 concluído. */
export function EntradaNaCasca() {
  const fonte = useFonteDeOnboarding()
  const ambiente = useAmbiente()
  const { dados: estado, erro, recarregar } = useCarregamento(fonte, (f) => f.ler(), [])
  if (ambiente.modo === 'real' && ambiente.disponivel('onboarding')) {
    if (erro) return (
      <main className="p-6">
        <p role="alert">Não foi possível carregar seu primeiro acesso.</p>
        <button type="button" onClick={recarregar}>Tentar novamente</button>
      </main>
    )
    if (!estado) return <Carregando rotulo="Carregando primeiro acesso" />
  }
  if (estado && precisaDoOnboarding(estado)) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
