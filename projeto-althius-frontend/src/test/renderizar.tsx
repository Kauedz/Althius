import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@/App'
import { criarFonteSimulada } from '@/fonte/simulada'

/** Renderiza o app inteiro sobre a fonte simulada, sem atrasos nem animação de digitação. */
export function renderizarApp(rota = '/') {
  const fonte = criarFonteSimulada({ atrasoMs: 0 })
  const usuario = userEvent.setup()
  const resultado = render(<App fonte={fonte} rotaInicial={rota} animarDigitacao={false} />)
  return { ...resultado, fonte, usuario }
}
