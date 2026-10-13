import { cn } from '@/lib/utils'
import { ICPS_DO_MAPA } from '@/fonte/mapa-de-cascatas'
import type { CascataDoCatalogo } from '@/fonte/sinais-tipos'
import { ROTULO_DA_ORIGEM } from './catalogo'
import { SeloDaDisponibilidade } from './disponibilidade'

/** Os Sinais por mercado do catálogo, agrupados por ICP de A a H. Só leitura: o Monitoramento deles não nasce por aqui. */

const TEXTO_POR_ESTADO: Record<CascataDoCatalogo['estado'], string | null> = {
  disponivel: 'Roda com dados reais. O Monitoramento deste Sinal ainda não é criado por aqui.',
  'em-teste': 'Em validação com dados reais: ainda não dá para monitorar.',
  'sem-fonte': null, // o motivo vem do banco
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Os cartões que correspondem à busca, agrupados por ICP na ordem do Mapa; o ICP sem cartão não aparece. */
export function agruparCascatasPorIcp(cascatas: readonly CascataDoCatalogo[], busca = '') {
  const termo = normalizar(busca)
  return ICPS_DO_MAPA.map((icp) => ({
    icp,
    cascatas: icp.sinais
      .map((tipo) => cascatas.find((c) => c.tipo === tipo && c.icp === icp.id))
      .filter((c): c is CascataDoCatalogo => c !== undefined)
      .filter((c) => !termo || normalizar(`${c.nome} ${icp.nome}`).includes(termo)),
  })).filter((grupo) => grupo.cascatas.length > 0)
}

export function SecaoDeCascatas({ grupos }: { grupos: ReturnType<typeof agruparCascatasPorIcp> }) {
  if (grupos.length === 0) return null
  return (
    <section aria-label="Sinais por mercado" className="flex flex-col gap-6">
      <h2 className="flex items-baseline gap-3">
        <span className="titulo-secao text-lg">Sinais por mercado</span>
        <span className="rotulo text-[0.6875rem]">{ROTULO_DA_ORIGEM.externo}</span>
      </h2>
      {grupos.map(({ icp, cascatas }) => (
        <section key={icp.id} aria-labelledby={`icp-${icp.id}`} className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 id={`icp-${icp.id}`} className="text-base font-normal">
              {icp.id} · {icp.nome}
            </h3>
            {icp.restricao && <p className="text-sm text-al-muted">{icp.restricao}</p>}
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4">
            {cascatas.map((cascata) => (
              <li key={cascata.tipo}>
                <CartaoDeCascata cascata={cascata} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}

function CartaoDeCascata({ cascata }: { cascata: CascataDoCatalogo }) {
  const texto = cascata.estado === 'sem-fonte' ? cascata.motivo : TEXTO_POR_ESTADO[cascata.estado]
  return (
    <div aria-disabled={cascata.estado !== 'disponivel'} className={cn('cartao flex h-full min-h-40 flex-col gap-3 border border-transparent p-5', cascata.estado !== 'disponivel' && 'opacity-80')}>
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-base leading-snug font-normal">{cascata.nome}</h4>
        {cascata.estado === 'sem-fonte' ? <span className="selo border-al-line text-al-muted">Sem fonte</span> : <SeloDaDisponibilidade disponibilidade={cascata.estado} />}
      </div>
      {cascata.escopo === 'mercado' && (
        <div className="flex flex-col gap-1">
          <span className="selo self-start">Mercado</span>
          <p className="text-sm text-al-muted">Mostra movimento do mercado, não de uma Conta sua.</p>
        </div>
      )}
      {texto && <p className="mt-auto pt-2 text-sm text-al-muted">{texto}</p>}
    </div>
  )
}
