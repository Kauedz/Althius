import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Casca } from '@/components/casca'
import { ConversasProvider } from '@/conversa/contexto'
import { FonteDeContasProvider, FonteDeSequenciasProvider, FonteProvider } from '@/fonte/contexto'
import { criarFonteDeContasSimulada } from '@/fonte/simulada-contas'
import { criarFonteDeSequenciasSimulada } from '@/fonte/simulada-sequencias'
import type { FonteDeAgentes, FonteDeContas, FonteDeSequencias } from '@/fonte/tipos'
import { PaginaAgente } from '@/paginas/agente'
import { PaginaAgentes } from '@/paginas/agentes'
import { PaginaAprovacoes } from '@/paginas/aprovacoes'
import { PaginaConexoes } from '@/paginas/conexoes'
import { PaginaContas } from '@/paginas/contas'
import { PaginaConversaCoordenada } from '@/paginas/conversa-coordenada'
import { PaginaSequencias } from '@/paginas/sequencias'

interface Props {
  fonte: FonteDeAgentes
  fonteDeContas?: FonteDeContas
  fonteDeSequencias?: FonteDeSequencias
  /** Usado nos testes: roteia em memória a partir desta rota. */
  rotaInicial?: string
  animarDigitacao?: boolean
}

export function App({
  fonte,
  fonteDeContas = criarFonteDeContasSimulada(),
  fonteDeSequencias = criarFonteDeSequenciasSimulada(),
  rotaInicial,
  animarDigitacao = true,
}: Props) {
  const rotas = (
    <Routes>
      <Route element={<Casca />}>
        <Route index element={<PaginaAgentes />} />
        <Route path="contas" element={<PaginaContas />} />
        <Route path="sequencias" element={<PaginaSequencias />} />
        <Route path="sequencias/:sequenciaId" element={<PaginaSequencias />} />
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
        <FonteDeSequenciasProvider fonte={fonteDeSequencias}>
          <ConversasProvider animarDigitacao={animarDigitacao}>
            {rotaInicial ? (
              <MemoryRouter initialEntries={[rotaInicial]}>{rotas}</MemoryRouter>
            ) : (
              <BrowserRouter>{rotas}</BrowserRouter>
            )}
          </ConversasProvider>
        </FonteDeSequenciasProvider>
      </FonteDeContasProvider>
    </FonteProvider>
  )
}
