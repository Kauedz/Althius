import { useState } from 'react'
import { Pause, Play, Plus } from 'lucide-react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { useAmbiente, useDadosDeSinais, useFonteDeContas } from '@/fonte/contexto'
import type { EstadoDoMonitoramento } from '@/fonte/sinais-tipos'
import { ROTULO_DA_ORIGEM, TIPO_PERSONALIZADO, familiaDoTipo, tipoPorId } from './catalogo'
import { SeloDoEstado } from './componentes'
import { motivoDaIndisponibilidade, podeMonitorar } from './disponibilidade'
import { useMonitoramentos, useSinaisDoMockup } from './estado'
import { VALIDADE_EM_DIAS, sinaisDisparadosPor } from './dados-mock'
import { ACAO_DO_ESTADO, resumoDaExecucao, resumoDasContas, resumoDoPublico, resumoDosCriterios } from './resumos'

export function PaginaDoTipo() {
  const { tipoId = '' } = useParams<{ tipoId: string }>()
  const { state } = useLocation() as { state?: { aviso?: string } }
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const operacional = useAmbiente().modo === 'real'
  const hoje = useFonteDeContas().hoje()
  const tipo = tipoPorId(tipoId)
  const monitoramentos = useMonitoramentos(tipoId)
  const { mudarEstado } = useSinaisDoMockup()
  const {
    carregando,
    erro,
    recarregar,
  } = useDadosDeSinais((f) => f.monitoramentosDoTipo(tipoId), [tipoId])
  const { dados: sinaisEncontrados } = useDadosDeSinais((f) => f.sinaisEncontrados(), [])
  // O estado do tipo (disponível, em teste ou em breve) só o Workspace operacional informa.
  const { dados: tipoDaFonte } = useDadosDeSinais((f) => f.tipo(tipoId), [tipoId])

  if (!tipo) return <Navigate to="/sinais" replace />
  const permiteCriar = !tipoDaFonte || podeMonitorar(tipoDaFonte)
  const motivoDeNaoCriar = tipoDaFonte ? motivoDaIndisponibilidade(tipoDaFonte) : null
  const familia = familiaDoTipo(tipo)
  const personalizado = tipo.id === TIPO_PERSONALIZADO.id
  const ativos = monitoramentos.filter((m) => m.estado === 'ativo').length

  const alternarEstado = async (id: string, novoEstado: EstadoDoMonitoramento) => {
    setErroAcao(null)
    try {
      await mudarEstado(id, novoEstado)
    } catch {
      setErroAcao(
        `Não foi possível ${novoEstado === 'pausado' ? 'pausar' : 'retomar'} o monitoramento. Tente de novo.`,
      )
    }
  }

  return (
    <Pagina
      titulo={tipo.nome}
      voltar={{ para: '/sinais', rotulo: 'Sinais' }}
      acoes={
        permiteCriar ? (
          <Link to={`/sinais/tipos/${tipo.id}/novo`} className={BOTAO_PRIMARIO}>
            <Plus strokeWidth={1.8} className="size-4" aria-hidden />
            {personalizado ? 'Novo personalizado' : 'Novo monitoramento'}
          </Link>
        ) : undefined
      }
    >
      <div className="flex max-w-3xl flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {familia ? (
            <>
              <span className="selo">{ROTULO_DA_ORIGEM[familia.origem]}</span>
              <span className="selo">{familia.nome}</span>
            </>
          ) : (
            <span className="selo">Qualquer origem</span>
          )}
        </div>
        <p className="text-base">{tipo.descricao}</p>
        <p className="text-sm text-al-muted">
          Cada Sinal disparado deixa a Conta-alvo Quente por {VALIDADE_EM_DIAS} dias. Pausar um Monitoramento interrompe novas detecções e
          preserva os sinais anteriores.
        </p>
      </div>

      {motivoDeNaoCriar && (
        <p role="status" className="border-l-2 border-al-atencao bg-al-surface px-4 py-3 text-sm">
          {motivoDeNaoCriar}
        </p>
      )}

      {state?.aviso && (
        <p role="status" className="border-l-2 border-al-sucesso bg-al-surface px-4 py-3 text-sm">
          {state.aviso}
        </p>
      )}

      {erroAcao && (
        <div role="alert" className="flex items-center justify-between border-l-2 border-al-perigo bg-al-surface px-4 py-3 text-sm text-al-perigo">
          <span>{erroAcao}</span>
          <button
            type="button"
            onClick={() => setErroAcao(null)}
            className="text-xs text-al-muted hover:text-al-ink underline underline-offset-4"
          >
            Fechar
          </button>
        </div>
      )}


      {carregando && monitoramentos.length === 0 && <Carregando />}

      {erro && (
        <div role="alert" className="flex flex-col items-start gap-3 border border-al-line bg-al-surface p-6">
          <p className="text-sm text-al-muted">Não foi possível carregar os monitoramentos.</p>
          <button
            type="button"
            onClick={recarregar}
            className={BOTAO_SECUNDARIO}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {!erro && (
      <section aria-labelledby="titulo-monitoramentos" className="flex flex-col gap-4">
        <h2 id="titulo-monitoramentos" className="flex items-baseline gap-3">
          <span className="titulo-secao text-lg">Monitoramentos</span>
          <span className="rotulo text-[0.625rem]">
            {monitoramentos.length} no total · {ativos} {ativos === 1 ? 'ativo' : 'ativos'}
          </span>
        </h2>

        {monitoramentos.length === 0 ? (
          <div className="flex flex-col items-start gap-3 border border-dashed border-al-line p-6">
            <p className="text-sm">
              {personalizado ? 'Nenhum sinal personalizado ainda.' : 'Nenhum Monitoramento deste tipo ainda.'}
            </p>
            <p className="text-sm text-al-muted">
              Você pode criar vários, cada um com nome, critérios e público próprios.
            </p>
            <Link to={`/sinais/tipos/${tipo.id}/novo`} className={BOTAO_PRIMARIO}>
              <Plus strokeWidth={1.8} className="size-4" aria-hidden />
              {personalizado ? 'Descrever um sinal' : 'Criar o primeiro'}
            </Link>
          </div>
        ) : (
          <ul aria-label="Monitoramentos deste tipo" className="flex flex-col border-t border-al-line">
            {monitoramentos.map((m) => {
              // No operacional, enquanto os Sinais não chegam, não há contagem: os disparos de exemplo são só da Demonstração.
              const disparados = sinaisEncontrados
                ? sinaisEncontrados.filter((s) => s.monitoramentoId === m.id).length
                : operacional ? 0 : sinaisDisparadosPor(m.id)
              return (
              <li
                key={m.id}
                aria-label={m.nome}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 border-b border-al-line py-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link to={`/sinais/tipos/${tipo.id}/${m.id}`} className="text-base font-normal hover:text-al-accent hover:underline">
                      {m.nome}
                    </Link>
                    <SeloDoEstado estado={m.estado} />
                    {m.origem && <span className="selo">{ROTULO_DA_ORIGEM[m.origem]}</span>}
                  </div>
                  <p className="truncate text-sm text-al-muted" title={resumoDosCriterios(m)}>
                    {resumoDosCriterios(m)}
                  </p>
                  <p className="text-xs text-al-muted">
                    {operacional ? resumoDasContas(m.publico.listas.length) : resumoDoPublico(m.publico)}
                    {disparados > 0 && ` · ${disparados} ${disparados === 1 ? 'Sinal disparado' : 'Sinais disparados'}`}
                  </p>
                  {m.ultimaFalha && (
                    <p className="text-xs text-al-atencao">Última rodada: {m.ultimaFalha}</p>
                  )}
                  {!m.ultimaFalha && m.ultimaExecucao?.estado === 'concluida' && (
                    <p className="text-xs text-al-muted">{resumoDaExecucao(m.ultimaExecucao, hoje)}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {m.estado === 'ativo' && (
                    <button type="button" onClick={() => alternarEstado(m.id, 'pausado')} className={BOTAO_DISCRETO}>
                      <Pause strokeWidth={1.8} className="size-3.5" aria-hidden />
                      Pausar
                    </button>
                  )}
                  {m.estado === 'pausado' && (
                    <button type="button" onClick={() => alternarEstado(m.id, 'ativo')} className={BOTAO_DISCRETO}>
                      <Play strokeWidth={1.8} className="size-3.5" aria-hidden />
                      Retomar
                    </button>
                  )}
                  <Link to={`/sinais/tipos/${tipo.id}/${m.id}`} className={BOTAO_DISCRETO}>
                    {ACAO_DO_ESTADO[m.estado]}
                  </Link>
                </div>
              </li>
              )
            })}
          </ul>
        )}
      </section>
      )}
    </Pagina>
  )
}
