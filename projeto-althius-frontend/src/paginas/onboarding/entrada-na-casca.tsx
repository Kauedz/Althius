import { Navigate, Outlet } from 'react-router-dom'
import { useDados, useFonteDeOnboarding } from '@/fonte/contexto'
import { precisaDoOnboarding } from '@/fonte/regras-onboarding'

/**
 * A entrada na Casca. Só o estado da Fonte de onboarding decide: sem o Day0 feito, a sessão vai para
 * `/onboarding`; com ele, entra normalmente, sem o onboarding ser forçado de novo. Enquanto a Fonte responde, a
 * Casca abre como sempre, carregando os próprios dados.
 */
export function EntradaNaCasca() {
  const fonte = useFonteDeOnboarding()
  const estado = useDados(fonte, (f) => f.ler(), [])
  if (estado && precisaDoOnboarding(estado)) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
