import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Casca } from '@/components/casca'
import { ConversasProvider } from '@/conversa/contexto'
import { FonteDeContasProvider, FonteProvider } from '@/fonte/contexto'
import { criarFonteDeContasSimulada } from '@/fonte/simulada-contas'
import type { FonteDeAgentes, FonteDeContas } from '@/fonte/tipos'
import { PaginaAgente } from '@/paginas/agente'
import { PaginaAgentes } from '@/paginas/agentes'
import { PaginaAprovacoes } from '@/paginas/aprovacoes'
import { PaginaConexoes } from '@/paginas/conexoes'
import { PaginaContas } from '@/paginas/contas'
import { PaginaConversaCoordenada } from '@/paginas/conversa-coordenada'

interface Props {
  fonte: FonteDeAgentes
  fonteDeContas?: FonteDeContas
  /** Usado nos testes: roteia em memória a partir desta rota. */
  rotaInicial?: string
  animarDigitacao?: boolean
}

export function App({
  fonte,
  fonteDeContas = criarFonteDeContasSimulada(),
  rotaInicial,
  animarDigitacao = true,
}: Props) {
  const rotas = (
    <Routes>
      <Route element={<Casca />}>
        <Route index element={<PaginaAgentes />} />
        <Route path="contas" element={<PaginaContas />} />
        <Route path="conversa" element={<PaginaConversaCoordenada />} />
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
      <FonteDeContasProvider fonte={fonteDeContas}>
        <ConversasProvider animarDigitacao={animarDigitacao}>
          {rotaInicial ? (
            <MemoryRouter initialEntries={[rotaInicial]}>{rotas}</MemoryRouter>
          ) : (
            <BrowserRouter>{rotas}</BrowserRouter>
          )}
        </ConversasProvider>
      </FonteDeContasProvider>
    </FonteProvider>
  )
}
