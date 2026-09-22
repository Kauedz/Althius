import { ChevronDown, Command } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BarraDeComando } from '@/components/barra-de-comando'
import { Logo } from '@/components/marca'
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
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const painel = useDados((fonte) => fonte.painel(), [])
  const { tema, alternar } = useTema()
  const [comandoAberto, setComandoAberto] = useState(false)

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault()
        setComandoAberto(true)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-6 border-b border-al-line px-10 py-4">
        <Logo />
        <span className="h-6 w-px bg-al-line" aria-hidden />
        <div className="flex items-baseline gap-2">
          <span className="rotulo">Workspace</span>
          <span className="font-normal">{workspace?.cliente}</span>
        </div>
        <span className="rotulo border border-al-line px-2 py-1">Demonstração</span>

        <div className="ml-auto flex items-center gap-4">
          <Button variant="outline" onClick={() => setComandoAberto(true)} className="gap-2 px-4">
            <Command strokeWidth={1.8} aria-hidden />
            <span>Comando</span>
            <kbd className="rotulo text-[0.625rem]">Ctrl K</kbd>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" className="gap-2 px-2" aria-label={`Menu do usuário: ${workspace?.usuario.nome ?? ''}`} />
              }
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-al-line text-sm font-normal">
                {workspace?.usuario.nome.split(' ').map((p) => p[0]).join('')}
              </span>
              <ChevronDown strokeWidth={1.8} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <span className="block font-normal text-al-ink">{workspace?.usuario.nome}</span>
                  <span className="block text-al-muted">{workspace?.usuario.cargo}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuItem onClick={alternar}>{tema === 'escuro' ? 'Tema claro' : 'Tema escuro'}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1">
        <nav aria-label="Aba de Agentes" className="w-56 shrink-0 border-r border-al-line px-6 py-10">
          <ul className="flex flex-col gap-2">
            <ItemDeNavegacao para="/" fim>
              Agentes
            </ItemDeNavegacao>
            <ItemDeNavegacao para="/aprovacoes">
              Aprovações
              {painel && painel.aprovacoesPendentes > 0 && (
                <span className="ml-auto text-al-accent">{painel.aprovacoesPendentes}</span>
              )}
            </ItemDeNavegacao>
            <ItemDeNavegacao para="/conexoes">Conexões</ItemDeNavegacao>
          </ul>
        </nav>
        <main className="min-w-0 flex-1 px-16 py-10">
          <Outlet />
        </main>
      </div>

      <BarraDeComando aberta={comandoAberto} aoMudar={setComandoAberto} />
    </div>
  )
}

function ItemDeNavegacao({ para, fim, children }: { para: string; fim?: boolean; children: React.ReactNode }) {
  return (
    <li>
      <NavLink
        to={para}
        end={fim}
        className={({ isActive }) =>
          cn(
            'flex items-center border-l-2 px-4 py-2 font-normal uppercase tracking-[0.18em] text-sm',
            isActive ? 'border-al-accent text-al-ink' : 'border-transparent text-al-muted hover:text-al-ink',
          )
        }
      >
        {children}
      </NavLink>
    </li>
  )
}
