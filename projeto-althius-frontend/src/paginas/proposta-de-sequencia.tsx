// A Sequência de E-mail que o Rhetor propôs para uma Conta-alvo (cadencia-pela-ia 02), na fila /aprovacoes e no passo da
// Conversa em que ele a propôs: a Conta-alvo, os Contatos e os passos (o dia, o assunto e o corpo, com as variáveis em
// destaque) e, enquanto pendente, Aprovar e Recusar só para o Vendedor responsável pela Conta (ADR-0009). Os outros veem
// a Conta e as quantidades: o assunto e o corpo são só dele. Aprovada, a Sequência existe sem envio, com o link para ela:
// os e-mails só saem depois do "Ativar envios". O estado vem da fila, então recarregar a Conversa mostra o mesmo.
import { ArrowRight } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconeAgente } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Button } from '@/components/ui/button'
import { useAmbiente, useDados, useFonte } from '@/fonte/contexto'
import { podeDecidir } from '@/fonte/regras'
import type { AprovacaoDeSequencia, Decisao, PassoDaSequenciaProposta } from '@/fonte/tipos'
import { cn, mensagemDeErro } from '@/lib/utils'
import { DecidirEmAprovacoes, useSomenteLeituraDoAgente } from '@/paginas/secoes/somente-leitura'

const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** O texto com as variáveis ({{primeiro_nome}}, {{empresa}}…) em destaque. */
export function TextoComVariaveis({ texto }: { texto: string }) {
  const partes = texto.split(/(\{\{\s*[A-Za-z_.]+\s*\}\})/)
  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <span key={i} data-variavel className="rounded bg-al-accent/10 px-1 font-normal text-al-accent">
            {parte}
          </span>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        ),
      )}
    </>
  )
}

/** O dia útil de cada passo, somando as esperas desde o primeiro (dia útil 0). */
function diasDosPassos(passos: PassoDaSequenciaProposta[]): number[] {
  let dia = 0
  return passos.map((p, i) => (dia = i === 0 ? p.esperaEmDias : dia + p.esperaEmDias))
}

/** O fim da proposta em uma linha. */
function rotuloDoFim(aprovacao: AprovacaoDeSequencia): string {
  switch (aprovacao.estado) {
    case 'pendente':
      return 'Aprovação pendente'
    case 'aprovada':
      return 'Sequência criada, envios não ativados'
    case 'rejeitada':
      return aprovacao.sequencia.motivo
        ? `Recusada pelo sistema · ${aprovacao.sequencia.motivo}. Nada foi criado.`
        : 'Recusada · nada foi criado'
    case 'expirada':
      return 'Expirada · ninguém decidiu em 7 dias, e nada foi criado'
    case 'cancelada':
      return 'Cancelada · nada foi criado'
  }
}

export function PropostaDeSequencia({
  aprovacao,
  onde,
  compacto = false,
}: {
  aprovacao: AprovacaoDeSequencia
  onde: 'fila' | 'conversa'
  /** No passo da Conversa: menor, com o estado no topo. */
  compacto?: boolean
}) {
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const agente = agentes?.find((a) => a.id === aprovacao.agenteId)
  const { sequencia } = aprovacao
  const pendente = aprovacao.estado === 'pendente'

  return (
    <article
      aria-label={aprovacao.acao}
      className={cn('flex flex-col', compacto ? 'cartao w-full gap-3 border border-al-line p-4 text-al-ink' : 'cartao gap-4 p-6')}
    >
      <div className="flex flex-wrap items-center gap-3">
        {compacto && pendente && <span className="rotulo text-al-accent">Aprovação pendente</span>}
        {!compacto && agente && <IconeAgente especialidade={agente.especialidade.id} />}
        {!compacto && agente && (
          <Link to={`/agentes/${agente.id}`} className="font-normal underline-offset-4 hover:underline">
            {agente.nome}
          </Link>
        )}
        <span className="rotulo">Sequência de E-mail</span>
        {!compacto && <span className="rotulo ml-auto">Pedido na Althius</span>}
      </div>
      <p className={compacto ? 'text-lg leading-snug font-normal' : 'text-xl font-normal'}>{aprovacao.acao}</p>
      <dl className={cn('grid grid-cols-[8rem_1fr] gap-x-6 gap-y-2', compacto && 'text-sm')}>
        <dt className="rotulo">Conta-alvo</dt>
        <dd>
          <Link to={`/contas/${sequencia.contaId}`} className="font-normal underline-offset-4 hover:underline">
            {sequencia.contaNome || 'Ver a Conta-alvo'}
          </Link>
        </dd>
        <dt className="rotulo">Contatos</dt>
        <dd>
          {sequencia.contatos
            ? sequencia.contatos.map((c) => (c.cargo ? `${c.nome} (${c.cargo})` : c.nome)).join(', ')
            : contar(sequencia.totalContatos, 'Contato', 'Contatos')}
        </dd>
        <dt className="rotulo">Passos</dt>
        <dd>{contar(sequencia.totalPassos, 'passo de E-mail', 'passos de E-mail')}</dd>
        <dt className="rotulo">Impacto</dt>
        <dd>{aprovacao.impacto}</dd>
        {aprovacao.justificativa && (
          <>
            <dt className="rotulo">Por quê</dt>
            <dd className="text-al-muted">{aprovacao.justificativa}</dd>
          </>
        )}
      </dl>
      {pendente && sequencia.passos && <PassosPropostos passos={sequencia.passos} />}
      {pendente && !sequencia.passos && (
        <p className="text-xs text-al-muted">O assunto e o corpo dos e-mails só o Vendedor responsável pela Conta-alvo vê.</p>
      )}
      <DecisaoDaProposta aprovacao={aprovacao} onde={onde} />
    </article>
  )
}

function PassosPropostos({ passos }: { passos: PassoDaSequenciaProposta[] }) {
  const dias = diasDosPassos(passos)
  return (
    <ol aria-label="Passos propostos" className="flex flex-col gap-3">
      {passos.map((passo, i) => (
        <li key={i} className="flex flex-col gap-1 rounded-xl border border-al-line bg-al-surface p-4">
          <span className="rotulo text-al-muted">
            E-mail {i + 1} · dia útil {dias[i]}
            {i > 0 && ` (${contar(passo.esperaEmDias, 'dia útil', 'dias úteis')} depois do anterior)`}
          </span>
          <p className="font-normal">
            <TextoComVariaveis texto={passo.assunto} />
          </p>
          <p className="text-sm whitespace-pre-line text-al-muted">
            <TextoComVariaveis texto={passo.corpo} />
          </p>
        </li>
      ))}
    </ol>
  )
}

function DecisaoDaProposta({ aprovacao, onde }: { aprovacao: AprovacaoDeSequencia; onde: 'fila' | 'conversa' }) {
  const fonte = useFonte()
  const { modo } = useAmbiente()
  const workspace = useDados((f) => f.workspace(), [])
  const [erro, setErro] = useState('')
  const [decidindo, setDecidindo] = useState(false)
  const somenteLeitura = useSomenteLeituraDoAgente()
  const { sequencia } = aprovacao

  if (aprovacao.estado === 'aprovada') {
    return (
      <div className="flex flex-col gap-2">
        <span className="rotulo text-al-sucesso">{rotuloDoFim(aprovacao)}</span>
        {sequencia.sequenciaCriadaId && (
          <Link
            to={`/sequencias/${sequencia.sequenciaCriadaId}`}
            className="inline-flex items-center gap-1.5 self-start text-sm font-normal underline underline-offset-4 hover:text-al-accent"
          >
            Ver a Sequência e ativar os envios <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        )}
      </div>
    )
  }
  if (aprovacao.estado !== 'pendente') {
    return <span className="rotulo text-al-erro">{rotuloDoFim(aprovacao)}</span>
  }
  if (somenteLeitura) return <DecidirEmAprovacoes />
  // Indefinido enquanto o Workspace carrega: nem os botões nem o aviso aparecem antes de saber quem é.
  if (workspace === undefined) return null
  if (!podeDecidir('sequencia', workspace?.papel, modo, sequencia.responsavel)) {
    return <p className="text-xs text-al-muted">Só o Vendedor responsável pela Conta-alvo decide esta Sequência.</p>
  }

  async function decidir(decisao: Decisao) {
    setErro('')
    setDecidindo(true)
    try {
      await fonte.decidirAprovacao(aprovacao.id, decisao, onde)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setDecidindo(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-al-muted">
        Aprovar cria a Sequência sem enviar nada: os e-mails só saem depois que você clicar em "Ativar envios".
      </p>
      <div className="flex gap-2">
        <Button disabled={decidindo} onClick={() => decidir('aprovada')} className="px-6 tracking-[0.04em]">
          Aprovar
        </Button>
        <Button variant="outline" disabled={decidindo} onClick={() => decidir('rejeitada')} className="px-6 tracking-[0.04em]">
          Recusar
        </Button>
      </div>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
    </div>
  )
}
