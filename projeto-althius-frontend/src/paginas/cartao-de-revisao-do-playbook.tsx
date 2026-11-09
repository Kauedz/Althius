// A revisão de uma seção do Playbook (CRM-09, ADR-0010), na fila /aprovacoes e no passo da Conversa em que o Scopus ou o
// Ethos a propôs. O Playbook foi substituído pelo Contexto da empresa (contexto-da-empresa 07): o cartão fica só como
// registro (a seção, o pedido, o fim da revisão e quem decidiu). A revisão ainda pendente não é mais decidida: ela vence
// sozinha, e quem quiser mudar o que os Agentes sabem vai ao Contexto da empresa.
import { Link } from 'react-router-dom'
import { IconeAgente } from '@/components/marca'
import { useDados } from '@/fonte/contexto'
import { SECOES_DO_PLAYBOOK, type IdDaSecaoDoPlaybook } from '@/fonte/playbook-tipos'
import type { AprovacaoDeRevisaoDoPlaybook } from '@/fonte/tipos'
import { cn } from '@/lib/utils'

const nomeDaSecaoDoPlaybook = (secao: IdDaSecaoDoPlaybook) =>
  SECOES_DO_PLAYBOOK.find((s) => s.id === secao)?.nome ?? secao

/** O fim da revisão em uma linha: quem decidiu e o que aconteceu com o Playbook. */
function rotuloDaRevisaoDoPlaybook(
  aprovacao: AprovacaoDeRevisaoDoPlaybook,
  { quemDecidiu }: { quemDecidiu?: string } = {},
): string {
  const por = quemDecidiu ? ` por ${quemDecidiu}` : ''
  switch (aprovacao.estado) {
    case 'pendente':
      return 'Não pode mais ser decidida · o Playbook foi substituído pelo Contexto da empresa'
    case 'aprovada':
      return aprovacao.revisao.versaoGravada
        ? `Aprovada${por} · versão ${aprovacao.revisao.versaoGravada} gravada no Playbook`
        : `Aprovada${por}`
    case 'rejeitada':
      return `Recusada${por} · o Playbook não mudou`
    case 'expirada':
      return 'Expirada · ninguém decidiu em 7 dias, e o Playbook não mudou'
    case 'cancelada':
      return 'Cancelada · o Playbook não mudou'
    case 'desatualizada':
      return 'Desatualizada · a seção mudou antes da decisão'
  }
}

export function CartaoDeRevisaoDoPlaybook({
  aprovacao,
  compacto = false,
}: {
  aprovacao: AprovacaoDeRevisaoDoPlaybook
  onde: 'fila' | 'conversa'
  /** No passo da Conversa: menor. */
  compacto?: boolean
}) {
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const dados = useDados((f) => f.participantesDoWorkspace(), [])
  const agente = agentes?.find((a) => a.id === aprovacao.agenteId)
  const quemDecidiu = dados?.participantes.find((p) => p.conta.id === aprovacao.revisao.decididaPor)?.conta.nome
  const pendente = aprovacao.estado === 'pendente'

  return (
    <article
      aria-label={aprovacao.acao}
      className={cn('flex flex-col', compacto ? 'cartao w-full gap-3 border border-al-line p-4 text-al-ink' : 'cartao gap-4 p-6')}
    >
      <div className="flex flex-wrap items-center gap-3">
        {!compacto && agente && <IconeAgente especialidade={agente.especialidade.id} />}
        {!compacto && agente && (
          <Link to={`/agentes/${agente.id}`} className="font-normal underline-offset-4 hover:underline">
            {agente.nome}
          </Link>
        )}
        <span className="rotulo">Playbook · {nomeDaSecaoDoPlaybook(aprovacao.revisao.secao)}</span>
        {!compacto && <span className="rotulo ml-auto">Pedido na Althius</span>}
      </div>
      <p className={compacto ? 'text-lg leading-snug font-normal' : 'text-xl font-normal'}>{aprovacao.acao}</p>
      <dl className={cn('grid grid-cols-[8rem_1fr] gap-x-6 gap-y-2', compacto && 'text-sm')}>
        <dt className="rotulo">Impacto</dt>
        <dd>{aprovacao.impacto}</dd>
        <dt className="rotulo">Por quê</dt>
        <dd className="text-al-muted">{aprovacao.justificativa}</dd>
      </dl>
      <span className={cn('rotulo', aprovacao.estado === 'aprovada' ? 'text-al-sucesso' : pendente ? 'text-al-muted' : 'text-al-erro')}>
        {rotuloDaRevisaoDoPlaybook(aprovacao, { quemDecidiu })}
      </span>
      {pendente && (
        <p className="text-sm text-al-muted">
          Para mudar o que os Agentes sabem, um Administrador edita o{' '}
          <Link to="/configuracoes/contexto" className="text-al-ink underline underline-offset-2">
            Contexto da empresa
          </Link>
          .
        </p>
      )}
    </article>
  )
}
