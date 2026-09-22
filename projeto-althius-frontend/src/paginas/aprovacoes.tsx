import { Link } from 'react-router-dom'
import { Carregando, IconeAgente } from '@/components/marca'
import { Button } from '@/components/ui/button'
import { useDados, useFonte } from '@/fonte/contexto'
import type { Aprovacao } from '@/fonte/tipos'
import { ROTULO_DO_CANAL } from '@/paginas/rotulos'

export function PaginaAprovacoes() {
  const aprovacoes = useDados((fonte) => fonte.aprovacoes(), [])
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const integracoes = useDados((fonte) => fonte.integracoes(), [])

  const pendentes = aprovacoes?.filter((a) => a.estado === 'pendente').length ?? 0
  // Uma lista só, com as pendentes primeiro: o cartão não sai do lugar ao ser decidido.
  const ordenadas = [...(aprovacoes ?? [])].sort(
    (a, b) => Number(b.estado === 'pendente') - Number(a.estado === 'pendente'),
  )

  return (
    <div className="flex max-w-4xl flex-col gap-16">
      <div className="flex flex-col gap-2">
        <h1 className="titulo-display text-7xl">Aprovações</h1>
        <p className="max-w-2xl text-lg text-al-muted">
          O que os agentes propuseram e só acontece com o seu ok. Também dá para decidir no canal de onde veio o pedido.
        </p>
      </div>

      {!aprovacoes || !agentes || !integracoes ? (
        <Carregando />
      ) : (
        <section aria-label="Propostas" className="flex flex-col gap-6">
          <h2 className="titulo-secao text-3xl">Pendentes · {pendentes}</h2>
          {pendentes === 0 && <p className="anotacao text-lg">nada esperando por você</p>}
          <ul className="flex flex-col gap-6">
            {ordenadas.map((aprovacao) => (
              <li key={aprovacao.id}>
                <CartaoDeAprovacao
                  aprovacao={aprovacao}
                  nomeDoAgente={agentes.find((a) => a.id === aprovacao.agenteId)?.nome}
                  nomeDaIntegracao={integracoes.find((i) => i.id === aprovacao.integracaoId)?.nome}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function CartaoDeAprovacao({
  aprovacao,
  nomeDoAgente,
  nomeDaIntegracao,
}: {
  aprovacao: Aprovacao
  nomeDoAgente?: string
  nomeDaIntegracao?: string
}) {
  const fonte = useFonte()
  return (
    <article aria-label={aprovacao.acao} className="cartao flex flex-col gap-4 p-6">
      <div className="flex items-center gap-4">
        <IconeAgente id={aprovacao.agenteId} />
        <Link to={`/agentes/${aprovacao.agenteId}`} className="font-normal underline-offset-4 hover:underline">
          {nomeDoAgente}
        </Link>
        <span className="rotulo">{nomeDaIntegracao}</span>
        <span className="rotulo ml-auto">
          {aprovacao.origem === 'althius' ? 'Pedido na Althius' : `Pedido no ${ROTULO_DO_CANAL[aprovacao.origem]}`}
        </span>
      </div>
      <p className="text-xl font-normal">{aprovacao.acao}</p>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-6 gap-y-2">
        <dt className="rotulo">Impacto</dt>
        <dd>{aprovacao.impacto}</dd>
        <dt className="rotulo">Por quê</dt>
        <dd className="text-al-muted">{aprovacao.justificativa}</dd>
      </dl>
      {aprovacao.estado === 'pendente' ? (
        <div className="flex gap-2">
          <Button onClick={() => fonte.decidirAprovacao(aprovacao.id, 'aprovada')} className="px-6 tracking-[0.18em] uppercase">
            Aprovar
          </Button>
          <Button variant="outline" onClick={() => fonte.decidirAprovacao(aprovacao.id, 'rejeitada')} className="px-6 tracking-[0.18em] uppercase">
            Rejeitar
          </Button>
        </div>
      ) : (
        <span className={aprovacao.estado === 'aprovada' ? 'rotulo text-al-sucesso' : 'rotulo text-al-erro'}>
          {aprovacao.estado === 'aprovada' ? 'Aprovada' : 'Rejeitada'}
        </span>
      )}
    </article>
  )
}
