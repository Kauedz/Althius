import { ArrowLeft, RadioTower, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { LogoDaConta } from '@/components/logos'
import { Pagina } from '@/components/pagina'
import { BOTAO_DISCRETO, BOTAO_SECUNDARIO } from '@/components/botoes'
import {
  useAmbiente,
  useDados,
  useDadosDeContas,
  useDadosDeSequencias,
  useDadosDeSinais,
  useFonteDeContas,
} from '@/fonte/contexto'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { cn } from '@/lib/utils'
import { FAMILIAS, tipoPorId } from './catalogo'
import { CATALOGO_VISIVEL, nomesDosNichos, type CardDoCatalogo } from './catalogo-visivel'
import { CONTAS_MOCK, SINAIS_MOCK, VALIDADE_EM_DIAS, dataDoDisparo, estaValido, foiDisparado, ordenarSinaisPorData } from './dados-mock'
import { GRADE_DE_CARTOES } from './cascatas'
import { useMonitoramentos } from './estado'
import {
  ZONA_DA_VITRINE,
  ativosDoCard,
  cardDoExtra,
  eLancamento,
  exclusivosEmProducao,
  montarPrateleiras,
  nichoDoWorkspace,
  sinalDaSemana,
  ultimasDetectadas,
  usePedidosDaVitrine,
} from './vitrine'
import {
  CartaoDaVitrine,
  CartaoDeLancamento,
  CartaoDePedido,
  CartaoEmProducao,
  CartoesDaPrateleira,
  MeusSinais,
  Prateleira,
  PrateleiraVazia,
  SinalDaSemana,
} from './vitrine-pecas'

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** A página principal de Sinais: o catálogo e, por um acesso discreto, os Sinais encontrados. */
export function PaginaSinais() {
  const [parametros, setParametros] = useSearchParams()
  const { state } = useLocation() as { state?: { aviso?: string } }
  const vendoEncontrados = parametros.get('vista') === 'encontrados'
  const {
    dados: tiposCarregados,
    carregando,
    erro,
    recarregar,
  } = useDadosDeSinais((f) => f.tipos(), [])

  return (
    <Pagina
      titulo="Sinais"
      icone={RadioTower}
    >
      <div className={ZONA_DA_VITRINE}>
      {vendoEncontrados ? (
        <SinaisEncontrados aoVoltar={() => setParametros({})} />
      ) : (
        <>
          {carregando && !tiposCarregados && <Carregando />}

          {erro && (
            <div role="alert" className="rounded-2xl flex flex-col items-start gap-3 border border-al-line bg-al-surface p-6">
              <p className="text-sm text-al-muted">Não foi possível carregar os sinais.</p>
              <button
                type="button"
                onClick={recarregar}
                className={BOTAO_SECUNDARIO}
              >
                Tentar de novo
              </button>
            </div>
          )}

          {state?.aviso && (
            <p role="status" className="text-sm text-al-muted">
              {state.aviso}
            </p>
          )}

          {!erro && (!carregando || tiposCarregados) && (
            <Catalogo aoVerEncontrados={() => setParametros({ vista: 'encontrados' })} />
          )}
        </>
      )}
      </div>
    </Pagina>
  )
}

function Catalogo({ aoVerEncontrados }: { aoVerEncontrados: () => void }) {
  const monitoramentos = useMonitoramentos()
  const [busca, setBusca] = useState('')
  const [familiaId, setFamiliaId] = useState('todos')
  const { dados: extras } = useDadosDeSinais((f) => f.catalogoDoWorkspace(), [])
  const exclusivos = (extras ?? []).map(cardDoExtra)
  const cards = [...CATALOGO_VISIVEL, ...exclusivos]
  const operacional = useAmbiente().modo === 'real'
  const hoje = useFonteDeContas().hoje()
  const { dados: sinaisCarregados, recarregar: recarregarSinais } = useDadosDeSinais((f) => f.sinaisEncontrados(), [])
  const { dados: contas } = useDadosDeContas((f) => f.contas(), [])
  const { dados: sequencias } = useDadosDeSequencias((f) => f.sequencias(), [])
  const memoria = useDados((f) => f.memoriaDoWorkspace(), [])
  const { pedidos, avisar, avisado } = usePedidosDaVitrine()
  const sinais = sinaisCarregados ?? (operacional ? undefined : SINAIS_MOCK)
  const encontrados = sinais?.length
  const totalAtivos = cards.reduce((soma, card) => soma + ativosDoCard(card, monitoramentos), 0)
  const segmentos = memoria?.icp.secoes.find((secao) => secao.titulo === 'Segmentos')?.texto ?? ''
  const nichoDoIcp = nichoDoWorkspace(segmentos)

  // No Workspace operacional, a prévia do Sinal da semana busca disparos novos a cada minuto.
  useEffect(() => {
    if (!operacional) return
    const relogio = setInterval(recarregarSinais, 60_000)
    return () => clearInterval(relogio)
  }, [operacional, recarregarSinais])

  const termo = normalizar(busca)
  const filtrando = Boolean(termo) || familiaId !== 'todos'
  const visiveis = cards.filter((card) => {
    if (familiaId !== 'todos' && card.familiaId !== familiaId) return false
    if (!termo) return true
    const nomes = nomesDosNichos(card.nichos).join(' ')
    const familia = FAMILIAS.find((item) => item.id === card.familiaId)?.nome ?? ''
    return normalizar(`${card.nome} ${card.frase} ${familia} ${nomes}`).includes(termo)
  })
  const familiasDoCatalogo = FAMILIAS.filter((familia) => cards.some((card) => card.familiaId === familia.id))
  const idsExclusivos = new Set(exclusivos.map((card) => card.id))
  const seloDe = (card: CardDoCatalogo) =>
    idsExclusivos.has(card.id) ? 'Exclusivo' : eLancamento(card.id) ? 'Lançamento' : undefined
  const ativosDe = (card: CardDoCatalogo) => ativosDoCard(card, monitoramentos)

  const prateleiras = montarPrateleiras({ cards: CATALOGO_VISIVEL, exclusivos, monitoramentos, nicho: nichoDoIcp })
  const destaque = sinalDaSemana({ cards, sinais: sinais ?? [], hoje, nicho: nichoDoIcp })
  const emProducao = exclusivosEmProducao(pedidos)
  const disparosPorMonitoramento = (id: string) => (sinais ?? []).filter((s) => s.monitoramentoId === id && foiDisparado(s.data, hoje)).length
  // Só os Monitoramentos de um Sinal da vitrine: os de um tipo arquivado não têm página para abrir.
  const ativos = monitoramentos
    .filter((m) => m.estado === 'ativo' && cards.some((card) => card.contados.includes(m.tipoId)))
    .map((m) => ({ id: m.id, tipoId: m.tipoId, nome: m.nome, disparos: disparosPorMonitoramento(m.id) }))
    .toSorted((a, b) => b.disparos - a.disparos)
  const idsAtivos = new Set(ativos.map((m) => m.id))
  const disparos = sinais === undefined ? undefined : sinais.filter((s) => idsAtivos.has(s.monitoramentoId) && foiDisparado(s.data, hoje)).length

  return (
    <div className="flex min-w-0 flex-col gap-10">
      <p className="max-w-2xl text-sm text-al-muted">
        Acontecimentos que indicam uma possível necessidade do que você vende. Escolha um Sinal e ative um Monitoramento;
        cada Sinal disparado deixa a Conta-alvo Quente por {VALIDADE_EM_DIAS} dias.
      </p>

      {!filtrando && destaque && (
        <SinalDaSemana
          card={destaque}
          ativos={ativosDoCard(destaque, monitoramentos)}
          detectadas={ultimasDetectadas(destaque, sinais ?? [], hoje)}
          contas={contas ?? (operacional ? [] : CONTAS_MOCK)}
          hoje={hoje}
          operacional={operacional}
        />
      )}

      {!filtrando && (
        <MeusSinais
          monitoramentosAtivos={ativos}
          disparos={disparos}
          contasQuentes={contas?.filter((conta) => conta.quente).length}
          sequenciasAtivas={sequencias?.filter((sequencia) => sequencia.status === 'ativa').length}
          acaoDosEncontrados={
            <button type="button" onClick={aoVerEncontrados} className={cn(BOTAO_DISCRETO, 'underline-offset-4 hover:underline')}>
              <RadioTower strokeWidth={1.8} className="size-3.5 text-al-accent" aria-hidden />
              Sinais encontrados
              {encontrados !== undefined && <span className="tabular-nums text-al-ink">{encontrados}</span>}
            </button>
          }
        />
      )}

      {!filtrando && (
        <>
          <Prateleira
            id="para-o-seu-nicho"
            titulo="Para o seu nicho"
            subtitulo={
              nichoDoIcp
                ? `${nichoDoIcp.nome}, pelos Segmentos do ICP do Workspace`
                : 'Sinais que valem para qualquer nicho. Descreva os Segmentos do ICP na Memória para afinar.'
            }
          >
            <CartoesDaPrateleira cards={prateleiras.paraOSeuNicho} ativosDe={ativosDe} />
          </Prateleira>

          <Prateleira id="mais-ativados" titulo="Mais ativados" subtitulo="Pelos Monitoramentos ativos do seu Workspace">
            {prateleiras.maisAtivados.length > 0 ? (
              <CartoesDaPrateleira cards={prateleiras.maisAtivados} ativosDe={ativosDe} />
            ) : (
              <PrateleiraVazia titulo="Nenhum Monitoramento ativo ainda.">
                Os Sinais que você ativar aparecem aqui, do mais usado ao menos usado.
              </PrateleiraVazia>
            )}
          </Prateleira>

          <Prateleira id="novos" titulo="Novos" subtitulo="Os últimos Sinais que entraram no catálogo">
            <CartoesDaPrateleira cards={prateleiras.novos} ativosDe={ativosDe} seloDe={(card) => seloDe(card) ?? 'Novo'} />
          </Prateleira>

          <Prateleira id="movimento-de-equipe" titulo="Movimento de equipe" subtitulo="Vagas, chegadas, saídas e promoções">
            <CartoesDaPrateleira cards={prateleiras.movimentoDeEquipe} ativosDe={ativosDe} />
          </Prateleira>

          <Prateleira id="midia-e-anuncios" titulo="Mídia e anúncios" subtitulo="Campanhas, publicações e reputação pública">
            <CartoesDaPrateleira cards={prateleiras.midiaEAnuncios} ativosDe={ativosDe} />
          </Prateleira>

          <Prateleira
            id="exclusivos"
            titulo="Exclusivos do seu Workspace"
            subtitulo="Sinais que a equipe Althius monta só para você"
          >
            <CartoesDaPrateleira cards={exclusivos} ativosDe={ativosDe} seloDe={() => 'Exclusivo'} />
            {emProducao.map(({ pedido, situacao }) => (
              <CartaoEmProducao key={pedido.id} pedido={pedido} situacao={situacao} />
            ))}
            {exclusivos.length === 0 && emProducao.length === 0 && (
              <PrateleiraVazia titulo="Nenhum Sinal exclusivo ainda.">
                Conte o evento que você quer acompanhar e a equipe Althius monta um Sinal só para este Workspace.{' '}
                <Link to="/sinais/pedidos" className="text-al-ink underline underline-offset-4 hover:text-al-accent">
                  Pedir um Sinal exclusivo
                </Link>
              </PrateleiraVazia>
            )}
          </Prateleira>

          {prateleiras.lancamentos.length > 0 && (
            <Prateleira id="lancamentos" titulo="Lançamentos" subtitulo="Em preparação pela equipe Althius. Peça para ser avisado.">
              {prateleiras.lancamentos.map((card) => (
                <CartaoDeLancamento key={card.id} card={card} avisado={avisado(card)} aoAvisar={avisar} />
              ))}
            </Prateleira>
          )}
        </>
      )}

      <section aria-labelledby="titulo-todos-os-sinais" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="titulo-todos-os-sinais" className="titulo-secao text-lg">
            Todos os Sinais
          </h2>
          <span className="rotulo">
            {cards.length} Sinais · {totalAtivos} {totalAtivos === 1 ? 'Monitoramento ativo' : 'Monitoramentos ativos'}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <div className="relative w-full max-w-sm">
            <Search strokeWidth={1.8} className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-al-muted" aria-hidden />
            <input
              type="search"
              aria-label="Buscar tipos de sinal"
              placeholder="Buscar por nome ou descrição"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="campo h-9 pl-9 text-sm placeholder:text-al-muted"
            />
          </div>
          <div role="group" aria-label="Filtrar por família" className="segmentado max-w-full flex-wrap">
            <button type="button" aria-pressed={familiaId === 'todos'} onClick={() => setFamiliaId('todos')}>
              Todas
            </button>
            {familiasDoCatalogo.map((familia) => (
              <button
                key={familia.id}
                type="button"
                aria-pressed={familiaId === familia.id}
                onClick={() => setFamiliaId(familia.id)}
              >
                {familia.nome}
              </button>
            ))}
          </div>
        </div>

        {visiveis.length === 0 ? (
          <div className="rounded-2xl flex flex-col items-start gap-3 border border-al-line bg-al-surface p-6">
            <p className="text-sm">Nenhum tipo de sinal corresponde a “{busca.trim() || 'esse filtro'}”.</p>
            <button
              type="button"
              onClick={() => {
                setBusca('')
                setFamiliaId('todos')
              }}
              className={BOTAO_SECUNDARIO}
            >
              Limpar busca
            </button>
          </div>
        ) : (
          <section aria-label="Catálogo de sinais">
            <ul className={GRADE_DE_CARTOES}>
              {visiveis.map((card) => (
                <CartaoDaVitrine key={card.id} card={card} ativos={ativosDe(card)} selo={seloDe(card)} />
              ))}
            </ul>
          </section>
        )}
      </section>

      <CartaoDePedido />
    </div>
  )
}

/** Lista simples: empresa, sinal disparado e data. Sem dashboard nem gráficos. */
function SinaisEncontrados({ aoVoltar }: { aoVoltar: () => void }) {
  const navegar = useNavigate()
  const hoje = useFonteDeContas().hoje()
  const operacional = useAmbiente().modo === 'real'
  const {
    dados: sinaisCarregados,
    carregando: carregandoSinais,
    erro: erroSinais,
    recarregar: recarregarSinais,
  } = useDadosDeSinais((f) => f.sinaisEncontrados(), [])
  const { dados: contasCarregadas = [], carregando: carregandoContas } = useDadosDeContas((f) => f.contas(), [])
  // Os Sinais das empresas que ainda não são Conta (candidatas da Caixa de Descobertas). Uma leitura que falha não tira a lista.
  const { dados: sinaisDeCandidatas = [] } = useDadosDeSinais((f) => (f.sinaisDeCandidatas ? f.sinaisDeCandidatas() : Promise.resolve([])), [])
  // No operacional a lista espera as Contas, para não mostrar um identificador no lugar do nome.
  const esperando = (carregandoSinais && !sinaisCarregados) || (operacional && carregandoContas)

  const todosSinais = sinaisCarregados ?? (operacional ? [] : SINAIS_MOCK)
  const sinais = ordenarSinaisPorData(todosSinais.filter((s) => foiDisparado(s.data, hoje)))
  const deCandidatas = sinaisDeCandidatas.filter((s) => foiDisparado(s.data, hoje))
  // Os Sinais das Contas e os das candidatas, juntos, do mais recente ao mais antigo.
  const linhas: ({ tipo: 'conta'; sinal: (typeof sinais)[number] } | { tipo: 'candidata'; sinal: (typeof deCandidatas)[number] })[] = [
    ...sinais.map((sinal) => ({ tipo: 'conta' as const, sinal })),
    ...deCandidatas.map((sinal) => ({ tipo: 'candidata' as const, sinal })),
  ].sort((a, b) => dataDoDisparo(b.sinal.data).getTime() - dataDoDisparo(a.sinal.data).getTime())

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="titulo-secao text-xl">Sinais encontrados</h2>
          <p className="text-sm text-al-muted">Os disparos dos seus Monitoramentos, do mais recente ao mais antigo.</p>
        </div>
        <button type="button" onClick={aoVoltar} className={BOTAO_DISCRETO}>
          <ArrowLeft strokeWidth={1.8} className="size-3.5" aria-hidden />
          Voltar ao catálogo
        </button>
      </div>

      {esperando && <Carregando />}

      {erroSinais && (
        <div role="alert" className="rounded-2xl flex flex-col items-start gap-3 border border-al-line bg-al-surface p-6">
          <p className="text-sm text-al-muted">Não foi possível carregar os sinais encontrados.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={recarregarSinais} className={BOTAO_SECUNDARIO}>
              Tentar de novo
            </button>
            <button type="button" onClick={aoVoltar} className={BOTAO_DISCRETO}>
              Voltar ao catálogo
            </button>
          </div>
        </div>
      )}

      {!erroSinais && !esperando && (
        linhas.length === 0 ? (
          <div className="rounded-2xl flex flex-col items-start gap-3 border border-al-line bg-al-surface p-6">
            <p className="text-sm">Nenhum Sinal encontrado ainda.</p>
            <p className="text-sm text-al-muted">
              Os Monitoramentos ativos procuram novos acontecimentos; os disparos aparecem aqui e no Último sinal de cada
              Conta-alvo.
            </p>
            <button type="button" onClick={aoVoltar} className={BOTAO_SECUNDARIO}>
              Configurar Monitoramentos
            </button>
          </div>
        ) : (
          <table aria-label="Sinais encontrados" className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                {['Empresa', 'Sinal', 'Data'].map((coluna) => (
                  <th key={coluna} scope="col" className="rotulo h-9.5 border-b border-al-line pr-4 text-[0.6875rem]">
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => {
                if (linha.tipo === 'candidata') {
                  const candidata = linha.sinal
                  const expiradoDaCandidata = !estaValido(candidata.data, hoje)
                  return (
                    <tr
                      key={`candidata-${candidata.id}`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('a')) return
                        navegar(`/contas/descobertas?candidata=${candidata.candidataId}`)
                      }}
                      className={cn('h-12 cursor-pointer transition-colors hover:bg-al-surface/60', expiradoDaCandidata && 'text-al-muted')}
                    >
                      <td className="w-56 border-b border-al-line pr-4">
                        <span className="flex flex-col py-2 leading-snug">
                          <span>{candidata.empresa}</span>
                          <Link to={`/contas/descobertas?candidata=${candidata.candidataId}`} className="text-xs text-al-accent hover:underline">
                            Ver candidata
                          </Link>
                        </span>
                      </td>
                      <td className="border-b border-al-line pr-4">
                        <span className="flex flex-col py-2 leading-snug">
                          <span>{candidata.frase}</span>
                          <span className="text-xs text-al-muted">
                            {tipoPorId(candidata.tipoId)?.nome ?? 'Sinal'}
                            {candidata.fonte && ` · ${candidata.fonte}`}
                            {expiradoDaCandidata && ' · expirado'}
                          </span>
                        </span>
                      </td>
                      <td className="w-36 border-b border-al-line pr-4 whitespace-nowrap" title={formatarDataCompleta(dataDoDisparo(candidata.data))}>
                        {formatarDataDoModulo(dataDoDisparo(candidata.data), hoje, { maiuscula: true })}
                      </td>
                    </tr>
                  )
                }
                const sinal = linha.sinal
                const conta =
                  contasCarregadas.find((c) => c.id === sinal.contaId) ??
                  (operacional ? undefined : CONTAS_MOCK.find((c) => c.id === sinal.contaId)) ?? {
                    id: sinal.contaId,
                    nome: operacional ? 'Conta-alvo' : sinal.contaId,
                    segmento: 'Geral',
                    origem: 'importada' as const,
                    logo: undefined,
                    logoDeUmaCor: undefined,
                  }
                const expirado = !estaValido(sinal.data, hoje)
                return (
                  <tr
                    key={sinal.id}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a')) return
                      navegar(`/sinais/contas/${conta.id}`)
                    }}
                    className={cn('h-12 cursor-pointer transition-colors hover:bg-al-surface/60', expirado && 'text-al-muted')}
                  >
                    <td className="w-56 border-b border-al-line pr-4">
                      <span className="flex items-center gap-2.5">
                        <LogoDaConta nome={conta.nome} logo={conta.logo} deUmaCor={conta.logoDeUmaCor} />
                        <span className="flex flex-col leading-snug">
                          <Link to={`/sinais/contas/${conta.id}`} className="hover:text-al-accent hover:underline">
                            {conta.nome}
                          </Link>
                          <Link to={`/sinais/contas/${conta.id}`} className="text-xs text-al-accent hover:underline">
                            Ver Conta
                          </Link>
                        </span>
                      </span>
                    </td>
                    <td className="border-b border-al-line pr-4">
                      <span className="flex flex-col py-2 leading-snug">
                        <span>{sinal.frase}</span>
                        <span className="text-xs text-al-muted">
                          {tipoPorId(sinal.tipoId)?.nome ?? 'Sinal'}
                          {expirado && ' · expirado'}
                        </span>
                      </span>
                    </td>
                    <td className="w-36 border-b border-al-line pr-4 whitespace-nowrap" title={formatarDataCompleta(dataDoDisparo(sinal.data))}>
                      {formatarDataDoModulo(dataDoDisparo(sinal.data), hoje, { maiuscula: true })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      )}
    </>
  )
}
