import { CalendarClock, Plus, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Opcao } from '@/components/opcao'
import {
  AGENDA_PADRAO,
  AVISO_DO_ESCOPO_GRANDE,
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
import type { Monitoramento } from '@/fonte/sinais-tipos'
import { cn } from '@/lib/utils'

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
 * marcado. O servidor confere os limites de novo ao gravar. A estimativa de créditos por dia e por mês é do ticket 30-05, que
 * ocupa o lugar marcado abaixo; aqui só se mostra quantas Rodadas por semana a Agenda faz.
 */
export function AgendaDoSinalNoMonitoramento({ monitoramento }: { monitoramento: Monitoramento }) {
  const fonte = useFonteDeSinais()
  const idDoHorario = useId()
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

  const problema = validarAgenda(rascunho, contas)
  const problemaDosHorarios = problema && ERROS_DE_HORARIO.includes(problema) ? problema : null
  const problemaDosDias = problema && !ERROS_DE_HORARIO.includes(problema) ? problema : null
  const mudou = !salva || !mesmaAgenda(rascunho, salva)

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
    const codigo = validarAgenda({ ...candidata, dias: rascunho.dias.length > 0 ? rascunho.dias : AGENDA_PADRAO.dias }, contas)
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
    try {
      await fonte.salvarAgenda!(monitoramento.id, rascunho)
      setSalvou(true)
    } catch (e) {
      setErroAoSalvar(e instanceof ErroDaAgenda ? e.message : MENSAGEM_DA_FALHA_DA_AGENDA)
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
        {contas > LIMITES_DA_AGENDA.contasDoEscopoGrande && <p className="text-xs text-al-muted">{AVISO_DO_ESCOPO_GRANDE}</p>}
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
        {/* A estimativa de créditos por dia e por mês entra aqui (30-05). */}
        <div data-lugar="estimativa-de-creditos" />
        {proximas && proximas.length > 0 && <p className="text-al-muted">{textoDasProximasRodadas(proximas)}</p>}
        {!problema && calculo?.para === rascunho && calculo.lista === null && (
          <p className="text-al-muted">Não foi possível calcular as próximas rodadas agora.</p>
        )}
        {aviso && !problema && <p className="text-xs text-al-muted">{aviso}</p>}
      </div>

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
        <button type="button" onClick={salvar} disabled={salvando || !!problema || !mudou} className={BOTAO_PRIMARIO}>
          Salvar agenda
        </button>
      </div>
    </section>
  )
}
