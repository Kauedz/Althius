// O visual do chat, no padrão dos assistentes de IA: coluna centralizada, a fala da pessoa numa bolha à direita, a do
// Agente solta na página com o ícone da Especialidade, ações que aparecem ao passar o mouse e o composer preso no rodapé.
// É só aparência: os dados, as permissões e o que cada fala diz continuam nas páginas que usam estas peças.
import { Check, Copy } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { IconeAgente, Pulso } from '@/components/marca'
import type { EspecialidadeId } from '@/fonte/tipos'
import { cn } from '@/lib/utils'

/** A largura da coluna do chat: a mesma na Conversa com um Agente e na Conversa coordenada, sempre centralizada. */
export const COLUNA_DO_CHAT = 'mx-auto w-full max-w-3xl'

/** A fala da pessoa: uma bolha à direita, com os anexos (se houver) logo abaixo. */
export function BolhaDoUsuario({ texto, children, className }: { texto: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex max-w-[85%] flex-col items-end gap-2 self-end', className)}>
      <p className="rounded-2xl rounded-br-md border border-al-line bg-al-surface px-4 py-2.5 leading-relaxed whitespace-pre-line shadow-(--al-sombra-cartao)">
        {texto}
      </p>
      {children}
    </div>
  )
}

/** A fala de um Agente: o ícone da Especialidade, o nome e o texto solto, com as ações embaixo. */
export function FalaDeAgente({
  especialidade,
  nome,
  acoes,
  children,
}: {
  especialidade?: EspecialidadeId
  nome?: string
  acoes?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="group grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3.5">
      <div className="pt-0.5">{especialidade ? <IconeAgente especialidade={especialidade} /> : null}</div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {nome && <span className="rotulo">{nome}</span>}
        <div className="leading-relaxed [&_p]:leading-relaxed">{children}</div>
        {acoes && (
          <div className="-ml-2 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
            {acoes}
          </div>
        )}
      </div>
    </div>
  )
}

/** Copia a resposta do Agente; vira "Copiado" por um instante. */
export function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      // Sem acesso à área de transferência: nada a fazer na demo.
    }
  }
  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={copiado ? 'Copiado' : 'Copiar resposta'}
      title={copiado ? 'Copiado' : 'Copiar resposta'}
      className="rounded-lg grid size-8 place-items-center text-al-muted transition-colors hover:bg-al-surface hover:text-al-ink"
    >
      {copiado ? <Check strokeWidth={1.8} className="size-4" aria-hidden /> : <Copy strokeWidth={1.8} className="size-4" aria-hidden />}
    </button>
  )
}

/** "Fulano está respondendo": o pulso da marca e o nome de quem responde. */
export function IndicadorDeResposta({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-3.5 pl-1 text-al-muted">
      <span className="relative size-5">
        <Pulso className="absolute inset-0" />
      </span>
      <span className="rotulo">{children}</span>
    </div>
  )
}

/** O rodapé do chat: o composer preso embaixo, sobre um degradê que esconde a conversa que passa por baixo. */
export function RodapeDoChat({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rodape-da-conversa', className)}>{children}</div>
}
