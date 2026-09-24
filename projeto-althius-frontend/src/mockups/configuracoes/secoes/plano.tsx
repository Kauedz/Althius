import { IconeDaEspecialidade } from '@/components/marca'
import { cn } from '@/lib/utils'
import { Bloco, BOTAO_PRIMARIO, CabecalhoDaSecao } from '../componentes'
import { EXECUCOES_NO_PERIODO } from '../dados'
import { useMockup } from '../estado'

const numero = new Intl.NumberFormat('pt-BR')

export function SecaoPlano() {
  const { participantes, convites } = useMockup()
  const total = EXECUCOES_NO_PERIODO.porEspecialidade.reduce((soma, e) => soma + e.total, 0)

  return (
    <>
      <CabecalhoDaSecao titulo="Plano" alcance="workspace" descricao="A situação do Workspace na Althius. Os números abaixo são demonstrativos." />

      <section aria-label="Plano atual" className="cartao flex items-center justify-between gap-6 p-6">
        <div className="flex flex-col gap-1">
          <span className="rotulo">Plano atual</span>
          <span className="titulo-secao text-3xl">Demonstração</span>
          <span className="text-sm text-al-muted">Preços, franquias e limites aparecem aqui quando estiverem definidos.</span>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button type="button" disabled aria-describedby="upgrade-em-breve" className={cn(BOTAO_PRIMARIO)}>
            Fazer upgrade
          </button>
          <span id="upgrade-em-breve" className="selo">
            Em breve
          </span>
        </div>
      </section>

      <Bloco titulo="Uso do Workspace" descricao={`Período: ${EXECUCOES_NO_PERIODO.periodo}.`}>
        <div className="grid grid-cols-2 gap-6">
          <dl className="flex flex-col gap-1 border border-al-line p-5">
            <dt className="rotulo">Participantes</dt>
            <dd className="titulo-display text-5xl tabular-nums">{participantes.length}</dd>
            <dd className="text-sm text-al-muted">
              {convites.length === 0 ? 'Nenhum convite pendente' : `${convites.length} ${convites.length === 1 ? 'convite pendente' : 'convites pendentes'}, fora da contagem`}
            </dd>
          </dl>
          <dl className="flex flex-col gap-1 border border-al-line p-5">
            <dt className="rotulo">Execuções de Agentes no período</dt>
            <dd className="titulo-display text-5xl tabular-nums">{numero.format(total)}</dd>
            <dd className="text-sm text-al-muted">Cada vez que um Agente foi acionado e entregou um resultado</dd>
          </dl>
        </div>
        <ul aria-label="Execuções por Especialidade" className="flex flex-col">
          {EXECUCOES_NO_PERIODO.porEspecialidade.map((e) => (
            <li key={e.especialidade} className="flex items-center gap-3 border-b border-al-line py-2.5 last:border-b-0">
              <IconeDaEspecialidade especialidade={e.especialidade} className="text-al-muted" />
              <span className="font-normal">{e.nome}</span>
              <span className="ml-auto tabular-nums">{numero.format(e.total)}</span>
            </li>
          ))}
        </ul>
      </Bloco>
    </>
  )
}
