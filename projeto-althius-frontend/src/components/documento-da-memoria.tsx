import type { ReactNode } from 'react'
import type { Dependente } from '@/fonte/regras-memoria'
import type { SecaoDoDocumento } from '@/fonte/tipos'
import { cn } from '@/lib/utils'

/** As seções de um documento da Memória do Workspace, com o título ao lado do texto. */
export function SecoesDoDocumento({ secoes, className }: { secoes: SecaoDoDocumento[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[12rem_1fr] gap-x-8', className)}>
      {secoes.map((secao) => (
        <div key={secao.titulo} className="contents">
          <dt className="rotulo pt-0.5">{secao.titulo}</dt>
          <dd className="leading-relaxed">{secao.texto}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * As configurações de outros módulos que leem um documento da Memória do Workspace, com o que cada uma usa dele.
 * `situacao` diz, à direita, em que pé cada uma está (ex.: "Em uso").
 */
export function ListaDeDependentes({
  dependentes,
  rotuloAcessivel,
  situacao,
}: {
  dependentes: Dependente[]
  rotuloAcessivel?: string
  situacao?: ReactNode
}) {
  return (
    <ul aria-label={rotuloAcessivel} className="flex flex-col">
      {dependentes.map((dependente) => (
        <li
          key={dependente.nome}
          aria-label={dependente.nome}
          className="grid grid-cols-[12rem_1fr_auto] items-baseline gap-x-8 border-b border-al-line py-3 last:border-b-0"
        >
          <span className="rotulo">{dependente.modulo}</span>
          <span className="flex flex-col">
            <span className="font-normal">{dependente.nome}</span>
            <span className="text-sm text-al-muted">{dependente.resumo}</span>
          </span>
          {situacao}
        </li>
      ))}
    </ul>
  )
}
