import { Archive, Check, Hash, Pencil, X } from 'lucide-react'
import type { FormEvent, KeyboardEvent } from 'react'
import { BOTAO_DISCRETO } from '@/components/botoes'
import { Pulso } from '@/components/marca'
import { nomeDaConversa, type ResumoDeConversa } from '@/fonte/tipos'
import { cn } from '@/lib/utils'
import { tempoRelativo } from './tempo-relativo'

/** A marca da Conversa que nasceu num thread do Slack. */
export function MarcaDoSlack() {
  return (
    <span className="rotulo inline-flex items-center gap-1">
      <Hash strokeWidth={1.8} className="size-3.5" aria-hidden />
      Slack
    </span>
  )
}

interface Props {
  conversa: ResumoDeConversa
  atual?: boolean
  agora: Date
  editando?: boolean
  nome?: string
  aoMudarNome?(nome: string): void
  aoAbrir(): void
  aoIniciarRenome?(): void
  aoCancelarRenome?(): void
  aoSalvarNome?(evento: FormEvent): void
  aoArquivar?(): void
}

/** Uma Conversa do histórico: a linha inteira abre, e renomear e arquivar ficam ao lado, no hover e no foco. */
export function LinhaDeConversa({
  conversa,
  atual = false,
  agora,
  editando = false,
  nome = '',
  aoMudarNome,
  aoAbrir,
  aoIniciarRenome,
  aoCancelarRenome,
  aoSalvarNome,
  aoArquivar,
}: Props) {
  const titulo = nomeDaConversa(conversa)

  function cancelarNoEscape(evento: KeyboardEvent) {
    if (evento.key !== 'Escape') return
    evento.preventDefault()
    evento.stopPropagation()
    aoCancelarRenome?.()
  }

  return (
    <li
      className={cn(
        'group relative',
        atual && 'bg-al-bg before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-al-accent',
      )}
    >
      {editando ? (
        <form
          onSubmit={aoSalvarNome}
          onKeyDown={cancelarNoEscape}
          className="flex h-[52px] items-center gap-2 px-3"
        >
          <input
            aria-label="Novo nome da Conversa"
            value={nome}
            maxLength={80}
            autoFocus
            onKeyDown={cancelarNoEscape}
            onChange={(evento) => aoMudarNome?.(evento.target.value)}
            className="min-w-0 flex-1 rounded-[10px] border border-al-line bg-transparent px-2 py-1 text-sm"
          />
          <button type="submit" aria-label="Salvar o nome" className={BOTAO_DISCRETO}>
            <Check strokeWidth={1.8} className="size-4" aria-hidden />
          </button>
          <button type="button" aria-label="Cancelar" onClick={aoCancelarRenome} className={BOTAO_DISCRETO}>
            <X strokeWidth={1.8} className="size-4" aria-hidden />
          </button>
        </form>
      ) : (
        <>
          <button
            type="button"
            onClick={aoAbrir}
            aria-current={atual ? 'true' : undefined}
            className="flex h-[52px] w-full items-center gap-3 px-4 pr-16 text-left hover:bg-al-hover"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm text-al-ink">{titulo}</span>
              <span className="flex min-w-0 items-center gap-2 truncate text-xs text-al-muted">
                {conversa.emAndamento && (
                  <span className="inline-flex items-center gap-1.5 text-al-rosa-texto">
                    <span className="relative size-3 shrink-0">
                      <Pulso className="absolute inset-0" />
                    </span>
                    respondendo
                  </span>
                )}
                <span>{tempoRelativo(conversa.atualizadaEm, agora)}</span>
                {conversa.doSlack && <MarcaDoSlack />}
              </span>
            </span>
          </button>
          {(aoIniciarRenome || aoArquivar) && (
            <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
              {aoIniciarRenome && (
                <button
                  type="button"
                  aria-label={`Renomear ${titulo}`}
                  onClick={aoIniciarRenome}
                  className={cn(BOTAO_DISCRETO, 'size-7 justify-center px-0 text-al-muted')}
                >
                  <Pencil strokeWidth={1.8} className="size-4" aria-hidden />
                </button>
              )}
              {aoArquivar && (
                <button
                  type="button"
                  aria-label={`Arquivar ${titulo}`}
                  onClick={aoArquivar}
                  className={cn(BOTAO_DISCRETO, 'size-7 justify-center px-0 text-al-muted')}
                >
                  <Archive strokeWidth={1.8} className="size-4" aria-hidden />
                </button>
              )}
            </span>
          )}
        </>
      )}
    </li>
  )
}
