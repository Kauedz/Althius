import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ICPS_DO_MAPA } from '@/fonte/mapa-de-cascatas'
import type { CascataDoCatalogo } from '@/fonte/sinais-tipos'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { ROTULO_DA_ORIGEM } from './catalogo'
import { SeloDaDisponibilidade } from './disponibilidade'

/** Os Sinais por mercado do catálogo, agrupados por ICP de A a H. */

/** A grade dos cartões: no celular o mínimo cabe na largura da página, em vez de forçar 17rem e espremer o cartão. */
export const GRADE_DE_CARTOES = 'grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4'

const TEXTO_POR_ESTADO: Record<CascataDoCatalogo['estado'], string | null> = {
  disponivel: null,
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
              {icp.nome}
            </h3>
            {icp.restricao && <p className="text-sm text-al-muted">{icp.restricao}</p>}
          </div>
          <ul className={GRADE_DE_CARTOES}>
            {cascatas.map((cascata) => (
              <li key={cascata.tipo} className="min-w-0">
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
  const podeCriar = cascata.escopo === 'conta' && cascata.estado === 'disponivel'
  return (
    <div aria-disabled={cascata.estado !== 'disponivel'} className={cn('cartao flex h-full min-h-40 min-w-0 flex-col gap-3 border border-transparent p-5', cascata.estado !== 'disponivel' && 'opacity-80')}>
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-base leading-snug font-normal">{cascata.nome}</h4>
        {cascata.estado === 'sem-fonte' ? <span className="selo shrink-0 border-al-line text-al-muted">Sem fonte</span> : <SeloDaDisponibilidade disponibilidade={cascata.estado} />}
      </div>
      {cascata.escopo === 'mercado' && (
        <div className="flex flex-col gap-1">
          <span className="selo self-start">Mercado</span>
          <p className="text-sm text-al-muted">Mostra movimento do mercado, não de uma Conta sua.</p>
        </div>
      )}
      {texto && <p className="text-sm text-al-muted">{texto}</p>}
      {podeCriar && (
        <Link to={`/sinais/cascatas/${cascata.tipo}/novo`} className={cn(BOTAO_PRIMARIO, 'mt-auto self-start')}>
          Criar Monitoramento
        </Link>
      )}
      {cascata.escopo === 'mercado' && (
        <Link
          to={`/sinais/mercado/${cascata.icp}?tipo=${cascata.tipo}`}
          className={cn(BOTAO_SECUNDARIO, 'mt-auto self-start')}
        >
          Ver Sinais de mercado
        </Link>
      )}
    </div>
  )
}
