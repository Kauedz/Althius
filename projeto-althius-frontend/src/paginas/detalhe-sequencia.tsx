import { useState } from 'react'
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ListTodo,
  Mail,
  MessageCircle,
  Pause,
  Phone,
  Plus,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Button } from '@/components/ui/button'
import { useDadosDeContas, useDadosDeSequencias, useFonteDeSequencias } from '@/fonte/contexto'
import type { CanalStep, StatusSequencia, StepSequencia } from '@/fonte/sequencias-tipos'

interface Props {
  sequenciaId: string
}

export const CANAIS_CONFIG: Record<
  CanalStep,
  { rotulo: string; titulo: string }
> = {
  email: { rotulo: 'E-mail', titulo: 'E-mail' },
  linkedin: { rotulo: 'LinkedIn', titulo: 'Convite no LinkedIn' },
  whatsapp: { rotulo: 'WhatsApp', titulo: 'Mensagem no WhatsApp' },
  sms: { rotulo: 'SMS', titulo: 'SMS' },
  ligacao: { rotulo: 'Ligação', titulo: 'Ligação' },
  tarefa: { rotulo: 'Tarefa', titulo: 'Tarefa' },
}

const HORARIOS_DISPONIVEIS = [
  '07:00',
  '08:00',
  '08:30',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '14:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
]

function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase()
}

export function DetalheSequencia({ sequenciaId }: Props) {
  const fonteDeSequencias = useFonteDeSequencias()
  const {
    dados: sequencia,
    carregando,
    erro,
    recarregar,
  } = useDadosDeSequencias((f) => f.sequencia(sequenciaId), [sequenciaId])

  const { dados: contas } = useDadosDeContas((f) => f.contas(), [])
  const { dados: contatos } = useDadosDeContas((f) => f.contatos(), [])

  const [stepSelecionadoId, setStepSelecionadoId] = useState<string | null>(null)
  const [menuAdicionarAberto, setMenuAdicionarAberto] = useState(false)
  const [edicoesLocais, setEdicoesLocais] = useState<Record<string, Partial<StepSequencia>>>({})

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
  const todosContatosDaConta = contatos?.filter((c) => c.contaId === sequencia.contaId) ?? []
  const contatosRestantes = todosContatosDaConta.filter(
    (c) => !sequencia.participantesIds.includes(c.id),
  )

  // Mescla passos com edições locais imediatas
  const stepsMesclados = sequencia.steps.map((s) => ({
    ...s,
    ...(edicoesLocais[s.id] ?? {}),
  }))

  // Step ativo selecionado (ou o primeiro da lista)
  const stepAtivo =
    stepsMesclados.find((s) => s.id === stepSelecionadoId) ??
    stepsMesclados[Math.min(sequencia.passoAtual, Math.max(0, stepsMesclados.length - 1))] ??
    stepsMesclados[0]

  const indiceStepAtivo = stepsMesclados.findIndex((s) => s.id === stepAtivo?.id)

  const diasUteisTotais = stepsMesclados.reduce(
    (total, s, idx) => total + (idx > 0 ? s.delayDiasUteis : 0),
    0,
  )

  // --- Handlers de Atualização via Fonte ---
  async function atualizarDoc(patch: Parameters<typeof fonteDeSequencias.atualizarDocumento>[1]) {
    await fonteDeSequencias.atualizarDocumento(sequencia!.id, patch)
  }

  async function handleSimularResposta() {
    const idx = Math.max(0, sequencia!.passoAtual - 1)
    const stepTocado = sequencia!.steps[idx] ?? sequencia!.steps[0]
    const contato = stepTocado ? contatosMap.get(stepTocado.contatoId) : null
    const nomeResp = contato?.nome ?? 'Contato'
    const canalResp = stepTocado ? CANAIS_CONFIG[stepTocado.canal].rotulo : 'E-mail'

    await atualizarDoc({
      status: 'pausada',
      motivoPause: `${nomeResp} respondeu via ${canalResp} hoje.`,
    })
  }

  async function handleRetomar() {
    await atualizarDoc({
      status: 'ativa',
      motivoPause: undefined,
    })
  }

  async function handleMarcarReuniao() {
    await atualizarDoc({
      status: 'reuniao',
      motivoPause: 'Reunião marcada com a Conta-alvo.',
    })
  }

  async function handleRemoverParticipante(contatoId: string) {
    if (sequencia!.participantesIds.length <= 1) return
    const novosParticipantes = sequencia!.participantesIds.filter((id) => id !== contatoId)
    const substituto = novosParticipantes[0]
    const novosSteps = sequencia!.steps.map((s) =>
      s.contatoId === contatoId ? { ...s, contatoId: substituto } : s,
    )
    await atualizarDoc({
      participantesIds: novosParticipantes,
      steps: novosSteps,
    })
  }

  async function handleAdicionarParticipante(novoId: string) {
    if (!novoId || sequencia!.participantesIds.includes(novoId)) return
    await atualizarDoc({
      participantesIds: [...sequencia!.participantesIds, novoId],
    })
  }

  async function handleAlterarJanelaPadrao(campo: 'de' | 'ate', valor: string) {
    await atualizarDoc({
      janelaPadrao: {
        ...sequencia!.janelaPadrao,
        [campo]: valor,
      },
    })
  }

  async function handleSalvarStep(modificacoes: Partial<StepSequencia>) {
    if (!stepAtivo) return
    // Atualização síncrona local
    setEdicoesLocais((prev) => ({
      ...prev,
      [stepAtivo.id]: { ...prev[stepAtivo.id], ...modificacoes },
    }))

    const novosSteps = sequencia!.steps.map((s) =>
      s.id === stepAtivo.id ? { ...s, ...modificacoes } : s,
    )
    await atualizarDoc({ steps: novosSteps })
  }

  async function handleMoverStep(direcao: -1 | 1) {
    if (!stepAtivo) return
    const novoIndice = indiceStepAtivo + direcao
    if (novoIndice < 0 || novoIndice >= sequencia!.steps.length) return

    const novosSteps = [...sequencia!.steps]
    const [removido] = novosSteps.splice(indiceStepAtivo, 1)
    novosSteps.splice(novoIndice, 0, removido)

    const reordenados = novosSteps.map((s, idx) => ({ ...s, ordem: idx + 1 }))
    await atualizarDoc({ steps: reordenados })
  }

  async function handleExcluirStep() {
    if (!stepAtivo || sequencia!.steps.length <= 1) return
    const novosSteps = sequencia!.steps
      .filter((s) => s.id !== stepAtivo.id)
      .map((s, idx) => ({ ...s, ordem: idx + 1 }))

    const proximoId = novosSteps[Math.max(0, indiceStepAtivo - 1)]?.id ?? novosSteps[0]?.id
    setStepSelecionadoId(proximoId)
    await atualizarDoc({ steps: novosSteps })
  }

  async function handleAdicionarStep(canal: CanalStep) {
    const lead = sequencia!.participantesIds[0] ?? ''
    const novoId = `step-${Date.now()}`
    const novoStep: StepSequencia = {
      id: novoId,
      ordem: sequencia!.steps.length + 1,
      canal,
      contatoId: lead,
      delayDiasUteis: sequencia!.steps.length === 0 ? 0 : 2,
      titulo: CANAIS_CONFIG[canal].titulo,
      corpo: '',
      objetivo: '',
    }
    setStepSelecionadoId(novoId)
    setMenuAdicionarAberto(false)
    await atualizarDoc({ steps: [...sequencia!.steps, novoStep] })
  }

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

      {/* Cabeçalho da Sequência (alinhado ao mock aprovado) */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-al-line pb-6">
        <div className="flex items-start gap-4">
          {/* Logo da Conta-alvo ou Fallback */}
          <div className="size-11 shrink-0 border border-al-line bg-al-surface flex items-center justify-center font-heading text-lg font-light text-al-ink">
            {conta?.logo ? (
              <img src={conta.logo} alt="" className="size-8 object-contain" />
            ) : (
              iniciais(nomeConta)
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <h2 className="titulo-secao text-2xl font-light uppercase text-al-ink">
                {nomeConta}{' '}
                <small className="text-sm lowercase text-al-muted tracking-normal">sequência</small>
              </h2>
              <SeloStatus status={sequencia.status} />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-al-muted">
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
              <span>Escrita por Rhetor · editada por Marina Costa</span>
              <span>·</span>
              <Link
                to={`/contas/${sequencia.contaId}`}
                className="text-al-ink underline underline-offset-2 hover:text-al-accent"
              >
                Ver Conta-alvo
              </Link>
            </div>
          </div>
        </div>

        {/* Ações do cabeçalho */}
        <div className="flex items-center gap-2">
          {sequencia.status === 'ativa' && (
            <Button
              type="button"
              variant="outline"
              onClick={handleSimularResposta}
              title="Demonstração"
              className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
            >
              <Smartphone className="size-3.5 mr-1 text-al-muted" />
              Simular resposta
            </Button>
          )}
        </div>
      </div>

      {/* Regra de Pause na Conta-alvo */}
      <div
        className={`flex items-start justify-between gap-4 border p-4 transition-colors ${
          sequencia.status === 'pausada'
            ? 'border-al-atencao/70 bg-al-atencao/10 text-al-ink'
            : sequencia.status === 'reuniao'
              ? 'border-al-accent/70 bg-al-accent/10 text-al-ink'
              : 'border-al-line bg-al-surface text-al-ink'
        }`}
      >
        <div className="flex items-start gap-3">
          {sequencia.status === 'reuniao' ? (
            <Calendar className="size-5 shrink-0 text-al-accent mt-0.5" />
          ) : (
            <Pause className="size-5 shrink-0 text-al-atencao mt-0.5" />
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-rotulo uppercase text-al-muted">
              Regra de pause na Conta-alvo
            </span>
            <p className="text-sm font-medium leading-relaxed">
              {sequencia.status === 'pausada'
                ? `Sequência pausada: ${sequencia.motivoPause ?? 'Resposta de contato recebida'}. Toda a sequência da ${nomeConta} está parada — nenhum Contato recebe o próximo step até alguém analisar.`
                : sequencia.status === 'reuniao'
                  ? `Reunião marcada: ${sequencia.motivoPause ?? 'Reunião marcada com a Conta-alvo.'} A sequência da ${nomeConta} foi encerrada para todos os Contatos.`
                  : sequencia.regraDePause}
            </p>
            <span className="text-xs text-al-muted">
              Regra do produto: qualquer resposta de qualquer Contato (positiva ou negativa) pausa a sequência inteira da empresa.
            </span>
          </div>
        </div>

        {/* Ações da regra de pause quando pausada */}
        {sequencia.status === 'pausada' && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRetomar}
              className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
            >
              Retomar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleMarcarReuniao}
              className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
            >
              Marcar reunião
            </Button>
          </div>
        )}
      </div>

      {/* Configurações da Sequência (seq-settings): Participantes e Janela padrão */}
      <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] border border-al-line bg-al-surface divide-y md:divide-y-0 md:divide-x divide-al-line">
        {/* Participantes */}
        <div className="p-3.5 flex flex-col gap-2.5">
          <span className="rotulo text-[0.625rem] text-al-muted tracking-rotulo uppercase">
            Participantes · {sequencia.participantesIds.length} de {todosContatosDaConta.length} Contatos
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {sequencia.participantesIds.map((id) => {
              const contato = contatosMap.get(id)
              const nome = contato?.nome ?? id
              return (
                <span
                  key={id}
                  className="inline-flex h-7.5 items-center gap-1.5 border border-al-line bg-al-bg px-2 py-0.5 text-xs"
                >
                  <span className="size-4.5 rounded-full bg-al-line text-[0.5625rem] font-medium flex items-center justify-center text-al-ink">
                    {iniciais(nome)}
                  </span>
                  <span className="font-medium text-al-ink">{nome}</span>
                  {contato?.persona && (
                    <small className="text-[0.6875rem] text-al-muted">· {contato.persona}</small>
                  )}
                  {sequencia.participantesIds.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoverParticipante(id)}
                      aria-label={`Tirar ${nome}`}
                      className="ml-1 text-al-muted hover:text-al-ink"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              )
            })}

            {contatosRestantes.length > 0 && (
              <select
                aria-label="Adicionar Contato"
                value=""
                onChange={(e) => handleAdicionarParticipante(e.target.value)}
                className="h-7.5 border border-dashed border-al-line bg-transparent px-2 text-xs text-al-muted hover:border-al-ink hover:text-al-ink cursor-pointer outline-none"
              >
                <option value="" disabled>
                  + Adicionar Contato
                </option>
                {contatosRestantes.map((c) => (
                  <option key={c.id} value={c.id} className="bg-al-surface text-al-ink">
                    {c.nome} {c.persona ? `· ${c.persona}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Janela de envio padrão */}
        <div className="p-3.5 flex flex-col gap-2.5">
          <span className="rotulo text-[0.625rem] text-al-muted tracking-rotulo uppercase">
            Janela padrão
          </span>
          <div className="flex flex-wrap items-center gap-2 text-xs text-al-ink">
            <span className="text-al-muted">Seg a sex, dias úteis ·</span>
            <select
              aria-label="Horário inicial"
              value={sequencia.janelaPadrao.de}
              onChange={(e) => handleAlterarJanelaPadrao('de', e.target.value)}
              className="h-7 border border-al-line bg-al-bg px-2 text-xs text-al-ink outline-none"
            >
              {HORARIOS_DISPONIVEIS.map((h) => (
                <option key={`de-${h}`} value={h} className="bg-al-surface">
                  {h}
                </option>
              ))}
            </select>
            <span className="text-al-muted">até</span>
            <select
              aria-label="Horário final"
              value={sequencia.janelaPadrao.ate}
              onChange={(e) => handleAlterarJanelaPadrao('ate', e.target.value)}
              className="h-7 border border-al-line bg-al-bg px-2 text-xs text-al-ink outline-none"
            >
              {HORARIOS_DISPONIVEIS.map((h) => (
                <option key={`ate-${h}`} value={h} className="bg-al-surface">
                  {h}
                </option>
              ))}
            </select>
            <span className="text-[0.6875rem] text-al-muted">horário de Brasília</span>
          </div>
        </div>
      </div>

      {/* Corpo da Sequência (seq-body): Timeline (340px) + Editor de Step */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] border border-al-line bg-al-surface min-h-[600px]">
        {/* Coluna 1: Timeline lateral (seq-timeline) */}
        <div className="border-b lg:border-b-0 lg:border-r border-al-line p-3.5 flex flex-col gap-3">
          <div className="flex items-center justify-between text-[0.625rem] font-normal uppercase tracking-rotulo text-al-muted px-1">
            <span>
              {stepsMesclados.length} steps · {diasUteisTotais} {diasUteisTotais === 1 ? 'dia útil' : 'dias úteis'}
            </span>
          </div>

          <ol className="flex flex-col gap-1 list-none p-0 m-0">
            {stepsMesclados.map((step, idx) => {
              const selecionado = step.id === stepAtivo?.id
              const concluido = idx < sequencia.passoAtual
              const ehAtual = idx === sequencia.passoAtual && sequencia.status === 'ativa'
              const contato = contatosMap.get(step.contatoId)
              const nomeContato = contato?.nome ?? step.contatoId

              return (
                <li key={step.id} className="flex flex-col">
                  {idx > 0 && (
                    <div className="flex items-center gap-2 py-1.5 px-2.5 text-[0.6875rem] text-al-muted">
                      <Clock className="size-3 text-al-muted" />
                      <span>
                        Aguardar {step.delayDiasUteis}{' '}
                        {step.delayDiasUteis === 1 ? 'dia útil' : 'dias úteis'}
                        {step.janela && ` · ${step.janela.de}–${step.janela.ate}`}
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setStepSelecionadoId(step.id)}
                    className={`flex w-full items-center gap-2.5 p-2 text-left border transition-all text-xs ${
                      selecionado
                        ? 'border-al-line bg-al-bg shadow-sm'
                        : 'border-transparent hover:bg-al-bg/50'
                    }`}
                  >
                    {/* Badge numérica ou checkmark */}
                    <span
                      className={`size-5 shrink-0 rounded-full flex items-center justify-center text-[0.6875rem] font-medium tabular-nums ${
                        concluido
                          ? 'border border-al-sucesso text-al-sucesso bg-transparent'
                          : ehAtual
                            ? 'bg-al-accent text-al-on-accent font-semibold'
                            : selecionado
                              ? 'bg-al-ink text-al-bg font-semibold'
                              : 'bg-al-line text-al-ink'
                      }`}
                    >
                      {concluido ? <Check className="size-3 text-al-sucesso" /> : idx + 1}
                    </span>

                    {/* Título e delay */}
                    <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                      <span
                        className={`truncate font-normal ${
                          concluido ? 'text-al-muted line-through' : 'text-al-ink'
                        }`}
                      >
                        {step.titulo}
                      </span>
                      <span className="text-[0.6875rem] text-al-muted shrink-0">
                        {idx === 0 ? '· Início' : `· +${step.delayDiasUteis}d`}
                      </span>
                    </div>

                    {/* Ícone do canal e avatar */}
                    <IconeCanal canal={step.canal} />
                    <span
                      className="size-4.5 rounded-full bg-al-line text-[0.5625rem] font-medium flex items-center justify-center text-al-ink shrink-0"
                      title={nomeContato}
                    >
                      {iniciais(nomeContato)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>

          {/* Botão de adicionar step */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setMenuAdicionarAberto(!menuAdicionarAberto)}
              className="flex w-full items-center justify-center gap-1.5 border border-dashed border-al-line p-2 text-xs text-al-muted hover:border-al-ink hover:text-al-ink transition-colors"
            >
              <Plus className="size-3.5" /> Adicionar step
            </button>

            {menuAdicionarAberto && (
              <div className="grid grid-cols-2 gap-1.5 mt-2 p-2 border border-al-line bg-al-bg">
                {(Object.keys(CANAIS_CONFIG) as CanalStep[]).map((canal) => (
                  <button
                    key={canal}
                    type="button"
                    onClick={() => handleAdicionarStep(canal)}
                    aria-label={`Adicionar step ${CANAIS_CONFIG[canal].rotulo}`}
                    className="flex items-center gap-2 p-1.5 text-xs text-al-muted hover:text-al-ink hover:bg-al-surface border border-transparent hover:border-al-line transition-colors"
                  >
                    <IconeCanal canal={canal} />
                    <span>{CANAIS_CONFIG[canal].rotulo}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coluna 2: Editor de Step Selecionado (seq-editor) */}
        {stepAtivo ? (
          <div className="p-6 flex flex-col gap-5 bg-al-surface">
            {/* Cabeçalho do step: ícone, input de título, índice e controles de movimentação */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-al-line pb-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="size-8 shrink-0 border border-al-line bg-al-bg flex items-center justify-center text-al-ink">
                  <IconeCanal canal={stepAtivo.canal} />
                </span>
                <input
                  aria-label="Nome do step"
                  value={stepAtivo.titulo}
                  onChange={(e) => handleSalvarStep({ titulo: e.target.value })}
                  placeholder="Nome do step"
                  className="flex-1 min-w-0 bg-transparent text-base font-normal text-al-ink border-b border-transparent focus:border-al-ink outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-al-muted">
                  Step {indiceStepAtivo + 1} de {stepsMesclados.length}
                </span>
                <button
                  type="button"
                  disabled={indiceStepAtivo === 0}
                  onClick={() => handleMoverStep(-1)}
                  aria-label="Mover para cima"
                  className="p-1 border border-al-line bg-al-bg text-al-muted hover:text-al-ink disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={indiceStepAtivo === stepsMesclados.length - 1}
                  onClick={() => handleMoverStep(1)}
                  aria-label="Mover para baixo"
                  className="p-1 border border-al-line bg-al-bg text-al-muted hover:text-al-ink disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronDown className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={stepsMesclados.length <= 1}
                  onClick={handleExcluirStep}
                  aria-label="Excluir step"
                  className="p-1 border border-al-line bg-al-bg text-al-erro hover:bg-al-erro/10 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>

            {/* Abas de canal */}
            <div className="flex flex-wrap gap-1 border-b border-al-line pb-3">
              {(Object.keys(CANAIS_CONFIG) as CanalStep[]).map((canal) => (
                <button
                  key={canal}
                  type="button"
                  onClick={() => {
                    const novoTitulo =
                      stepAtivo.titulo === CANAIS_CONFIG[stepAtivo.canal].titulo
                        ? CANAIS_CONFIG[canal].titulo
                        : stepAtivo.titulo
                    handleSalvarStep({ canal, titulo: novoTitulo })
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border ${
                    stepAtivo.canal === canal
                      ? 'border-al-accent bg-al-accent/10 text-al-ink font-medium'
                      : 'border-transparent text-al-muted hover:text-al-ink hover:bg-al-bg'
                  }`}
                >
                  <IconeCanal canal={canal} />
                  <span>{CANAIS_CONFIG[canal].rotulo}</span>
                </button>
              ))}
            </div>

            {/* Linha Para: Destinatário */}
            <div className="grid grid-cols-[80px_1fr] items-center gap-3 border-b border-al-line pb-3">
              <span className="text-xs text-al-muted">Para:</span>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Destinatário"
                  value={stepAtivo.contatoId}
                  onChange={(e) => handleSalvarStep({ contatoId: e.target.value })}
                  className="border border-al-line bg-al-bg px-2.5 py-1 text-xs text-al-ink outline-none"
                >
                  {sequencia.participantesIds.map((id) => {
                    const c = contatosMap.get(id)
                    return (
                      <option key={id} value={id} className="bg-al-surface text-al-ink">
                        {c?.nome ?? id} {c?.cargo ? `· ${c.cargo}` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>

            {/* Assunto (quando aplicável) */}
            {(stepAtivo.canal === 'email' ||
              (stepAtivo.canal === 'linkedin' && stepAtivo.subtipoLinkedIn === 'inmail')) && (
              <div className="grid grid-cols-[80px_1fr] items-center gap-3 border-b border-al-line pb-3">
                <span className="text-xs text-al-muted">Assunto:</span>
                <input
                  aria-label="Assunto do e-mail"
                  value={stepAtivo.assunto ?? ''}
                  onChange={(e) => handleSalvarStep({ assunto: e.target.value })}
                  placeholder="Assunto da mensagem"
                  className="border border-al-line bg-al-bg px-2.5 py-1 text-xs text-al-ink outline-none"
                />
              </div>
            )}

            {/* Mensagem / Roteiro / Nota */}
            <div className="grid grid-cols-[80px_1fr] items-start gap-3 border-b border-al-line pb-3">
              <span className="text-xs text-al-muted pt-1">
                {stepAtivo.canal === 'ligacao'
                  ? 'Roteiro:'
                  : stepAtivo.canal === 'tarefa'
                    ? 'Nota:'
                    : 'Mensagem:'}
              </span>
              <textarea
                aria-label="Corpo da mensagem"
                rows={6}
                value={stepAtivo.corpo ?? ''}
                onChange={(e) => handleSalvarStep({ corpo: e.target.value })}
                placeholder={
                  stepAtivo.canal === 'ligacao'
                    ? 'Roteiro ou instruções da chamada...'
                    : stepAtivo.canal === 'tarefa'
                      ? 'Nota ou detalhes da tarefa...'
                      : 'Texto da mensagem...'
                }
                className="border border-al-line bg-al-bg p-2.5 text-xs text-al-ink outline-none leading-relaxed resize-y font-sans"
              />
            </div>

            {/* Quando: Delay e Janela */}
            <div className="grid grid-cols-[80px_1fr] items-center gap-3 border-b border-al-line pb-3">
              <span className="text-xs text-al-muted">Quando:</span>
              <div className="flex flex-wrap items-center gap-2 text-xs text-al-ink">
                {indiceStepAtivo === 0 ? (
                  <span className="text-al-muted">Começa assim que a sequência for aprovada</span>
                ) : (
                  <>
                    <span className="text-al-muted">Aguardar</span>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      aria-label="Dias úteis de espera"
                      value={stepAtivo.delayDiasUteis}
                      onChange={(e) =>
                        handleSalvarStep({
                          delayDiasUteis: Math.max(0, parseInt(e.target.value, 10) || 0),
                        })
                      }
                      className="w-14 border border-al-line bg-al-bg px-2 py-0.5 text-center text-xs text-al-ink outline-none"
                    />
                    <span className="text-al-muted">
                      dias úteis após o step {indiceStepAtivo}
                    </span>
                  </>
                )}
                <span className="text-al-muted">·</span>
                <select
                  aria-label="Janela do step"
                  value={
                    stepAtivo.janela?.de === '10:00'
                      ? 'manha'
                      : stepAtivo.janela?.de === '14:00'
                        ? 'tarde'
                        : 'herdar'
                  }
                  onChange={(e) => {
                    const opcao = e.target.value
                    if (opcao === 'manha') {
                      handleSalvarStep({ janela: { de: '10:00', ate: '12:00' } })
                    } else if (opcao === 'tarde') {
                      handleSalvarStep({ janela: { de: '14:00', ate: '17:00' } })
                    } else {
                      handleSalvarStep({ janela: null })
                    }
                  }}
                  className="border border-al-line bg-al-bg px-2 py-0.5 text-xs text-al-ink outline-none"
                >
                  <option value="herdar">
                    Janela da sequência ({sequencia.janelaPadrao.de}–{sequencia.janelaPadrao.ate})
                  </option>
                  <option value="manha">Manhã (10:00–12:00)</option>
                  <option value="tarde">Tarde (14:00–17:00)</option>
                </select>
              </div>
            </div>

            {/* Objetivo */}
            <div className="grid grid-cols-[80px_1fr] items-center gap-3 border-b border-al-line pb-3">
              <span className="text-xs text-al-muted">Objetivo:</span>
              <div className="flex flex-col gap-1">
                <input
                  aria-label="Objetivo do step"
                  value={stepAtivo.objetivo ?? ''}
                  onChange={(e) => handleSalvarStep({ objetivo: e.target.value })}
                  placeholder="O que este step precisa conseguir"
                  className="border border-al-line bg-al-bg px-2.5 py-1 text-xs text-al-ink outline-none"
                />
                {stepAtivo.objetivo && (
                  <span className="text-[0.6875rem] text-al-muted">
                    Objetivo: {stepAtivo.objetivo}
                  </span>
                )}
              </div>
            </div>

            {/* Rodapé de demonstração */}
            <div className="flex items-center gap-2 text-xs text-al-muted pt-1">
              <span className="px-1.5 py-0.5 border border-al-line text-[0.625rem] uppercase tracking-rotulo text-al-muted">
                Demonstração
              </span>
              <span>Ainda não enviado · nada sai deste protótipo</span>
            </div>
          </div>
        ) : (
          <div className="p-8 flex items-center justify-center text-sm text-al-muted">
            Nenhum step selecionado
          </div>
        )}
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
