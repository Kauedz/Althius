import { Clock, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LogoDaIntegracao, nomeDaIntegracao } from '@/components/logos'
import { Carregando, IconeAgente } from '@/components/marca'
import { DecisaoDeAprovacao } from '@/components/decisao'
import { Pagina } from '@/components/pagina'
import { useAmbiente, useDados } from '@/fonte/contexto'
import type { ModoDoAmbiente } from '@/fonte/ambiente'
import {
  filtrarFila,
  lerFilaDeAprovacoes,
  MOTIVO_DA_VENCIDA,
  prazoDaAprovacao,
  ROTULO_DO_TIPO,
  type FiltroDaFila,
} from '@/fonte/fila-de-aprovacoes'
import { ehRevisaoDoPlaybook, ehSequenciaProposta, podeDecidir } from '@/fonte/regras'
import type { Agente, AprovacaoDaFila, AprovacaoDeAcao, Integracao, TipoDeAprovacao } from '@/fonte/tipos'
import { CartaoDeRevisao } from '@/paginas/cartao-de-revisao'
import { CartaoDeRevisaoDoPlaybook } from '@/paginas/cartao-de-revisao-do-playbook'
import { PropostaDeSequencia } from '@/paginas/proposta-de-sequencia'
import { ROTULO_DO_CANAL } from '@/paginas/rotulos'

/** O que a fila é em cada ambiente: no Workspace operacional, só um Administrador decide, e o Canal ainda não decide. */
const INTRODUCAO: Record<ModoDoAmbiente, string> = {
  demonstracao: 'O que os agentes propuseram e só acontece com o seu ok. Também dá para decidir no canal de onde veio o pedido.',
  real: 'O que os Agentes propuseram e só acontece com o ok de um Administrador. Também dá para decidir no passo da Conversa em que o Agente pediu.',
}

export function PaginaAprovacoes() {
  const { modo } = useAmbiente()
  const aprovacoes = useDados(lerFilaDeAprovacoes, [])
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const integracoes = useDados((fonte) => fonte.integracoes(), [])
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const decideAcoes = podeDecidir('acao', workspace?.papel, modo)
  const [filtro, setFiltro] = useState<FiltroDaFila>({ tipo: 'todos', agenteId: 'todos' })

  const pendentes = aprovacoes?.filter((a) => a.estado === 'pendente').length ?? 0
  // Uma lista só, com as pendentes primeiro: o cartão não sai do lugar ao ser decidido.
  const ordenadas = filtrarFila(aprovacoes ?? [], filtro).sort(
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
          <FiltrosDaFila filtro={filtro} aoMudar={setFiltro} agentes={agentes} />
          {ordenadas.length === 0 && (aprovacoes.length > 0) && (
            <p className="text-sm text-al-muted">Nenhuma Aprovação com esses filtros.</p>
          )}
          <ul className="flex flex-col gap-6">
            {ordenadas.map((aprovacao) => (
              <li key={aprovacao.id} className="flex flex-col gap-2">
                <PrazoDaAprovacao aprovacao={aprovacao} />
                {ehSequenciaProposta(aprovacao) ? (
                  <PropostaDeSequencia aprovacao={aprovacao} onde="fila" />
                ) : ehRevisaoDoPlaybook(aprovacao) ? (
                  <CartaoDeRevisaoDoPlaybook aprovacao={aprovacao} onde="fila" />
                ) : aprovacao.revisao ? (
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

/** O prazo da pendente ("vence em 6 h") ou, na vencida, o motivo. */
function PrazoDaAprovacao({ aprovacao }: { aprovacao: AprovacaoDaFila }) {
  if (aprovacao.estado === 'expirada') {
    return (
      <p className="flex items-center gap-2 text-sm text-al-muted">
        <Clock aria-hidden className="size-4" />
        <span>
          <span className="font-normal text-al-ink">Vencida.</span> {MOTIVO_DA_VENCIDA}
        </span>
      </p>
    )
  }
  const prazo = prazoDaAprovacao(aprovacao)
  if (!prazo) return null
  return (
    <p className="flex items-center gap-2 text-sm text-al-muted">
      <Clock aria-hidden className="size-4" />
      <span>{prazo.charAt(0).toUpperCase() + prazo.slice(1)}</span>
    </p>
  )
}

const TIPOS: (TipoDeAprovacao | 'todos')[] = ['todos', 'envio', 'integracao', 'revisao', 'sequencia']

function FiltrosDaFila({
  filtro,
  aoMudar,
  agentes,
}: {
  filtro: FiltroDaFila
  aoMudar: (filtro: FiltroDaFila) => void
  agentes: Agente[]
}) {
  return (
    <div className="flex flex-wrap gap-4">
      <label className="flex items-center gap-2 text-sm">
        <span className="rotulo">Tipo</span>
        <select
          className="campo w-auto"
          value={filtro.tipo}
          onChange={(e) => aoMudar({ ...filtro, tipo: e.target.value as FiltroDaFila['tipo'] })}
        >
          {TIPOS.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo === 'todos' ? 'Todos' : ROTULO_DO_TIPO[tipo]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <span className="rotulo">Agente</span>
        <select
          className="campo w-auto"
          value={filtro.agenteId}
          onChange={(e) => aoMudar({ ...filtro, agenteId: e.target.value })}
        >
          <option value="todos">Todos</option>
          {agentes.map((agente) => (
            <option key={agente.id} value={agente.id}>
              {agente.nome}
            </option>
          ))}
        </select>
      </label>
    </div>
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
