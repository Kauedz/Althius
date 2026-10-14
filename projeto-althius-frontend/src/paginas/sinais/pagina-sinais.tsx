import { ArrowLeft, ArrowRight, RadioTower, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { LogoDaConta } from '@/components/logos'
import { Pagina } from '@/components/pagina'
import { BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { useAmbiente, useDadosDeContas, useDadosDeSinais, useFonteDeContas } from '@/fonte/contexto'
import type { CardSobPedido } from '@/fonte/sinais-tipos'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { cn } from '@/lib/utils'
import { FAMILIAS, tipoPorId } from './catalogo'
import {
  CATALOGO_VISIVEL,
  nomesDosNichos,
  valeParaTodosOsNichos,
  type CardDoCatalogo,
} from './catalogo-visivel'
import { NICHOS } from './nichos'
import { CONTAS_MOCK, SINAIS_MOCK, VALIDADE_EM_DIAS, dataDoDisparo, estaValido, foiDisparado, ordenarSinaisPorData } from './dados-mock'
import { GRADE_DE_CARTOES } from './cascatas'
import { useMonitoramentos } from './estado'

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
      acoes={
        <Link to="/sinais/mercado" className={BOTAO_SECUNDARIO}>
          Painéis de mercado
        </Link>
      }
    >
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
    </Pagina>
  )
}

function cardDoExtra(extra: CardSobPedido): CardDoCatalogo {
  const familia = FAMILIAS.find((item) => item.id === extra.familiaId)
  return {
    id: extra.id,
    nome: extra.nome,
    frase: extra.frase,
    familiaId: extra.familiaId,
    formulario: familia?.formulario ?? 'expansao',
    nichos: extra.nichos,
    fonte: extra.fonte,
    custoRotulo: extra.custoRotulo,
    custoUsd: null,
    coletores: extra.coletores,
    contados: [extra.id],
  }
}

function ativosDoCard(card: CardDoCatalogo, monitoramentos: { tipoId: string; estado: string }[]): number {
  return monitoramentos.filter((m) => m.estado === 'ativo' && card.contados.includes(m.tipoId)).length
}

function Catalogo({ aoVerEncontrados }: { aoVerEncontrados: () => void }) {
  const monitoramentos = useMonitoramentos()
  const [busca, setBusca] = useState('')
  const [nicho, setNicho] = useState('todos')
  const [familiaId, setFamiliaId] = useState('todos')
  const { dados: extras } = useDadosDeSinais((f) => f.catalogoDoWorkspace(), [])
  const cards = [...CATALOGO_VISIVEL, ...(extras ?? []).map(cardDoExtra)]
  const operacional = useAmbiente().modo === 'real'
  const { dados: sinaisCarregados } = useDadosDeSinais((f) => f.sinaisEncontrados(), [])
  const encontrados = sinaisCarregados?.length ?? (operacional ? undefined : SINAIS_MOCK.length)
  const totalAtivos = cards.reduce((soma, card) => soma + ativosDoCard(card, monitoramentos), 0)

  const termo = normalizar(busca)
  const visiveis = cards.filter((card) => {
    if (nicho !== 'todos' && !card.nichos.includes(nicho)) return false
    if (familiaId !== 'todos' && card.familiaId !== familiaId) return false
    if (!termo) return true
    const nomes = nomesDosNichos(card.nichos).join(' ')
    const familia = FAMILIAS.find((item) => item.id === card.familiaId)?.nome ?? ''
    return normalizar(`${card.nome} ${card.frase} ${familia} ${nomes}`).includes(termo)
  })
  const familiasDoCatalogo = FAMILIAS.filter((familia) => cards.some((card) => card.familiaId === familia.id))

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <p className="text-sm text-al-muted">
            Acontecimentos que indicam uma possível necessidade do que você vende. Escolha um Sinal para configurar
            Monitoramentos; cada Sinal disparado deixa a Conta-alvo Quente por {VALIDADE_EM_DIAS} dias.
          </p>
          <span className="rotulo">
            {cards.length} Sinais · {totalAtivos} {totalAtivos === 1 ? 'Monitoramento ativo' : 'Monitoramentos ativos'}
          </span>
        </div>
        <button type="button" onClick={aoVerEncontrados} className={cn(BOTAO_DISCRETO, 'underline-offset-4 hover:underline')}>
          <RadioTower strokeWidth={1.8} className="size-3.5 text-al-accent" aria-hidden />
          Sinais encontrados
          {encontrados !== undefined && <span className="tabular-nums text-al-ink">{encontrados}</span>}
        </button>
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
        <div role="group" aria-label="Filtrar por nicho" className="segmentado max-w-full flex-wrap">
          <button type="button" aria-pressed={nicho === 'todos'} onClick={() => setNicho('todos')}>
            Todos
          </button>
          {NICHOS.map((item) => (
            <button key={item.slug} type="button" aria-pressed={nicho === item.slug} onClick={() => setNicho(item.slug)}>
              {item.nome}
            </button>
          ))}
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
              setNicho('todos')
              setFamiliaId('todos')
            }}
            className={BOTAO_SECUNDARIO}
          >
            Limpar busca
          </button>
        </div>
      ) : (
        <section aria-label="Catálogo de sinais" className="flex flex-col gap-4">
          <ul className={GRADE_DE_CARTOES}>
            {visiveis.map((card) => (
              <CartaoDoCatalogo key={card.id} card={card} ativos={ativosDoCard(card, monitoramentos)} />
            ))}
          </ul>
        </section>
      )}

      <CartaoDePedido />
    </>
  )
}

function CartaoDoCatalogo({ card, ativos }: { card: CardDoCatalogo; ativos: number }) {
  const nichos = valeParaTodosOsNichos(card) ? ['Todos os nichos'] : nomesDosNichos(card.nichos)
  return (
    <li className="min-w-0">
      <Link
        to={`/sinais/tipos/${card.id}`}
        className="cartao group flex h-full min-h-48 flex-col gap-3 border border-transparent p-6 transition-colors hover:border-al-accent"
      >
        <h3 className="text-lg leading-snug font-normal">{card.nome}</h3>
        <p className="text-sm text-al-muted">{card.frase}</p>
        <ul aria-label={`Nichos de ${card.nome}`} className="flex flex-wrap gap-1.5">
          {nichos.map((nome) => (
            <li key={nome} className="selo">{nome}</li>
          ))}
        </ul>
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <span className="rotulo inline-flex items-center gap-2 text-al-ink">
            {ativos > 0 && <span className="size-1.5 rounded-full bg-al-sucesso" aria-hidden />}
            {ativos} {ativos === 1 ? 'ativo' : 'ativos'}
          </span>
          <span
            className="rounded-md grid size-8 place-items-center border border-al-accent/60 text-al-accent transition-colors group-hover:border-al-accent group-hover:bg-al-accent/10"
            aria-hidden
          >
            <ArrowRight strokeWidth={1.8} className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </li>
  )
}

/** O pedido à equipe Althius. Sempre visível, no fim da grade. */
function CartaoDePedido() {
  return (
    <section aria-label="Pedir um Sinal" className="cartao flex flex-wrap items-center justify-between gap-6 p-6">
      <div className="flex max-w-2xl flex-col gap-1.5">
        <h2 className="titulo-secao text-xl">Precisa de outro Sinal?</h2>
        <p className="text-sm text-al-muted">
          Conte o evento que você quer acompanhar e a equipe Althius monta para você.
        </p>
      </div>
      <Link to="/sinais/pedidos" className={BOTAO_PRIMARIO}>
        Falar com a equipe Althius
      </Link>
    </section>
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
  // No operacional a lista espera as Contas, para não mostrar um identificador no lugar do nome.
  const esperando = (carregandoSinais && !sinaisCarregados) || (operacional && carregandoContas)

  const todosSinais = sinaisCarregados ?? (operacional ? [] : SINAIS_MOCK)
  const sinais = ordenarSinaisPorData(todosSinais.filter((s) => foiDisparado(s.data, hoje)))

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
        sinais.length === 0 ? (
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
              {sinais.map((sinal) => {
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
                        <Link to={`/sinais/contas/${conta.id}`} className="hover:text-al-accent hover:underline">
                          {conta.nome}
                        </Link>
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
