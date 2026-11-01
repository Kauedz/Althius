import { useState, type ReactNode } from 'react'
import { CalendarClock, Coins, Database, Flame, Pause, Play, Zap, type LucideIcon } from 'lucide-react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { cn } from '@/lib/utils'
import { BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { useAmbiente, useDadosDeContas, useDadosDeSinais, useFonteDeContas } from '@/fonte/contexto'
import type { CardSobPedido, EstadoDoMonitoramento, Monitoramento } from '@/fonte/sinais-tipos'
import { ROTULO_DA_ORIGEM, familiaDoTipo, tipoPorId, type TipoDeSinal } from './catalogo'
import { cardPorId, cardQueConta, nomesDosNichos, valeParaTodosOsNichos } from './catalogo-visivel'
import { sinalArquivado } from './arquivados'
import { useCatalogoFuncional } from './catalogo-funcional'
import { SeloDoEstado } from './componentes'
import { motivoDaIndisponibilidade, podeMonitorar } from './disponibilidade'
import { useMonitoramentos, useSinaisDoMockup } from './estado'
import { CONTAS_MOCK, SINAIS_MOCK, VALIDADE_EM_DIAS, sinaisDisparadosPor } from './dados-mock'
import {
  ZONA_DA_VITRINE,
  cardDoExtra,
  custoEmCreditos,
  eLancamento,
  frequenciaDoCard,
  resultadoDoCard,
  ultimasDetectadas,
  usePedidosDaVitrine,
} from './vitrine'
import { BotaoAviseMe, CapaDoSinal, PreviaDasDetectadas, SelosDoEstado } from './vitrine-pecas'
import { ACAO_DO_ESTADO, resumoDaRodada, resumoDasContas, resumoDoPublico, resumoDosCriterios } from './resumos'
import { useAtivacaoDoSinal } from './usar-ativacao'
import { AvisoDePausaPorCreditos, AvisoDeRodadaPulada } from './aviso-de-pausa'
import { sinalComRodadaPulada } from '@/fonte/preco-por-rodada'
import { noMercado, resumoDoMercado } from './mercado-enderecavel'

/**
 * Retomar o Sinal pausado pela pessoa. Com Agenda, passa pela confirmação "Ativar Sinal" (retomar volta a gastar créditos); sem
 * Agenda, retoma direto, como sempre.
 */
function BotaoDeRetomar({ monitoramento, aoFalhar }: { monitoramento: Monitoramento; aoFalhar: (mensagem: string) => void }) {
  const { pedir, dialogo } = useAtivacaoDoSinal(monitoramento, () => aoFalhar('Não foi possível retomar o monitoramento. Tente de novo.'))
  return (
    <>
      <button type="button" onClick={pedir} className={BOTAO_DISCRETO}>
        <Play strokeWidth={1.8} className="size-3.5" aria-hidden />
        Retomar
      </button>
      {dialogo}
    </>
  )
}

function tipoDoExtra(extra: CardSobPedido): TipoDeSinal {
  return {
    id: extra.id,
    nome: extra.nome,
    descricao: extra.frase,
    familiaId: extra.familiaId,
    formulario: familiaDoTipo({ id: extra.id, nome: extra.nome, descricao: extra.frase, familiaId: extra.familiaId })?.formulario ?? 'expansao',
  }
}

export function PaginaDoTipo() {
  const { tipoId = '' } = useParams<{ tipoId: string }>()
  const { state } = useLocation() as { state?: { aviso?: string } }
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const operacional = useAmbiente().modo === 'real'
  const hoje = useFonteDeContas().hoje()
  const todos = useMonitoramentos()
  const { mudarEstado, carregando, erro, recarregar } = useSinaisDoMockup()
  const { dados: sinaisEncontrados } = useDadosDeSinais((f) => f.sinaisEncontrados(), [])
  const { dados: tipoDaFonte } = useDadosDeSinais((f) => f.tipo(tipoId), [tipoId])
  const { dados: extras, carregando: carregandoExtras } = useDadosDeSinais((f) => f.catalogoDoWorkspace(), [])
  const { dados: contas } = useDadosDeContas((f) => f.contas(), [])
  const { avisar, avisado } = usePedidosDaVitrine()
  const visao = useCatalogoFuncional()
  const extra = extras?.find((card) => card.id === tipoId)
  const card = cardPorId(tipoId)
  const tipo = tipoPorId(tipoId) ?? (extra ? tipoDoExtra(extra) : undefined)
  const monitoramentos = card
    ? todos.filter((m) => card.contados.includes(m.tipoId))
    : todos.filter((m) => m.tipoId === tipoId)

  if (tipoId === 'personalizado') return <Navigate to="/sinais/pedidos" replace />
  const unido = cardQueConta(tipoId)
  if (unido && unido.id !== tipoId) return <Navigate to={`/sinais/tipos/${unido.id}`} replace />
  if (sinalArquivado(tipoId)) return <Navigate to="/sinais" replace />
  if (!tipo && carregandoExtras && !extras) return <Carregando />
  if (!tipo) return <Navigate to="/sinais" replace />
  const detalhe = card ?? (extra ? cardDoExtra(extra) : undefined)
  // No operacional, o cliente só abre um card que roda de verdade ou que o Workspace já monitora. Sem os estados, volta
  // ao catálogo, que mostra o erro.
  if (operacional && detalhe) {
    if (visao.erro) return <Navigate to="/sinais" replace />
    if (visao.carregando || (carregando && todos.length === 0)) return <Carregando />
    if (visao.visiveis([detalhe], todos).length === 0) return <Navigate to="/sinais" replace />
  }
  const visivel = Boolean(detalhe)
  const disponibilidadeDoCard = detalhe ? visao.disponibilidadeDe(detalhe) : undefined
  const estadoDoCard = detalhe ? visao.estadoDe(detalhe) : undefined
  // Card que não roda (o que o Workspace já monitora, ou o interno da equipe) não abre Monitoramento novo.
  const permiteCriar = disponibilidadeDoCard
    ? podeMonitorar({ disponibilidade: disponibilidadeDoCard })
    : visivel || !tipoDaFonte || podeMonitorar(tipoDaFonte)
  const motivoDeNaoCriar = disponibilidadeDoCard
    ? motivoDaIndisponibilidade({ disponibilidade: disponibilidadeDoCard })
    : visivel || !tipoDaFonte ? null : motivoDaIndisponibilidade(tipoDaFonte)
  const familia = familiaDoTipo(tipo)
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

  const lancamento = eLancamento(tipo.id)
  const exclusivo = Boolean(extra)
  const acao = lancamento && detalhe ? (
    <BotaoAviseMe card={detalhe} avisado={avisado(detalhe)} aoAvisar={avisar} />
  ) : permiteCriar ? (
    <Link to={`/sinais/tipos/${tipo.id}/novo`} className={BOTAO_PRIMARIO}>
      <Zap strokeWidth={1.8} className="size-4" aria-hidden />
      Ativar Monitoramento
    </Link>
  ) : null
  const sinaisDoWorkspace = sinaisEncontrados ?? (operacional ? [] : SINAIS_MOCK)

  return (
    <Pagina titulo={tipo.nome} voltar={{ para: '/sinais', rotulo: 'Sinais' }}>
      <div className={cn(ZONA_DA_VITRINE, 'gap-8')}>
      <section aria-label="Capa do Sinal" className="overflow-hidden rounded-[var(--radius-card)]">
        <CapaDoSinal id={tipo.id} className="flex min-h-72 flex-col justify-end gap-4 p-6 md:min-h-80 md:p-10">
          <div className="vitrine-brilho" aria-hidden />
          <div className="flex flex-wrap gap-2">
            {familia ? (
              <>
                <span className="selo border-al-ink/30 bg-al-bg/60 text-al-ink">{ROTULO_DA_ORIGEM[familia.origem]}</span>
                <span className="selo border-al-ink/30 bg-al-bg/60 text-al-ink">{familia.nome}</span>
              </>
            ) : (
              <span className="selo border-al-ink/30 bg-al-bg/60 text-al-ink">Qualquer origem</span>
            )}
            {exclusivo && <span className="selo border-al-ink/30 bg-al-bg/60 text-al-ink">Exclusivo</span>}
            {lancamento && <span className="selo border-al-ink/30 bg-al-bg/60 text-al-ink">Lançamento</span>}
          </div>
          {estadoDoCard && <SelosDoEstado estado={estadoDoCard} className="justify-start" />}
          <p className="titulo-display max-w-3xl text-4xl md:text-6xl" aria-hidden>
            {tipo.nome}
          </p>
          <p className="max-w-xl text-base text-al-ink">{tipo.descricao}</p>
          {acao && <div className="flex flex-wrap items-center gap-3 pt-1">{acao}</div>}
        </CapaDoSinal>
      </section>

      {detalhe && (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <PreviaDasDetectadas
            titulo="Prévia: últimas empresas detectadas"
            detectadas={ultimasDetectadas(detalhe, sinaisDoWorkspace, hoje)}
            contas={contas ?? (operacional ? [] : CONTAS_MOCK)}
            hoje={hoje}
            operacional={operacional}
          />
          <dl className="grid min-w-0 content-start gap-3 sm:grid-cols-2">
            <Ficha icone={Database} rotulo="Fonte">
              {detalhe.fonte}
            </Ficha>
            <Ficha icone={CalendarClock} rotulo="Frequência">
              {frequenciaDoCard(detalhe)}
            </Ficha>
            <Ficha icone={Coins} rotulo="Custo em créditos">
              <span>{custoEmCreditos(detalhe)}</span>
              <span className="text-xs text-al-muted">
                Preço fixo, dentro do limite mensal de créditos do seu contrato.
              </span>
            </Ficha>
            <Ficha icone={Flame} rotulo="Resultado">
              {resultadoDoCard(detalhe, operacional).map((linha) => (
                <span key={linha}>{linha}</span>
              ))}
            </Ficha>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <dt className="rotulo">Nichos</dt>
              <dd>
                <ul aria-label="Nichos" className="flex flex-wrap gap-2">
                  {(valeParaTodosOsNichos(detalhe) ? ['Todos os nichos'] : nomesDosNichos(detalhe.nichos)).map((nome) => (
                    <li key={nome} className="selo">{nome}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </div>
      )}

      <p className="max-w-3xl text-sm text-al-muted">
        Cada Sinal disparado deixa a Conta-alvo Quente por {VALIDADE_EM_DIAS} dias. Pausar um Monitoramento interrompe novas detecções e
        preserva os sinais anteriores.
      </p>

      {motivoDeNaoCriar && (
        <p role="status" className="rounded-xl bg-al-atencao-suave px-4 py-3 text-sm">
          {motivoDeNaoCriar}
        </p>
      )}

      {state?.aviso && (
        <p role="status" className="rounded-xl bg-al-sucesso-suave px-4 py-3 text-sm">
          {state.aviso}
        </p>
      )}

      {erroAcao && (
        <div role="alert" className="flex items-center justify-between rounded-xl bg-al-erro/10 px-4 py-3 text-sm text-al-erro">
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
        <div role="alert" className="rounded-2xl flex flex-col items-start gap-3 border border-al-line bg-al-surface p-6">
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

      {!erro && !carregando && (
      <section aria-labelledby="titulo-monitoramentos" className="flex flex-col gap-4">
        <h2 id="titulo-monitoramentos" className="flex items-baseline gap-3">
          <span className="titulo-secao text-lg">Monitoramentos</span>
          <span className="rotulo text-[0.6875rem]">
            {monitoramentos.length} no total · {ativos} {ativos === 1 ? 'ativo' : 'ativos'}
          </span>
        </h2>

        {monitoramentos.length === 0 ? (
          <div className="rounded-2xl flex flex-col items-start gap-3 border border-dashed border-al-line p-6">
            <p className="text-sm">Nenhum Monitoramento deste tipo ainda.</p>
            <p className="text-sm text-al-muted">
              {lancamento
                ? 'Este Sinal ainda está em preparação pela equipe Althius. Peça o aviso e ative quando ele lançar.'
                : 'Ative pelo botão da capa. Você pode ter vários, cada um com nome, critérios e público próprios.'}
            </p>
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
                    {operacional
                      ? noMercado(m.publico) ? resumoDoMercado(m.criterios) : resumoDasContas(m.publico.listas.length)
                      : resumoDoPublico(m.publico)}
                    {disparados > 0 && ` · ${disparados} ${disparados === 1 ? 'Sinal disparado' : 'Sinais disparados'}`}
                  </p>
                  {m.ultimaFalha && (
                    <p className="text-xs text-al-atencao">Última rodada: {m.ultimaFalha}</p>
                  )}
                  {!m.ultimaFalha && m.ultimaRodada?.estado === 'concluida' && (
                    <p className="text-xs text-al-muted">{resumoDaRodada(m.ultimaRodada, hoje)}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {m.estado === 'ativo' && (
                    <button type="button" onClick={() => alternarEstado(m.id, 'pausado')} className={BOTAO_DISCRETO}>
                      <Pause strokeWidth={1.8} className="size-3.5" aria-hidden />
                      Pausar
                    </button>
                  )}
                  {m.estado === 'pausado' && m.pausadoPor !== 'sem_creditos' && (
                    <BotaoDeRetomar monitoramento={m} aoFalhar={setErroAcao} />
                  )}
                  <Link to={`/sinais/tipos/${tipo.id}/${m.id}`} className={BOTAO_DISCRETO}>
                    {ACAO_DO_ESTADO[m.estado]}
                  </Link>
                </div>
                {m.pausadoPor === 'sem_creditos' && (
                  <div className="col-span-2 pt-2">
                    <AvisoDePausaPorCreditos monitoramento={m} />
                  </div>
                )}
                {sinalComRodadaPulada(m) && (
                  <div className="col-span-2 pt-2">
                    <AvisoDeRodadaPulada monitoramento={m} />
                  </div>
                )}
              </li>
              )
            })}
          </ul>
        )}
      </section>
      )}
      </div>
    </Pagina>
  )
}

function Ficha({ icone: Icone, rotulo, children }: { icone: LucideIcon; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] border border-al-line bg-al-surface p-4">
      <dt className="rotulo inline-flex items-center gap-2">
        <Icone strokeWidth={1.8} className="size-3.5 text-al-accent" aria-hidden />
        {rotulo}
      </dt>
      <dd className="flex flex-col gap-1 text-sm">{children}</dd>
    </div>
  )
}
