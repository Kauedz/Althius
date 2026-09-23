import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { criarFonteDeContasSimulada } from '@/fonte/simulada-contas'
import { criarFonteSimulada } from '@/fonte/simulada'
import './index.css'

const fonte = criarFonteSimulada()
const fonteDeContas = criarFonteDeContasSimulada()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App fonte={fonte} fonteDeContas={fonteDeContas} />
  </StrictMode>,
)
