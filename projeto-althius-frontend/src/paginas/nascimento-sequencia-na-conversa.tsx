import { useEffect, useState } from 'react'
import { Check, Sparkles, Users } from 'lucide-react'
import { IconeAgente } from '@/components/marca'
import { Button } from '@/components/ui/button'
import {
  useDados,
  useDadosDeContas,
  useDadosDeSequencias,
  useFonte,
  useFonteDeSequencias,
} from '@/fonte/contexto'
import type { Contato } from '@/fonte/contas-tipos'
import type { StepSequencia } from '@/fonte/sequencias-tipos'
import type { Agente, AgenteId, Integracao } from '@/fonte/tipos'
import { AprovacaoNaConversa } from '@/paginas/aprovacao-na-conversa'
import { DetalheSequencia } from '@/paginas/detalhe-sequencia'

interface Referencias {
  agentes: Record<AgenteId, Agente>
  integracoes: Integracao[]
}

export interface NascimentoSequenciaNaConversaProps {
  contaId: string
  agenteId: string
  sinal?: string
  sequenciaId?: string
  referencias?: Referencias
}

type Estagio = 'oferta' | 'participantes' | 'documento'

function sugerirParticipantes(contatosDaConta: Contato[]): string[] {
  if (contatosDaConta.length <= 1) {
    return contatosDaConta.map((c) => c.id)
  }
  // Seleciona até 2 pessoas prioritárias (decisor / influenciador / líderes), sem incluir o comitê inteiro no automático
  const prioritarios = contatosDaConta.filter(
    (c) =>
      c.persona?.toLowerCase().includes('decisor') ||
      c.persona?.toLowerCase().includes('influenciador') ||
      c.persona?.toLowerCase().includes('técnico') ||
      c.persona?.toLowerCase().includes('tecnico') ||
      c.cargo?.toLowerCase().includes('research') ||
      c.cargo?.toLowerCase().includes('head'),
  )
  if (prioritarios.length >= 2) {
    return prioritarios.slice(0, 2).map((c) => c.id)
  }
  return contatosDaConta.slice(0, 2).map((c) => c.id)
}

function gerarStepsIniciais(
  contaId: string,
  nomeConta: string,
  contatos: Contato[],
  selecionadosIds: string[],
): StepSequencia[] {
  const selecionados = contatos.filter((c) => selecionadosIds.includes(c.id))
  const lead = selecionados[0] ?? contatos[0]
  const segundo = selecionados[1] ?? lead
  const primeiroNome = lead ? lead.nome.split(' ')[0] : 'Time'
  const primeiroNome2 = segundo ? segundo.nome.split(' ')[0] : primeiroNome

  return [
    {
      id: `step-${Date.now()}-1`,
      ordem: 1,
      canal: 'email',
      contatoId: lead ? lead.id : `contato-${contaId}-1`,
      delayDiasUteis: 0,
      titulo: 'Abertura pelo Sinal',
      assunto: `${nomeConta}: abordagem a partir do sinal recente`,
      corpo: `Oi ${primeiroNome},\n\nAcompanhamos as novidades recentes da ${nomeConta}. Times nessa fase costumam otimizar seus pipelines de dados e decisões para acelerar o crescimento.\n\nFaz sentido uma conversa de 20 minutos na próxima semana?\n\nMarina Costa`,
      objetivo: 'Conectar o Sinal a uma dor concreta',
      modoEmail: 'auto',
    },
    {
      id: `step-${Date.now()}-2`,
      ordem: 2,
      canal: 'linkedin',
      contatoId: segundo ? segundo.id : `contato-${contaId}-1`,
      delayDiasUteis: 1,
      titulo: 'Conexão no LinkedIn',
      corpo: `Oi ${primeiroNome2}, vi as movimentações recentes da ${nomeConta} e acompanho seu trabalho na área. Vamos nos conectar por aqui? Abraço!`,
      objetivo: 'Abrir canal de relacionamento no LinkedIn',
      subtipoLinkedIn: 'convite',
    },
    {
      id: `step-${Date.now()}-3`,
      ordem: 3,
      canal: 'email',
      contatoId: lead ? lead.id : `contato-${contaId}-1`,
      delayDiasUteis: 2,
      titulo: 'Follow-up executivo',
      assunto: `Re: ${nomeConta}: abordagem a partir do sinal recente`,
      corpo: `${primeiroNome}, caso você não seja a pessoa certa para avaliar isso, quem do time você me indicaria?\n\nObrigada,\nMarina Costa`,
      objetivo: 'Validar dono da iniciativa sem pressão',
      modoEmail: 'manual',
    },
    {
      id: `step-${Date.now()}-4`,
      ordem: 4,
      canal: 'ligacao',
      contatoId: lead ? lead.id : `contato-${contaId}-1`,
      delayDiasUteis: 2,
      titulo: 'Ligação de alinhamento',
      corpo: `Objetivo: validar prioridades da ${nomeConta}.\n\nAbertura: "Oi ${primeiroNome}, aqui é Marina Costa, da Databricks. Liguei para entender se a expansão de dados já tem dono definido."`,
      objetivo: 'Qualificar dono e próximos passos',
      janela: { de: '10:00', ate: '12:00' },
    },
  ]
}

/**
 * Fluxo de nascimento de sequência na Conversa coordenada:
 * 1. Coordenação oferece a sequência (exige confirmação humana antes de gravar)
 * 2. Rhetor sugere participantes e o humano confirma/altera a lista antes de persistir
 * 3. O documento da sequência aparece na Conversa com a mesma estrutura do detalhe
 */
export function NascimentoSequenciaNaConversa({
  contaId,
  agenteId,
  sinal,
  sequenciaId,
  referencias,
}: NascimentoSequenciaNaConversaProps) {
  const fonteDeAgentes = useFonte()
  const fonteDeSequencias = useFonteDeSequencias()
  const aprovacoes = useDados((f) => f.aprovacoes(), [])
  const { dados: contas } = useDadosDeContas((f) => f.contas(), [])
  const { dados: todosContatos } = useDadosDeContas((f) => f.contatos(), [])
  const { dados: sequenciaExistente } = useDadosDeSequencias(
    (f) => f.sequenciaPorConta(contaId),
    [contaId],
  )

  const conta = contas?.find((c) => c.id === contaId)
  const contatosConta = (todosContatos ?? []).filter((c) => c.contaId === contaId)
  const nomeConta = conta?.nome ?? contaId
  const fraseSinal = sinal ?? conta?.ultimoSinal?.frase ?? 'Sinal recente identificado'
  const agente = referencias?.agentes[agenteId]

  const [estagio, setEstagio] = useState<Estagio>(sequenciaId ? 'documento' : 'oferta')
  const [participantesSelecionados, setParticipantesSelecionados] = useState<string[]>([])
  const [participantesSugeridos, setParticipantesSugeridos] = useState<string[]>([])
  const [sequenciaAtivaId, setSequenciaAtivaId] = useState<string | null>(sequenciaId ?? null)
  const [salvando, setSalvando] = useState(false)
  const [aprovacaoId, setAprovacaoId] = useState<string | null>(null)

  useEffect(() => {
    const idDoc = sequenciaAtivaId ?? sequenciaExistente?.id
    if (estagio === 'documento' && idDoc && !aprovacaoId && aprovacoes) {
      const encontrada = aprovacoes.find((a) => a.sequenciaId === idDoc)
      if (encontrada) {
        setAprovacaoId(encontrada.id)
      }
    }
  }, [estagio, sequenciaAtivaId, sequenciaExistente, aprovacaoId, aprovacoes])

  // Transição 1: Oferta confirmada pelo humano -> Rhetor sugere participantes
  function handleConfirmarOferta() {
    const sugeridos = sugerirParticipantes(contatosConta)
    setParticipantesSugeridos(sugeridos)
    setParticipantesSelecionados(sugeridos)
    setEstagio('participantes')
  }

  function handleAlternarParticipante(id: string) {
    setParticipantesSelecionados((atuais) =>
      atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id],
    )
  }

  // Transição 2: Humano confirma lista de participantes -> grava via FonteDeSequencias
  async function handleConfirmarParticipantes() {
    if (participantesSelecionados.length === 0) return
    setSalvando(true)
    try {
      const existente = sequenciaExistente ?? (await fonteDeSequencias.sequenciaPorConta(contaId))
      let idFinal: string
      let stepsCriados: StepSequencia[] = []
      if (existente) {
        await fonteDeSequencias.confirmarParticipantes(existente.id, participantesSelecionados)
        idFinal = existente.id
        stepsCriados = existente.steps ?? []
      } else {
        stepsCriados = gerarStepsIniciais(contaId, nomeConta, contatosConta, participantesSelecionados)
        const nova = await fonteDeSequencias.criarSequencia({
          contaId,
          participantesIds: participantesSelecionados,
          steps: stepsCriados,
        })
        idFinal = nova.id
      }
      setSequenciaAtivaId(idFinal)
      setEstagio('documento')

      // Propor Aprovação simulada pós-documento no padrão do app (ADR 0002 / Propor)
      const totalSteps = stepsCriados.length || 4
      fonteDeAgentes
        .proporAprovacao({
          agenteId: agenteId || 'rhetor',
          acao: `Ativar sequência da Conta-alvo ${nomeConta} (${totalSteps} steps)`,
          integracaoId: 'hubspot',
          impacto: `${totalSteps} steps multicanal para ${participantesSelecionados.length} ${
            participantesSelecionados.length === 1 ? 'contato' : 'contatos'
          } (simulação, sem envio real)`,
          justificativa: `Sequência estruturada pelo Rhetor a partir do sinal recente da ${nomeConta}.`,
          origem: 'althius',
          gatilho: 'coordenacao',
          contaId,
          contaNome: nomeConta,
          sequenciaId: idFinal,
        })
        .then((novaAprovacao) => {
          setAprovacaoId(novaAprovacao.id)
        })
    } finally {
      setSalvando(false)
    }
  }

  // ESTÁGIO 1: OFERTA DE SEQUÊNCIA (Exige confirmação humana antes de gravar)
  if (estagio === 'oferta') {
    return (
      <article
        aria-label={`Oferta de sequência: ${nomeConta}`}
        className="flex flex-col gap-4 border border-al-line bg-al-surface p-5"
      >
        <div className="flex items-center gap-2 text-sm text-al-muted">
          <IconeAgente especialidade="rhetor" tamanho="sm" />
          <span className="font-normal text-al-ink">{agente?.nome ?? 'Rhetor'}</span>
          <span className="text-al-line">·</span>
          <span className="rotulo">Coordenação · Oferta de sequência</span>
          <span className="text-al-line">·</span>
          <span className="text-xs uppercase tracking-rotulo text-al-accent font-medium">
            🔥 Conta Quente
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg font-normal leading-snug text-al-ink">
            Montar sequência de abordagem para {nomeConta}
          </h3>
          <p className="text-sm text-al-muted leading-relaxed">
            Sinal identificado pelo Scopus: &ldquo;{fraseSinal}&rdquo;. O Comitê de compra foi
            mapeado pelo Ethos. Deseja que o Rhetor estruture a sequência multicanal para esta
            Conta-alvo?
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-al-line/60">
          <div className="flex items-center gap-2 text-xs text-al-muted">
            <span className="px-1.5 py-0.5 border border-al-line text-[0.625rem] uppercase tracking-rotulo text-al-muted">
              Human-in-the-loop
            </span>
            <span>Exige confirmação humana antes de gravar na conta</span>
          </div>

          <Button
            type="button"
            onClick={handleConfirmarOferta}
            className="inline-flex items-center gap-1.5 h-8 border border-al-ink bg-al-ink px-4 text-xs font-medium tracking-rotulo text-al-surface uppercase hover:bg-al-muted"
          >
            <Sparkles className="size-3.5" />
            Montar sequência
          </Button>
        </div>
      </article>
    )
  }

  // ESTÁGIO 2: SUGESTÃO DE PARTICIPANTES (Humano altera lista antes de persistir)
  if (estagio === 'participantes') {
    const totalContatos = contatosConta.length

    return (
      <article
        aria-label={`Sugestão de participantes: ${nomeConta}`}
        className="flex flex-col gap-4 border border-al-line bg-al-surface p-5"
      >
        <div className="flex items-center gap-2 text-sm text-al-muted">
          <IconeAgente especialidade="rhetor" tamanho="sm" />
          <span className="font-normal text-al-ink">{agente?.nome ?? 'Rhetor'}</span>
          <span className="text-al-line">·</span>
          <span className="rotulo">Sugestão de participantes</span>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-normal leading-snug text-al-ink">
            Participantes da sequência de {nomeConta}
          </h3>
          <p className="text-sm text-al-muted leading-relaxed">
            O Rhetor sugeriu os contatos e personas mais aderentes ao Sinal. Confirme ou altere quem
            deve entrar na sequência antes de gerar o documento (o comitê inteiro não é incluído no
            automático):
          </p>
        </div>

        {/* Lista de Contatos com seleção */}
        <div
          role="group"
          aria-label="Contatos participantes da sequência"
          className="flex flex-col divide-y divide-al-line border border-al-line bg-al-bg"
        >
          {contatosConta.map((contato) => {
            const selecionado = participantesSelecionados.includes(contato.id)
            const sugerido = participantesSugeridos.includes(contato.id)

            return (
              <label
                key={contato.id}
                className="flex items-center justify-between gap-3 p-3 cursor-pointer hover:bg-al-surface/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selecionado}
                    onChange={() => handleAlternarParticipante(contato.id)}
                    aria-label={contato.nome}
                    className="size-4 rounded-none accent-al-ink cursor-pointer"
                  />
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-al-ink">{contato.nome}</span>
                      {contato.persona && (
                        <span className="px-1.5 py-0.5 text-[0.625rem] uppercase tracking-rotulo bg-al-surface border border-al-line text-al-muted">
                          {contato.persona}
                        </span>
                      )}
                      {sugerido && (
                        <span className="px-1.5 py-0.5 text-[0.625rem] uppercase tracking-rotulo bg-al-accent/10 border border-al-accent/30 text-al-accent font-medium">
                          Sugerido pelo Rhetor
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-al-muted">{contato.cargo}</span>
                  </div>
                </div>

                <div className="text-xs text-al-muted">
                  {selecionado ? (
                    <span className="inline-flex items-center gap-1 text-al-ink font-medium">
                      <Check className="size-3.5 text-al-accent" /> Incluído
                    </span>
                  ) : (
                    <span>Não incluído</span>
                  )}
                </div>
              </label>
            )
          })}

          {contatosConta.length === 0 && (
            <div className="p-4 text-xs text-al-muted">
              Nenhum contato cadastrado nesta Conta-alvo.
            </div>
          )}
        </div>

        {totalContatos === 1 && (
          <p className="text-xs text-al-muted italic">
            Conta com 1 contato: uma sequência focada é válida e recomendada para este contato único.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-al-line/60">
          <div className="text-xs text-al-muted">
            {participantesSelecionados.length}{' '}
            {participantesSelecionados.length === 1
              ? 'participante selecionado'
              : 'participantes selecionados'}{' '}
            de {totalContatos}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEstagio('oferta')}
              className="h-8 border-al-line text-xs uppercase tracking-rotulo"
            >
              Voltar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmarParticipantes}
              disabled={participantesSelecionados.length === 0 || salvando}
              className="inline-flex items-center gap-1.5 h-8 border border-al-ink bg-al-ink px-4 text-xs font-medium tracking-rotulo text-al-surface uppercase hover:bg-al-muted disabled:opacity-40"
            >
              <Users className="size-3.5" />
              {salvando ? 'Gravando…' : 'Confirmar participantes e gerar sequência'}
            </Button>
          </div>
        </div>
      </article>
    )
  }

  // ESTÁGIO 3: DOCUMENTO NA CONVERSA (Usa a mesma sequência da fonte que o detalhe)
  const idDoc = sequenciaAtivaId ?? sequenciaExistente?.id
  if (!idDoc) return null

  const idAprovacao = aprovacaoId ?? aprovacoes?.find((a) => a.sequenciaId === idDoc)?.id

  return (
    <div className="flex flex-col gap-6">
      <article
        aria-label={`Documento da sequência: ${nomeConta}`}
        className="flex flex-col gap-3 border border-al-line bg-al-surface p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-al-line pb-3 text-xs text-al-muted">
          <div className="flex items-center gap-2">
            <IconeAgente especialidade="rhetor" tamanho="sm" />
            <span className="font-normal text-al-ink">{agente?.nome ?? 'Rhetor'}</span>
            <span className="text-al-line">·</span>
            <span className="rotulo text-al-accent font-medium">Documento vivo da sequência</span>
          </div>
          <span className="px-1.5 py-0.5 border border-al-line text-[0.625rem] uppercase tracking-rotulo text-al-muted">
            Espelhado com Detalhe da Conta e Lista Global
          </span>
        </div>

        <DetalheSequencia sequenciaId={idDoc} incorporado={true} />
      </article>

      {idAprovacao && (
        <section aria-label="Aprovação pós-documento" className="flex flex-col gap-2">
          <AprovacaoNaConversa
            aprovacaoId={idAprovacao}
            cabecalho={(_aprovacao, rotuloDoEstado) => (
              <div className="flex items-center gap-2 text-sm text-al-muted mb-1">
                <IconeAgente especialidade="rhetor" tamanho="sm" />
                <span className="font-normal text-al-ink">{agente?.nome ?? 'Rhetor'}</span>
                <span className="text-al-line">·</span>
                <span className="rotulo">{rotuloDoEstado}</span>
                <span className="text-al-line">·</span>
                <span className="text-xs uppercase tracking-rotulo text-al-muted">
                  Simulação (sem envio real)
                </span>
              </div>
            )}
            className="border border-al-line bg-al-surface p-5 gap-2"
          />
        </section>
      )}
    </div>
  )
}
