import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AplicativoAutenticado } from '@/auth/aplicativo'
import { App } from '@/App'
import { criarFonteDeContasSimulada } from '@/fonte/simulada-contas'
import { criarFonteDeOnboardingSimulada } from '@/fonte/simulada-onboarding'
import { criarFonteDeSequenciasSimulada } from '@/fonte/simulada-sequencias'
import { criarFonteDeSinaisSimulada } from '@/fonte/simulada-sinais'
import { clienteSupabase } from '@/supabase/cliente'
import { criarFonteSimulada } from '@/fonte/simulada'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RaizDoAplicativo />
  </StrictMode>,
)

function RaizDoAplicativo() {
  const [modoDemo, setModoDemo] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'true' || params.get('demo') === 'false') return false
    if (params.get('demo') === 'true') return true
    const salvo = localStorage.getItem('althius:modo_demo')
    if (salvo !== null) return salvo === 'true'
    // Modo padrão no protótipo: liberado
    return true
  })

  const ativarDemo = () => {
    localStorage.setItem('althius:modo_demo', 'true')
    setModoDemo(true)
  }

  const desativarDemo = () => {
    localStorage.setItem('althius:modo_demo', 'false')
    setModoDemo(false)
  }

  if (modoDemo || !clienteSupabase) {
    return (
      <AplicativoDeDemonstracao
        aoAlternarParaAutenticado={clienteSupabase ? desativarDemo : undefined}
      />
    )
  }

  return (
    <AplicativoAutenticado
      cliente={clienteSupabase}
      aoAcessarDemonstracao={ativarDemo}
    />
  )
}

function AplicativoDeDemonstracao({
  aoAlternarParaAutenticado,
}: {
  aoAlternarParaAutenticado?: () => void
}) {
  const fonte = useMemo(() => criarFonteSimulada({ armazenamento: window.localStorage }), [])
  const fonteDeContas = useMemo(() => criarFonteDeContasSimulada({ armazenamento: window.localStorage }), [])
  const fonteDeSequencias = useMemo(() => criarFonteDeSequenciasSimulada({ armazenamento: window.localStorage }), [])
  const fonteDeOnboarding = useMemo(() => criarFonteDeOnboardingSimulada({ armazenamento: window.localStorage }), [])
  const fonteDeSinais = useMemo(() => criarFonteDeSinaisSimulada({ fonteDeContas }), [fonteDeContas])

  return (
    <>
      {aoAlternarParaAutenticado && (
        <div className="flex items-center justify-between border-b border-al-line bg-al-surface/40 px-4 py-1.5 text-xs text-al-muted">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-al-ink">Modo Protótipo (Completo)</span>
            <span>· Navegação sem necessidade de e-mail</span>
          </div>
          <button
            type="button"
            onClick={aoAlternarParaAutenticado}
            className="cursor-pointer text-al-accent hover:underline"
          >
            Acessar tela de login Supabase
          </button>
        </div>
      )}
      <App
        fonte={fonte}
        fonteDeContas={fonteDeContas}
        fonteDeSequencias={fonteDeSequencias}
        fonteDeOnboarding={fonteDeOnboarding}
        fonteDeSinais={fonteDeSinais}
      />
    </>
  )
}
