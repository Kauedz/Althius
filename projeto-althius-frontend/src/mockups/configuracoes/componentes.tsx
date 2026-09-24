import { CircleAlert, CircleCheck, FlaskConical, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { iniciais, type Participante } from './dados'

// Os botões seguem os de Sequências e Sinais: raio 0, rótulo em maiúsculas e entreletra do manual.
export { BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Opcao } from '@/paginas/sinais/componentes'

export type Alcance = 'pessoal' | 'workspace' | 'althius'

const ROTULO_DO_ALCANCE: Record<Alcance, string> = {
  pessoal: 'Só você',
  workspace: 'Compartilhado com o Workspace',
  althius: 'Althius',
}

const DICA_DO_ALCANCE: Record<Alcance, string> = {
  pessoal: 'O que você muda aqui vale só para a sua Conta de usuário.',
  workspace: 'O que muda aqui vale para todas as pessoas do Workspace.',
  althius: 'Informações da Althius, iguais para todos os Workspaces.',
}

/** O cabeçalho de uma seção de Configurações, com o alcance do que se muda nela. */
export function CabecalhoDaSecao({ titulo, alcance, descricao }: { titulo: string; alcance: Alcance; descricao?: string }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="titulo-secao text-3xl">{titulo}</h2>
        <span className={cn('selo', alcance === 'workspace' && 'border-al-accent/50 text-al-ink')} title={DICA_DO_ALCANCE[alcance]}>
          {ROTULO_DO_ALCANCE[alcance]}
        </span>
      </div>
      <p className="max-w-2xl text-al-muted">{descricao ?? DICA_DO_ALCANCE[alcance]}</p>
    </header>
  )
}

/** Um bloco dentro de uma seção: título pequeno, descrição e conteúdo. */
export function Bloco({ titulo, descricao, acoes, children, className }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={titulo} className={cn('flex flex-col gap-5 border-t border-al-line pt-6', className)}>
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

/** A foto da pessoa ou, sem foto, as iniciais do nome. */
export function Avatar({ pessoa, tamanho = 'md' }: { pessoa: Pick<Participante, 'nome' | 'foto'>; tamanho?: 'sm' | 'md' | 'lg' }) {
  const classes = cn('shrink-0 rounded-full', { sm: 'size-8 text-xs', md: 'size-9 text-xs', lg: 'size-20 text-2xl' }[tamanho])
  if (pessoa.foto) return <img src={pessoa.foto} alt="" className={cn(classes, 'object-cover')} />
  return (
    <span className={cn(classes, 'grid place-items-center bg-al-line font-normal text-al-ink')} aria-hidden>
      {iniciais(pessoa.nome)}
    </span>
  )
}

/** Resultado de uma operação: sucesso e aviso são anunciados com calma; erro, na hora. */
export function Mensagem({ tipo, children }: { tipo: 'sucesso' | 'erro' | 'info'; children: ReactNode }) {
  const Icone = tipo === 'sucesso' ? CircleCheck : tipo === 'erro' ? CircleAlert : Info
  return (
    <p
      role={tipo === 'erro' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 border-l-2 py-1 pl-3 text-sm',
        tipo === 'sucesso' && 'border-al-sucesso',
        tipo === 'erro' && 'border-al-erro text-al-ink',
        tipo === 'info' && 'border-al-line text-al-muted',
      )}
    >
      <Icone
        strokeWidth={1.8}
        className={cn('mt-0.5 size-4 shrink-0', tipo === 'sucesso' && 'text-al-sucesso', tipo === 'erro' && 'text-al-erro')}
        aria-hidden
      />
      <span>{children}</span>
    </p>
  )
}

/** Um campo de formulário com rótulo e, quando houver, a mensagem de validação logo abaixo. */
export function Campo({ rotulo, id, erro, dica, children }: { rotulo: string; id: string; erro?: string; dica?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      {children}
      {erro ? (
        <span id={`${id}-erro`} className="text-sm text-al-erro">
          {erro}
        </span>
      ) : (
        dica && <span className="text-sm text-al-muted">{dica}</span>
      )}
    </div>
  )
}

/** Ação que só existe no mockup, para simular o que no aplicativo acontece fora da tela. */
export function AcaoDoMockup({ aoClicar, children }: { aoClicar: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      title="Só no mockup"
      className="inline-flex h-7 shrink-0 items-center gap-1.5 border border-dashed border-al-accent/60 px-2 text-xs font-normal tracking-rotulo text-al-muted uppercase transition-colors hover:text-al-ink"
    >
      <FlaskConical strokeWidth={1.8} className="size-3.5 text-al-accent" aria-hidden />
      {children}
    </button>
  )
}

/** Faixa que identifica conteúdo provisório, a ser trocado pelo definitivo sem redesenhar a página. */
export function FaixaProvisoria({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex items-center gap-3 border border-dashed border-al-atencao/60 px-4 py-3 text-sm">
      <span className="selo border-al-atencao/60 text-al-atencao">Conteúdo provisório</span>
      <span className="text-al-muted">{children}</span>
    </div>
  )
}
