import { ArrowLeft, Check, Clock, Mail, MessageCircle, Pause, Phone, Smartphone, ListTodo } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Button } from '@/components/ui/button'
import { useDadosDeContas, useDadosDeSequencias } from '@/fonte/contexto'
import type { CanalStep, StatusSequencia } from '@/fonte/sequencias-tipos'

interface Props {
  sequenciaId: string
}

export function DetalheSequencia({ sequenciaId }: Props) {
  const {
    dados: sequencia,
    carregando,
    erro,
    recarregar,
  } = useDadosDeSequencias((f) => f.sequencia(sequenciaId), [sequenciaId])

  const { dados: contas } = useDadosDeContas((f) => f.contas(), [])
  const { dados: contatos } = useDadosDeContas((f) => f.contatos(), [])

  if (carregando) {
    return <Carregando />
  }

  if (erro || !sequencia) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4 py-8">
        <Link
          to="/sequencias"
          className="inline-flex items-center gap-1.5 text-xs text-al-muted hover:text-al-ink tracking-rotulo uppercase"
        >
          <ArrowLeft className="size-4" /> Voltar para Sequências
        </Link>
        <p className="text-sm text-al-muted">
          {erro ? 'Não foi possível carregar a sequência.' : 'Sequência não encontrada.'}
        </p>
        {erro && (
          <Button
            type="button"
            variant="outline"
            onClick={recarregar}
            className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
          >
            Tentar de novo
          </Button>
        )}
      </div>
    )
  }

  const conta = contas?.find((c) => c.id === sequencia.contaId)
  const nomeConta = conta?.nome ?? sequencia.contaId
  const contatosMap = new Map(contatos?.map((c) => [c.id, c]) ?? [])

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* Navegação de volta */}
      <div>
        <Link
          to="/sequencias"
          className="inline-flex items-center gap-1.5 text-xs text-al-muted hover:text-al-ink tracking-rotulo uppercase"
        >
          <ArrowLeft className="size-4" /> Sequências / {nomeConta}
        </Link>
      </div>

      {/* Cabeçalho da Sequência */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-al-line pb-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h2 className="titulo-secao text-2xl font-light uppercase text-al-ink">
              {nomeConta} <span className="text-sm lowercase text-al-muted tracking-normal">sequência</span>
            </h2>
            <SeloStatus status={sequencia.status} />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-al-muted">
            <span>
              {sequencia.totalParticipantes}{' '}
              {sequencia.totalParticipantes === 1 ? 'contato participante' : 'contatos participantes'}
            </span>
            <span>·</span>
            <span>{sequencia.steps.length} steps ordenados</span>
            {conta?.dominio && (
              <>
                <span>·</span>
                <span>{conta.dominio}</span>
              </>
            )}
            <span>·</span>
            <Link to="/contas" className="text-al-ink underline underline-offset-2 hover:text-al-accent">
              Ver Conta-alvo
            </Link>
          </div>
        </div>
      </div>

      {/* Regra de Pause em destaque */}
      <div
        className={`flex items-start gap-3.5 border p-4 ${
          sequencia.status === 'pausada'
            ? 'border-al-atencao/60 bg-al-atencao/10 text-al-ink'
            : sequencia.status === 'reuniao'
              ? 'border-al-accent/60 bg-al-accent/10 text-al-ink'
              : 'border-al-line bg-al-surface text-al-ink'
        }`}
      >
        <Pause className="size-5 shrink-0 text-al-atencao mt-0.5" />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-rotulo uppercase text-al-muted">
            Regra de pause na Conta-alvo
          </span>
          <p className="text-sm font-medium leading-relaxed">
            {sequencia.status === 'pausada' && sequencia.motivoPause
              ? `Sequência pausada: ${sequencia.motivoPause}. Toda a sequência da ${nomeConta} está parada — nenhum contato recebe novos steps até análise humana.`
              : sequencia.regraDePause}
          </p>
          <span className="text-xs text-al-muted">
            Regra do produto: qualquer resposta de qualquer Contato (positiva ou negativa) pausa a sequência inteira da empresa.
          </span>
        </div>
      </div>

      {/* Visão de Participantes e Janela */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Participantes */}
        <div className="border border-al-line bg-al-surface p-4 flex flex-col gap-3">
          <span className="rotulo text-xs text-al-muted">
            Participantes ({sequencia.participantesIds.length})
          </span>
          <div className="flex flex-wrap gap-2">
            {sequencia.participantesIds.map((id) => {
              const contato = contatosMap.get(id)
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 border border-al-line bg-al-bg px-2.5 py-1 text-xs"
                >
                  <span className="font-medium text-al-ink">{contato?.nome ?? id}</span>
                  {contato?.cargo && <span className="text-al-muted">({contato.cargo})</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Janela de Envio Padrão */}
        <div className="border border-al-line bg-al-surface p-4 flex flex-col gap-3">
          <span className="rotulo text-xs text-al-muted">Janela de Envio Padrão</span>
          <div className="flex items-center gap-2 text-sm text-al-ink">
            <Clock className="size-4 text-al-muted" />
            <span>
              Segunda a sexta, dias úteis · {sequencia.janelaPadrao.de} às {sequencia.janelaPadrao.ate}
            </span>
          </div>
          <span className="text-xs text-al-muted">Horário comercial de Brasília</span>
        </div>
      </div>

      {/* Lista ordenada de Steps */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="rotulo text-xs text-al-muted">
            Timeline de Abordagem ({sequencia.steps.length} steps)
          </span>
          <span className="text-xs text-al-muted">
            Passo atual: {Math.min(sequencia.passoAtual + 1, sequencia.steps.length)} de {sequencia.steps.length}
          </span>
        </div>

        <ol className="flex flex-col divide-y divide-al-line border border-al-line bg-al-surface">
          {sequencia.steps.map((step, idx) => {
            const contato = contatosMap.get(step.contatoId)
            const concluido = idx < sequencia.passoAtual
            const ehAtual = idx === sequencia.passoAtual && sequencia.status === 'ativa'

            return (
              <li key={step.id} className="p-4 flex flex-col gap-2 hover:bg-al-bg/40 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`size-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                        concluido
                          ? 'border border-al-sucesso text-al-sucesso bg-transparent'
                          : ehAtual
                            ? 'bg-al-accent text-al-on-accent'
                            : 'border border-al-line text-al-muted bg-al-bg'
                      }`}
                    >
                      {concluido ? <Check className="size-3.5" /> : idx + 1}
                    </span>
                    <IconeCanal canal={step.canal} />
                    <span className="text-sm font-medium text-al-ink">{step.titulo}</span>
                  </div>

                  <span className="text-xs text-al-muted">
                    {idx === 0
                      ? 'Início imediato'
                      : `Aguardar ${step.delayDiasUteis} ${step.delayDiasUteis === 1 ? 'dia útil' : 'dias úteis'}`}
                  </span>
                </div>

                <div className="ml-9 flex flex-col gap-1 text-xs text-al-muted">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                      Destinatário: <strong className="font-medium text-al-ink">{contato?.nome ?? step.contatoId}</strong>
                    </span>
                    {step.objetivo && (
                      <>
                        <span>·</span>
                        <span>Objetivo: {step.objetivo}</span>
                      </>
                    )}
                  </div>

                  {step.assunto && (
                    <p className="mt-1 text-xs text-al-ink/80 italic">
                      Assunto: {step.assunto}
                    </p>
                  )}
                  {step.corpo && (
                    <p className="mt-1 text-xs text-al-muted line-clamp-2">
                      {step.corpo}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

export function SeloStatus({ status }: { status: StatusSequencia }) {
  switch (status) {
    case 'ativa':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-al-line text-xs font-normal text-al-sucesso">
          <span className="size-1.5 rounded-full bg-al-sucesso" />
          Ativa
        </span>
      )
    case 'pausada':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-al-line text-xs font-normal text-al-atencao">
          <span className="size-1.5 rounded-full bg-al-atencao" />
          Pausada
        </span>
      )
    case 'reuniao':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-al-line text-xs font-normal text-al-accent">
          <span className="size-1.5 rounded-full bg-al-accent" />
          Reunião
        </span>
      )
    case 'esgotada':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-al-line text-xs font-normal text-al-muted">
          <span className="size-1.5 rounded-full bg-al-muted" />
          Esgotada
        </span>
      )
  }
}

export function IconeCanal({ canal }: { canal: CanalStep }) {
  switch (canal) {
    case 'email':
      return <Mail className="size-4 text-al-muted" aria-label="E-mail" />
    case 'linkedin':
      return (
        <svg
          viewBox="0 0 24 24"
          role="img"
          aria-label="LinkedIn"
          className="size-4 fill-none stroke-current text-al-muted"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>LinkedIn</title>
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6ZM2 9h4v12H2z" />
          <circle cx="4" cy="4" r="2" />
        </svg>
      )
    case 'whatsapp':
      return <MessageCircle className="size-4 text-al-muted" aria-label="WhatsApp" />
    case 'sms':
      return <Smartphone className="size-4 text-al-muted" aria-label="SMS" />
    case 'ligacao':
      return <Phone className="size-4 text-al-muted" aria-label="Ligação" />
    case 'tarefa':
      return <ListTodo className="size-4 text-al-muted" aria-label="Tarefa" />
  }
}

