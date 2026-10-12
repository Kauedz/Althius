import {
  Bot,
  Building2,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  ListChecks,
  Plug,
  RadioTower,
  Route,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { AvatarDePessoa, IconeDaEspecialidade, IndicadorDeEstado, ROTULO_DO_ESTADO } from '@/components/marca'
import { LogoDoWorkspace } from '@/components/logos'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAmbiente, useDados, useFonteDeOnboarding } from '@/fonte/contexto'
import { identidadeDoWorkspace, progressoDoOnboarding } from '@/fonte/regras-onboarding'
import { ROTULO_DO_PAPEL } from '@/fonte/regras'
import { cn } from '@/lib/utils'
import { useTemaDaConta } from '@/tema-da-conta'

// A barra lateral recolhida (só o símbolo e os ícones) fica guardada no navegador.
const CHAVE_DA_BARRA = 'althius:sidebar-recolhida'
const BarraRecolhida = createContext(false)

function lerBarraRecolhida() {
  try {
    return localStorage.getItem(CHAVE_DA_BARRA) === 'true'
  } catch {
    return false
  }
}

export function Casca() {
  const [recolhida, setRecolhida] = useState(lerBarraRecolhida)
  const alternarBarra = () =>
    setRecolhida((atual) => {
      const nova = !atual
      try {
        localStorage.setItem(CHAVE_DA_BARRA, String(nova))
      } catch {
        // Sem armazenamento, a escolha vale só até recarregar.
      }
      return nova
    })
  return (
    <div
      className={cn(
        'grid min-h-screen transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none',
        recolhida ? 'grid-cols-[4.25rem_1fr]' : 'grid-cols-[15.5rem_1fr]',
      )}
    >
      <BarraRecolhida.Provider value={recolhida}>
        <Sidebar alternarBarra={alternarBarra} />
      </BarraRecolhida.Provider>
      <main className="flex min-w-0 flex-col">
        <Outlet />
      </main>
    </div>
  )
}

/** O logo do site (osso e rosa): a barra é sempre escura. Recolhida, fica só o símbolo. */
function LogoDaBarra({ recolhida }: { recolhida: boolean }) {
  return recolhida ? (
    <img src="/marca/althius-symbol-osso-rosa.png" alt="Althius" className="h-5 w-auto" />
  ) : (
    <img src="/marca/althius-logo-osso-rosa.png" alt="Althius" className="h-5 w-auto" />
  )
}

function Sidebar({ alternarBarra }: { alternarBarra: () => void }) {
  const recolhida = useContext(BarraRecolhida)
  const { modo } = useAmbiente()
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const fonteDeOnboarding = useFonteDeOnboarding()
  const onboarding = useDados(fonteDeOnboarding, (fonte) => fonte.ler(), [])
  const progresso = onboarding && progressoDoOnboarding(onboarding)
  // O Workspace criado no onboarding se apresenta pelo que a pessoa informou; sem ele, vale o da demonstração.
  const doOnboarding = onboarding ? identidadeDoWorkspace(onboarding) : null
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const agentesPadrao = agentes?.filter((agente) => agente.tipo === 'padrao')
  const cliente = doOnboarding?.nome || workspace?.cliente
  const descricao = doOnboarding?.descricao || workspace?.descricao
  const { pathname } = useLocation()
  // A aba de Agentes inclui a página de cada Agente e a Conversa coordenada.
  const naAbaDeAgentes = pathname === '/' || pathname.startsWith('/agentes/') || pathname.startsWith('/conversa')
  const naAbaDeContas = pathname === '/contas' || pathname.startsWith('/contas/') || pathname.startsWith('/contatos')
  const naAbaDeSequencias = pathname === '/sequencias' || pathname.startsWith('/sequencias/')
  const naAbaDeSinais = pathname === '/sinais' || pathname.startsWith('/sinais/')
  const pendentes = workspace?.aprovacoesPendentes ?? 0

  return (
    <aside
      aria-label="Navegação"
      data-recolhida={recolhida || undefined}
      className={cn(
        'al-zona-escura sticky top-0 flex h-screen flex-col gap-6 overflow-x-hidden overflow-y-auto border-r border-al-divisor py-5',
        recolhida ? 'px-2.5' : 'px-4',
      )}
    >
      <div className="flex flex-col gap-4">
        <div className={cn('flex h-8 items-center', recolhida ? 'flex-col justify-center gap-3 h-auto' : 'justify-between pl-2')}>
          <LogoDaBarra recolhida={recolhida} />
          <button
            type="button"
            onClick={alternarBarra}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
            title={recolhida ? 'Expandir menu' : 'Recolher menu'}
            className="grid size-8 place-items-center rounded-md text-al-muted transition-colors duration-200 hover:bg-al-hover hover:text-al-ink"
          >
            {recolhida ? (
              <PanelLeftOpen strokeWidth={1.8} className="size-4" aria-hidden />
            ) : (
              <PanelLeftClose strokeWidth={1.8} className="size-4" aria-hidden />
            )}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <SeletorDeWorkspace cliente={cliente} descricao={descricao} logo={doOnboarding?.logo ?? null} />
          {/* A Demonstração se identifica pelo selo (ADR 0003); o Workspace operacional, pelo seu. */}
          <span className={cn('selo self-start', recolhida && 'sr-only')}>{modo === 'demonstracao' ? 'Demonstração' : 'Operacional'}</span>
        </div>
      </div>

      {progresso?.pendente && <AtalhoDoOnboarding percentual={progresso.percentual} />}

      {/* Um Workspace sem Agentes guardados não mostra o grupo vazio. */}
      {agentesPadrao?.length !== 0 && (
        <Secao titulo="Especialistas">
          {agentesPadrao?.map((agente) => (
            <ItemDeNavegacao
              key={agente.id}
              para={`/agentes/${agente.id}`}
              ativo={pathname.startsWith(`/agentes/${agente.id}/`)}
              icone={<IconeDaEspecialidade especialidade={agente.especialidade.id} />}
              fim={
                <span title={ROTULO_DO_ESTADO[agente.estado]}>
                  <IndicadorDeEstado estado={agente.estado} />
                </span>
              }
            >
              {agente.nome}
            </ItemDeNavegacao>
          ))}
        </Secao>
      )}

      <Secao titulo="Workspace">
        <ItemDeNavegacao para="/contas" ativo={naAbaDeContas} icone={<IconeDeNavegacao icone={Building2} />}>
          Contas e Contatos
        </ItemDeNavegacao>
        <ItemDeNavegacao para="/sequencias" ativo={naAbaDeSequencias} icone={<IconeDeNavegacao icone={Route} />}>
          Sequências
        </ItemDeNavegacao>
        <ItemDeNavegacao para="/" ativo={naAbaDeAgentes} icone={<IconeDeNavegacao icone={Bot} />}>
          Agentes
        </ItemDeNavegacao>
        <ItemDeNavegacao para="/sinais" ativo={naAbaDeSinais} icone={<IconeDeNavegacao icone={RadioTower} />}>
          Sinais
        </ItemDeNavegacao>
        <ItemDeNavegacao
          para="/aprovacoes"
          ativo={pathname.startsWith('/aprovacoes')}
          icone={<IconeDeNavegacao icone={ShieldCheck} />}
          rotulo={pendentes > 0 ? `Aprovações, ${pendentes} ${pendentes === 1 ? 'pendente' : 'pendentes'}` : undefined}
          fim={
            pendentes > 0 && (
              <span className="grid h-4.5 min-w-5 place-items-center rounded-full bg-al-accent px-1.5 text-xs font-medium text-al-on-accent tabular-nums">
                {pendentes}
              </span>
            )
          }
        >
          Aprovações
        </ItemDeNavegacao>
        <ItemDeNavegacao para="/conexoes" ativo={pathname.startsWith('/conexoes')} icone={<IconeDeNavegacao icone={Plug} />}>
          Conexões
        </ItemDeNavegacao>
        <ItemDeNavegacao
          para="/configuracoes/perfil"
          ativo={pathname.startsWith('/configuracoes')}
          icone={<IconeDeNavegacao icone={Settings} />}
        >
          Configurações
        </ItemDeNavegacao>
      </Secao>

      <MenuDoUsuario />
    </aside>
  )
}

/** Enquanto o onboarding não está 100% completo, a Casca leva de volta ao checklist, mesmo depois de concluído. */
function AtalhoDoOnboarding({ percentual }: { percentual: number }) {
  return (
    <Secao titulo="Primeiros passos">
      <ItemDeNavegacao
        para="/onboarding"
        ativo={false}
        icone={<IconeDeNavegacao icone={ListChecks} />}
        rotulo={`Onboarding, ${percentual}% completo`}
        fim={<span className="text-xs tabular-nums">{percentual}%</span>}
      >
        Onboarding
      </ItemDeNavegacao>
    </Secao>
  )
}

function SeletorDeWorkspace({
  cliente,
  descricao,
  logo,
}: {
  cliente?: string
  descricao?: string
  logo: string | null
}) {
  const recolhida = useContext(BarraRecolhida)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Workspace: ${cliente ?? ''}`}
            title={recolhida ? `Workspace: ${cliente ?? ''}` : undefined}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-xl border border-al-line bg-al-surface text-left transition-colors duration-200 hover:border-al-line-forte hover:bg-al-hover',
              recolhida ? 'h-11 justify-center p-1' : 'h-12 px-2.5',
            )}
          />
        }
      >
        <LogoDoWorkspace nome={cliente ?? ''} endereco={logo} />
        <span className={cn('flex min-w-0 flex-1 flex-col leading-tight', recolhida && 'sr-only')}>
          <span className="rotulo text-[0.6875rem]">Workspace</span>
          <span className="truncate font-normal">{cliente}</span>
        </span>
        {!recolhida && <ChevronsUpDown strokeWidth={1.8} className="size-4 text-al-muted" aria-hidden />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block font-normal text-al-ink">{cliente}</span>
            <span className="block text-al-muted">{descricao}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuDoUsuario() {
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const { tema, alternar, salvamento } = useTemaDaConta()
  const nome = workspace?.usuario.nome ?? ''
  const recolhida = useContext(BarraRecolhida)
  const rotuloDoTema =
    salvamento.estado === 'salvando'
      ? 'Salvando o tema…'
      : salvamento.estado === 'falhou'
        ? 'Tema não salvo'
        : tema === 'escuro'
          ? 'Tema escuro'
          : 'Tema claro'

  return (
    <div className={cn('mt-auto flex items-center gap-2.5 border-t border-al-line pt-4', recolhida && 'flex-col gap-2')}>
      <AvatarDePessoa nome={nome} foto={workspace?.usuario.foto} />
      <span className={cn('flex min-w-0 flex-1 flex-col leading-tight', recolhida && 'sr-only')}>
        <span className="truncate text-sm font-normal">{nome}</span>
        <span className="rotulo text-[0.6875rem]">{rotuloDoTema}</span>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Menu do usuário: ${nome}`} />}>
          <ChevronsUpDown strokeWidth={1.8} className="text-al-muted" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <span className="block font-normal text-al-ink">{nome}</span>
              <span className="block text-al-muted">{workspace?.usuario.cargo}</span>
              {workspace?.papel && (
                <span className="block text-al-muted">{ROTULO_DO_PAPEL[workspace.papel]} neste Workspace</span>
              )}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/configuracoes/perfil" />}>Meu perfil</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void alternar()} disabled={salvamento.estado === 'salvando'}>
            {tema === 'escuro' ? 'Tema claro' : 'Tema escuro'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  const recolhida = useContext(BarraRecolhida)
  return (
    <nav aria-label={titulo} className="flex flex-col gap-0.5">
      <span className={cn('rotulo px-2 pb-1 text-[0.6875rem]', recolhida && 'sr-only')} aria-hidden>
        {titulo}
      </span>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </nav>
  )
}

function IconeDeNavegacao({ icone: Icone }: { icone: LucideIcon }) {
  return <Icone strokeWidth={1.8} className="size-4 shrink-0" aria-hidden />
}

function ItemDeNavegacao({
  para,
  ativo,
  icone,
  fim,
  rotulo,
  children,
}: {
  para: string
  ativo: boolean
  icone: ReactNode
  fim?: ReactNode
  /** Nome acessível, quando o texto visível não basta (ex.: o número de pendentes). */
  rotulo?: string
  children: ReactNode
}) {
  const recolhida = useContext(BarraRecolhida)
  return (
    <li>
      <Link
        to={para}
        aria-label={rotulo}
        aria-current={ativo ? 'page' : undefined}
        title={recolhida ? (rotulo ?? (typeof children === 'string' ? children : undefined)) : undefined}
        className={cn(
          'relative flex h-9 items-center gap-2.5 rounded-lg border-l-2 px-2.5 text-sm font-normal',
          recolhida && 'justify-center px-0',
          ativo
            ? 'border-al-accent bg-al-hover text-al-ink'
            : 'border-transparent text-al-muted transition-colors duration-200 hover:bg-al-hover hover:text-al-ink',
        )}
      >
        {icone}
        <span className={cn('truncate', recolhida && 'sr-only')}>{children}</span>
        {fim && (
          <span className={cn('ml-auto flex items-center', recolhida && 'absolute top-1 right-1 scale-75')}>{fim}</span>
        )}
      </Link>
    </li>
  )
}
