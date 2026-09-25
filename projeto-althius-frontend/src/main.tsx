import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { criarFonteDeContasSimulada } from '@/fonte/simulada-contas'
import { criarFonteDeOnboardingSimulada } from '@/fonte/simulada-onboarding'
import { criarFonteDeSequenciasSimulada } from '@/fonte/simulada-sequencias'
import { criarFonteSimulada } from '@/fonte/simulada'
import './index.css'

const fonte = criarFonteSimulada({ armazenamento: window.localStorage })
const fonteDeContas = criarFonteDeContasSimulada({ armazenamento: window.localStorage })
const fonteDeSequencias = criarFonteDeSequenciasSimulada({ armazenamento: window.localStorage })
const fonteDeOnboarding = criarFonteDeOnboardingSimulada({ armazenamento: window.localStorage })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      fonte={fonte}
      fonteDeContas={fonteDeContas}
      fonteDeSequencias={fonteDeSequencias}
      fonteDeOnboarding={fonteDeOnboarding}
    />
  </StrictMode>,
)

