import {
  Bell,
  Bot,
  Building2,
  ChevronsUpDown,
  FlaskConical,
  Plug,
  RadioTower,
  Route,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { IconeDaEspecialidade, Logo } from '@/components/marca'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { Avatar } from './componentes'
import { ROTULO_DO_PAPEL, WORKSPACE } from './dados'
import { useMockup, type PermissaoDoNavegador } from './estado'

/** Réplica da casca do aplicativo: só Configurações e Aprovações respondem neste mockup. */
export function CascaDoMockup() {
  return (
    <div className="grid min-h-screen grid-cols-[15.5rem_1fr]">
      <Sidebar />
      {/* O espaço no fim deixa rolar o conteúdo para além do painel de controles do mockup. */}
      <main className="flex min-w-0 flex-col pb-60">
        <Outlet />
      </main>
      <PainelDoMockup />
      <AvisosDoNavegador />
    </div>
  )
}

function Sidebar() {
  const { pathname } = useLocation()
  const { propostas } = useMockup()
  const pendentes = propostas.filter((p) => p.estado === 'pendente').length

  return (
    <aside aria-label="Navegação" className="sticky top-0 flex h-screen flex-col gap-6 border-r border-al-line p-4">
      <div className="flex flex-col gap-4">
        <Logo />
        <div className="flex flex-col gap-2">
          <div className="flex h-11 items-center gap-2 border border-al-line bg-al-surface px-2">
            <span className="grid size-7 shrink-0 place-items-center bg-al-ink text-sm font-medium text-al-bg" aria-hidden>
              {WORKSPACE.nome[0]}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="rotulo text-[0.5625rem]">Workspace</span>
              <span className="truncate font-normal">{WORKSPACE.nome}</span>
            </span>
          </div>
          <span className="selo self-start">Demonstração</span>
        </div>
      </div>

      <Secao titulo="Especialistas">
        {(['scopus', 'ethos', 'rhetor', 'oraculum'] as const).map((id) => (
          <ItemForaDoMockup key={id} icone={<IconeDaEspecialidade especialidade={id} />}>
            {id.charAt(0).toUpperCase() + id.slice(1)}
          </ItemForaDoMockup>
        ))}
      </Secao>

      <Secao titulo="Workspace">
        <ItemForaDoMockup icone={<Icone icone={Building2} />}>Contas e Contatos</ItemForaDoMockup>
        <ItemForaDoMockup icone={<Icone icone={Route} />}>Sequências</ItemForaDoMockup>
        <ItemForaDoMockup icone={<Icone icone={Bot} />}>Agentes</ItemForaDoMockup>
        <ItemForaDoMockup icone={<Icone icone={RadioTower} />}>Sinais</ItemForaDoMockup>
        <ItemDeNavegacao
          para="/aprovacoes"
          ativo={pathname.startsWith('/aprovacoes')}
          icone={<Icone icone={ShieldCheck} />}
          rotulo={pendentes > 0 ? `Aprovações, ${pendentes} ${pendentes === 1 ? 'pendente' : 'pendentes'}` : undefined}
          fim={
            pendentes > 0 && (
              <span className="grid h-4.5 min-w-5 place-items-center bg-al-accent px-1.5 text-xs font-medium text-al-on-accent tabular-nums">
                {pendentes}
              </span>
            )
          }
        >
          Aprovações
        </ItemDeNavegacao>
        <ItemForaDoMockup icone={<Icone icone={Plug} />}>Conexões</ItemForaDoMockup>
        <ItemDeNavegacao para="/configuracoes/perfil" ativo={pathname.startsWith('/configuracoes')} icone={<Icone icone={Settings} />}>
          Configurações
        </ItemDeNavegacao>
      </Secao>

      <MenuDoUsuario />
    </aside>
  )
}

function MenuDoUsuario() {
  const { visitante, tema, mudarTema } = useMockup()
  const navegar = useNavigate()

  return (
    <div className="mt-auto flex items-center gap-2.5 border-t border-al-line pt-4">
      <Avatar pessoa={visitante} tamanho="sm" />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-normal">{visitante.nome}</span>
        <span className="rotulo text-[0.5625rem]">{ROTULO_DO_PAPEL[visitante.papel]}</span>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Menu do usuário: ${visitante.nome}`} />}>
          <ChevronsUpDown strokeWidth={1.8} className="text-al-muted" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <span className="block font-normal text-al-ink">{visitante.nome}</span>
              <span className="block text-al-muted">{visitante.email}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuItem onClick={() => navegar('/configuracoes/perfil')}>Meu perfil</DropdownMenuItem>
          <DropdownMenuItem onClick={() => navegar('/configuracoes/preferencias')}>Preferências</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => mudarTema(tema === 'escuro' ? 'claro' : 'escuro')}>
            {tema === 'escuro' ? 'Tema claro' : 'Tema escuro'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

const ROTULO_DA_PERMISSAO: Record<PermissaoDoNavegador, string> = {
  perguntar: 'Ainda não pediu permissão',
  concedida: 'Permissão concedida',
  negada: 'Permissão bloqueada',
  indisponivel: 'Sem suporte a notificações',
}

/**
 * Controles de revisão do mockup: trocar a pessoa que vê a tela e simular o navegador.
 * Não existe no aplicativo: lá, o papel vem da Participação e a permissão, do próprio navegador.
 */
function PainelDoMockup() {
  const { participantes, visitanteId, verComo, notificacoes, simularNavegador, recomecar } = useMockup()
  const [aberto, setAberto] = useState(true)

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="fixed right-4 bottom-4 z-40 inline-flex h-9 items-center gap-2 border border-dashed border-al-accent/70 bg-al-bg px-3 text-xs tracking-rotulo uppercase"
      >
        <FlaskConical strokeWidth={1.8} className="size-4 text-al-accent" aria-hidden />
        Controles do mockup
      </button>
    )
  }

  return (
    <section
      aria-label="Controles do mockup"
      className="fixed right-4 bottom-4 z-40 flex w-72 flex-col gap-3 border border-dashed border-al-accent/70 bg-al-bg p-4 shadow-lg"
    >
      <div className="flex items-center justify-between">
        <span className="rotulo inline-flex items-center gap-2 text-al-ink">
          <FlaskConical strokeWidth={1.8} className="size-4 text-al-accent" aria-hidden />
          Controles do mockup
        </span>
        <button type="button" aria-label="Recolher controles do mockup" onClick={() => setAberto(false)} className="text-al-muted hover:text-al-ink">
          <X strokeWidth={1.8} className="size-4" aria-hidden />
        </button>
      </div>
      <label className="flex flex-col gap-1">
        <span className="rotulo text-[0.625rem]">Ver como</span>
        <select aria-label="Ver como" value={visitanteId} onChange={(e) => verComo(e.target.value)} className="campo py-1.5 text-sm">
          {participantes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} · {ROTULO_DO_PAPEL[p.papel]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="rotulo text-[0.625rem]">Navegador</span>
        <select
          aria-label="Navegador simulado"
          value={notificacoes.navegador}
          onChange={(e) => simularNavegador(e.target.value as PermissaoDoNavegador)}
          className="campo py-1.5 text-sm"
        >
          {Object.entries(ROTULO_DA_PERMISSAO).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={recomecar} className="self-start text-xs tracking-rotulo text-al-muted uppercase hover:text-al-ink">
        Recomeçar o mockup
      </button>
    </section>
  )
}

/** Os avisos que o navegador mostraria, desenhados na página: o mockup não chama a API real. */
function AvisosDoNavegador() {
  const { avisos, dispensarAviso, visitanteId, estadoDasNotificacoes } = useMockup()
  const meus = estadoDasNotificacoes === 'ativado' ? avisos.filter((a) => a.para.includes(visitanteId)) : []
  if (meus.length === 0) return null
  return (
    <ol aria-label="Avisos do navegador (simulados)" className="fixed top-4 right-4 z-50 flex w-80 flex-col gap-2">
      {meus.map((aviso) => (
        <li key={aviso.id} className="flex items-start gap-3 border border-al-line bg-al-surface p-3 shadow-lg">
          <Bell strokeWidth={1.8} className="mt-0.5 size-4 shrink-0 text-al-accent" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="rotulo text-[0.5625rem]">Althius · aviso simulado</span>
            <span className="text-sm font-normal">{aviso.titulo}</span>
            <span className="text-sm text-al-muted">{aviso.texto}</span>
          </div>
          <button type="button" aria-label="Dispensar aviso" onClick={() => dispensarAviso(aviso.id)} className="text-al-muted hover:text-al-ink">
            <X strokeWidth={1.8} className="size-4" aria-hidden />
          </button>
        </li>
      ))}
    </ol>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <nav aria-label={titulo} className="flex flex-col gap-0.5">
      <span className="rotulo px-2 pb-1 text-[0.625rem]" aria-hidden>
        {titulo}
      </span>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </nav>
  )
}

function Icone({ icone: IconeLucide }: { icone: LucideIcon }) {
  return <IconeLucide strokeWidth={1.8} className="size-4 shrink-0" aria-hidden />
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
  rotulo?: string
  children: ReactNode
}) {
  return (
    <li>
      <Link
        to={para}
        aria-label={rotulo}
        aria-current={ativo ? 'page' : undefined}
        className={cn(
          'flex h-8.5 items-center gap-2.5 border-l-2 px-2 text-sm font-normal',
          ativo ? 'border-al-accent bg-al-surface text-al-ink' : 'border-transparent text-al-muted hover:bg-al-surface hover:text-al-ink',
        )}
      >
        {icone}
        {children}
        {fim && <span className="ml-auto flex items-center">{fim}</span>}
      </Link>
    </li>
  )
}

/** Um item do aplicativo que não faz parte deste mockup: aparece para dar contexto, sem navegar. */
function ItemForaDoMockup({ icone, children }: { icone: ReactNode; children: ReactNode }) {
  return (
    <li>
      <span
        aria-disabled
        title="Fora deste mockup"
        className="flex h-8.5 cursor-default items-center gap-2.5 border-l-2 border-transparent px-2 text-sm font-normal text-al-muted/60"
      >
        {icone}
        {children}
      </span>
    </li>
  )
}
