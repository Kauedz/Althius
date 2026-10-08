import { ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LogoDaIntegracao, nomeDaIntegracao } from '@/components/logos'
import { Carregando, IconeAgente } from '@/components/marca'
import { DecisaoDeAprovacao } from '@/components/decisao'
import { Pagina } from '@/components/pagina'
import { useAmbiente, useDados } from '@/fonte/contexto'
import type { ModoDoAmbiente } from '@/fonte/ambiente'
import { podeDecidir } from '@/fonte/regras'
import type { Agente, AprovacaoDeAcao, Integracao } from '@/fonte/tipos'
import { CartaoDeRevisao } from '@/paginas/cartao-de-revisao'
import { ROTULO_DO_CANAL } from '@/paginas/rotulos'

/** O que a fila é em cada ambiente: no Workspace operacional, só um Administrador decide, e o Canal ainda não decide. */
const INTRODUCAO: Record<ModoDoAmbiente, string> = {
  demonstracao: 'O que os agentes propuseram e só acontece com o seu ok. Também dá para decidir no canal de onde veio o pedido.',
  real: 'O que os Agentes propuseram e só acontece com o ok de um Administrador. Também dá para decidir no passo da Conversa em que o Agente pediu.',
}

export function PaginaAprovacoes() {
  const { modo } = useAmbiente()
  const aprovacoes = useDados((fonte) => fonte.aprovacoes(), [])
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const integracoes = useDados((fonte) => fonte.integracoes(), [])
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const decideAcoes = podeDecidir('acao', workspace?.papel, modo)

  const pendentes = aprovacoes?.filter((a) => a.estado === 'pendente').length ?? 0
  // Uma lista só, com as pendentes primeiro: o cartão não sai do lugar ao ser decidido.
  const ordenadas = [...(aprovacoes ?? [])].sort(
    (a, b) => Number(b.estado === 'pendente') - Number(a.estado === 'pendente'),
  )

  return (
    <Pagina titulo="Aprovações" icone={ShieldCheck} className="max-w-4xl gap-10">
      <div className="flex flex-col gap-2">
        <p className="max-w-2xl text-lg text-al-muted">
          {INTRODUCAO[modo]}
        </p>
      </div>

      {!aprovacoes || !agentes || !integracoes || !workspace ? (
        <Carregando />
      ) : (
        <section aria-label="Propostas" className="flex flex-col gap-6">
          <h2 className="titulo-secao text-3xl">Pendentes · {pendentes}</h2>
          {pendentes === 0 && <p className="anotacao text-lg">nada esperando por você</p>}
          <ul className="flex flex-col gap-6">
            {ordenadas.map((aprovacao) => (
              <li key={aprovacao.id}>
                {aprovacao.revisao ? (
                  <CartaoDeRevisao aprovacao={aprovacao} papel={workspace.papel} />
                ) : (
                  <CartaoDeAprovacao
                    aprovacao={aprovacao}
                    agente={agentes.find((a) => a.id === aprovacao.agenteId)}
                    integracao={integracoes.find((i) => i.id === aprovacao.integracaoId)}
                    podeDecidir={decideAcoes}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Pagina>
  )
}

/** Uma ação proposta numa Integração. Sem `podeDecidir`, a pendente mostra quem decide em vez dos botões. */
function CartaoDeAprovacao({
  aprovacao,
  agente,
  integracao,
  podeDecidir,
}: {
  aprovacao: AprovacaoDeAcao
  agente?: Agente
  integracao?: Integracao
  podeDecidir: boolean
}) {
  const { integracaoId } = aprovacao
  const rotuloDaIntegracao = nomeDaIntegracao(integracaoId, integracao?.nome)
  return (
    <article aria-label={aprovacao.acao} className="cartao flex flex-col gap-4 p-6">
      <div className="flex items-center gap-4">
        {agente && <IconeAgente especialidade={agente.especialidade.id} />}
        <Link to={`/agentes/${aprovacao.agenteId}`} className="font-normal underline-offset-4 hover:underline">
          {agente?.nome}
        </Link>
        <LogoDaIntegracao id={integracaoId} nome={rotuloDaIntegracao} />
        <span className="rotulo">{rotuloDaIntegracao}</span>
        <span className="rotulo ml-auto">
          {aprovacao.origem === 'althius' ? 'Pedido na Althius' : `Pedido no ${ROTULO_DO_CANAL[aprovacao.origem]}`}
        </span>
      </div>
      <p className="text-xl font-normal">{aprovacao.acao}</p>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-6 gap-y-2">
        {aprovacao.contaNome && (
          <>
            <dt className="rotulo">Conta-alvo</dt>
            <dd>
              {aprovacao.contaId ? (
                <Link to={`/contas/${aprovacao.contaId}`} className="font-normal underline-offset-4 hover:underline">
                  {aprovacao.contaNome}
                </Link>
              ) : (
                aprovacao.contaNome
              )}
            </dd>
          </>
        )}
        {aprovacao.sequenciaId && (
          <>
            <dt className="rotulo">Sequência</dt>
            <dd>
              <Link to={`/sequencias/${aprovacao.sequenciaId}`} className="font-normal underline-offset-4 hover:underline">
                Ver sequência
              </Link>
            </dd>
          </>
        )}
        <dt className="rotulo">Impacto</dt>
        <dd>{aprovacao.impacto}</dd>
        <dt className="rotulo">Por quê</dt>
        <dd className="text-al-muted">{aprovacao.justificativa}</dd>
      </dl>
      <DecisaoDeAprovacao aprovacao={aprovacao} onde="fila" podeDecidir={podeDecidir} />
    </article>
  )
}
