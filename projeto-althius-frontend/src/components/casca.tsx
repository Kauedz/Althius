import { Bot, Building2, ChevronsUpDown, Plug, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { IconeDaEspecialidade, IndicadorDeEstado, ROTULO_DO_ESTADO } from '@/components/marca'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDados } from '@/fonte/contexto'
import { cn } from '@/lib/utils'
import { useTema } from '@/tema'

export function Casca() {
  return (
    <div className="grid min-h-screen grid-cols-[15.5rem_1fr]">
      <Sidebar />
      <main className="flex min-w-0 flex-col">
        <Outlet />
      </main>
    </div>
  )
}

function Sidebar() {
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const { pathname } = useLocation()
  // A aba de Agentes inclui a página de cada Agente e a Conversa coordenada.
  const naAbaDeAgentes = pathname === '/' || pathname.startsWith('/agentes/') || pathname.startsWith('/conversa')
  const naAbaDeContas = pathname === '/contas' || pathname.startsWith('/contas/') || pathname.startsWith('/contatos')
  const pendentes = workspace?.aprovacoesPendentes ?? 0

  return (
    <aside
      aria-label="Navegação"
      className="sticky top-0 flex h-screen flex-col gap-6 border-r border-al-line p-4"
    >
      <div className="flex flex-col gap-2">
        <SeletorDeWorkspace cliente={workspace?.cliente} descricao={workspace?.descricao} />
        <span className="selo self-start">Demonstração</span>
      </div>

      <Secao titulo="Especialistas">
        {agentes
          ?.filter((agente) => agente.tipo === 'padrao')
          .map((agente) => (
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

      <Secao titulo="Workspace">
        <ItemDeNavegacao para="/contas" ativo={naAbaDeContas} icone={<IconeDeNavegacao icone={Building2} />}>
          Contas e Contatos
        </ItemDeNavegacao>
        <ItemDeNavegacao para="/" ativo={naAbaDeAgentes} icone={<IconeDeNavegacao icone={Bot} />}>
          Agentes
        </ItemDeNavegacao>
        <ItemDeNavegacao
          para="/aprovacoes"
          ativo={pathname.startsWith('/aprovacoes')}
          icone={<IconeDeNavegacao icone={ShieldCheck} />}
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
        <ItemDeNavegacao para="/conexoes" ativo={pathname.startsWith('/conexoes')} icone={<IconeDeNavegacao icone={Plug} />}>
          Conexões
        </ItemDeNavegacao>
      </Secao>

      <MenuDoUsuario />
    </aside>
  )
}

function SeletorDeWorkspace({ cliente, descricao }: { cliente?: string; descricao?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Workspace: ${cliente ?? ''}`}
            className="flex h-11 items-center gap-2 border border-al-line bg-al-surface px-2 text-left"
          />
        }
      >
        <span className="grid size-7 shrink-0 place-items-center bg-al-ink text-sm font-medium text-al-bg" aria-hidden>
          {cliente?.[0]}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="rotulo text-[0.5625rem]">Workspace</span>
          <span className="truncate font-normal">{cliente}</span>
        </span>
        <ChevronsUpDown strokeWidth={1.8} className="size-4 text-al-muted" aria-hidden />
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
  const { tema, alternar } = useTema()
  const nome = workspace?.usuario.nome ?? ''

  return (
    <div className="mt-auto flex items-center gap-2.5 border-t border-al-line pt-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-al-line text-xs font-normal" aria-hidden>
        {nome
          .split(' ')
          .map((parte) => parte[0])
          .join('')}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-normal">{nome}</span>
        <span className="rotulo text-[0.5625rem]">{tema === 'escuro' ? 'Tema escuro' : 'Tema claro'}</span>
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
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuItem onClick={alternar}>{tema === 'escuro' ? 'Tema claro' : 'Tema escuro'}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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
  return (
    <li>
      <Link
        to={para}
        aria-label={rotulo}
        aria-current={ativo ? 'page' : undefined}
        className={cn(
          'flex h-8.5 items-center gap-2.5 border-l-2 px-2 text-sm font-normal',
          ativo
            ? 'border-al-accent bg-al-surface text-al-ink'
            : 'border-transparent text-al-muted hover:bg-al-surface hover:text-al-ink',
        )}
      >
        {icone}
        {children}
        {fim && <span className="ml-auto flex items-center">{fim}</span>}
      </Link>
    </li>
  )
}
