import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Casca } from '@/components/casca'
import { ConversasProvider } from '@/conversa/contexto'
import { FonteProvider } from '@/fonte/contexto'
import type { FonteDeAgentes } from '@/fonte/tipos'
import { PaginaAgente } from '@/paginas/agente'
import { PaginaAprovacoes } from '@/paginas/aprovacoes'
import { PaginaConexoes } from '@/paginas/conexoes'
import { PaginaInicial } from '@/paginas/inicial'

interface Props {
  fonte: FonteDeAgentes
  /** Usado nos testes: roteia em memória a partir desta rota. */
  rotaInicial?: string
  animarDigitacao?: boolean
}

export function App({ fonte, rotaInicial, animarDigitacao = true }: Props) {
  const rotas = (
    <Routes>
      <Route element={<Casca />}>
        <Route index element={<PaginaInicial />} />
        <Route path="aprovacoes" element={<PaginaAprovacoes />} />
        <Route path="conexoes" element={<PaginaConexoes />} />
        <Route path="agentes/:agenteId" element={<Navigate to="conversa" replace />} />
        <Route path="agentes/:agenteId/:secao" element={<PaginaAgente />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )

  return (
    <FonteProvider fonte={fonte}>
      <ConversasProvider animarDigitacao={animarDigitacao}>
        {rotaInicial ? (
          <MemoryRouter initialEntries={[rotaInicial]}>{rotas}</MemoryRouter>
        ) : (
          <BrowserRouter>{rotas}</BrowserRouter>
        )}
      </ConversasProvider>
    </FonteProvider>
  )
}
