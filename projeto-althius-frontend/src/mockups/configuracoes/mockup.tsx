import { Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { HashRouter, Link, MemoryRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Pagina } from '@/components/pagina'
import { cn } from '@/lib/utils'
import { CascaDoMockup } from './casca'
import { WORKSPACE } from './dados'
import { MockupProvider, type Tema } from './estado'
import { SecaoAjuda } from './secoes/ajuda'
import { PaginaDeAprovacoes } from './secoes/aprovacoes'
import { SecaoMemoria } from './secoes/memoria'
import { SecaoPerfil } from './secoes/perfil'
import { SecaoPessoas } from './secoes/pessoas'
import { SecaoPlano } from './secoes/plano'
import { SecaoPreferencias } from './secoes/preferencias'

interface Props {
  /** Usado nos testes: roteia em memória a partir desta rota. */
  rotaInicial?: string
  /** A espera simulada enquanto o Agente prepara uma proposta. */
  atrasoMs?: number
  temaInicial?: Tema
}

/**
 * Mockup navegável de Configurações (ticket 01), para aprovação visual.
 * Vive fora do aplicativo: tem entrada própria e não usa as fontes simuladas do App.
 */
export function MockupDeConfiguracoes({ rotaInicial, atrasoMs = 1400, temaInicial = 'escuro' }: Props) {
  const rotas = (
    <Routes>
      <Route element={<CascaDoMockup />}>
        <Route path="configuracoes" element={<LayoutDeConfiguracoes />}>
          <Route path="perfil" element={<SecaoPerfil />} />
          <Route path="preferencias" element={<SecaoPreferencias />} />
          <Route path="pessoas" element={<SecaoPessoas />} />
          <Route path="memoria/:documentoId" element={<SecaoMemoria />} />
          <Route path="plano" element={<SecaoPlano />} />
          <Route path="ajuda/:paginaId" element={<SecaoAjuda />} />
        </Route>
        <Route path="aprovacoes" element={<PaginaDeAprovacoes />} />
        <Route path="*" element={<Navigate to="/configuracoes/perfil" replace />} />
      </Route>
    </Routes>
  )

  return (
    <MockupProvider atrasoMs={atrasoMs} temaInicial={temaInicial}>
      {rotaInicial ? <MemoryRouter initialEntries={[rotaInicial]}>{rotas}</MemoryRouter> : <HashRouter>{rotas}</HashRouter>}
    </MockupProvider>
  )
}

function LayoutDeConfiguracoes() {
  return (
    <Pagina titulo="Configurações" icone={Settings}>
      <div className="grid grid-cols-[13rem_1fr] gap-12">
        <div className="sticky top-22 flex flex-col gap-6 self-start">
          <Grupo titulo="Pessoal">
            <Item para="/configuracoes/perfil">Meu perfil</Item>
            <Item para="/configuracoes/preferencias">Preferências</Item>
          </Grupo>
          <Grupo titulo={`Workspace ${WORKSPACE.nome}`}>
            <Item para="/configuracoes/pessoas">Pessoas e acesso</Item>
            <Item para="/configuracoes/memoria/resumo" prefixo="/configuracoes/memoria">
              Memória do Workspace
            </Item>
            <Item para="/configuracoes/plano">Plano</Item>
          </Grupo>
          <Grupo titulo="Althius">
            <Item para="/configuracoes/ajuda/central" prefixo="/configuracoes/ajuda">
              Ajuda e informações
            </Item>
          </Grupo>
        </div>
        <div className="flex max-w-4xl min-w-0 flex-col gap-10">
          <Outlet />
        </div>
      </div>
    </Pagina>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <nav aria-label={titulo} className="flex flex-col gap-0.5">
      <span className="rotulo px-3 pb-1 text-[0.625rem]" aria-hidden>
        {titulo}
      </span>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </nav>
  )
}

function Item({ para, prefixo, children }: { para: string; prefixo?: string; children: ReactNode }) {
  const { pathname } = useLocation()
  const ativo = pathname.startsWith(prefixo ?? para)
  return (
    <li>
      <Link
        to={para}
        aria-current={ativo ? 'page' : undefined}
        className={cn(
          'flex h-8.5 items-center border-l-2 px-3 text-sm font-normal',
          ativo ? 'border-al-accent bg-al-surface text-al-ink' : 'border-transparent text-al-muted hover:bg-al-surface hover:text-al-ink',
        )}
      >
        {children}
      </Link>
    </li>
  )
}
