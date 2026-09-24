import { AbasSublinhadas } from '@/components/abas'
import { Button } from '@/components/ui/button'
import type { PreviaContato } from '@/fonte/contas-tipos'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { cn, iniciais } from '@/lib/utils'

/** As peças que as abas Contas e Contatos compartilham: as abas, o sistema da tabela e as células comuns. */

const ABAS_MODULO = [
  { rotulo: 'Contas', para: '/contas' },
  { rotulo: 'Contatos', para: '/contatos' },
]

export function AbasDoModulo() {
  return <AbasSublinhadas rotuloAcessivel="Abas de contas e contatos" abas={ABAS_MODULO} />
}

// Cabeçalho fixo no topo do quadro que rola.
export const CABECALHO =
  'rotulo sticky top-0 z-2 h-9.5 border-b border-al-line bg-al-bg pr-4 text-[0.625rem] whitespace-nowrap'
// Linhas compactas, separadas só pela linha do token.
export const CELULA = 'border-b border-al-line pr-4'

/** A mensagem curta de erro da lista, com "Tentar de novo". */
export function FalhaAoCarregar({ mensagem, tentarDeNovo }: { mensagem: string; tentarDeNovo: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-6">
      <p className="text-sm text-al-muted">{mensagem}</p>
      <Button
        type="button"
        variant="outline"
        onClick={tentarDeNovo}
        className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
      >
        Tentar de novo
      </Button>
    </div>
  )
}

/** A foto do Contato num círculo, ou as iniciais do nome quando não há foto. */
export function AvatarDoContato({ contato, className }: { contato: PreviaContato; className?: string }) {
  const circulo = cn('size-6.5 shrink-0 rounded-full border border-al-line ring-[1.5px] ring-al-bg', className)
  if (contato.foto) {
    return <img src={contato.foto} alt={contato.nome} title={contato.nome} className={cn(circulo, 'object-cover')} />
  }
  return (
    <span
      role="img"
      aria-label={contato.nome}
      title={contato.nome}
      className={cn(circulo, 'grid place-items-center bg-al-surface text-[0.625rem] font-normal text-al-ink')}
    >
      {iniciais(contato.nome)}
    </span>
  )
}

export function CelulaUltimoContato({ data, hoje }: { data?: string; hoje: Date }) {
  if (!data) {
    return <span className="text-al-muted">Nunca</span>
  }

  const dataRelativaOuExplicita = formatarDataDoModulo(data, hoje, { maiuscula: true })
  const dataCompleta = formatarDataCompleta(data)

  return (
    <span title={dataCompleta} aria-label={dataCompleta} className="whitespace-nowrap">
      {dataRelativaOuExplicita}
    </span>
  )
}
