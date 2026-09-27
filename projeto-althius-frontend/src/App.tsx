import { Bot, Building2, MessageSquare, Plug, RadioTower, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AvisosDoNavegador } from '@/components/avisos-do-navegador'
import { Casca } from '@/components/casca'
import { PaginaDeModuloIndisponivel } from '@/components/modulo-indisponivel'
import { ConversasProvider } from '@/conversa/contexto'
import type { Ambiente, ModuloDoWorkspace } from '@/fonte/ambiente'
import {
  AmbienteProvider,
  useAmbiente,
  FonteDeContasProvider,
  FonteDeOnboardingProvider,
  FonteDeSequenciasProvider,
  FonteDeContasRemetentesProvider,
  FonteDeSinaisProvider,
  FonteDeConexoesProvider,
  FonteProvider,
} from '@/fonte/contexto'
import { PaginaAgente } from '@/paginas/agente'
import { PaginaAgentes } from '@/paginas/agentes'
import { PaginaAprovacoes } from '@/paginas/aprovacoes'
import { PaginaConexoes } from '@/paginas/conexoes'
import { PaginaConfiguracoes } from '@/paginas/configuracoes/pagina-configuracoes'
import { PaginaContas } from '@/paginas/contas'
import { PaginaContatos } from '@/paginas/contatos'
import { PaginaConversaCoordenada } from '@/paginas/conversa-coordenada'
import { EntradaNaCasca } from '@/paginas/onboarding/entrada-na-casca'
import { PaginaOnboarding } from '@/paginas/onboarding/pagina-onboarding'
import { RegistrarAberturaDeSinais, RetornoDoChecklist } from '@/paginas/onboarding/retorno-de-sinais'
import { PaginaSequencias } from '@/paginas/sequencias'
import { SinaisDoMockupProvider } from '@/paginas/sinais/estado'
import { ContextoDasPosicoesDasListas, criarPosicoesDasListas } from '@/paginas/voltar-para-a-lista'
import { ContaComSinais, LayoutSinais, PaginaDoTipo, PaginaSinais, RotaDoEditor } from '@/paginas/sinais/rotas'

interface Props {
  /** As fontes do ambiente, escolhidas no ponto de composição pela sessão e pelo Workspace. */
  ambiente: Ambiente
  /** Usado nos testes: roteia em memória a partir desta rota. */
  rotaInicial?: string
  animarDigitacao?: boolean
}

export function App({ ambiente, rotaInicial, animarDigitacao = true }: Props) {
  const [posicoesDasListas] = useState(criarPosicoesDasListas)
  const rotas = (
    <Routes>
      <Route path="onboarding" element={<TelaDoModulo modulo="onboarding" quandoIndisponivel={<Navigate to="/" replace />}><PaginaOnboarding /></TelaDoModulo>} />
      <Route element={<EntradaNaCasca />}>
        <Route element={<Casca />}>
          <Route index element={<TelaDoModulo modulo="agentes" titulo="Agentes" icone={Bot}><PaginaAgentes /></TelaDoModulo>} />
          <Route path="contas" element={<TelaDoModulo modulo="contas" titulo="Contas" icone={Building2}><PaginaContas /></TelaDoModulo>} />
          <Route path="contas/:contaId" element={<TelaDoModulo modulo="contas" titulo="Contas" icone={Building2}><PaginaContas /></TelaDoModulo>} />
          <Route path="contatos" element={<TelaDoModulo modulo="contatos" titulo="Contatos" icone={Building2}><PaginaContatos /></TelaDoModulo>} />
          <Route path="sequencias" element={<PaginaSequencias />} />
          <Route path="sequencias/:sequenciaId" element={<PaginaSequencias />} />
          <Route path="sinais" element={<TelaDoModulo modulo="sinais" titulo="Sinais" icone={RadioTower}><SinaisNaCasca /></TelaDoModulo>}>
            <Route index element={<PaginaSinais />} />
            <Route path="tipos/:tipoId" element={<PaginaDoTipo />} />
            <Route path="tipos/:tipoId/novo" element={<RotaDoEditor />} />
            <Route path="tipos/:tipoId/:monitoramentoId" element={<RotaDoEditor />} />
            <Route path="contas/:contaId" element={<ContaComSinais />} />
          </Route>
          <Route path="conversa" element={<TelaDoModulo modulo="agentes" titulo="Conversa" icone={MessageSquare}><PaginaConversaCoordenada /></TelaDoModulo>} />
          <Route path="aprovacoes" element={<TelaDoModulo modulo="aprovacoes" titulo="Aprovações" icone={ShieldCheck}><PaginaAprovacoes /></TelaDoModulo>} />
          <Route path="conexoes" element={<TelaDoModulo modulo="conexoes" titulo="Conexões" icone={Plug}><PaginaConexoes /></TelaDoModulo>} />
          <Route path="configuracoes" element={<Navigate to="/configuracoes/perfil" replace />} />
          <Route path="configuracoes/:secao" element={<PaginaConfiguracoes />} />
          <Route path="configuracoes/:secao/:pagina" element={<PaginaConfiguracoes />} />
          <Route path="agentes/:agenteId" element={<Navigate to="conversa" replace />} />
          <Route path="agentes/:agenteId/:secao" element={<TelaDoModulo modulo="agentes" titulo="Agentes" icone={Bot}><PaginaAgente /></TelaDoModulo>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )

  return (
    <AmbienteProvider ambiente={ambiente}>
      <FonteProvider fonte={ambiente.fonte}>
        <FonteDeContasProvider fonte={ambiente.fonteDeContas}>
          <FonteDeSequenciasProvider fonte={ambiente.fonteDeSequencias}>
            <FonteDeOnboardingProvider fonte={ambiente.fonteDeOnboarding}>
              <FonteDeSinaisProvider fonte={ambiente.fonteDeSinais}>
                <FonteDeConexoesProvider fonte={ambiente.fonteDeConexoes}>
                  <FonteDeContasRemetentesProvider fonte={ambiente.fonteDeContasRemetentes}>
                    <SinaisDoMockupProvider>
                      <ConversasProvider animarDigitacao={animarDigitacao}>
                        <ContextoDasPosicoesDasListas.Provider value={posicoesDasListas}>
                          {rotaInicial ? (
                            <MemoryRouter initialEntries={[rotaInicial]}>
                              <AvisosDoNavegador />
                              {rotas}
                            </MemoryRouter>
                          ) : (
                            <BrowserRouter>
                              <AvisosDoNavegador />
                              {rotas}
                            </BrowserRouter>
                          )}
                        </ContextoDasPosicoesDasListas.Provider>
                      </ConversasProvider>
                    </SinaisDoMockupProvider>
                  </FonteDeContasRemetentesProvider>
                </FonteDeConexoesProvider>
              </FonteDeSinaisProvider>
            </FonteDeOnboardingProvider>
          </FonteDeSequenciasProvider>
        </FonteDeContasProvider>
      </FonteProvider>
    </AmbienteProvider>
  )
}

/**
 * A tela de um módulo, quando o ambiente tem backend para ele; senão, a página que diz que ele está indisponível, com
 * o título e o ícone da tela, ou `quandoIndisponivel`, numa tela sem a Casca.
 */
function TelaDoModulo({
  modulo,
  titulo = '',
  icone,
  quandoIndisponivel,
  children,
}: {
  modulo: ModuloDoWorkspace
  titulo?: string
  icone?: LucideIcon
  quandoIndisponivel?: ReactNode
  children: ReactNode
}) {
  const { disponivel } = useAmbiente()
  if (disponivel(modulo)) return children
  return quandoIndisponivel ?? <PaginaDeModuloIndisponivel modulo={modulo} titulo={titulo} icone={icone} />
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
