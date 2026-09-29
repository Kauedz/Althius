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
import { MODULO_INDISPONIVEL } from '@/fonte/ambiente'
import {
  useAmbiente,
  useDados,
  useDadosDeContas,
  useDadosDeSequencias,
  useFonteDeContas,
  useFonteDeSequencias,
} from '@/fonte/contexto'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { textoDaResposta } from '@/fonte/texto-do-email'
import { carregarAnexo, formaDoAnexo } from '@/fonte/anexo-recebido'
import {
  CANAIS_SUPORTADOS,
  type AnexoRecebido,
  type AnexoStep,
  type AutorizacaoDosEnvios,
  type AtualizacaoDocumento,
  type CanalStep,
  type EnvioDoPasso,
  type RespostaRecebida,
  type Sequencia,
  type StatusSequencia,
  type StepSequencia,
} from '@/fonte/sequencias-tipos'
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
  const ambiente = useAmbiente()
  const permiteAcoesDeDemonstracao = ambiente.modo === 'demonstracao'
  // Sem armazenamento de arquivos no Workspace, um anexo seria só um endereço local salvo no documento.
  const anexosDisponiveis = ambiente.disponivel('anexos')
  const workspace = useDados((fonte) => fonte.workspace(), [])
  // Na Demonstração, a remetente dos roteiros; num Workspace operacional, a Conta de usuário da sessão, que só abre o
  // documento quando é a Vendedora responsável.
  const remetente: Remetente | undefined =
    ambiente.modo === 'demonstracao'
      ? REMETENTE_DA_DEMONSTRACAO
      : workspace && { nome: workspace.usuario.nome, email: workspace.usuario.email }
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

  const { dados: contas, carregando: carregandoContas } = useDadosDeContas((f) => f.contas(), [])
  const { dados: contatos } = useDadosDeContas((f) => f.contatos(), [])

  // Os Envios e as respostas reais só existem num Workspace operacional, e só o Responsável pela Sequência os vê.
  const { dados: envios, erro: erroDosEnvios, recarregar: recarregarEnvios } = useDadosDeSequencias(
    (f) => f.envios(sequenciaId),
    [sequenciaId],
  )
  const { dados: respostas, recarregar: recarregarRespostas } = useDadosDeSequencias(
    (f) => f.respostasRecebidas(sequenciaId),
    [sequenciaId],
  )
  const { dados: autorizacao, recarregar: recarregarAutorizacao } = useDadosDeSequencias(
    (f) => f.autorizacao(sequenciaId),
    [sequenciaId],
  )
  const [dialogoAtivacaoAberto, setDialogoAtivacaoAberto] = useState(false)
  const [ativando, setAtivando] = useState(false)
  const [avisoDaAtivacao, setAvisoDaAtivacao] = useState<AvisoDoEnvio | null>(null)
  const [enviandoStepId, setEnviandoStepId] = useState<string | null>(null)
  const [avisoDoEnvio, setAvisoDoEnvio] = useState<(AvisoDoEnvio & { stepId: string }) | null>(null)
  const [erroDoAnexo, setErroDoAnexo] = useState<string | null>(null)
  const [imagemAmpliada, setImagemAmpliada] = useState<{ nome: string; url: string } | null>(null)

  const [stepSelecionadoId, setStepSelecionadoId] = useState<string | null>(null)
  const [menuAdicionarAberto, setMenuAdicionarAberto] = useState(false)
  const [edicoesLocais, setEdicoesLocais] = useState<Record<string, Partial<StepSequencia>>>({})
  const [modoPrevia, setModoPrevia] = useState(false)
  const [dialogoDestinosAberto, setDialogoDestinosAberto] = useState(false)
  const [contatoParaEditarDestinos, setContatoParaEditarDestinos] = useState<Contato | null>(null)
  // Ref para inserir variáveis no campo que estava com foco (assunto ou corpo)
  const ultimoCampoRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  // A Sequência mais recente que a tela conhece: a última gravada ou, sem gravação pendente, a última lida. As
  // alterações entram numa fila e cada uma parte dela, para duas alterações seguidas não apagarem uma à outra antes
  // de a Sequência ser relida.
  const ultimaConhecidaRef = useRef<Sequencia | undefined>(undefined)
  const filaDeAlteracoesRef = useRef<Promise<void>>(Promise.resolve())
  const alteracoesPendentesRef = useRef(0)
  useEffect(() => {
    if (sequencia && alteracoesPendentesRef.current === 0) ultimaConhecidaRef.current = sequencia
  }, [sequencia])

  async function handleSalvarDestinos(destinos: { email?: string; whatsapp?: string; linkedin?: string }) {
    if (!contatoParaEditarDestinos) return
    await fonteDeContas.atualizarDestinosContato(contatoParaEditarDestinos.id, destinos)
  }

  // O título, a trilha e o resumo público mostram o nome da Conta-alvo: esperam as Contas para não mostrar, antes
  // delas, o identificador no lugar do nome. Se as Contas falharem, fica o identificador.
  if (carregando || carregandoContas) {
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

  // Uma Sequência encerrada é histórico: o Workspace só vê a projeção segura, até quem foi o titular dela.
  if (sequencia.responsavel === false || sequencia.status === 'encerrada') {
    return (
      <section aria-label="Resumo público da sequência" className="flex flex-col items-start gap-4 py-8">
        <Link to="/sequencias" className="inline-flex items-center gap-1.5 text-xs text-al-muted hover:text-al-ink tracking-rotulo uppercase">
          <ArrowLeft className="size-4" /> Voltar para Sequências
        </Link>
        <h2 className="titulo-secao text-2xl">Resumo da Conta-alvo</h2>
        <p className="text-sm text-al-muted">
          {sequencia.status === 'encerrada'
            ? textoDoEncerramento(sequencia)
            : 'Esta Sequência tem outro Vendedor responsável. Você pode consultar o status, mas não o documento nem os detalhes privados.'}
        </p>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border border-al-line bg-al-surface p-4 text-sm">
          <dt className="text-al-muted">Conta-alvo</dt><dd>{nomeConta}</dd>
          <dt className="text-al-muted">Status</dt>
          <dd>{rotuloDoStatusPublico(sequencia)}</dd>
          <dt className="text-al-muted">Participantes</dt><dd>{sequencia.totalParticipantes}</dd>
          <dt className="text-al-muted">Etapas</dt><dd>{sequencia.totalSteps ?? 0}</dd>
        </dl>
      </section>
    )
  }

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
  function atualizarDoc(alteracao: AtualizacaoDocumento | ((atual: Sequencia) => AtualizacaoDocumento)) {
    alteracoesPendentesRef.current += 1
    const vez = filaDeAlteracoesRef.current.then(async () => {
      const conhecida = ultimaConhecidaRef.current
      const atual = conhecida?.id === sequencia!.id ? conhecida : sequencia!
      const patch = typeof alteracao === 'function' ? alteracao(atual) : alteracao
      ultimaConhecidaRef.current = await fonteDeSequencias.atualizarDocumento(atual.id, patch)
    })
    const terminar = () => {
      alteracoesPendentesRef.current -= 1
    }
    filaDeAlteracoesRef.current = vez.then(terminar, terminar)
    return vez
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

  // Confirmar fixa o Destino (ADR-0014) e o backend envia pela Conta remetente do Responsável. Um bloqueio volta
  // como desfecho com o motivo, e o passo fica como o backend o deixou.
  async function handleConfirmarEEnviar(step: StepSequencia) {
    setEnviandoStepId(step.id)
    setAvisoDoEnvio(null)
    try {
      const envio = await fonteDeSequencias.confirmarPasso(sequencia!.id, step.id)
      const resultado = await fonteDeSequencias.enviarPasso(sequencia!.id, envio.id)
      if (resultado.outcome === 'sent') {
        setAvisoDoEnvio({ stepId: step.id, texto: `E-mail enviado para ${envio.destino}.`, tipo: 'ok' })
      } else {
        setAvisoDoEnvio({ stepId: step.id, texto: resultado.mensagem ?? 'O envio não saiu.', tipo: 'atencao' })
      }
    } catch (erro) {
      setAvisoDoEnvio({ stepId: step.id, texto: erro instanceof Error ? erro.message : 'O envio não saiu.', tipo: 'atencao' })
    } finally {
      setEnviandoStepId(null)
      recarregarEnvios()
      recarregarRespostas()
      recarregar()
    }
  }

  // Ativar autoriza o documento atual (a versão que o Executor envia) e fixa o Destino de cada passo de E-mail
  // pendente (ADR-0014). Um bloqueio volta como desfecho, com o passo que o causou.
  async function handleAtivarEnvios() {
    setAtivando(true)
    setAvisoDaAtivacao(null)
    try {
      const resultado = await fonteDeSequencias.ativarEnvios(sequencia!.id)
      if (resultado.outcome === 'activated') {
        const passo = resultado.stepId ? sequencia!.steps.find((s) => s.id === resultado.stepId) : undefined
        setAvisoDaAtivacao({
          tipo: 'ok',
          texto: passo && resultado.programadoPara
            ? `Envios ativados. "${passo.titulo}" sai ${formatarDataEHora(resultado.programadoPara)}.`
            : 'Envios ativados.',
        })
      } else {
        const passo = resultado.stepId ? sequencia!.steps.find((s) => s.id === resultado.stepId) : undefined
        setAvisoDaAtivacao({
          tipo: 'atencao',
          texto: `${resultado.mensagem ?? 'Os envios não foram ativados.'}${passo ? ` Passo: "${passo.titulo}".` : ''}`,
        })
      }
    } catch (erro) {
      setAvisoDaAtivacao({ tipo: 'atencao', texto: erro instanceof Error ? erro.message : 'Os envios não foram ativados.' })
    } finally {
      setAtivando(false)
      setDialogoAtivacaoAberto(false)
      recarregarAutorizacao()
      recarregarEnvios()
    }
  }

  // Um envio incerto que o eco não reconciliou: o titular conferiu a caixa de saída e diz se o e-mail saiu.
  async function handleResolverIncerto(step: StepSequencia, saiu: boolean) {
    setAvisoDoEnvio(null)
    try {
      await fonteDeSequencias.resolverIncerto(sequencia!.id, step.id, saiu)
      setAvisoDoEnvio({
        stepId: step.id,
        tipo: 'ok',
        texto: saiu ? 'Registrado como enviado.' : 'Registrado como não enviado. O passo volta para a fila.',
      })
    } catch (erro) {
      setAvisoDoEnvio({ stepId: step.id, texto: erro instanceof Error ? erro.message : 'Não foi possível registrar.', tipo: 'atencao' })
    } finally {
      recarregarEnvios()
    }
  }

  async function arquivoDoAnexo(resposta: RespostaRecebida, anexo: AnexoRecebido) {
    const url = await fonteDeSequencias.urlDoAnexo(resposta.interacaoId, anexo.id)
    return carregarAnexo(url, anexo)
  }

  // PDF abre no leitor do navegador; a aba abre no clique, antes de esperar o arquivo, senão o bloqueador de
  // pop-ups a barra. O resto baixa com o nome original. Imagens abrem na própria página (MiniaturaDoAnexo).
  async function handleAbrirAnexo(resposta: RespostaRecebida, anexo: AnexoRecebido) {
    setErroDoAnexo(null)
    const pdf = formaDoAnexo(anexo) === 'pdf'
    const aba = pdf ? window.open('', '_blank') : null
    if (aba) aba.opener = null
    try {
      const local = URL.createObjectURL(await arquivoDoAnexo(resposta, anexo))
      if (pdf && aba) aba.location.href = local
      else if (pdf) window.open(local, '_blank', 'noopener')
      else {
        const link = document.createElement('a')
        link.href = local
        link.download = anexo.nome
        link.click()
      }
      setTimeout(() => URL.revokeObjectURL(local), 60_000)
    } catch (erro) {
      aba?.close()
      setErroDoAnexo(erro instanceof Error ? erro.message : 'Não foi possível abrir o anexo.')
    }
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
    await atualizarDoc((atual) => {
      const novosParticipantes = atual.participantesIds.filter((id) => id !== contatoId)
      const substituto = novosParticipantes[0]
      return {
        participantesIds: novosParticipantes,
        steps: atual.steps.map((s) => (s.contatoId === contatoId ? { ...s, contatoId: substituto } : s)),
      }
    })
  }

  async function handleAdicionarParticipante(novoId: string) {
    if (!novoId || sequencia!.participantesIds.includes(novoId)) return
    await atualizarDoc((atual) => ({
      participantesIds: atual.participantesIds.includes(novoId) ? atual.participantesIds : [...atual.participantesIds, novoId],
    }))
  }

  async function handleAlterarJanelaPadrao(campo: 'de' | 'ate', valor: string) {
    await atualizarDoc((atual) => ({
      janelaPadrao: {
        ...atual.janelaPadrao,
        [campo]: valor,
      },
    }))
  }

  async function handleSalvarStep(modificacoes: Partial<StepSequencia>) {
    if (!stepAtivo) return
    // Atualização síncrona local
    setEdicoesLocais((prev) => ({
      ...prev,
      [stepAtivo.id]: { ...prev[stepAtivo.id], ...modificacoes },
    }))

    const id = stepAtivo.id
    await atualizarDoc((atual) => ({
      steps: atual.steps.map((s) => (s.id === id ? { ...s, ...modificacoes } : s)),
    }))
  }

  async function handleMoverStep(direcao: -1 | 1) {
    if (!stepAtivo) return
    const novoIndice = indiceStepAtivo + direcao
    if (novoIndice < 0 || novoIndice >= sequencia!.steps.length) return

    const id = stepAtivo.id
    await atualizarDoc((atual) => {
      const indice = atual.steps.findIndex((s) => s.id === id)
      const destino = indice + direcao
      if (indice < 0 || destino < 0 || destino >= atual.steps.length) return {}
      const novosSteps = [...atual.steps]
      const [removido] = novosSteps.splice(indice, 1)
      novosSteps.splice(destino, 0, removido)
      return { steps: novosSteps.map((s, idx) => ({ ...s, ordem: idx + 1 })) }
    })
  }

  async function handleExcluirStep() {
    if (!stepAtivo || sequencia!.steps.length <= 1) return
    const id = stepAtivo.id
    const restantes = sequencia!.steps.filter((s) => s.id !== id)
    setStepSelecionadoId(restantes[Math.max(0, indiceStepAtivo - 1)]?.id ?? restantes[0]?.id)
    await atualizarDoc((atual) => ({
      steps: atual.steps.filter((s) => s.id !== id).map((s, idx) => ({ ...s, ordem: idx + 1 })),
    }))
  }

  async function handleAdicionarStep(canal: CanalStep) {
    const novoId = `step-${Date.now()}`
    const novoStep = (atual: Sequencia): StepSequencia => ({
      id: novoId,
      ordem: atual.steps.length + 1,
      canal,
      contatoId: atual.participantesIds[0] ?? '',
      delayDiasUteis: atual.steps.length === 0 ? 0 : 2,
      titulo: CANAIS_CONFIG[canal].titulo,
      corpo: '',
      objetivo: '',
      modoEmail: canal === 'email' ? 'auto' : undefined,
      subtipoLinkedIn: canal === 'linkedin' ? 'convite' : undefined,
      anexos: [],
    })
    setStepSelecionadoId(novoId)
    setMenuAdicionarAberto(false)
    setModoPrevia(false)
    await atualizarDoc((atual) => ({ steps: [...atual.steps, novoStep(atual)] }))
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
              {ambiente.modo === 'demonstracao' && (
                <>
                  <span>·</span>
                  <span>Escrita por Rhetor · editada por Marina Costa</span>
                </>
              )}
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
          {permiteAcoesDeDemonstracao && sequencia.status === 'ativa' && (
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

        {/* Ações da regra de pause quando pausada; com a Conta arquivada, só restaurar a Conta libera a retomada */}
        {sequencia.status === 'pausada' && !sequencia.pausadaPelaConta && (
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
            {permiteAcoesDeDemonstracao && <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleMarcarReuniao}
              className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
            >
              Marcar reunião
            </Button>}
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

      {!permiteAcoesDeDemonstracao && sequencia.steps.some((s) => s.canal === 'email') && (
        <PainelDosEnvios
          sequencia={sequencia}
          autorizacao={autorizacao ?? null}
          envios={envios ?? []}
          aviso={avisoDaAtivacao}
          onAtivar={() => {
            setAvisoDaAtivacao(null)
            setDialogoAtivacaoAberto(true)
          }}
        />
      )}

      <Dialog open={dialogoAtivacaoAberto} onOpenChange={(aberto) => { if (!aberto && !ativando) setDialogoAtivacaoAberto(false) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ativar envios</DialogTitle>
            <DialogDescription>
              Os passos de E-mail abaixo saem sozinhos, na ordem, em dias úteis e dentro da janela de horário, mesmo com o
              navegador fechado. Cada um fica com o Destino mostrado aqui. Uma resposta do Contato pausa a Sequência.
            </DialogDescription>
          </DialogHeader>
          <ol aria-label="Passos a ativar" className="flex flex-col gap-2 list-none p-0 m-0 text-xs">
            {sequencia.steps
              .filter((s) => s.canal === 'email' && !envios?.some((e) => e.stepId === s.id && ENVIO_JA_SAIU.has(e.status)))
              .map((s) => {
                const contato = contatosMap.get(s.contatoId)
                return (
                  <li key={s.id} className="flex flex-col gap-0.5 border-t border-al-line pt-2 first:border-t-0 first:pt-0">
                    <span className="text-al-ink font-medium">{s.titulo}</span>
                    <span className="text-al-muted">
                      Para {contato?.email ?? 'Contato sem e-mail'} · {s.modoEmail === 'manual' ? 'manual: espera você enviar' : 'automático'}
                      {s.delayDiasUteis > 0 ? ` · ${s.delayDiasUteis} ${s.delayDiasUteis === 1 ? 'dia útil' : 'dias úteis'} depois do anterior` : ''}
                    </span>
                  </li>
                )
              })}
          </ol>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogoAtivacaoAberto(false)} disabled={ativando}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleAtivarEnvios} disabled={ativando}>
              {ativando ? 'Ativando…' : 'Ativar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {respostas && respostas.length > 0 && (
        <RespostasRecebidas
          respostas={respostas}
          contatosMap={contatosMap}
          onAbrirAnexo={handleAbrirAnexo}
          carregarImagem={arquivoDoAnexo}
          onAmpliarImagem={setImagemAmpliada}
          erro={erroDoAnexo}
        />
      )}

      <Dialog open={!!imagemAmpliada} onOpenChange={(aberto) => { if (!aberto) setImagemAmpliada(null) }}>
        <DialogContent className="sm:max-w-4xl">
          <DialogTitle className="text-sm font-medium text-al-ink pr-8 break-all">{imagemAmpliada?.nome}</DialogTitle>
          {imagemAmpliada && (
            <>
              <img src={imagemAmpliada.url} alt={imagemAmpliada.nome} className="max-h-[75vh] w-full object-contain" />
              <a href={imagemAmpliada.url} download={imagemAmpliada.nome} className="text-xs text-al-muted underline justify-self-start">
                Baixar {imagemAmpliada.nome}
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>

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
              const envioDoStep = envios?.find((e) => e.stepId === step.id)
              const concluido = permiteAcoesDeDemonstracao ? idx < sequencia.passoAtual : envioDoStep?.status === 'sent'
              const ehAtual = idx === sequencia.passoAtual && sequencia.status === 'ativa'
              const respondido = !!envioDoStep && !!respostas?.some((r) => r.envioId === envioDoStep.id)
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

                    {/* Indicador de resposta (real, ou de demonstração) e de desfecho de demo */}
                    {(respondido || step.metricas?.respondeu) && (
                      <span
                        className="px-1.5 py-0.5 border border-al-atencao/40 bg-al-atencao/10 text-al-atencao text-[0.625rem] font-medium tracking-rotulo uppercase shrink-0"
                        title={respondido ? 'O Contato respondeu a este passo' : 'Demonstração: obteve resposta'}
                      >
                        {respondido ? 'Respondeu' : '1 resposta'}
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
            remetente={remetente}
            onAnexar={anexosDisponiveis ? handleAnexar : undefined}
            onRemoverAnexo={handleRemoverAnexo}
            ultimoCampoRef={ultimoCampoRef}
            envio={envios?.find((e) => e.stepId === stepAtivo.id)}
            enviosIndisponiveis={!!erroDosEnvios}
            enviando={enviandoStepId === stepAtivo.id}
            avisoDoEnvio={avisoDoEnvio?.stepId === stepAtivo.id ? avisoDoEnvio : null}
            onConfirmarEEnviar={permiteAcoesDeDemonstracao ? undefined : () => handleConfirmarEEnviar(stepAtivo)}
            onResolverIncerto={permiteAcoesDeDemonstracao ? undefined : (saiu) => handleResolverIncerto(stepAtivo, saiu)}
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

/** Quem assina as mensagens da Sequência na prévia. */
interface Remetente {
  nome: string
  email: string
  /** O cargo que o LinkedIn mostra; sem ele, a prévia não mostra nenhum. */
  cargo?: string
}

/** A remetente dos roteiros de exemplo da Demonstração. */
const REMETENTE_DA_DEMONSTRACAO: Remetente = {
  nome: 'Marina Costa',
  email: 'marina.costa@databricks.com',
  cargo: 'Head de Receita na Databricks',
}

function resolverVariavel(
  nome: string,
  conta: ContaAlvo | undefined,
  contato: Contato | undefined,
  remetente: Remetente | undefined,
): string | null {
  const primeiroNome = (contato?.nome ?? '').split(/\s+/)[0] ?? ''
  const mapa: Record<string, string | undefined | null> = {
    'conta.nome': conta?.nome,
    'conta.sinal': conta?.ultimoSinal?.frase,
    'conta.segmento': conta?.segmento,
    'contato.primeiro_nome': primeiroNome || undefined,
    'contato.cargo': contato?.cargo,
    persona: contato?.persona,
    'remetente.nome': remetente?.nome,
  }
  return mapa[nome] ?? null
}

function renderizarPreview(
  texto: string,
  conta: ContaAlvo | undefined,
  contato: Contato | undefined,
  remetente: Remetente | undefined,
): string {
  return texto.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, nome: string) => {
    const valor = resolverVariavel(nome, conta, contato, remetente)
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
  remetente: Remetente | undefined
  dataPrevista?: string
  onSalvar: (patch: Partial<StepSequencia>) => void
  onMover: (direcao: -1 | 1) => void
  onExcluir: () => void
  onInserirVariavel: (token: string) => void
  /** Sem ele, o ambiente não guarda arquivos: os anexos ficam indisponíveis. */
  onAnexar?: (arquivo: File, tipo: 'imagem' | 'video') => void
  onRemoverAnexo: (indice: number) => void
  ultimoCampoRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  onEditarDestinos?: (contato: Contato) => void
  /** O Envio deste passo num Workspace operacional, quando já foi confirmado alguma vez. */
  envio?: EnvioDoPasso
  /** Os Envios não carregaram: sem saber se o passo já saiu, a tela não oferece envio. */
  enviosIndisponiveis?: boolean
  enviando?: boolean
  avisoDoEnvio?: AvisoDoEnvio | null
  /** Sem ele (Demonstração), nenhum envio real é oferecido. */
  onConfirmarEEnviar?: () => void
  onResolverIncerto?: (saiu: boolean) => void
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
  remetente,
  dataPrevista,
  onSalvar,
  onMover,
  onExcluir,
  onInserirVariavel,
  onAnexar,
  onRemoverAnexo,
  ultimoCampoRef,
  onEditarDestinos,
  envio,
  enviosIndisponiveis = false,
  enviando = false,
  avisoDoEnvio = null,
  onConfirmarEEnviar,
  onResolverIncerto,
}: ComposerStepProps) {
  const naDemonstracao = useAmbiente().modo === 'demonstracao'
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
          <PreviaCanal step={step} conta={conta} contato={contato} remetente={remetente} />
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

      {/* Rodapé: num Workspace operacional, o Envio real do passo; na Demonstração, as métricas de exemplo. */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-al-muted px-4 py-3 border-t border-al-line bg-al-surface/40">
        {!naDemonstracao ? (
          <RodapeDoEnvio
            step={step}
            envio={envio}
            enviosIndisponiveis={enviosIndisponiveis}
            enviando={enviando}
            aviso={avisoDoEnvio}
            onConfirmarEEnviar={onConfirmarEEnviar}
            onResolverIncerto={onResolverIncerto}
          />
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}

// ---------- Envio real do passo (Workspace operacional) ----------

/** O que a tela diz depois de um pedido de envio: sucesso, ou o motivo de não ter saído. */
interface AvisoDoEnvio {
  texto: string
  tipo: 'ok' | 'atencao'
}

const ROTULO_DO_ENVIO: Record<EnvioDoPasso['status'], string> = {
  waiting: 'Na fila',
  scheduled: 'Programado',
  cancelled: 'Cancelado',
  confirmed: 'Confirmado',
  awaiting_reconfirmation: 'Aguardando reconfirmação',
  sending: 'Enviando…',
  sent: 'Enviado',
  uncertain: 'Envio incerto',
  failed: 'Falhou',
  bounced: 'Devolvido',
}

/** Situações em que confirmar de novo (e enviar) faz sentido; as outras esperam o provedor ou a reconciliação. */
const ENVIO_REENVIAVEL = new Set<EnvioDoPasso['status']>(['confirmed', 'awaiting_reconfirmation', 'failed', 'bounced'])
/** Situações em que o passo já saiu (ou pode ter saído): não entra numa nova ativação. */
const ENVIO_JA_SAIU = new Set<EnvioDoPasso['status']>(['sending', 'sent', 'uncertain'])
/** Situações que pedem atenção do Responsável. */
const ENVIO_COM_ATENCAO = new Set<EnvioDoPasso['status']>(['failed', 'bounced', 'awaiting_reconfirmation', 'uncertain'])

/** Dia da semana, data e hora no horário de Brasília, como a agenda do Executor conta. */
function formatarDataEHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function descreverEnvio(envio: EnvioDoPasso): string {
  switch (envio.status) {
    case 'waiting':
      return `Na fila: sai depois do passo anterior, para ${envio.destino}.`
    case 'scheduled':
      return `Sai sozinho ${envio.programadoPara ? formatarDataEHora(envio.programadoPara) : 'no próximo horário válido'} para ${envio.destino}, mesmo com o navegador fechado.${
        envio.ultimoErro ? ` Última tentativa: ${envio.ultimoErro}.` : ''
      }`
    case 'cancelled':
      return 'Cancelado: a Sequência mudou depois da ativação.'
    case 'sent':
      return `Enviado em ${formatarDataCompleta(envio.enviadoEm ?? envio.confirmadoEm)} para ${envio.destino}. Aceito pelo provedor; não é entrega nem leitura.`
    case 'awaiting_reconfirmation':
      return envio.ultimoErro === 'contact_unlinked'
        ? 'O Contato saiu da Conta-alvo. Ajuste o passo e confirme de novo.'
        : `O e-mail do Contato mudou depois da confirmação (era ${envio.destino}). Reconfirme para enviar ao novo Destino.`
    case 'uncertain':
      return 'O provedor não respondeu a tempo e a confirmação não chegou. Confira sua caixa de saída: o e-mail saiu?'
    case 'failed':
      return `O provedor não aceitou o envio${envio.ultimoErro ? ` (${envio.ultimoErro})` : ''}. Reconfirme para tentar de novo.`
    case 'bounced':
      return `O e-mail para ${envio.destino} foi devolvido.`
    case 'sending':
      return `Enviando para ${envio.destino}…`
    case 'confirmed':
      return envio.modo === 'manual'
        ? `Passo manual: não sai sozinho. Pronto para você enviar${envio.programadoPara ? ` a partir de ${formatarDataEHora(envio.programadoPara)}` : ''} para ${envio.destino}.`
        : `Confirmado para ${envio.destino}. Ainda não enviado.`
    default:
      return envio.destino
  }
}

function RodapeDoEnvio({
  step,
  envio,
  enviosIndisponiveis,
  enviando,
  aviso,
  onConfirmarEEnviar,
  onResolverIncerto,
}: {
  step: StepSequencia
  envio?: EnvioDoPasso
  enviosIndisponiveis: boolean
  enviando: boolean
  aviso: AvisoDoEnvio | null
  onConfirmarEEnviar?: () => void
  onResolverIncerto?: (saiu: boolean) => void
}) {
  if (step.canal !== 'email') {
    return <span>Envio por {CANAIS_CONFIG[step.canal].rotulo} ainda não disponível neste Workspace.</span>
  }
  if (enviosIndisponiveis && !envio) {
    return <span className="text-al-atencao">Não foi possível carregar a situação do envio deste passo. Recarregue a página antes de enviar.</span>
  }
  // Depois de um envio aceito, o botão só volta quando a lista de Envios já mostra o passo como enviado.
  const podeEnviar = !!onConfirmarEEnviar && !enviando && aviso?.tipo !== 'ok'
    && (!envio || ENVIO_REENVIAVEL.has(envio.status))
  const rotuloDoBotao = enviando
    ? 'Enviando…'
    : envio?.status === 'confirmed' && envio.modo === 'manual'
      ? 'Enviar'
      : envio && envio.status !== 'confirmed' ? 'Reconfirmar e enviar' : 'Confirmar e enviar'
  const podeResolver = !!onResolverIncerto && envio?.status === 'uncertain' && aviso?.tipo !== 'ok'
  return (
    <>
      <span className="flex items-center gap-2">
        {envio && (
          <span
            className={`px-1.5 py-0.5 border text-[0.625rem] uppercase tracking-rotulo font-medium ${
              envio.status === 'sent'
                ? 'border-al-sucesso/40 text-al-sucesso'
                : ENVIO_COM_ATENCAO.has(envio.status)
                  ? 'border-al-atencao/40 text-al-atencao'
                  : 'border-al-line text-al-muted'
            }`}
          >
            {ROTULO_DO_ENVIO[envio.status]}
          </span>
        )}
        <span>{envio ? descreverEnvio(envio) : 'Ainda não enviado. Confirmar fixa o e-mail atual do Contato como Destino.'}</span>
      </span>
      {podeEnviar && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onConfirmarEEnviar}
          className="h-7 border-al-line text-[0.6875rem] tracking-rotulo uppercase hover:bg-al-surface ml-auto"
        >
          <Mail className="size-3.5 mr-1 text-al-muted" />
          {rotuloDoBotao}
        </Button>
      )}
      {podeResolver && (
        <span className="flex items-center gap-2 ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onResolverIncerto!(true)}
            className="h-7 border-al-line text-[0.6875rem] tracking-rotulo uppercase hover:bg-al-surface"
          >
            Saiu
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onResolverIncerto!(false)}
            className="h-7 border-al-line text-[0.6875rem] tracking-rotulo uppercase hover:bg-al-surface"
          >
            Não saiu
          </Button>
        </span>
      )}
      {aviso && (
        <span role="status" className={`basis-full ${aviso.tipo === 'ok' ? 'text-al-sucesso' : 'text-al-atencao'}`}>
          {aviso.texto}
        </span>
      )}
    </>
  )
}

/** Os envios automáticos da Sequência: ativar, o que está programado e o aviso quando uma edição os parou. */
function PainelDosEnvios({
  sequencia,
  autorizacao,
  envios,
  aviso,
  onAtivar,
}: {
  sequencia: Sequencia
  autorizacao: AutorizacaoDosEnvios | null
  envios: EnvioDoPasso[]
  aviso: AvisoDoEnvio | null
  onAtivar: () => void
}) {
  const proximo = envios.find((e) => e.status === 'scheduled')
    ?? envios.find((e) => e.status === 'confirmed' && e.modo === 'manual')
  const passoDoProximo = proximo ? sequencia.steps.find((s) => s.id === proximo.stepId) : undefined
  let texto: string
  let rotulo: string | null = null
  if (!autorizacao) {
    texto = 'Os passos de E-mail só saem sozinhos, mesmo com o navegador fechado, depois que você ativar os envios.'
    rotulo = 'Ativar envios'
  } else if (!autorizacao.ativa) {
    texto = autorizacao.motivoDaRevogacao === 'edited'
      ? 'Você alterou passos depois da ativação. Os envios automáticos pararam até você ativar de novo.'
      : autorizacao.motivoDaRevogacao === 'account_archived'
        ? 'A Conta-alvo foi arquivada. Os envios automáticos pararam: ao restaurá-la, retome a Sequência e ative os envios de novo.'
        : 'Os envios automáticos estão parados.'
    rotulo = 'Ativar de novo'
  } else if (sequencia.status !== 'ativa') {
    texto = 'Envios ativos, mas a Sequência está pausada: nada sai até você retomar.'
  } else if (proximo && passoDoProximo) {
    texto = proximo.status === 'scheduled'
      ? `Envios ativos. Próximo: "${passoDoProximo.titulo}", ${proximo.programadoPara ? formatarDataEHora(proximo.programadoPara) : 'no próximo horário válido'}.`
      : `Envios ativos. Próximo: "${passoDoProximo.titulo}", passo manual que espera você enviar.`
  } else {
    texto = 'Envios ativos. Nenhum passo programado agora.'
  }
  return (
    <section aria-label="Envios automáticos" className="flex flex-wrap items-center gap-3 border border-al-line bg-al-surface px-4 py-3 text-xs text-al-muted">
      <span className="text-xs font-semibold tracking-rotulo uppercase text-al-muted">Envios automáticos</span>
      <span>{texto}</span>
      {rotulo && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAtivar}
          className="h-7 border-al-line text-[0.6875rem] tracking-rotulo uppercase hover:bg-al-bg ml-auto"
        >
          <Mail className="size-3.5 mr-1 text-al-muted" />
          {rotulo}
        </Button>
      )}
      {aviso && (
        <span role="status" className={`basis-full ${aviso.tipo === 'ok' ? 'text-al-sucesso' : 'text-al-atencao'}`}>
          {aviso.texto}
        </span>
      )}
    </section>
  )
}

/** Uma imagem recebida aparece em miniatura; o clique a amplia na própria página. */
function MiniaturaDoAnexo({
  anexo,
  carregar,
  onAmpliar,
  onBaixar,
}: {
  anexo: AnexoRecebido
  carregar: () => Promise<Blob>
  onAmpliar: (imagem: { nome: string; url: string }) => void
  onBaixar: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)
  // A função muda a cada render do pai; a miniatura só recarrega quando o anexo muda.
  const carregarRef = useRef(carregar)
  useEffect(() => {
    carregarRef.current = carregar
  })

  useEffect(() => {
    let ativo = true
    let local: string | null = null
    carregarRef.current().then(
      (arquivo) => {
        if (!ativo) return
        local = URL.createObjectURL(arquivo)
        setUrl(local)
      },
      () => { if (ativo) setFalhou(true) },
    )
    return () => {
      ativo = false
      if (local) URL.revokeObjectURL(local)
    }
  }, [anexo.id])

  if (falhou) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onBaixar}
        className="h-7 border-al-line text-[0.6875rem] hover:bg-al-bg"
      >
        Baixar {anexo.nome}
      </Button>
    )
  }
  if (!url) return <span className="text-xs text-al-muted">{anexo.nome} · carregando…</span>
  return (
    <button
      type="button"
      onClick={() => onAmpliar({ nome: anexo.nome, url })}
      aria-label={`Ampliar ${anexo.nome}`}
      className="block border border-al-line bg-al-bg p-1 hover:border-al-ink cursor-zoom-in"
    >
      <img src={url} alt={anexo.nome} className="h-32 max-w-[240px] object-contain" />
    </button>
  )
}

/** As respostas recebidas, com conteúdo: só o Responsável pela Sequência chega aqui. */
function RespostasRecebidas({
  respostas,
  contatosMap,
  onAbrirAnexo,
  carregarImagem,
  onAmpliarImagem,
  erro,
}: {
  respostas: RespostaRecebida[]
  contatosMap: Map<string, Contato>
  onAbrirAnexo: (resposta: RespostaRecebida, anexo: AnexoRecebido) => void
  carregarImagem: (resposta: RespostaRecebida, anexo: AnexoRecebido) => Promise<Blob>
  onAmpliarImagem: (imagem: { nome: string; url: string }) => void
  erro: string | null
}) {
  return (
    <section aria-label="Respostas recebidas" className="flex flex-col gap-3 border border-al-line bg-al-surface p-4">
      <span className="text-xs font-semibold tracking-rotulo uppercase text-al-muted">
        {respostas.length === 1 ? 'Resposta recebida' : `${respostas.length} respostas recebidas`} · só você vê o conteúdo
      </span>
      {erro && <p role="alert" className="text-xs text-al-atencao">{erro}</p>}
      {respostas.map((resposta) => {
        const quem = resposta.de.nome
          ?? (resposta.contatoId ? contatosMap.get(resposta.contatoId)?.nome : undefined)
          ?? resposta.de.email
          ?? 'Contato'
        return (
          <article key={resposta.interacaoId} className="flex flex-col gap-1.5 border-t border-al-line pt-3 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-al-muted">
              <span className="text-al-ink font-medium">{quem}</span>
              {resposta.de.email && resposta.de.nome && <span>&lt;{resposta.de.email}&gt;</span>}
              <span>· {formatarDataCompleta(resposta.recebidaEm)}</span>
            </div>
            {resposta.assunto && <p className="text-sm font-medium text-al-ink">{resposta.assunto}</p>}
            {resposta.corpo && (
              <p className="text-sm text-al-ink whitespace-pre-wrap leading-relaxed">{textoDaResposta(resposta.corpo)}</p>
            )}
            {resposta.anexos.length > 0 && (
              <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
                {resposta.anexos.map((anexo) => (
                  <li key={anexo.id}>
                    {anexo.status === 'stored' && formaDoAnexo(anexo) === 'imagem' ? (
                      <MiniaturaDoAnexo
                        anexo={anexo}
                        carregar={() => carregarImagem(resposta, anexo)}
                        onAmpliar={onAmpliarImagem}
                        onBaixar={() => onAbrirAnexo(resposta, anexo)}
                      />
                    ) : anexo.status === 'stored' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onAbrirAnexo(resposta, anexo)}
                        className="h-7 border-al-line text-[0.6875rem] hover:bg-al-bg"
                      >
                        {formaDoAnexo(anexo) === 'pdf' ? 'Abrir' : 'Baixar'} {anexo.nome}
                      </Button>
                    ) : (
                      <span className="text-xs text-al-muted">
                        {anexo.nome} · {anexo.status === 'failed' ? 'indisponível' : 'baixando…'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>
        )
      })}
    </section>
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
  remetente,
}: {
  step: StepSequencia
  conta: ContaAlvo | undefined
  contato: Contato | undefined
  remetente: Remetente | undefined
}) {
  const naDemonstracao = useAmbiente().modo === 'demonstracao'
  const corpo = step.corpo ?? ''
  const assunto = step.assunto ?? ''
  const janela = step.janela
  const hora = janela ? `${janela.de}–${janela.ate}` : '09:02'
  const nomeContato = contato?.nome ?? 'Contato'
  const inicContato = iniciais(nomeContato)
  const nomeRemetente = remetente?.nome ?? ''
  const emailRemetente = remetente?.email ?? ''
  const inicRemetente = iniciais(nomeRemetente)
  // A Demonstração compõe um endereço de exemplo; um Workspace operacional só mostra o e-mail real do Contato.
  const emailContato = naDemonstracao
    ? `${nomeContato.toLowerCase().replace(/\s+/g, '.')}@${conta?.nome?.toLowerCase().replace(/\s+/g, '') ?? 'empresa'}.com`
    : (contato?.email ?? '')

  const corpoHtml = renderizarPreview(corpo, conta, contato, remetente)
  const assuntoHtml = renderizarPreview(assunto, conta, contato, remetente)

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
              <span className="al-pv-avatar">{inicRemetente}</span>
              <span className="al-pv-who">
                <strong>{nomeRemetente}</strong>
                {remetente?.cargo && <small>{remetente.cargo}</small>}
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
            <span className="al-pv-avatar">{inicRemetente}</span>
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
          <span className="al-pv-avatar">{inicRemetente}</span>
          <span className="al-pv-who">
            <span>
              <strong>{nomeRemetente}</strong>{' '}
              <small>&lt;{emailRemetente}&gt;</small>
            </span>
            <small>para {nomeContato}{emailContato && <> &lt;{emailContato}&gt;</>}</small>
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
  /** Sem ele, o ambiente não guarda arquivos: não há como anexar. */
  onAnexar?: (arquivo: File, tipo: 'imagem' | 'video') => void
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

          {onAnexar && (
            <>
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
            </>
          )}
        </div>
        <p className="text-[0.6875rem] text-al-muted">
          {onAnexar ? 'O arquivo fica só neste protótipo — nada é enviado.' : MODULO_INDISPONIVEL.anexos}
        </p>
      </div>
    </div>
  )
}

/** O que o Workspace lê do status de uma Sequência que não é dele. */
function rotuloDoStatusPublico(sequencia: Sequencia): string {
  if (sequencia.status === 'encerrada') return 'Encerrada'
  if (sequencia.pausadaPelaConta) return 'Pausada: Conta-alvo arquivada'
  return sequencia.status === 'pausada' ? 'Contato respondeu; sequência pausada' : sequencia.status
}

function textoDoEncerramento(sequencia: Sequencia): string {
  return sequencia.encerradaPor === 'exclusao'
    ? 'Esta Sequência foi encerrada porque a Conta-alvo foi apagada. Os passos pendentes foram cancelados e nada mais sai por ela.'
    : 'Esta Sequência foi encerrada porque a responsabilidade pela Conta-alvo mudou. Os passos pendentes foram cancelados; o Vendedor responsável atual cria a Sequência dele, com o documento e as Contas remetentes dele.'
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
    case 'encerrada':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-al-line text-xs font-normal text-al-muted">
          <span className="size-1.5 rounded-full bg-al-muted" />
          Encerrada
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
