import { Link } from 'react-router-dom'
import { Carregando, IconeAgente, ROTULO_DO_ESTADO } from '@/components/marca'
import { useDados } from '@/fonte/contexto'
import { descreverFrequencia, ROTULO_DO_GATILHO } from '@/paginas/rotulos'

export function PaginaInicial() {
  const painel = useDados((fonte) => fonte.painel(), [])
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const workspace = useDados((fonte) => fonte.workspace(), [])

  return (
    <div className="flex flex-col gap-16">
      <div className="flex flex-col gap-2">
        <h1 className="titulo-display text-7xl">Agentes</h1>
        <p className="max-w-2xl text-lg text-al-muted">
          Quatro especialistas trabalhando o go-to-market da {workspace?.cliente}, inclusive quando ninguém está olhando.
        </p>
      </div>

      <section aria-label="Painel" className="grid grid-cols-4 gap-6">
        {!painel ? (
          <div className="col-span-4">
            <Carregando />
          </div>
        ) : (
          <>
            <Link to="/aprovacoes" className="cartao flex flex-col gap-2 p-6 hover:outline hover:outline-al-line">
              <span className="titulo-display text-6xl">{painel.aprovacoesPendentes}</span>
              <span className="rotulo">Aprovações pendentes</span>
              {painel.aprovacoesPendentes > 0 && <span className="anotacao">esperando você decidir</span>}
            </Link>

            <div className="cartao flex flex-col gap-2 p-6">
              <span className="titulo-display text-6xl">{painel.horasEconomizadas}</span>
              <span className="rotulo">Horas economizadas</span>
              <span className="text-sm text-al-muted">{painel.tarefasFeitas} tarefas feitas pelos agentes</span>
            </div>

            <div className="cartao flex flex-col gap-4 p-6">
              <span className="rotulo">Rotinas de hoje</span>
              <ul className="flex flex-col gap-2">
                {painel.rotinasDeHoje.map((rotina) => (
                  <li key={rotina.id} className="text-sm">
                    <span className="block">{rotina.tarefa}</span>
                    <span className="text-al-muted">{descreverFrequencia(rotina)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="cartao flex flex-col gap-4 p-6">
              <span className="rotulo">Atividade recente</span>
              <ul className="flex flex-col gap-2">
                {painel.atividadeRecente.map((item) => (
                  <li key={item.id} className="text-sm">
                    <span className="block">{item.descricao}</span>
                    <span className="text-al-muted">
                      {item.quando} · {ROTULO_DO_GATILHO[item.gatilho]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>

      <section aria-label="Galeria de agentes" className="flex flex-col gap-6">
        <h2 className="titulo-secao text-3xl">Especialistas</h2>
        {!agentes ? (
          <Carregando />
        ) : (
          <ul className="grid grid-cols-2 gap-6">
            {agentes.map((agente) => (
              <li key={agente.id}>
                <Link
                  to={`/agentes/${agente.id}/conversa`}
                  className="cartao flex h-full flex-col gap-6 p-10 hover:outline hover:outline-al-line"
                >
                  <div className="flex items-start justify-between">
                    <IconeAgente especialidade={agente.especialidade.id} estado={agente.estado} tamanho="lg" />
                    <span className="rotulo">{ROTULO_DO_ESTADO[agente.estado]}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="titulo-secao text-4xl">{agente.nome}</span>
                    <span className="rotulo">{agente.especialidade.rotulo}</span>
                  </div>
                  <p className="text-al-muted">{agente.especialidade.descricao}</p>
                  <dl className="mt-auto grid grid-cols-2 gap-4 border-t border-al-line pt-4">
                    <div>
                      <dt className="rotulo">Tarefas feitas</dt>
                      <dd className="titulo-display text-3xl">{agente.tarefasFeitas}</dd>
                    </div>
                    <div>
                      <dt className="rotulo">Horas economizadas</dt>
                      <dd className="titulo-display text-3xl">{agente.horasEconomizadas}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
