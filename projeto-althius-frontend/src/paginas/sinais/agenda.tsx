import { CalendarClock, Plus, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Opcao } from '@/components/opcao'
import {
  AGENDA_PADRAO,
  ErroDaAgenda,
  ERROS_DE_HORARIO,
  HORARIOS_POSSIVEIS,
  LIMITES_DA_AGENDA,
  MENSAGEM_DA_FALHA_DA_AGENDA,
  NOME_CURTO_DO_DIA,
  REGRA_DA_AGENDA,
  TEXTO_DO_ERRO_DA_AGENDA,
  adicionarHorario,
  alternarDia,
  mesmaAgenda,
  removerHorario,
  rodadasPorSemana,
  textoDasProximasRodadas,
  validarAgenda,
  type AgendaDoSinal,
  type CodigoDeErroDaAgenda,
} from '@/fonte/agenda-do-sinal'
import { useFonteDeSinais } from '@/fonte/contexto'
import {
  AVISO_DE_REPETICAO,
  ErroDoLimite,
  MENSAGEM_DA_FALHA_DO_LIMITE,
  creditos,
  textoDaEstimativa,
  textoDoErroDoLimite,
  validarLimitePorDia,
} from '@/fonte/preco-por-rodada'
import type { Monitoramento } from '@/fonte/sinais-tipos'
import { cn } from '@/lib/utils'
import { useEstimativa } from './usar-estimativa'

const QUANTAS_PROXIMAS = 3
const DIAS = [1, 2, 3, 4, 5, 6, 7]

/** O que a pessoa lê do estado do Sinal: a Agenda só começa a valer com o Sinal ativo. */
function avisoDoEstado(estado: Monitoramento['estado']): string | null {
  if (estado === 'ativo') return null
  if (estado === 'pausado') return 'O Sinal está pausado: as rodadas voltam quando você o retomar.'
  return 'O Sinal ainda não está ativo: as rodadas começam quando você o ativar.'
}

/**
 * A Agenda do Sinal (agente-de-sinal 03): quantas Rodadas por dia, em quais horários e em quais dias. Os horários são de 15 em
 * 15 minutos, no horário de Brasília. O relógio acorda o Sinal a cada 10 minutos, então a Rodada começa por volta do horário
 * marcado. O servidor confere os limites de novo ao gravar.
 *
 * A Estimativa (agente-de-sinal 04) mostra quanto a Agenda pode gastar por Rodada, por dia e por mês, e quanto tempo o saldo dura
 * nesse ritmo, e muda a cada horário ou dia que a pessoa mexe. O "Limite por dia" (opcional) vem preenchido com o máximo de um dia
 * da Agenda, que a pessoa só pode baixar; "Salvar agenda" grava a Agenda e o limite.
 */
export function AgendaDoSinalNoMonitoramento({ monitoramento }: { monitoramento: Monitoramento }) {
  const fonte = useFonteDeSinais()
  const idDoHorario = useId()
  const idDoLimite = useId()
  const salva = monitoramento.agenda
  const contas = monitoramento.publico.listas.length
  const [rascunho, setRascunho] = useState<AgendaDoSinal>(() => salva ?? { ...AGENDA_PADRAO, horarios: [...AGENDA_PADRAO.horarios], dias: [...AGENDA_PADRAO.dias] })
  const [novoHorario, setNovoHorario] = useState('08:00')
  const [recusaDoHorario, setRecusaDoHorario] = useState<CodigoDeErroDaAgenda | null>(null)
  // O cálculo mais recente dos próximos horários, com a Agenda a que se refere (lista nula: o cálculo falhou).
  const [calculo, setCalculo] = useState<{ para: AgendaDoSinal; lista: string[] | null } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [salvou, setSalvou] = useState(false)
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null)
  // O que a pessoa digitou no limite por dia; nulo enquanto ela não mexeu (o campo segue o que está gravado ou o sugerido).
  const [textoDoLimite, setTextoDoLimite] = useState<string | null>(null)

  const problema = validarAgenda(rascunho)
  const problemaDosHorarios = problema && ERROS_DE_HORARIO.includes(problema) ? problema : null
  const problemaDosDias = problema && !ERROS_DE_HORARIO.includes(problema) ? problema : null
  const agendaMudou = !salva || !mesmaAgenda(rascunho, salva)
  // A estimativa segue a Agenda que a pessoa está montando, sem gravar nada; só enquanto a Agenda vale.
  const { estimativa } = useEstimativa(monitoramento.id, problema ? undefined : rascunho, !problema)

  // O limite por dia: de 1 ao máximo de um dia da Agenda (a pessoa só baixa). Sem mexer, o campo mostra o limite gravado, ou o
  // sugerido enquanto o gravado é o padrão (o máximo da Agenda gravada): assim ele acompanha a Agenda.
  const limiteSalvo = monitoramento.limitePorDia
  const sugerido = estimativa?.limiteSugeridoPorDia
  const mostraLimite = !!fonte.salvarLimitePorDia && sugerido !== undefined && sugerido > 0
  const sugeridoDaGravada = estimativa && salva ? estimativa.porRodada * salva.horarios.length : null
  const seguePadrao = limiteSalvo === undefined || (sugeridoDaGravada !== null && limiteSalvo >= sugeridoDaGravada)
  const problemaDoLimite = mostraLimite && textoDoLimite !== null ? validarLimitePorDia(textoDoLimite, sugerido) : null
  const limiteEfetivo: number | null = !mostraLimite
    ? null
    : textoDoLimite !== null
    ? (problemaDoLimite ? null : Number(textoDoLimite.trim()))
    : seguePadrao
    ? sugerido
    : Math.min(limiteSalvo, sugerido)
  const limiteParaSalvar =
    limiteEfetivo !== null && limiteEfetivo !== limiteSalvo && (agendaMudou || textoDoLimite !== null) ? limiteEfetivo : null
  const mudou = agendaMudou || limiteParaSalvar !== null

  // Os próximos horários vêm do mesmo cálculo que o relógio usa; só quando a Agenda vale.
  useEffect(() => {
    if (problema || !fonte.proximasRodadas) return
    let ativo = true
    fonte
      .proximasRodadas(rascunho, contas, QUANTAS_PROXIMAS)
      .then((lista) => ativo && setCalculo({ para: rascunho, lista }))
      .catch(() => ativo && setCalculo({ para: rascunho, lista: null }))
    return () => {
      ativo = false
    }
  }, [fonte, rascunho, contas, problema])

  if (!fonte.salvarAgenda) return null

  function editar(nova: AgendaDoSinal) {
    setRascunho(nova)
    setSalvou(false)
    setErroAoSalvar(null)
  }

  function adicionar() {
    const candidata = adicionarHorario(rascunho, novoHorario)
    // Só conta o que diz respeito aos horários: os dias são escolhidos à parte.
    const codigo = validarAgenda({ ...candidata, dias: rascunho.dias.length > 0 ? rascunho.dias : AGENDA_PADRAO.dias })
    if (codigo && ERROS_DE_HORARIO.includes(codigo)) {
      setRecusaDoHorario(codigo)
      return
    }
    setRecusaDoHorario(null)
    editar(candidata)
  }

  async function salvar() {
    setSalvando(true)
    setSalvou(false)
    setErroAoSalvar(null)
    let etapa: 'agenda' | 'limite' = 'agenda'
    try {
      if (agendaMudou) await fonte.salvarAgenda!(monitoramento.id, rascunho)
      etapa = 'limite'
      // O limite só vale depois da Agenda: o servidor confere contra o máximo de um dia da Agenda gravada.
      if (limiteParaSalvar !== null) await fonte.salvarLimitePorDia!(monitoramento.id, limiteParaSalvar)
      setTextoDoLimite(null)
      setSalvou(true)
    } catch (e) {
      setErroAoSalvar(
        e instanceof ErroDaAgenda || e instanceof ErroDoLimite
          ? e.message
          : etapa === 'agenda' ? MENSAGEM_DA_FALHA_DA_AGENDA : MENSAGEM_DA_FALHA_DO_LIMITE,
      )
    } finally {
      setSalvando(false)
    }
  }

  const proximas = !problema && calculo?.para === rascunho ? calculo.lista : null
  const erroDosHorarios = recusaDoHorario ?? problemaDosHorarios
  const aviso = avisoDoEstado(monitoramento.estado)

  return (
    <section aria-label="Agenda" className="rounded-xl flex flex-col gap-5 border border-al-line bg-al-surface p-4">
      <header className="flex flex-col gap-1">
        <span className="rotulo inline-flex items-center gap-2 text-al-accent">
          <CalendarClock strokeWidth={1.8} className="size-3.5" aria-hidden />
          Agenda
        </span>
        <p className="text-sm text-al-muted">
          Escolha quantas vezes por dia o Sinal roda e em quais horários, no horário de Brasília. {REGRA_DA_AGENDA}
        </p>
        {!salva && (
          <p className="text-sm text-al-muted">Sem agenda salva, o Sinal roda a cada 24 horas. Esta é a agenda sugerida: salve para valer.</p>
        )}
      </header>

      <div role="group" aria-label="Horários" className="flex flex-col gap-2">
        <span className="rotulo text-al-ink" aria-hidden>
          Horários
        </span>
        {rascunho.horarios.length > 0 ? (
          <ul aria-label="Horários da agenda" className="flex flex-wrap gap-2">
            {rascunho.horarios.map((horario) => (
              <li
                key={horario}
                className="rounded-md inline-flex h-8 items-center gap-1 border border-al-accent bg-al-accent/10 pl-3 pr-1 text-sm text-al-ink"
              >
                {horario}
                <button
                  type="button"
                  aria-label={`Remover ${horario}`}
                  onClick={() => {
                    setRecusaDoHorario(null)
                    editar(removerHorario(rascunho, horario))
                  }}
                  className="rounded-md grid size-6 place-items-center text-al-muted transition-colors hover:text-al-ink"
                >
                  <X strokeWidth={1.8} className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-al-muted">Nenhum horário escolhido.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={idDoHorario} className="text-xs text-al-muted">
              Novo horário
            </label>
            <select
              id={idDoHorario}
              value={novoHorario}
              onChange={(e) => {
                setNovoHorario(e.target.value)
                setRecusaDoHorario(null)
              }}
              className="campo h-10 w-32"
            >
              {HORARIOS_POSSIVEIS.map((horario) => (
                <option key={horario} value={horario}>
                  {horario}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={adicionar} className={BOTAO_SECUNDARIO}>
            <Plus strokeWidth={1.8} className="size-4" aria-hidden />
            Adicionar horário
          </button>
        </div>
        <p className="text-xs text-al-muted">
          De {LIMITES_DA_AGENDA.passoEmMinutos} em {LIMITES_DA_AGENDA.passoEmMinutos} minutos. O relógio acorda o Sinal a cada 10 minutos, então a rodada começa por volta do horário.
        </p>
        {erroDosHorarios && (
          <p role="alert" className="text-xs text-al-erro">
            {TEXTO_DO_ERRO_DA_AGENDA[erroDosHorarios]}
          </p>
        )}
      </div>

      <div role="group" aria-label="Dias da semana" className="flex flex-col gap-2">
        <span className="rotulo text-al-ink" aria-hidden>
          Dias da semana
        </span>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((dia) => (
            <Opcao key={dia} marcada={rascunho.dias.includes(dia)} aoClicar={() => editar(alternarDia(rascunho, dia))}>
              {NOME_CURTO_DO_DIA[dia].replace(/^./, (letra) => letra.toUpperCase())}
            </Opcao>
          ))}
        </div>
        {problemaDosDias && (
          <p role="alert" className="text-xs text-al-erro">
            {TEXTO_DO_ERRO_DA_AGENDA[problemaDosDias]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1 text-sm">
        {!problema && (
          <p>
            <span className="rotulo mr-2">Rodadas por semana</span>
            {rodadasPorSemana(rascunho).toLocaleString('pt-BR')}
          </p>
        )}
        {estimativa && (
          <>
            <p>
              <span className="rotulo mr-2">Estimativa</span>
              {textoDaEstimativa(estimativa)}
            </p>
            {estimativa.avisoDeRepeticao && <p className="text-xs text-al-muted">{AVISO_DE_REPETICAO}</p>}
          </>
        )}
        {proximas && proximas.length > 0 && <p className="text-al-muted">{textoDasProximasRodadas(proximas)}</p>}
        {!problema && calculo?.para === rascunho && calculo.lista === null && (
          <p className="text-al-muted">Não foi possível calcular as próximas rodadas agora.</p>
        )}
        {aviso && !problema && <p className="text-xs text-al-muted">{aviso}</p>}
      </div>

      {mostraLimite && (
        <div className="flex flex-col gap-1">
          <label htmlFor={idDoLimite} className="rotulo text-al-ink">
            Limite por dia
          </label>
          <div className="flex items-center gap-2">
            <input
              id={idDoLimite}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={textoDoLimite ?? String(limiteEfetivo ?? '')}
              aria-invalid={problemaDoLimite ? true : undefined}
              onChange={(e) => {
                setTextoDoLimite(e.target.value)
                setSalvou(false)
                setErroAoSalvar(null)
              }}
              className="campo h-10 w-32"
            />
            <span className="text-sm text-al-muted">créditos</span>
          </div>
          <p className="text-xs text-al-muted">
            Opcional. O Sinal para de rodar no dia quando chega a esse limite, somando as rodadas agendadas e as manuais. Você
            pode baixar o limite; o máximo é {creditos(sugerido)}, o que a agenda gasta num dia.
          </p>
          {problemaDoLimite && (
            <p role="alert" className="text-xs text-al-erro">
              {textoDoErroDoLimite(problemaDoLimite, sugerido)}
            </p>
          )}
        </div>
      )}
      {erroAoSalvar && (
        <p role="alert" className={cn('rounded-xl bg-al-erro/10 px-4 py-3 text-sm text-al-erro')}>
          {erroAoSalvar}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {salvou && !mudou && (
          <p role="status" className="text-sm text-al-muted">
            Agenda salva.
          </p>
        )}
        <button type="button" onClick={salvar} disabled={salvando || !!problema || !!problemaDoLimite || !mudou} className={BOTAO_PRIMARIO}>
          Salvar agenda
        </button>
      </div>
    </section>
  )
}
