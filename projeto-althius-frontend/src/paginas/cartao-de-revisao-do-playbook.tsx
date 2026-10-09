// A revisão de uma seção do Playbook (CRM-09, ADR-0010), na fila /aprovacoes e no passo da Conversa em que o Scopus ou o
// Ethos a propôs: a seção, a versão vigente ao lado da proposta e, enquanto pendente, Aprovar e Recusar só para o
// Administrador; o Membro vê que só um Administrador decide. Decidida, fica só o registro: a versão gravada, a recusa
// ou o fim sem decisão. O conteúdo proposto não é guardado depois disso.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ComparacaoDoPlaybook } from '@/components/conteudo-do-playbook'
import { IconeAgente } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Button } from '@/components/ui/button'
import { useDados, useFonte, useFonteDoPlaybook } from '@/fonte/contexto'
import { SECOES_DO_PLAYBOOK, type ConteudoDoPlaybook, type IdDaSecaoDoPlaybook } from '@/fonte/playbook-tipos'
import { podeDecidir } from '@/fonte/regras'
import type { AprovacaoDeRevisaoDoPlaybook, Decisao, Papel } from '@/fonte/tipos'
import { cn, mensagemDeErro } from '@/lib/utils'

const nomeDaSecaoDoPlaybook = (secao: IdDaSecaoDoPlaybook) =>
  SECOES_DO_PLAYBOOK.find((s) => s.id === secao)?.nome ?? secao

/** O fim da revisão em uma linha: quem decidiu e o que aconteceu com o Playbook. */
function rotuloDaRevisaoDoPlaybook(
  aprovacao: AprovacaoDeRevisaoDoPlaybook,
  { quemDecidiu, agente }: { quemDecidiu?: string; agente?: string } = {},
): string {
  const por = quemDecidiu ? ` por ${quemDecidiu}` : ''
  switch (aprovacao.estado) {
    case 'pendente':
      return 'Aprovação pendente'
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
      return `Desatualizada · a seção mudou antes da decisão; peça ao ${agente ?? 'Agente'} uma proposta nova`
  }
}

export function CartaoDeRevisaoDoPlaybook({
  aprovacao,
  onde,
  compacto = false,
}: {
  aprovacao: AprovacaoDeRevisaoDoPlaybook
  onde: 'fila' | 'conversa'
  /** No passo da Conversa: menor, com o estado no topo. */
  compacto?: boolean
}) {
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const agente = agentes?.find((a) => a.id === aprovacao.agenteId)
  const { secao, proposto } = aprovacao.revisao

  return (
    <article
      aria-label={aprovacao.acao}
      className={cn('flex flex-col', compacto ? 'cartao w-full gap-3 border border-al-line p-4 text-al-ink' : 'cartao gap-4 p-6')}
    >
      <div className="flex flex-wrap items-center gap-3">
        {compacto && aprovacao.estado === 'pendente' && <span className="rotulo text-al-accent">Aprovação pendente</span>}
        {!compacto && agente && <IconeAgente especialidade={agente.especialidade.id} />}
        {!compacto && agente && (
          <Link to={`/agentes/${agente.id}`} className="font-normal underline-offset-4 hover:underline">
            {agente.nome}
          </Link>
        )}
        <Link to={`/configuracoes/playbook/${secao}`} className="rotulo underline-offset-4 hover:underline">
          Playbook · {nomeDaSecaoDoPlaybook(secao)}
        </Link>
        {!compacto && <span className="rotulo ml-auto">Pedido na Althius</span>}
      </div>
      <p className={compacto ? 'text-lg leading-snug font-normal' : 'text-xl font-normal'}>{aprovacao.acao}</p>
      <dl className={cn('grid grid-cols-[8rem_1fr] gap-x-6 gap-y-2', compacto && 'text-sm')}>
        <dt className="rotulo">Impacto</dt>
        <dd>{aprovacao.impacto}</dd>
        <dt className="rotulo">Por quê</dt>
        <dd className="text-al-muted">{aprovacao.justificativa}</dd>
      </dl>
      {aprovacao.estado === 'pendente' && proposto && <PropostaAoLadoDaVigente secao={secao} proposto={proposto} />}
      <DecisaoDaRevisao aprovacao={aprovacao} onde={onde} papel={workspace ? workspace.papel : undefined} agente={agente?.nome} />
    </article>
  )
}

/** A versão vigente vem do Playbook agora; enquanto a revisão está pendente, ela é a versão de que a proposta partiu. */
function PropostaAoLadoDaVigente({ secao, proposto }: { secao: IdDaSecaoDoPlaybook; proposto: ConteudoDoPlaybook }) {
  const fonteDoPlaybook = useFonteDoPlaybook()
  const atual = useDados(fonteDoPlaybook, (f) => f.secao(secao), [secao])
  return (
    <ComparacaoDoPlaybook
      secao={secao}
      vigente={atual?.vigente ? { versao: atual.vigente.versao, conteudo: atual.vigente.conteudo } : null}
      proposto={proposto}
    />
  )
}

function DecisaoDaRevisao({
  aprovacao,
  onde,
  papel,
  agente,
}: {
  aprovacao: AprovacaoDeRevisaoDoPlaybook
  onde: 'fila' | 'conversa'
  /** Indefinido enquanto o Workspace carrega: nem os botões nem o aviso aparecem antes de saber quem é. */
  papel: Papel | null | undefined
  agente?: string
}) {
  const fonte = useFonte()
  const dados = useDados((f) => f.participantesDoWorkspace(), [])
  const [erro, setErro] = useState('')
  const [decidindo, setDecidindo] = useState(false)

  if (aprovacao.estado !== 'pendente') {
    const quemDecidiu = dados?.participantes.find((p) => p.conta.id === aprovacao.revisao.decididaPor)?.conta.nome
    return (
      <span className={cn('rotulo', aprovacao.estado === 'aprovada' ? 'text-al-sucesso' : 'text-al-erro')}>
        {rotuloDaRevisaoDoPlaybook(aprovacao, { quemDecidiu, agente })}
      </span>
    )
  }
  if (papel === undefined) return null
  if (!podeDecidir('revisao-da-memoria', papel)) {
    return <p className="text-xs text-al-muted">Só um Administrador decide esta Aprovação.</p>
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
      <div className="flex gap-2">
        <Button disabled={decidindo} onClick={() => decidir('aprovada')} className="px-6 tracking-rotulo uppercase">
          Aprovar
        </Button>
        <Button
          variant="outline"
          disabled={decidindo}
          onClick={() => decidir('rejeitada')}
          className="px-6 tracking-rotulo uppercase"
        >
          Recusar
        </Button>
      </div>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
    </div>
  )
}
