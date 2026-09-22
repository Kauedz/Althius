import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { criarFonteSimulada } from '@/fonte/simulada'
import './index.css'

const fonte = criarFonteSimulada()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App fonte={fonte} />
  </StrictMode>,
)
