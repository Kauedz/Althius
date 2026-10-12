import type { ReactNode } from 'react'
import { AbasSublinhadas } from '@/components/abas'
import { cn } from '@/lib/utils'

/** O alcance do que se muda numa seção: só a Conta de usuário, todo o Workspace ou nada (informação da Althius). */
export type Alcance = 'pessoal' | 'workspace' | 'althius'

const SELO_DO_ALCANCE: Record<Alcance, { rotulo: string; className?: string }> = {
  pessoal: { rotulo: 'Só você' },
  workspace: { rotulo: 'Compartilhado com o Workspace', className: 'border-al-accent/50 text-al-ink' },
  althius: { rotulo: 'Althius' },
}

/** Uma seção de Configurações: o título, o selo do alcance do que se muda nela, a descrição e o conteúdo. */
export function SecaoDeConfiguracoes({
  id,
  titulo,
  alcance,
  descricao,
  estreita = false,
  children,
}: {
  id: string
  titulo: string
  alcance: Alcance
  descricao: ReactNode
  /** As seções pessoais, só com formulários, são mais estreitas. */
  estreita?: boolean
  children: ReactNode
}) {
  const selo = SELO_DO_ALCANCE[alcance]
  return (
    <section aria-labelledby={`titulo-${id}`} className={cn('flex flex-col gap-8', estreita ? 'max-w-2xl' : 'max-w-4xl')}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 id={`titulo-${id}`} className="titulo-secao text-3xl">
            {titulo}
          </h2>
          <span className={cn('selo', selo.className)}>{selo.rotulo}</span>
        </div>
        <p className="text-al-muted">{descricao}</p>
      </div>
      {children}
    </section>
  )
}

/** As abas de uma seção com uma página por aba, cada uma em /configuracoes/<seção>/<página>. */
export function AbasDasPaginas({
  secao,
  paginas,
  rotuloAcessivel,
}: {
  secao: string
  paginas: Record<string, string>
  rotuloAcessivel: string
}) {
  return (
    <AbasSublinhadas
      rotuloAcessivel={rotuloAcessivel}
      abas={Object.entries(paginas).map(([pagina, rotulo]) => ({ rotulo, para: `/configuracoes/${secao}/${pagina}` }))}
    />
  )
}

/** Um bloco dentro de uma seção de Configurações: título pequeno, descrição, ações e conteúdo. */
export function Bloco({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo: string
  descricao?: ReactNode
  acoes?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-5 border-t border-al-line pt-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="titulo-secao text-lg">{titulo}</h3>
          {descricao && <p className="text-sm text-al-muted">{descricao}</p>}
        </div>
        {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  )
}

/** Faixa que identifica conteúdo provisório, a ser trocado pelo definitivo sem redesenhar a página. */
export function FaixaProvisoria({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="rounded-xl flex items-center gap-3 border border-dashed border-al-atencao/60 px-4 py-3 text-sm">
      <span className="selo shrink-0 border-al-atencao/60 text-al-atencao">Conteúdo provisório</span>
      <span className="text-al-muted">{children}</span>
    </div>
  )
}
