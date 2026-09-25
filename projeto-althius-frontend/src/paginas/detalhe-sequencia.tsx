import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Image,
  ListTodo,
  Mail,
  MessageCircle,
  Pause,
  Pencil,
  Phone,
  Plus,
  Smartphone,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useDadosDeContas,
  useDadosDeSequencias,
  useFonteDeContas,
  useFonteDeSequencias,
} from '@/fonte/contexto'
import { formatarDataDoModulo } from '@/fonte/formatar-data'
import { CANAIS_SUPORTADOS, type AnexoStep, type CanalStep, type StatusSequencia, type StepSequencia } from '@/fonte/sequencias-tipos'
import type { ContaAlvo, Contato } from '@/fonte/contas-tipos'
import { normalizarWhatsApp, validarEmail } from '@/fonte/simulada-contas'

interface Props {
  sequenciaId: string
  incorporado?: boolean
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

function adicionarDiasUteis(dataBase: Date, dias: number): Date {
  const d = new Date(dataBase)
  let restantes = Math.abs(dias)
  const sinal = dias < 0 ? -1 : 1
  while (restantes > 0) {
    d.setDate(d.getDate() + sinal)
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      restantes--
    }
  }
  return d
}

function calcularDatasDosSteps(criadaEm: string, steps: StepSequencia[]): Date[] {
  let atual = new Date(criadaEm)
  return steps.map((s, idx) => {
    if (idx > 0) {
      atual = adicionarDiasUteis(atual, s.delayDiasUteis)
    }
    return new Date(atual)
  })
}

export function DetalheSequencia({ sequenciaId, incorporado = false }: Props) {
  const fonteDeSequencias = useFonteDeSequencias()
  const fonteDeContas = useFonteDeContas()
  const hoje = fonteDeSequencias.hoje()

  const {
    dados: sequencia,
    carregando,
    erro,
    recarregar,
  } = useDadosDeSequencias((f) => f.sequencia(sequenciaId), [sequenciaId])

  const { dados: metricasDemo } = useDadosDeSequencias(
    (f) => f.metricasDeDemo(sequenciaId),
    [sequenciaId],
  )

  const { dados: contas } = useDadosDeContas((f) => f.contas(), [])
  const { dados: contatos } = useDadosDeContas((f) => f.contatos(), [])

  const [stepSelecionadoId, setStepSelecionadoId] = useState<string | null>(null)
  const [menuAdicionarAberto, setMenuAdicionarAberto] = useState(false)
  const [edicoesLocais, setEdicoesLocais] = useState<Record<string, Partial<StepSequencia>>>({})
  const [modoPrevia, setModoPrevia] = useState(false)
  const [dialogoDestinosAberto, setDialogoDestinosAberto] = useState(false)
  const [contatoParaEditarDestinos, setContatoParaEditarDestinos] = useState<Contato | null>(null)
  // Ref para inserir variáveis no campo que estava com foco (assunto ou corpo)
  const ultimoCampoRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  async function handleSalvarDestinos(destinos: { email?: string; whatsapp?: string; linkedin?: string }) {
    if (!contatoParaEditarDestinos) return
    await fonteDeContas.atualizarDestinosContato(contatoParaEditarDestinos.id, destinos)
  }

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

  const datasDosSteps = calcularDatasDosSteps(sequencia.criadaEm, stepsMesclados)
  const dataStepAtivo = datasDosSteps[indiceStepAtivo]
  const dataFormatadaStepAtivo = dataStepAtivo
    ? formatarDataDoModulo(dataStepAtivo, hoje, { maiuscula: false })
    : undefined

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
    const contatoId = stepTocado?.contatoId ?? sequencia!.participantesIds[0] ?? ''
    const motivo = `${nomeResp} respondeu via ${canalResp} hoje.`

    // Registra a resposta como Interação na Conta-alvo
    await fonteDeContas.registrarInteracao({
      contaId: sequencia!.contaId,
      contatoId,
      tipo: 'email-recebido',
      origem: canalResp,
      participanteCliente: 'Marina Costa',
    })

    await atualizarDoc({
      status: 'pausada',
      motivoPause: motivo,
    })
  }

  async function handleRetomar() {
    await atualizarDoc({
      status: 'ativa',
      motivoPause: undefined,
    })
  }

  async function handleMarcarReuniao() {
    const contatoId = sequencia!.participantesIds[0] ?? ''
    await fonteDeContas.registrarInteracao({
      contaId: sequencia!.contaId,
      contatoId,
      tipo: 'reuniao',
      origem: 'Calendário',
      participanteCliente: 'Marina Costa',
    })

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
      modoEmail: canal === 'email' ? 'auto' : undefined,
      subtipoLinkedIn: canal === 'linkedin' ? 'convite' : undefined,
      anexos: [],
    }
    setStepSelecionadoId(novoId)
    setMenuAdicionarAberto(false)
    setModoPrevia(false)
    await atualizarDoc({ steps: [...sequencia!.steps, novoStep] })
  }

  // Insere o token {{variavel}} na posição do cursor do campo atualmente focado
  function handleInserirVariavel(token: string) {
    const campo = ultimoCampoRef.current
    if (!campo || !stepAtivo) return
    const start = campo.selectionStart ?? campo.value.length
    const end = campo.selectionEnd ?? start
    const novoValor = campo.value.slice(0, start) + token + campo.value.slice(end)
    // Identifica se o campo é assunto ou corpo
    const campo_id = campo.getAttribute('data-campo')
    const patch =
      campo_id === 'assunto' ? { assunto: novoValor } : { corpo: novoValor }
    handleSalvarStep(patch)
    // Restaura o foco e a posição do cursor após o re-render
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[data-campo="${campo_id}"]`,
      )
      if (el) {
        el.focus()
        const pos = start + token.length
        el.setSelectionRange(pos, pos)
        ultimoCampoRef.current = el
      }
    })
  }

  function handleAnexar(arquivo: File, tipo: 'imagem' | 'video') {
    if (!stepAtivo) return
    const url = URL.createObjectURL(arquivo)
    const novoAnexo: AnexoStep = { tipo, nome: arquivo.name, url }
    const anexosAtuais = stepAtivo.anexos ?? []
    handleSalvarStep({ anexos: [...anexosAtuais, novoAnexo] })
  }

  function handleRemoverAnexo(indice: number) {
    if (!stepAtivo) return
    const novosAnexos = (stepAtivo.anexos ?? []).filter((_, i) => i !== indice)
    handleSalvarStep({ anexos: novosAnexos })
  }


  return (
    <div className={`flex flex-col gap-6 ${incorporado ? 'border border-al-line bg-al-bg p-4' : 'py-2'}`}>
      {/* Navegação de volta */}
      {!incorporado && (
        <div>
          <Link
            to="/sequencias"
            className="inline-flex items-center gap-1.5 text-xs text-al-muted hover:text-al-ink tracking-rotulo uppercase"
          >
            <ArrowLeft className="size-4" /> Sequências / {nomeConta}
          </Link>
        </div>
      )}

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
              {metricasDemo && (metricasDemo.respostas > 0 || metricasDemo.reunioes > 0) && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1.5" title="Métricas de demonstração">
                    <span className="px-1.5 py-0.2 border border-al-line text-[0.625rem] uppercase tracking-rotulo text-al-muted">
                      Demonstração
                    </span>
                    <span className="text-al-ink font-medium">
                      {metricasDemo.respostas}{' '}
                      {metricasDemo.respostas === 1 ? 'resposta' : 'respostas'}
                    </span>
                    {metricasDemo.reunioes > 0 && (
                      <span className="text-al-accent font-medium">
                        · {metricasDemo.reunioes}{' '}
                        {metricasDemo.reunioes === 1 ? 'reunião' : 'reuniões'}
                      </span>
                    )}
                  </span>
                </>
              )}
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
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-rotulo uppercase text-al-muted">
                Regra de pause na Conta-alvo
              </span>
              {sequencia.status === 'pausada' && (
                <span className="text-[0.6875rem] font-semibold tracking-rotulo uppercase text-al-atencao px-1.5 py-0.5 border border-al-atencao/40 bg-al-atencao/10">
                  Pausa da Conta inteira
                </span>
              )}
            </div>
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
              const temDestinos = Boolean(contato?.email || contato?.whatsapp || contato?.linkedin)
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
                  <button
                    type="button"
                    onClick={() => {
                      if (contato) {
                        setContatoParaEditarDestinos(contato)
                        setDialogoDestinosAberto(true)
                      }
                    }}
                    aria-label={temDestinos ? `Editar destinos de ${nome}` : `Cadastrar destinos de ${nome}`}
                    className={`ml-1 text-[0.625rem] px-1 py-0.5 border ${
                      temDestinos
                        ? 'border-al-line text-al-ink hover:border-al-accent'
                        : 'border-dashed border-al-atencao text-al-atencao hover:border-al-ink'
                    }`}
                    title={temDestinos ? 'Destinos cadastrados' : 'Cadastrar destinos reais'}
                  >
                    {temDestinos ? 'Destinos' : '+ Destinos'}
                  </button>
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

          <ol aria-label="Linha do tempo de passos" className="flex flex-col gap-1 list-none p-0 m-0">
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

                    {/* Título e delay/data */}
                    <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                      <span
                        className={`truncate font-normal ${
                          concluido ? 'text-al-muted line-through' : 'text-al-ink'
                        }`}
                      >
                        {step.titulo}
                      </span>
                      <span className="text-[0.6875rem] text-al-muted shrink-0">
                        {idx === 0
                          ? '· Início'
                          : datasDosSteps[idx]
                            ? `· ${formatarDataDoModulo(datasDosSteps[idx], hoje, { maiuscula: false })}`
                            : `· +${step.delayDiasUteis}d`}
                      </span>
                    </div>

                    {/* Indicador de resposta ou desfecho de demo */}
                    {step.metricas?.respondeu && (
                      <span
                        className="px-1.5 py-0.5 border border-al-atencao/40 bg-al-atencao/10 text-al-atencao text-[0.625rem] font-medium tracking-rotulo uppercase shrink-0"
                        title="Demonstração: obteve resposta"
                      >
                        1 resposta
                      </span>
                    )}
                    {step.metricas?.desfecho && (
                      <span
                        className="px-1.5 py-0.5 border border-al-line bg-al-surface text-al-muted text-[0.625rem] font-medium shrink-0"
                        title="Demonstração: desfecho"
                      >
                        {step.metricas.desfecho}
                      </span>
                    )}

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
              <div className="grid grid-cols-3 gap-1.5 mt-2 p-2 border border-al-line bg-al-bg">
                {CANAIS_SUPORTADOS.map((canal) => (
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
          <ComposerStep
            step={stepAtivo}
            indice={indiceStepAtivo}
            total={stepsMesclados.length}
            janelaPadrao={sequencia.janelaPadrao}
            participantesIds={sequencia.participantesIds}
            contatosMap={contatosMap}
            modoPrevia={modoPrevia}
            onModoPrevia={setModoPrevia}
            conta={conta}
            contatos={contatos ?? []}
            dataPrevista={dataFormatadaStepAtivo}
            onSalvar={handleSalvarStep}
            onMover={handleMoverStep}
            onExcluir={handleExcluirStep}
            onInserirVariavel={handleInserirVariavel}
            onAnexar={handleAnexar}
            onRemoverAnexo={handleRemoverAnexo}
            ultimoCampoRef={ultimoCampoRef}
            onEditarDestinos={(c) => {
              setContatoParaEditarDestinos(c)
              setDialogoDestinosAberto(true)
            }}
          />
        ) : (
          <div className="p-8 flex items-center justify-center text-sm text-al-muted">
            Nenhum step selecionado
          </div>
        )}
      </div>

      <DialogoDestinosContato
        aberto={dialogoDestinosAberto}
        aoMudar={setDialogoDestinosAberto}
        contato={contatoParaEditarDestinos}
        aoSalvar={handleSalvarDestinos}
      />
    </div>
  )
}

// ---------- Variáveis disponíveis para inserção ----------

const VARIAVEIS: Array<{ nome: string; grupo: string; token: string }> = [
  { nome: 'conta.nome', grupo: 'Conta', token: '{{conta.nome}}' },
  { nome: 'conta.sinal', grupo: 'Conta', token: '{{conta.sinal}}' },
  { nome: 'conta.segmento', grupo: 'Conta', token: '{{conta.segmento}}' },
  { nome: 'contato.primeiro_nome', grupo: 'Contato', token: '{{contato.primeiro_nome}}' },
  { nome: 'contato.cargo', grupo: 'Contato', token: '{{contato.cargo}}' },
  { nome: 'persona', grupo: 'Persona', token: '{{persona}}' },
  { nome: 'remetente.nome', grupo: 'Você', token: '{{remetente.nome}}' },
]

// ---------- Substituição de variáveis para preview ----------

function resolverVariavel(
  nome: string,
  conta: ContaAlvo | undefined,
  contato: Contato | undefined,
): string | null {
  const primeiroNome = (contato?.nome ?? '').split(/\s+/)[0] ?? ''
  const mapa: Record<string, string | undefined | null> = {
    'conta.nome': conta?.nome,
    'conta.sinal': conta?.ultimoSinal?.frase,
    'conta.segmento': conta?.segmento,
    'contato.primeiro_nome': primeiroNome || undefined,
    'contato.cargo': contato?.cargo,
    persona: contato?.persona,
    'remetente.nome': 'Marina Costa',
  }
  return mapa[nome] ?? null
}

function renderizarPreview(
  texto: string,
  conta: ContaAlvo | undefined,
  contato: Contato | undefined,
): string {
  return texto.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, nome: string) => {
    const valor = resolverVariavel(nome, conta, contato)
    if (valor) return `<mark class="al-preview-var">${valor}</mark>`
    return `<mark class="al-preview-var-missing">{{${nome}}}</mark>`
  })
}

// ---------- Composer de Step ----------

interface ComposerStepProps {
  step: StepSequencia
  indice: number
  total: number
  janelaPadrao: { de: string; ate: string }
  participantesIds: string[]
  contatosMap: Map<string, Contato>
  modoPrevia: boolean
  onModoPrevia: (v: boolean) => void
  conta: ContaAlvo | undefined
  contatos: Contato[]
  dataPrevista?: string
  onSalvar: (patch: Partial<StepSequencia>) => void
  onMover: (direcao: -1 | 1) => void
  onExcluir: () => void
  onInserirVariavel: (token: string) => void
  onAnexar: (arquivo: File, tipo: 'imagem' | 'video') => void
  onRemoverAnexo: (indice: number) => void
  ultimoCampoRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  onEditarDestinos?: (contato: Contato) => void
}

function ComposerStep({
  step,
  indice,
  total,
  janelaPadrao,
  participantesIds,
  contatosMap,
  modoPrevia,
  onModoPrevia,
  conta,
  dataPrevista,
  onSalvar,
  onMover,
  onExcluir,
  onInserirVariavel,
  onAnexar,
  onRemoverAnexo,
  ultimoCampoRef,
  onEditarDestinos,
}: ComposerStepProps) {
  const contato = contatosMap.get(step.contatoId)
  const ehNota = step.canal === 'ligacao' || step.canal === 'tarefa'
  const temAssunto =
    step.canal === 'email' ||
    (step.canal === 'linkedin' && step.subtipoLinkedIn === 'inmail')
  const limiteCaracteres =
    step.canal === 'sms'
      ? 160
      : step.canal === 'linkedin' && step.subtipoLinkedIn === 'convite'
        ? 300
        : null
  const corpo = step.corpo ?? ''
  const anexos = step.anexos ?? []

  const rotuloMensagem = step.canal === 'ligacao' ? 'Roteiro:' : step.canal === 'tarefa' ? 'Nota:' : 'Mensagem:'

  return (
    <div className="flex flex-col bg-al-surface" data-testid="composer-step">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-al-line px-5 py-3.5">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="size-8 shrink-0 border border-al-line bg-al-bg flex items-center justify-center text-al-ink">
            <IconeCanal canal={step.canal} />
          </span>
          <input
            aria-label="Nome do step"
            value={step.titulo}
            onChange={(e) => onSalvar({ titulo: e.target.value })}
            placeholder="Nome do step"
            className="flex-1 min-w-0 bg-transparent text-base font-normal text-al-ink border-b border-transparent focus:border-al-ink outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-al-muted">Step {indice + 1} de {total}</span>
          <button
            type="button"
            disabled={indice === 0}
            onClick={() => onMover(-1)}
            aria-label="Mover para cima"
            className="p-1 border border-al-line bg-al-bg text-al-muted hover:text-al-ink disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            disabled={indice === total - 1}
            onClick={() => onMover(1)}
            aria-label="Mover para baixo"
            className="p-1 border border-al-line bg-al-bg text-al-muted hover:text-al-ink disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronDown className="size-4" />
          </button>
          <button
            type="button"
            disabled={total <= 1}
            onClick={onExcluir}
            aria-label="Excluir step"
            className="p-1 border border-al-line bg-al-bg text-al-erro hover:bg-al-erro/10 disabled:opacity-30 disabled:pointer-events-none"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Abas de canal */}
      <div className="flex flex-wrap gap-1 border-b border-al-line px-4 pt-2 pb-0">
        {CANAIS_SUPORTADOS.map((canal) => (
          <button
            key={canal}
            type="button"
            role="tab"
            aria-selected={step.canal === canal}
            onClick={() => {
              const novoTitulo =
                step.titulo === CANAIS_CONFIG[step.canal].titulo
                  ? CANAIS_CONFIG[canal].titulo
                  : step.titulo
              onSalvar({
                canal,
                titulo: novoTitulo,
                modoEmail: canal === 'email' ? (step.modoEmail ?? 'auto') : undefined,
                subtipoLinkedIn: canal === 'linkedin' ? (step.subtipoLinkedIn ?? 'convite') : undefined,
              })
              onModoPrevia(false)
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs transition-colors border-b-2 -mb-px ${
              step.canal === canal
                ? 'border-b-al-accent text-al-ink font-medium'
                : 'border-b-transparent text-al-muted hover:text-al-ink'
            }`}
          >
            <IconeCanal canal={canal} />
            <span>{CANAIS_CONFIG[canal].rotulo}</span>
          </button>
        ))}
      </div>

      {/* Linha Para: Destinatário */}
      <div className="grid grid-cols-[80px_1fr] items-center gap-3 border-b border-al-line px-4 py-2.5">
        <span className="text-xs text-al-muted">Para:</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Destinatário"
            value={step.contatoId}
            onChange={(e) => onSalvar({ contatoId: e.target.value })}
            className="border border-al-line bg-al-bg px-2.5 py-1 text-xs text-al-ink outline-none"
          >
            {participantesIds.map((id) => {
              const c = contatosMap.get(id)
              return (
                <option key={id} value={id} className="bg-al-surface text-al-ink">
                  {c?.nome ?? id} {c?.cargo ? `· ${c.cargo}` : ''}
                </option>
              )
            })}
          </select>
          {contato?.persona && (
            <span className="text-xs text-al-muted">· {contato.persona}</span>
          )}

          {/* Destino real do canal atual */}
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-al-line text-xs">
            <span className="text-al-muted">Destino:</span>
            {step.canal === 'email' && (
              contato?.email ? (
                <span className="font-mono text-al-ink" data-testid="destino-atual">{contato.email}</span>
              ) : (
                <span className="text-al-atencao" data-testid="destino-atual">Nenhum e-mail real</span>
              )
            )}
            {step.canal === 'whatsapp' && (
              contato?.whatsapp ? (
                <span className="font-mono text-al-ink" data-testid="destino-atual">{contato.whatsapp}</span>
              ) : (
                <span className="text-al-atencao" data-testid="destino-atual">Nenhum WhatsApp real</span>
              )
            )}
            {step.canal === 'linkedin' && (
              contato?.linkedin ? (
                <span className="font-mono text-al-ink" data-testid="destino-atual">{contato.linkedin}</span>
              ) : (
                <span className="text-al-atencao" data-testid="destino-atual">Nenhum LinkedIn real</span>
              )
            )}
            {contato && onEditarDestinos && (
              <button
                type="button"
                onClick={() => onEditarDestinos(contato)}
                aria-label={`Editar destinos de ${contato.nome}`}
                className="text-[0.6875rem] text-al-muted hover:text-al-ink underline underline-offset-2 ml-1"
              >
                Editar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Opções específicas por canal (Envio/Modo/Subtipo) */}
      <div className="grid grid-cols-[80px_1fr] items-center gap-3 border-b border-al-line px-4 py-2.5">
        <span className="text-xs text-al-muted">Envio:</span>
        <OpcoesPorCanal step={step} onSalvar={onSalvar} />
      </div>

      {/* Assunto (e-mail ou LinkedIn InMail) */}
      {temAssunto && !modoPrevia && (
        <div className="grid grid-cols-[80px_1fr] items-center gap-3 border-b border-al-line px-4 py-2.5">
          <span className="text-xs text-al-muted">Assunto:</span>
          <input
            aria-label="Assunto do e-mail"
            data-campo="assunto"
            value={step.assunto ?? ''}
            onChange={(e) => onSalvar({ assunto: e.target.value })}
            onFocus={(e) => { ultimoCampoRef.current = e.currentTarget }}
            placeholder="Assunto da mensagem"
            className="border border-al-line bg-al-bg px-2.5 py-1 text-xs text-al-ink outline-none w-full"
          />
        </div>
      )}

      {/* Barra de variáveis + botão de preview */}
      <BarraVariaveis
        onInserir={onInserirVariavel}
        modoPrevia={modoPrevia}
        onModoPrevia={onModoPrevia}
      />

      {/* Mensagem / Roteiro / Nota ou Preview */}
      <div className="grid grid-cols-[80px_1fr] items-start gap-3 border-b border-al-line px-4 py-3">
        <span className="text-xs text-al-muted pt-1">
          {modoPrevia ? 'Como chega:' : rotuloMensagem}
        </span>
        {modoPrevia ? (
          <PreviaCanal step={step} conta={conta} contato={contato} />
        ) : (
          <div className="relative">
            <textarea
              aria-label="Corpo da mensagem"
              data-campo="corpo"
              rows={6}
              value={corpo}
              onChange={(e) => onSalvar({ corpo: e.target.value })}
              onFocus={(e) => { ultimoCampoRef.current = e.currentTarget }}
              placeholder={
                step.canal === 'ligacao'
                  ? 'Roteiro ou instruções da chamada...'
                  : step.canal === 'tarefa'
                    ? 'Nota ou detalhes da tarefa...'
                    : 'Texto da mensagem...'
              }
              className="w-full border border-al-line bg-al-bg p-2.5 text-xs text-al-ink outline-none leading-relaxed resize-y font-sans"
            />
            {limiteCaracteres !== null && (
              <span
                className={`absolute bottom-2 right-2 text-[0.6875rem] tabular-nums ${
                  corpo.length > limiteCaracteres ? 'text-al-erro font-medium' : 'text-al-muted'
                }`}
                aria-label="Contador de caracteres"
              >
                {corpo.length}/{limiteCaracteres}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Anexos */}
      {!ehNota && (
        <LinhaAnexos
          anexos={anexos}
          onAnexar={onAnexar}
          onRemover={onRemoverAnexo}
        />
      )}

      {/* Quando: Delay e Janela */}
      <div className="grid grid-cols-[80px_1fr] items-center gap-3 border-b border-al-line px-4 py-2.5">
        <span className="text-xs text-al-muted">Quando:</span>
        <div className="flex flex-wrap items-center gap-2 text-xs text-al-ink">
          {indice === 0 ? (
            <span className="text-al-muted">Começa assim que a sequência for aprovada</span>
          ) : (
            <>
              <span className="text-al-muted">Aguardar</span>
              <input
                type="number"
                min={0}
                max={30}
                aria-label="Dias úteis de espera"
                value={step.delayDiasUteis}
                onChange={(e) =>
                  onSalvar({
                    delayDiasUteis: Math.max(0, parseInt(e.target.value, 10) || 0),
                  })
                }
                className="w-14 border border-al-line bg-al-bg px-2 py-0.5 text-center text-xs text-al-ink outline-none"
              />
              <span className="text-al-muted">dias úteis após o step {indice}</span>
            </>
          )}
          <span className="text-al-muted">·</span>
          <select
            aria-label="Janela do step"
            value={
              step.janela?.de === '10:00'
                ? 'manha'
                : step.janela?.de === '14:00'
                  ? 'tarde'
                  : 'herdar'
            }
            onChange={(e) => {
              const opcao = e.target.value
              if (opcao === 'manha') {
                onSalvar({ janela: { de: '10:00', ate: '12:00' } })
              } else if (opcao === 'tarde') {
                onSalvar({ janela: { de: '14:00', ate: '17:00' } })
              } else {
                onSalvar({ janela: null })
              }
            }}
            className="border border-al-line bg-al-bg px-2 py-0.5 text-xs text-al-ink outline-none"
          >
            <option value="herdar">
              Janela da sequência ({janelaPadrao.de}–{janelaPadrao.ate})
            </option>
            <option value="manha">Manhã (10:00–12:00)</option>
            <option value="tarde">Tarde (14:00–17:00)</option>
          </select>
        </div>
      </div>

      {/* Objetivo */}
      <div className="grid grid-cols-[80px_1fr] items-center gap-3 border-b border-al-line px-4 py-2.5">
        <span className="text-xs text-al-muted">Objetivo:</span>
        <input
          aria-label="Objetivo do step"
          value={step.objetivo ?? ''}
          onChange={(e) => onSalvar({ objetivo: e.target.value })}
          placeholder="O que este step precisa conseguir"
          className="border border-al-line bg-al-bg px-2.5 py-1 text-xs text-al-ink outline-none w-full"
        />
      </div>

      {/* Rodapé de demonstração e métricas do step */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-al-muted px-4 py-3 border-t border-al-line bg-al-surface/40">
        <span className="px-1.5 py-0.5 border border-al-line text-[0.625rem] uppercase tracking-rotulo text-al-muted font-medium">
          Demonstração
        </span>
        {step.metricas ? (
          <>
            {step.metricas.desfecho ? (
              <span>
                Resultado: <strong className="font-normal text-al-ink">{step.metricas.desfecho}</strong>
              </span>
            ) : (
              <>
                {dataPrevista && (
                  <span>
                    Enviado em <strong className="font-normal text-al-ink">{dataPrevista}</strong>
                  </span>
                )}
                {step.metricas.aberturas !== null && step.metricas.aberturas !== undefined && (
                  <span>
                    Aberto <strong className="font-normal text-al-ink">{step.metricas.aberturas}×</strong>
                  </span>
                )}
                <span>
                  <strong className="font-normal text-al-ink">
                    {step.metricas.respondeu ? '1 resposta' : '0 respostas'}
                  </strong>
                </span>
              </>
            )}
          </>
        ) : (
          <span>Ainda não enviado · nada sai deste protótipo</span>
        )}
      </div>
    </div>
  )
}

// ---------- Opções específicas por canal ----------

function OpcoesPorCanal({
  step,
  onSalvar,
}: {
  step: StepSequencia
  onSalvar: (patch: Partial<StepSequencia>) => void
}) {
  if (step.canal === 'email') {
    return (
      <div className="flex items-center gap-1 border border-al-line">
        {(['auto', 'manual'] as const).map((modo) => (
          <button
            key={modo}
            type="button"
            onClick={() => onSalvar({ modoEmail: modo })}
            aria-pressed={step.modoEmail === modo}
            className={`px-3 py-1 text-xs transition-colors ${
              step.modoEmail === modo
                ? 'bg-al-surface text-al-ink shadow-[inset_0_-2px_0_var(--al-accent)]'
                : 'text-al-muted hover:text-al-ink'
            }`}
          >
            {modo === 'auto' ? 'Automático' : 'Manual — revisar antes'}
          </button>
        ))}
      </div>
    )
  }

  if (step.canal === 'linkedin') {
    const opcoes: Array<{ valor: typeof step.subtipoLinkedIn; rotulo: string }> = [
      { valor: 'convite', rotulo: 'Convite com nota' },
      { valor: 'mensagem', rotulo: 'Mensagem' },
      { valor: 'inmail', rotulo: 'InMail' },
    ]
    return (
      <div className="flex items-center gap-1 border border-al-line flex-wrap">
        {opcoes.map(({ valor, rotulo }) => (
          <button
            key={valor}
            type="button"
            onClick={() => onSalvar({ subtipoLinkedIn: valor })}
            aria-pressed={step.subtipoLinkedIn === valor}
            className={`px-3 py-1 text-xs transition-colors ${
              step.subtipoLinkedIn === valor
                ? 'bg-al-surface text-al-ink shadow-[inset_0_-2px_0_var(--al-accent)]'
                : 'text-al-muted hover:text-al-ink'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>
    )
  }

  if (step.canal === 'whatsapp') {
    return <span className="text-xs text-al-muted">Enviado do número do vendedor · sem envio neste protótipo</span>
  }
  if (step.canal === 'sms') {
    return <span className="text-xs text-al-muted">Até 160 caracteres</span>
  }
  if (step.canal === 'ligacao') {
    return <span className="text-xs text-al-muted">Vira uma tarefa de ligação na data do step</span>
  }
  if (step.canal === 'tarefa') {
    return <span className="text-xs text-al-muted">Tarefa manual para quem é dono da Conta-alvo</span>
  }
  return null
}

// ---------- Barra de variáveis ----------

function BarraVariaveis({
  onInserir,
  modoPrevia,
  onModoPrevia,
}: {
  onInserir: (token: string) => void
  modoPrevia: boolean
  onModoPrevia: (v: boolean) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-al-line px-4 py-2">
      <span className="text-[0.6875rem] text-al-muted mr-1">Inserir variável</span>
      {VARIAVEIS.map(({ nome, grupo, token }) => (
        <button
          key={nome}
          type="button"
          onMouseDown={(e) => e.preventDefault()} // mantém foco no campo de texto
          onClick={() => onInserir(token)}
          aria-label={`Inserir variável ${token}`}
          className="inline-flex h-6 items-center gap-1 border border-al-line bg-al-bg px-2 font-mono text-[0.6875rem] text-al-ink hover:border-al-accent hover:text-al-accent"
        >
          <em className="not-italic text-[0.5625rem] uppercase tracking-widest text-al-muted font-sans">
            {grupo}
          </em>
          {token}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-1 border border-al-line">
        <button
          type="button"
          onClick={() => onModoPrevia(false)}
          aria-pressed={!modoPrevia}
          aria-label="Modo edição"
          className={`p-1.5 transition-colors ${!modoPrevia ? 'bg-al-surface text-al-ink' : 'text-al-muted hover:text-al-ink'}`}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onModoPrevia(true)}
          aria-pressed={modoPrevia}
          aria-label="Pré-visualizar"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[0.6875rem] transition-colors ${modoPrevia ? 'bg-al-surface text-al-ink' : 'text-al-muted hover:text-al-ink'}`}
        >
          <Eye className="size-3.5" />
          Pré-visualizar
        </button>
      </div>
    </div>
  )
}

// ---------- Pré-visualização por canal ----------

function PreviaCanal({
  step,
  conta,
  contato,
}: {
  step: StepSequencia
  conta: ContaAlvo | undefined
  contato: Contato | undefined
}) {
  const corpo = step.corpo ?? ''
  const assunto = step.assunto ?? ''
  const janela = step.janela
  const hora = janela ? `${janela.de}–${janela.ate}` : '09:02'
  const nomeContato = contato?.nome ?? 'Contato'
  const inicContato = iniciais(nomeContato)
  const nomeRemetente = 'Marina Costa'
  const emailRemetente = 'marina.costa@databricks.com'
  const emailContato = `${nomeContato.toLowerCase().replace(/\s+/g, '.')
    }@${conta?.nome?.toLowerCase().replace(/\s+/g, '') ?? 'empresa'}.com`

  const corpoHtml = renderizarPreview(corpo, conta, contato)
  const assuntoHtml = renderizarPreview(assunto, conta, contato)

  if (step.canal === 'whatsapp') {
    return (
      <div className="al-pv al-pv-wa" data-testid="preview-whatsapp">
        <div className="al-pv-wa-head">
          <span className="al-pv-avatar">{inicContato}</span>
          <span className="al-pv-who">
            <strong>{nomeContato}</strong>
            <small>online</small>
          </span>
        </div>
        <div className="al-pv-wa-chat">
          <span className="al-pv-wa-day">Hoje</span>
          <PreviewAnexos anexos={step.anexos ?? []} />
          <div
            className="al-pv-wa-bubble"
            dangerouslySetInnerHTML={{ __html: corpoHtml || '<span class="al-pv-empty">Mensagem…</span>' }}
          />
        </div>
        <div className="al-pv-wa-input">
          <span>Mensagem</span>
        </div>
      </div>
    )
  }

  if (step.canal === 'sms') {
    return (
      <div className="al-pv al-pv-sms" data-testid="preview-sms">
        <div className="al-pv-phone">
          <div className="al-pv-sms-head">
            <span className="al-pv-sms-avatar">{inicContato}</span>
            <small>{nomeContato}</small>
          </div>
          <div className="al-pv-sms-chat">
            <span className="al-pv-sms-meta">Mensagem de texto · SMS · Hoje {hora}</span>
            <PreviewAnexos anexos={step.anexos ?? []} />
            <div
              className="al-pv-sms-bubble"
              dangerouslySetInnerHTML={{ __html: corpoHtml || '<span class="al-pv-empty">Mensagem…</span>' }}
            />
            <span className="al-pv-sms-status">Entregue</span>
          </div>
          <div className="al-pv-sms-input">Mensagem de texto</div>
        </div>
      </div>
    )
  }

  if (step.canal === 'linkedin') {
    if (step.subtipoLinkedIn === 'convite') {
      return (
        <div className="al-pv al-pv-li" data-testid="preview-linkedin">
          <div className="al-pv-li-bar">
            <span className="al-pv-li-mark">in</span>
            <strong>Convites</strong>
            <small>1 novo</small>
          </div>
          <div className="al-pv-li-card">
            <div className="al-pv-li-person">
              <span className="al-pv-avatar">MC</span>
              <span className="al-pv-who">
                <strong>{nomeRemetente}</strong>
                <small>Head de Receita na Databricks</small>
              </span>
            </div>
            <small className="al-pv-li-when">Convite para se conectar · agora</small>
            <div
              className="al-pv-li-note"
              dangerouslySetInnerHTML={{ __html: corpoHtml || '<span class="al-pv-empty">Nota do convite…</span>' }}
            />
            <div className="al-pv-li-actions">
              <span className="al-pv-li-btn ghost">Ignorar</span>
              <span className="al-pv-li-btn">Aceitar</span>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="al-pv al-pv-li" data-testid="preview-linkedin">
        <div className="al-pv-li-bar">
          <span className="al-pv-li-mark">in</span>
          <strong>Mensagens</strong>
          {step.subtipoLinkedIn === 'inmail' && (
            <span className="al-pv-li-tag">InMail</span>
          )}
        </div>
        <div className="al-pv-li-thread">
          <span className="al-pv-li-day">Hoje</span>
          <div className="al-pv-li-msg">
            <span className="al-pv-avatar">MC</span>
            <div>
              <div className="al-pv-li-msg-meta">
                <strong>{nomeRemetente}</strong>
                <small>{hora}</small>
              </div>
              {step.subtipoLinkedIn === 'inmail' && assunto && (
                <p className="al-pv-li-subject" dangerouslySetInnerHTML={{ __html: assuntoHtml }} />
              )}
              <div
                className="al-pv-li-text"
                dangerouslySetInnerHTML={{ __html: corpoHtml || '<span class="al-pv-empty">Mensagem…</span>' }}
              />
              <PreviewAnexos anexos={step.anexos ?? []} />
            </div>
          </div>
        </div>
        <div className="al-pv-li-input">Escreva uma mensagem…</div>
      </div>
    )
  }

  if (step.canal === 'email') {
    return (
      <div className="al-pv al-pv-mail" data-testid="preview-email">
        <div className="al-pv-mail-toolbar">
          <span>← Caixa de entrada</span>
        </div>
        <h4
          className="al-pv-mail-subject"
          dangerouslySetInnerHTML={{ __html: assuntoHtml || '<span class="al-pv-empty">(sem assunto)</span>' }}
        />
        <div className="al-pv-mail-from">
          <span className="al-pv-avatar">MC</span>
          <span className="al-pv-who">
            <span>
              <strong>{nomeRemetente}</strong>{' '}
              <small>&lt;{emailRemetente}&gt;</small>
            </span>
            <small>para {nomeContato} &lt;{emailContato}&gt;</small>
          </span>
          <time>{hora}</time>
        </div>
        <div
          className="al-pv-mail-body"
          dangerouslySetInnerHTML={{ __html: corpoHtml || '<span class="al-pv-empty">Corpo do e-mail…</span>' }}
        />
        {(step.anexos ?? []).length > 0 && (
          <div className="al-pv-mail-atts">
            {(step.anexos ?? []).map((a, i) => (
              <span key={i} className="al-pv-mail-att">
                {a.tipo === 'video' ? <Video className="size-3.5" /> : <Image className="size-3.5" />}
                <span>{a.nome}</span>
              </span>
            ))}
          </div>
        )}
        <div className="al-pv-mail-actions">
          <span>← Responder</span>
          <span>Encaminhar →</span>
        </div>
      </div>
    )
  }

  // Ligação / Tarefa — cartão de tarefa
  const tipoTarefa = step.canal === 'ligacao' ? 'Tarefa de ligação' : 'Tarefa'
  return (
    <div className="al-pv al-pv-task" data-testid="preview-task">
      <div className="al-pv-task-head">
        <IconeCanal canal={step.canal} />
        <span className="al-pv-who">
          <strong>{tipoTarefa} · {nomeContato}</strong>
          <small>Vence no dia do step · {hora} · dona: {nomeRemetente}</small>
        </span>
        <span className="al-pv-task-check">✓ Concluir</span>
      </div>
      <div
        className="al-pv-task-body"
        dangerouslySetInnerHTML={{ __html: corpoHtml || `<span class="al-pv-empty">${step.canal === 'ligacao' ? 'Roteiro da ligação…' : 'Nota da tarefa…'}</span>` }}
      />
    </div>
  )
}

// Miniaturas dos anexos na pré-visualização
function PreviewAnexos({ anexos }: { anexos: AnexoStep[] }) {
  if (!anexos.length) return null
  return (
    <div className="al-pv-anexos">
      {anexos.map((a, i) => (
        <div key={i} className="al-pv-anexo">
          {a.url ? (
            a.tipo === 'video' ? (
              <video src={a.url} className="al-pv-media" muted />
            ) : (
              <img src={a.url} alt={a.nome} className="al-pv-media" />
            )
          ) : (
            <span className={`al-pv-media-fake ${a.tipo}`}>
              {a.tipo === 'video' ? <Video className="size-5" /> : <Image className="size-5" />}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------- Linha de Anexos ----------

function LinhaAnexos({
  anexos,
  onAnexar,
  onRemover,
}: {
  anexos: AnexoStep[]
  onAnexar: (arquivo: File, tipo: 'imagem' | 'video') => void
  onRemover: (i: number) => void
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-start gap-3 border-b border-al-line px-4 py-3">
      <span className="text-xs text-al-muted pt-1">Anexos:</span>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {anexos.map((a, i) => (
            <div key={i} className="relative flex flex-col border border-al-line bg-al-bg w-28">
              <div className="h-16 flex items-center justify-center overflow-hidden bg-al-surface">
                {a.url ? (
                  a.tipo === 'video' ? (
                    <video src={a.url} className="h-full w-full object-cover" muted />
                  ) : (
                    <img src={a.url} alt={a.nome} className="h-full w-full object-cover" />
                  )
                ) : (
                  <span className="text-al-muted">
                    {a.tipo === 'video' ? <Video className="size-5" /> : <Image className="size-5" />}
                  </span>
                )}
              </div>
              <span className="px-1.5 py-1 text-[0.625rem] text-al-muted truncate">{a.nome}</span>
              <button
                type="button"
                onClick={() => onRemover(i)}
                aria-label={`Remover anexo ${a.nome}`}
                className="absolute top-1 right-1 size-4 flex items-center justify-center bg-black/60 text-white"
              >
                <X className="size-2.5" />
              </button>
            </div>
          ))}

          {/* Botão para imagem */}
          <label className="flex flex-col items-center justify-center w-28 h-24 border border-dashed border-al-line text-al-muted hover:border-al-ink hover:text-al-ink cursor-pointer gap-1.5 text-xs">
            <Image className="size-4" />
            Imagem ou print
            <input
              type="file"
              accept="image/*"
              aria-label="Anexar imagem"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onAnexar(f, 'imagem')
                e.target.value = ''
              }}
            />
          </label>

          {/* Botão para vídeo */}
          <label className="flex flex-col items-center justify-center w-28 h-24 border border-dashed border-al-line text-al-muted hover:border-al-ink hover:text-al-ink cursor-pointer gap-1.5 text-xs">
            <Video className="size-4" />
            Vídeo
            <input
              type="file"
              accept="video/*"
              aria-label="Anexar vídeo"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onAnexar(f, 'video')
                e.target.value = ''
              }}
            />
          </label>
        </div>
        <p className="text-[0.6875rem] text-al-muted">
          O arquivo fica só neste protótipo — nada é enviado.
        </p>
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

export function DialogoDestinosContato({
  aberto,
  aoMudar,
  contato,
  aoSalvar,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  contato: Contato | null
  aoSalvar: (destinos: { email?: string; whatsapp?: string; linkedin?: string }) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (contato) {
      setEmail(contato.email ?? '')
      setWhatsapp(contato.whatsapp ?? '')
      setLinkedin(contato.linkedin ?? '')
      setErro(null)
    }
  }, [contato, aberto])

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    let whatsappNormalizado: string | undefined = undefined
    if (whatsapp.trim()) {
      try {
        whatsappNormalizado = normalizarWhatsApp(whatsapp)
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'WhatsApp inválido')
        return
      }
    }

    let emailNormalizado: string | undefined = undefined
    if (email.trim()) {
      try {
        emailNormalizado = validarEmail(email)
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'E-mail inválido')
        return
      }
    }

    const linkedinValido = linkedin.trim() || undefined

    setSalvando(true)
    try {
      await aoSalvar({
        email: emailNormalizado,
        whatsapp: whatsappNormalizado,
        linkedin: linkedinValido,
      })
      aoMudar(false)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar destinos')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="gap-6 p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="titulo-secao text-xl text-al-ink">
            Destinos de {contato?.nome ?? 'Contato'}
          </DialogTitle>
          <DialogDescription className="text-sm text-al-muted">
            Cadastre os canais reais (E-mail, WhatsApp e LinkedIn) para envio da sequência.
            Dados fictícios de demonstração não autorizam disparos reais.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSalvar} className="flex flex-col gap-4">
          {erro && (
            <div role="alert" className="p-2.5 text-xs border border-al-atencao/40 bg-al-atencao/10 text-al-atencao">
              {erro}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="destino-email" className="rotulo text-[0.625rem] text-al-muted uppercase tracking-rotulo">
              E-mail corporativo real
            </label>
            <input
              id="destino-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex: marina.costa@empresa.com"
              className="h-9 border border-al-line bg-al-bg px-3 text-xs text-al-ink outline-none focus:border-al-ink"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="destino-whatsapp" className="rotulo text-[0.625rem] text-al-muted uppercase tracking-rotulo">
              WhatsApp (formato E.164)
            </label>
            <input
              id="destino-whatsapp"
              type="text"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="ex: 11999998888 ou +5511999998888"
              className="h-9 border border-al-line bg-al-bg px-3 text-xs text-al-ink outline-none focus:border-al-ink"
            />
            <span className="text-[0.6875rem] text-al-muted">
              Números do Brasil sem código de país serão normalizados automaticamente com +55.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="destino-linkedin" className="rotulo text-[0.625rem] text-al-muted uppercase tracking-rotulo">
              Perfil do LinkedIn (URL ou usuário)
            </label>
            <input
              id="destino-linkedin"
              type="text"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="ex: https://linkedin.com/in/usuario ou usuario"
              className="h-9 border border-al-line bg-al-bg px-3 text-xs text-al-ink outline-none focus:border-al-ink"
            />
          </div>

          <DialogFooter className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => aoMudar(false)}
              className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={salvando}
              className="h-8 bg-al-ink text-al-bg text-xs tracking-rotulo uppercase hover:bg-al-ink/90"
            >
              {salvando ? 'Salvando...' : 'Salvar destinos'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

