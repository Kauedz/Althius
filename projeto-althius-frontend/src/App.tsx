import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Casca } from '@/components/casca'
import { ConversasProvider } from '@/conversa/contexto'
import {
  FonteDeContasProvider,
  FonteDeOnboardingProvider,
  FonteDeSequenciasProvider,
  FonteDeSinaisProvider,
  FonteProvider,
} from '@/fonte/contexto'
import { criarFonteDeContasSimulada } from '@/fonte/simulada-contas'
import { criarFonteDeOnboardingSimulada } from '@/fonte/simulada-onboarding'
import { criarFonteDeSequenciasSimulada } from '@/fonte/simulada-sequencias'
import { criarFonteDeSinaisSimulada } from '@/fonte/simulada-sinais'
import type {
  FonteDeAgentes,
  FonteDeContas,
  FonteDeOnboarding,
  FonteDeSequencias,
  FonteDeSinais,
} from '@/fonte/tipos'
import { PaginaAgente } from '@/paginas/agente'
import { PaginaAgentes } from '@/paginas/agentes'
import { PaginaAprovacoes } from '@/paginas/aprovacoes'
import { PaginaConexoes } from '@/paginas/conexoes'
import { PaginaConfiguracoes } from '@/paginas/configuracoes/pagina-configuracoes'
import { PaginaContas } from '@/paginas/contas'
import { PaginaConversaCoordenada } from '@/paginas/conversa-coordenada'
import { PaginaOnboarding, RegistrarAberturaDeSinais, RetornoDoChecklist } from '@/paginas/onboarding'
import { PaginaSequencias } from '@/paginas/sequencias'
import { SinaisDoMockupProvider } from '@/paginas/sinais/estado'
import { ContaComSinais, LayoutSinais, PaginaDoTipo, PaginaSinais, RotaDoEditor } from '@/paginas/sinais/rotas'

interface Props {
  fonte: FonteDeAgentes
  fonteDeContas?: FonteDeContas
  fonteDeSequencias?: FonteDeSequencias
  fonteDeOnboarding?: FonteDeOnboarding
  fonteDeSinais?: FonteDeSinais
  /** Usado nos testes: roteia em memória a partir desta rota. */
  rotaInicial?: string
  animarDigitacao?: boolean
}

export function App({
  fonte,
  fonteDeContas = criarFonteDeContasSimulada(),
  fonteDeSequencias = criarFonteDeSequenciasSimulada(),
  fonteDeOnboarding = criarFonteDeOnboardingSimulada(),
  fonteDeSinais = criarFonteDeSinaisSimulada(),
  rotaInicial,
  animarDigitacao = true,
}: Props) {
  if (
    'vincularFonteDeSequencias' in fonteDeContas &&
    typeof (fonteDeContas as { vincularFonteDeSequencias?: (f: FonteDeSequencias) => void })
      .vincularFonteDeSequencias === 'function'
  ) {
    (
      fonteDeContas as { vincularFonteDeSequencias: (f: FonteDeSequencias) => void }
    ).vincularFonteDeSequencias(fonteDeSequencias)
  }

  if (
    'vincularFonteDeContas' in fonteDeSinais &&
    typeof (fonteDeSinais as { vincularFonteDeContas?: (f: FonteDeContas) => void })
      .vincularFonteDeContas === 'function'
  ) {
    (fonteDeSinais as { vincularFonteDeContas: (f: FonteDeContas) => void }).vincularFonteDeContas(
      fonteDeContas,
    )
  }

  const rotas = (
    <Routes>
      <Route path="onboarding" element={<PaginaOnboarding />} />
      <Route element={<Casca />}>
        <Route index element={<PaginaAgentes />} />
        <Route path="contas" element={<PaginaContas />} />
        <Route path="contas/:contaId" element={<PaginaContas />} />
        <Route path="sequencias" element={<PaginaSequencias />} />
        <Route path="sequencias/:sequenciaId" element={<PaginaSequencias />} />
        <Route path="sinais" element={<SinaisNaCasca />}>
          <Route index element={<PaginaSinais />} />
          <Route path="tipos/:tipoId" element={<PaginaDoTipo />} />
          <Route path="tipos/:tipoId/novo" element={<RotaDoEditor />} />
          <Route path="tipos/:tipoId/:monitoramentoId" element={<RotaDoEditor />} />
          <Route path="contas/:contaId" element={<ContaComSinais />} />
        </Route>
        <Route path="conversa" element={<PaginaConversaCoordenada />} />
        <Route path="aprovacoes" element={<PaginaAprovacoes />} />
        <Route path="conexoes" element={<PaginaConexoes />} />
        <Route path="configuracoes" element={<Navigate to="/configuracoes/perfil" replace />} />
        <Route path="configuracoes/:secao" element={<PaginaConfiguracoes />} />
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
          <FonteDeOnboardingProvider fonte={fonteDeOnboarding}>
            <FonteDeSinaisProvider fonte={fonteDeSinais}>
              <SinaisDoMockupProvider>
                <ConversasProvider animarDigitacao={animarDigitacao}>
                  {rotaInicial ? (
                    <MemoryRouter initialEntries={[rotaInicial]}>{rotas}</MemoryRouter>
                  ) : (
                    <BrowserRouter>{rotas}</BrowserRouter>
                  )}
                </ConversasProvider>
              </SinaisDoMockupProvider>
            </FonteDeSinaisProvider>
          </FonteDeOnboardingProvider>
        </FonteDeSequenciasProvider>
      </FonteDeContasProvider>
    </FonteProvider>
  )
}

function SinaisNaCasca() {
  return (
    <>
      <RetornoDoChecklist />
      <RegistrarAberturaDeSinais />
      <LayoutSinais />
    </>
  )
}
