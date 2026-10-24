import { useAmbiente } from '@/fonte/contexto'
import type { LucideIcon } from 'lucide-react'
import { Pagina } from '@/components/pagina'
import { MODULO_INDISPONIVEL, MOTOR_FORA_DO_AR, type ModuloDoWorkspace } from '@/fonte/ambiente'

/**
 * O lugar de um módulo que o Workspace operacional ainda não conectou: diz que ele está indisponível, sem dados nem
 * resultados de demonstração no lugar.
 */
export function AvisoDeModuloIndisponivel({ modulo }: { modulo: ModuloDoWorkspace }) {
  const { motivoDasConversas } = useAmbiente()
  const motorForaDoAr = modulo === 'conversas' && motivoDasConversas === 'motor_fora_do_ar'
  return (
    <div role="status" className="rounded-2xl flex max-w-2xl flex-col items-start gap-2 border border-dashed border-al-line px-5 py-4">
      <span className="selo">Indisponível</span>
      <p className="text-al-ink">{motorForaDoAr ? MOTOR_FORA_DO_AR : MODULO_INDISPONIVEL[modulo]}</p>
      {!motorForaDoAr && <p className="text-sm text-al-muted">
        Ele ainda não foi conectado ao Workspace operacional, e nada aqui é simulado.
      </p>}
    </div>
  )
}

/** A página de um módulo indisponível, com o título da tela que ela ocupa. */
export function PaginaDeModuloIndisponivel({
  modulo,
  titulo,
  icone,
}: {
  modulo: ModuloDoWorkspace
  titulo: string
  icone?: LucideIcon
}) {
  return (
    <Pagina titulo={titulo} icone={icone}>
      <AvisoDeModuloIndisponivel modulo={modulo} />
    </Pagina>
  )
}
