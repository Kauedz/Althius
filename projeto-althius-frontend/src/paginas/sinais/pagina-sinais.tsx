import { ArrowLeft, ArrowRight, Plus, RadioTower, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { LogoDaConta } from '@/components/logos'
import { Pagina } from '@/components/pagina'
import { BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { useAmbiente, useDadosDeContas, useDadosDeSinais, useFonteDeContas } from '@/fonte/contexto'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { cn } from '@/lib/utils'
import {
  FAMILIAS,
  ROTULO_DA_ORIGEM,
  ROTULO_DA_ORIGEM_NO_PLURAL,
  TIPOS,
  TIPO_PERSONALIZADO,
  familiaDoTipo,
  tipoPorId,
  type Origem,
  type TipoDeSinal,
} from './catalogo'
import { CONTAS_MOCK, SINAIS_MOCK, VALIDADE_EM_DIAS, dataDoDisparo, estaValido, foiDisparado, ordenarSinaisPorData } from './dados-mock'
import { AvisoDeNovosSinais, motivoDaIndisponibilidade, podeMonitorar, SeloDaDisponibilidade } from './disponibilidade'
import { useMonitoramentos } from './estado'

type Filtro = 'todos' | Origem

const FILTROS: Filtro[] = ['todos', 'externo', 'interno', 'originado']

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
        <Link to="/sinais/tipos/personalizado/novo" className={BOTAO_PRIMARIO}>
          <Sparkles strokeWidth={1.8} className="size-4" aria-hidden />
          Criar sinal personalizado
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

          {!erro && (!carregando || tiposCarregados) && (
            <Catalogo
              tiposDisponiveis={tiposCarregados}
              aoVerEncontrados={() => setParametros({ vista: 'encontrados' })}
            />
          )}
        </>
      )}
    </Pagina>
  )
}

function Catalogo({
  tiposDisponiveis,
  aoVerEncontrados,
}: {
  tiposDisponiveis?: TipoDeSinal[]
  aoVerEncontrados: () => void
}) {
  const navegar = useNavigate()
  const monitoramentos = useMonitoramentos()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const catalogoTipos = tiposDisponiveis ?? TIPOS

  const ativosPorTipo = new Map<string, number>()
  for (const m of monitoramentos) {
    if (m.estado === 'ativo') ativosPorTipo.set(m.tipoId, (ativosPorTipo.get(m.tipoId) ?? 0) + 1)
  }
  const totalAtivos = [...ativosPorTipo.values()].reduce((soma, n) => soma + n, 0)
  const personalizados = monitoramentos.filter((m) => m.tipoId === TIPO_PERSONALIZADO.id).length

  const termo = normalizar(busca)
  const corresponde = (tipo: TipoDeSinal) =>
    (filtro === 'todos' || familiaDoTipo(tipo)?.origem === filtro) &&
    (!termo || normalizar(`${tipo.nome} ${tipo.descricao} ${familiaDoTipo(tipo)?.nome ?? ''}`).includes(termo))
  const familias = FAMILIAS.map((familia) => ({
    familia,
    tipos: catalogoTipos.filter((tipo) => tipo.familiaId === familia.id && corresponde(tipo)),
  })).filter((grupo) => grupo.tipos.length > 0)

  const totalPorOrigem = (origem: Filtro) =>
    origem === 'todos' ? catalogoTipos.length : catalogoTipos.filter((tipo) => familiaDoTipo(tipo)?.origem === origem).length

  const operacional = useAmbiente().modo === 'real'
  const { dados: sinaisCarregados } = useDadosDeSinais((f) => f.sinaisEncontrados(), [])
  // No operacional a contagem é a dos Sinais gravados, e só aparece quando eles chegam.
  const encontrados = sinaisCarregados?.length ?? (operacional ? undefined : SINAIS_MOCK.length)

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <p className="text-sm text-al-muted">
            Acontecimentos que indicam uma possível necessidade do que você vende. Escolha um tipo para configurar
            Monitoramentos; cada Sinal disparado deixa a Conta-alvo Quente por {VALIDADE_EM_DIAS} dias.
          </p>
          <span className="rotulo">
            {TIPOS.length} tipos · {totalAtivos} {totalAtivos === 1 ? 'Monitoramento ativo' : 'Monitoramentos ativos'}
          </span>
        </div>
        <button type="button" onClick={aoVerEncontrados} className={cn(BOTAO_DISCRETO, 'underline-offset-4 hover:underline')}>
          <RadioTower strokeWidth={1.8} className="size-3.5 text-al-accent" aria-hidden />
          Sinais encontrados
          {encontrados !== undefined && <span className="tabular-nums text-al-ink">{encontrados}</span>}
        </button>
      </div>

      {catalogoTipos.some((tipo) => !podeMonitorar(tipo)) && <AvisoDeNovosSinais />}

      {totalAtivos === 0 && (
        <div className="rounded-2xl flex flex-wrap items-center justify-between gap-3 border border-dashed border-al-line px-5 py-4">
          <p className="text-sm text-al-muted">
            Nenhum Monitoramento ativo ainda. Escolha um tipo abaixo ou comece pelo mais comum.
          </p>
          <Link to="/sinais/tipos/abertura-de-vagas/novo" className={BOTAO_SECUNDARIO}>
            <Plus strokeWidth={1.8} className="size-4" aria-hidden />
            Monitorar abertura de vagas
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
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
        <div role="group" aria-label="Filtrar por origem" className="segmentado">
          {FILTROS.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-pressed={filtro === opcao}
              onClick={() => setFiltro(opcao)}
            >
              {opcao === 'todos' ? 'Todos' : ROTULO_DA_ORIGEM_NO_PLURAL[opcao]}
              <span className="text-al-muted tabular-nums" aria-hidden>
                {totalPorOrigem(opcao)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <CartaoPersonalizado quantidade={personalizados} />

      {familias.length === 0 ? (
        <div className="rounded-2xl flex flex-col items-start gap-3 border border-al-line bg-al-surface p-6">
          <p className="text-sm">Nenhum tipo de sinal corresponde a “{busca.trim()}”.</p>
          <p className="text-sm text-al-muted">Tente outras palavras, mude o filtro ou descreva o que procura num sinal personalizado.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setBusca('')
                setFiltro('todos')
              }}
              className={BOTAO_SECUNDARIO}
            >
              Limpar busca
            </button>
            <button
              type="button"
              onClick={() => navegar(`/sinais/tipos/personalizado/novo?descricao=${encodeURIComponent(busca.trim())}`)}
              className={BOTAO_SECUNDARIO}
            >
              Criar personalizado com essa busca
            </button>
          </div>
        </div>
      ) : (
        <section aria-label="Catálogo de sinais" className="flex flex-col gap-10">
          {familias.map(({ familia, tipos }) => (
            <section key={familia.id} aria-labelledby={`familia-${familia.id}`} className="flex flex-col gap-4">
              <h2 id={`familia-${familia.id}`} className="flex items-baseline gap-3">
                <span className="titulo-secao text-lg">{familia.nome}</span>
                <span className="rotulo text-[0.6875rem]">{ROTULO_DA_ORIGEM[familia.origem]}</span>
              </h2>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4">
                {tipos.map((tipo) => (
                  <li key={tipo.id}>
                    <CartaoDeTipo tipo={tipo} ativos={ativosPorTipo.get(tipo.id) ?? 0} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>
      )}
    </>
  )
}

function CartaoDeTipo({ tipo, ativos }: { tipo: TipoDeSinal; ativos: number }) {
  const motivo = motivoDaIndisponibilidade(tipo)
  // Em teste ou em breve: o card mostra o estado e o motivo e não leva a lugar nenhum, então não deixa criar Monitoramento.
  if (motivo && tipo.disponibilidade) {
    return (
      <div aria-disabled="true" className="cartao flex h-full min-h-48 flex-col gap-3 border border-transparent p-6 opacity-80">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg leading-snug font-normal">{tipo.nome}</h3>
          <SeloDaDisponibilidade disponibilidade={tipo.disponibilidade} />
        </div>
        <p className="text-sm text-al-muted">{tipo.descricao}</p>
        <p className="mt-auto pt-3 text-sm text-al-muted">{motivo}</p>
      </div>
    )
  }
  return (
    <Link
      to={`/sinais/tipos/${tipo.id}`}
      className="cartao group flex h-full min-h-48 flex-col gap-3 border border-transparent p-6 transition-colors hover:border-al-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg leading-snug font-normal">{tipo.nome}</h3>
        {tipo.disponibilidade && <SeloDaDisponibilidade disponibilidade={tipo.disponibilidade} />}
      </div>
      <p className="text-sm text-al-muted">{tipo.descricao}</p>
      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        {ativos > 0 ? (
          <span className="rotulo inline-flex items-center gap-2 text-al-ink">
            <span className="size-1.5 rounded-full bg-al-sucesso" aria-hidden />
            {ativos} {ativos === 1 ? 'ativo' : 'ativos'}
          </span>
        ) : (
          <span className="rotulo opacity-60">Nenhum ativo</span>
        )}
        <span
          className="rounded-md grid size-8 place-items-center border border-al-accent/60 text-al-accent transition-colors group-hover:border-al-accent group-hover:bg-al-accent/10"
          aria-hidden
        >
          <ArrowRight strokeWidth={1.8} className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

/** O destaque do sinal personalizado: descrição livre, sem código nem API. */
function CartaoPersonalizado({ quantidade }: { quantidade: number }) {
  return (
    <section
      aria-label="Sinal personalizado"
      className="cartao flex flex-wrap items-center justify-between gap-6 p-6"
    >
      <div className="flex max-w-2xl flex-col gap-1.5">
        <h2 className="titulo-secao text-xl">Não encontrou o que procura?</h2>
        <p className="text-sm text-al-muted">
          Descreva em linguagem livre o que quer acompanhar e, se souber, onde encontrar. A Althius prepara os critérios
          para você revisar antes de ativar, sem código nem API.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {quantidade > 0 && (
          <Link to="/sinais/tipos/personalizado" className={BOTAO_SECUNDARIO}>
            Meus personalizados · {quantidade}
          </Link>
        )}
        <Link to="/sinais/tipos/personalizado/novo" className={BOTAO_PRIMARIO}>
          <Plus strokeWidth={1.8} className="size-4" aria-hidden />
          Descrever um sinal
        </Link>
      </div>
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
