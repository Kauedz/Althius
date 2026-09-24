import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CHAVE_DO_TEMA } from './estado'
import { MockupDeConfiguracoes } from './mockup'
import '@/index.css'

// Mockup descartável (ticket 01 de Configurações): abre em /mockups/configuracoes.html, fora do aplicativo.
// O tema escolhido fica guardado no navegador; ?tema=claro força o tema claro, para revisar e capturar as telas.
function lerTemaGuardado() {
  try {
    return localStorage.getItem(CHAVE_DO_TEMA)
  } catch {
    return null
  }
}
const temaInicial = (new URLSearchParams(location.search).get('tema') ?? lerTemaGuardado()) === 'claro' ? 'claro' : 'escuro'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MockupDeConfiguracoes temaInicial={temaInicial} />
  </StrictMode>,
)
