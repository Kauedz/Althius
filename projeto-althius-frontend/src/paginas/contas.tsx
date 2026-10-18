import { PreviewCard } from '@base-ui/react/preview-card'
import { Archive, Building2, ExternalLink, Plus, RadioTower, Route, Upload } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SeloDeAderencia } from '@/components/aderencia'
import { LogoDaConta } from '@/components/logos'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { useDados, useDadosDeContas, useFonteDeContas, useFonteDoPlaybook } from '@/fonte/contexto'
import type { ContaAlvo, FonteDeContas } from '@/fonte/contas-tipos'
import { criteriosDePassagem } from '@/fonte/criterios-de-passagem'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { parseDataDisparo } from '@/fonte/regras-sinais'
import { cn, normalizarParaBusca } from '@/lib/utils'
import { BOTAO_DO_CABECALHO, ContasArquivadas } from './arquivar-e-apagar'
import { DetalheConta } from './detalhe-conta'
import { DialogoCriacaoEmLote } from './dialogo-criacao-em-lote'
import { KanbanDeContas } from './kanban-de-contas'
import {
  AbasDoModulo,
  AvatarDoContato,
  CABECALHO,
  CAIXA,
  CampoDeBusca,
  CELULA,
  CelulaUltimoContato,
  ChipsDosFiltros,
  Contagem,
  FalhaAoCarregar,
  type FiltroAtivo,
  GrupoDeFiltros,
  MenuDeFiltros,
  OPCAO,
  SemResultado,
} from './modulo-contas-e-contatos'
import { ADERENCIAS, type GrupoDaPrioridade, grupoDaConta, ROTULO_ADERENCIA } from './ordem-da-aderencia'
import { useRecorteNoEndereco } from './recorte-no-endereco'
import { Foguinho } from './sinais/componentes'
import { type EstadoDaNavegacao, useEstadoParaODetalhe, useRolagemDaLista } from './voltar-para-a-lista'

type Comparacao = (a: ContaAlvo, b: ContaAlvo) => number

/**
 * Ordena as Contas-alvo pela regra de Prioridade (ADR 0007):
 * 1. Quente (ao menos um sinal válido): contas Quentes vêm primeiro.
 * 2. Dentro do grupo de Quentes: sinal mais recente primeiro (desempate por recência); se igual, Fit > Não fit > Não avaliada; depois alfabética.
 * 3. Dentro do grupo de Não quentes: Aderência (Fit > Não fit > Não avaliada); dentro de cada grupo, sinal mais recente primeiro (mesmo expirado); depois alfabética.
 */
export function ordenarPorPrioridade(a: ContaAlvo, b: ContaAlvo): number {
  const quenteA = (a.totalSinaisValidos ?? 0) > 0
  const quenteB = (b.totalSinaisValidos ?? 0) > 0

  if (quenteA !== quenteB) {
    return quenteA ? -1 : 1
  }

  const rankAderencia = (c: ContaAlvo) => {
    if (c.aderencia === 'fit') return 1
    if (c.aderencia === 'nao-fit') return 2
    return 3 // Não avaliada
  }

  if (quenteA && quenteB) {
    const dataSinalA = a.ultimoSinal ? parseDataDisparo(a.ultimoSinal.data).getTime() : -1
    const dataSinalB = b.ultimoSinal ? parseDataDisparo(b.ultimoSinal.data).getTime() : -1
    if (dataSinalA !== dataSinalB) {
      return dataSinalB - dataSinalA
    }
    const rankA = rankAderencia(a)
    const rankB = rankAderencia(b)
    if (rankA !== rankB) {
      return rankA - rankB
    }
    return a.nome.localeCompare(b.nome, 'pt-BR')
  }

  const rankA = rankAderencia(a)
  const rankB = rankAderencia(b)
  if (rankA !== rankB) {
    return rankA - rankB
  }

  const dataSinalA = a.ultimoSinal ? parseDataDisparo(a.ultimoSinal.data).getTime() : -1
  const dataSinalB = b.ultimoSinal ? parseDataDisparo(b.ultimoSinal.data).getTime() : -1
  if (dataSinalA !== dataSinalB) {
    return dataSinalB - dataSinalA
  }

  return a.nome.localeCompare(b.nome, 'pt-BR')
}

/** A data mais recente primeiro; sem data, no fim. */
function maisRecentePrimeiro(data: (conta: ContaAlvo) => string | undefined): Comparacao {
  const instante = (conta: ContaAlvo) => {
    const valor = data(conta)
    return valor ? new Date(valor).getTime() : -Infinity
  }
  return (a, b) => {
    const [instanteA, instanteB] = [instante(a), instante(b)]
    // Comparados antes da subtração: dois "sem data" (-Infinity) dariam NaN, e não empate.
    return instanteA === instanteB ? 0 : instanteB > instanteA ? 1 : -1
  }
}

const porNome: Comparacao = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR')
const porUltimoSinal = maisRecentePrimeiro((conta) => conta.ultimoSinal?.data)

/** Aplica os critérios em sequência: o seguinte só desfaz o empate do anterior. */
function emSequencia(...criterios: Comparacao[]): Comparacao {
  return (a, b) => criterios.reduce((resultado, criterio) => resultado || criterio(a, b), 0)
}

/** As opções de "Ordenar por", cada uma com direção fixa. Empates, em todas, pelo nome. */
const ORDENACOES = {
  // Quentes primeiro, depois Fit, Não fit e não avaliada (ADR 0007).
  prioridade: { rotulo: 'Prioridade', comparar: ordenarPorPrioridade },
  'ultimo-sinal': { rotulo: 'Último sinal', comparar: emSequencia(porUltimoSinal, porNome) },
  contatos: { rotulo: 'Contatos', comparar: emSequencia((a, b) => b.totalContatos - a.totalContatos, porNome) },
  'ultimo-contato': {
    rotulo: 'Último contato',
    comparar: emSequencia(
      maisRecentePrimeiro((conta) => conta.ultimoContatoEm),
      porNome,
    ),
  },
} satisfies Record<string, { rotulo: string; comparar: Comparacao }>

type Ordenacao = keyof typeof ORDENACOES
const ORDENACAO_PADRAO: Ordenacao = 'prioridade'

function eOrdenacao(valor: string | null): valor is Ordenacao {
  return valor !== null && Object.hasOwn(ORDENACOES, valor)
}

const ROTULO_PRESENCA = {
  sinal: { com: 'Com sinal', sem: 'Sem sinal' },
  contatos: { com: 'Com contatos', sem: 'Sem contatos' },
} satisfies Record<GrupoDePresenca, Record<Presenca, string>>

/** Nos filtros de Sinal e de Contatos, a conta tem ou não tem. Sem escolha, o filtro não se aplica. */
type Presenca = 'com' | 'sem'

function ePresenca(valor: string | null): valor is Presenca {
  return valor === 'com' || valor === 'sem'
}

/** Opções do mesmo grupo se combinam com "ou"; grupos diferentes, com "e". Um grupo vazio não filtra. */
interface FiltrosDasContas {
  aderencia: GrupoDaPrioridade[]
  segmento: string[]
  sinal?: Presenca
  contatos?: Presenca
}

type GrupoDeOpcoes = 'aderencia' | 'segmento'
type GrupoDePresenca = 'sinal' | 'contatos'
const PARAMETROS_DOS_FILTROS = ['aderencia', 'segmento', 'sinal', 'contatos'] as const

const porTexto = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

/**
 * A busca, a ordenação e os filtros da lista vivem nos parâmetros do endereço (`busca`, `ordem`, `aderencia`,
 * `segmento`, `sinal` e `contatos`), e só lá: abrir o endereço reconstrói o recorte.
 */
function useRecorteDasContas() {
  const recorte = useRecorteNoEndereco(PARAMETROS_DOS_FILTROS)
  const { parametros, definir } = recorte
  const ordemNoEndereco = parametros.get('ordem')
  const sinal = parametros.get('sinal')
  const contatos = parametros.get('contatos')
  const filtros: FiltrosDasContas = {
    aderencia: recorte.aderencias,
    // Em ordem alfabética e sem repetições.
    segmento: [...new Set(parametros.getAll('segmento'))].toSorted(porTexto),
    sinal: ePresenca(sinal) ? sinal : undefined,
    contatos: ePresenca(contatos) ? contatos : undefined,
  }

  return {
    ...recorte,
    ordem: eOrdenacao(ordemNoEndereco) ? ordemNoEndereco : ORDENACAO_PADRAO,
    filtros,
    ordenar: (valor: Ordenacao) => definir('ordem', valor, ORDENACAO_PADRAO),
    alternarOpcao: (grupo: GrupoDeOpcoes, valor: string) => recorte.alternarOpcao(grupo, valor),
    escolherPresenca: (grupo: GrupoDePresenca, valor: Presenca | undefined) => definir(grupo, valor ?? '', ''),
  }
}

const contarFiltros = (filtros: FiltrosDasContas) =>
  filtros.aderencia.length + filtros.segmento.length + (filtros.sinal ? 1 : 0) + (filtros.contatos ? 1 : 0)
const temFiltros = (filtros: FiltrosDasContas) => contarFiltros(filtros) > 0

const atendePresenca = (filtro: Presenca | undefined, tem: boolean) => !filtro || (filtro === 'com') === tem

/** As contas que passam em todos os grupos de filtros, e em pelo menos uma opção de cada grupo. */
function filtrarContas(contas: ContaAlvo[], filtros: FiltrosDasContas): ContaAlvo[] {
  const atendeOpcoes = <T,>(opcoes: T[], valor: T | undefined) =>
    opcoes.length === 0 || (valor !== undefined && opcoes.includes(valor))
  return contas.filter(
    (conta) =>
      atendeOpcoes(filtros.aderencia, grupoDaConta(conta)) &&
      atendeOpcoes(filtros.segmento, conta.segmento) &&
      atendePresenca(filtros.sinal, !!conta.ultimoSinal) &&
      atendePresenca(filtros.contatos, conta.totalContatos > 0),
  )
}

/** As contas cujo nome ou domínio contém a busca, sem diferenciar maiúsculas e acentos. */
function buscarContas(contas: ContaAlvo[], busca: string): ContaAlvo[] {
  const termo = normalizarParaBusca(busca)
  return contas.filter((conta) =>
    [conta.nome, conta.dominio ?? ''].some((campo) => normalizarParaBusca(campo).includes(termo)),
  )
}

export function PaginaContas() {
  const { contaId } = useParams<{ contaId?: string }>()

  if (contaId) {
    return <DetalheConta contaId={contaId} />
  }

  return <ListaContas />
}

function ListaContas() {
  const navegar = useNavigate()
  const fonte = useFonteDeContas()
  const { dados: contas, carregando, erro, recarregar } = useDadosDeContas(
    (f) => f.contas(),
    [],
  )

  const recorte = useRecorteDasContas()
  const { busca, ordem, filtros, buscar, ordenar } = recorte

  const hoje = fonte.hoje()
  const contasExibidas = filtrarContas(buscarContas(contas ?? [], busca), filtros).toSorted(ORDENACOES[ordem].comparar)
  const comBusca = normalizarParaBusca(busca) !== ''
  const recortada = comBusca || temFiltros(filtros)
  const listaVisivel = !carregando && !erro && contasExibidas.length > 0
  const quadro = useRolagemDaLista(listaVisivel)
  const estadoDoLink = useEstadoParaODetalhe('Contas')
  const [cadastrando, setCadastrando] = useState(false)
  const [verArquivadas, setVerArquivadas] = useState(false)
  const [selecionadas, setSelecionadas] = useState<string[]>([])
  const [loteAberto, setLoteAberto] = useState(false)
  // A vista Kanban (kanban 03) vive no parâmetro `vista` do endereço, como o recorte; sem `moverEstagio`, só a tabela.
  const kanban = !!fonte.moverEstagio && recorte.parametros.get('vista') === 'kanban'
  // Os critérios de passagem (kanban 04) saem da seção SLA e metas; sem Playbook, o cartão segue sem eles.
  const fonteDoPlaybook = useFonteDoPlaybook()
  const sla = useDados(fonteDoPlaybook, (f) => f.secao('sla_e_metas').catch(() => undefined), [])
  const criterios = useMemo(() => criteriosDePassagem(sla?.vigente?.conteudo.linhas ?? []), [sla])

  // As Contas arquivadas ficam fora da lista e da busca padrão (CRM-18): esta visão as mostra, para restaurar ou apagar.
  if (verArquivadas && fonte.contasArquivadas) {
    return (
      <Pagina titulo="Contas" icone={Building2} ocupaAJanela>
        <AbasDoModulo />
        <div className="flex items-end justify-between gap-8">
          <h2 className="sr-only">Contas arquivadas</h2>
          <p className="text-sm text-al-muted">
            Contas arquivadas ficam fora das listas e buscas. Restaure uma Conta para voltar a trabalhar nela.
          </p>
          <Button type="button" variant="outline" onClick={() => setVerArquivadas(false)} className={BOTAO_DO_CABECALHO}>
            Voltar às Contas
          </Button>
        </div>
        <ContasArquivadas />
      </Pagina>
    )
  }

  return (
    <Pagina titulo="Contas" icone={Building2} ocupaAJanela>
      <AbasDoModulo />

      <div className="flex items-end justify-between gap-8">
        <h2 className="sr-only">Empresas</h2>
        <p className="text-sm text-al-muted">
          Empresas do seu mercado organizadas pelo momento de abordagem
        </p>
        {contas && (
          <Contagem
            exibidos={contasExibidas.length}
            total={contas.length}
            recortada={recortada}
            singular="conta"
            plural="contas"
          />
        )}
        {fonte.contasArquivadas && (
          <Button type="button" variant="outline" onClick={() => setVerArquivadas(true)} className={BOTAO_DO_CABECALHO}>
            <Archive className="mr-1.5 size-3.5" aria-hidden />
            Arquivadas
          </Button>
        )}
        {selecionadas.length > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setLoteAberto(true)}
            className={BOTAO_DO_CABECALHO}
          >
            <Route className="mr-1.5 size-3.5" aria-hidden />
            Criar Sequências
          </Button>
        )}
        {fonte.importacao && (
          <Link
            to="/contas/importar"
            className="rounded-md inline-flex h-9 shrink-0 items-center gap-1.5 border border-al-line bg-al-bg px-4 text-sm font-medium tracking-[0.04em] text-al-ink hover:bg-al-surface"
          >
            <Upload className="size-3.5" aria-hidden />
            Importar CSV
          </Link>
        )}
        {fonte.salvarConta && !cadastrando && (
          <Button
            type="button"
            onClick={() => setCadastrando(true)}
            className="rounded-md inline-flex h-9 shrink-0 items-center gap-1.5 border border-al-accent bg-al-accent px-4 text-sm font-medium tracking-[0.04em] text-al-on-accent hover:bg-al-accent-2"
          >
            <Plus className="size-3.5" aria-hidden />
            Nova Conta-alvo
          </Button>
        )}
      </div>

      {cadastrando && fonte.salvarConta && (
        <FormularioNovaConta salvar={fonte.salvarConta.bind(fonte)} fechar={() => setCadastrando(false)} />
      )}

      {contas && contas.length > 0 && (
        <div className="flex items-center gap-2.5 border-y border-al-line py-2">
          <CampoDeBusca
            rotulo="Buscar contas"
            placeholder="Buscar por empresa ou domínio"
            valor={busca}
            buscar={buscar}
          />
          <span className="flex-1" />
          {fonte.moverEstagio && (
            <div role="group" aria-label="Vista" className="segmentado">
              {(['tabela', 'kanban'] as const).map((vista) => (
                <button
                  key={vista}
                  type="button"
                  aria-pressed={kanban === (vista === 'kanban')}
                  onClick={() => recorte.definir('vista', vista, 'tabela')}
                >
                  {vista === 'kanban' ? 'Kanban' : 'Tabela'}
                </button>
              ))}
            </div>
          )}
          <MenuDeFiltrosDasContas contas={contas} recorte={recorte} />
          <select
            aria-label="Ordenar por"
            value={ordem}
            onChange={(e) => eOrdenacao(e.target.value) && ordenar(e.target.value)}
            className="rounded-md h-9 cursor-pointer border border-al-line bg-al-surface pr-8 pl-3 text-sm text-al-ink"
          >
            {Object.entries(ORDENACOES).map(([valor, { rotulo }]) => (
              <option key={valor} value={valor}>
                Ordenar por: {rotulo}
              </option>
            ))}
          </select>
        </div>
      )}

      {temFiltros(filtros) && <ChipsDosFiltros filtros={filtrosAtivos(recorte)} limparFiltros={recorte.limparFiltros} />}

      {carregando && <Carregando />}

      {erro && <FalhaAoCarregar mensagem="Não foi possível carregar as contas." tentarDeNovo={recarregar} />}

      {!carregando && !erro && contas && contas.length === 0 && (
        <p className="py-12 text-sm text-al-muted">
          Nenhuma Conta-alvo ainda. As empresas aparecem aqui quando o Scopus encontrá-las ou quando forem importadas.
        </p>
      )}

      {!carregando && !erro && contas && contas.length > 0 && contasExibidas.length === 0 && (
        <SemResultado
          mensagem={comBusca ? `Nenhuma conta encontrada para “${busca.trim()}”.` : 'Nenhuma conta encontrada.'}
          limparBuscaEFiltros={recorte.limparBuscaEFiltros}
        />
      )}

      {listaVisivel && kanban && fonte.moverEstagio && (
        <KanbanDeContas
          contas={contasExibidas}
          mover={fonte.moverEstagio.bind(fonte)}
          estadoDoLink={estadoDoLink}
          criterios={criterios}
        />
      )}

      {listaVisivel && !kanban && (
        // A tabela rola num quadro próprio, nos dois sentidos, que vai até o pé da janela. Assim o cabeçalho
        // fica fixo na rolagem vertical e a coluna Empresa, na horizontal, sem tirar do lugar a sidebar e a
        // barra de topo.
        <div ref={quadro} className="min-h-0 overflow-auto">
          <table
            aria-label="Tabela de Contas"
            className="w-full min-w-[64rem] table-fixed border-separate border-spacing-0 text-left text-sm"
          >
            <thead>
              <tr>
                <th scope="col" className={cn(CABECALHO, 'left-0 z-3 w-52')}>
                  Empresa
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-28')}>
                  Quente
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-24')}>
                  Aderência
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-40')}>
                  Contatos
                </th>
                {/* Sem largura fixa: o Último sinal fica com o resto, e é a coluna mais larga. */}
                <th scope="col" className={CABECALHO}>
                  Último sinal
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-36')}>
                  Segmento
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-28')}>
                  Último contato
                </th>
              </tr>
            </thead>
            <tbody>
              {contasExibidas.map((conta) => (
                <tr
                  key={conta.id}
                  className="h-11 cursor-pointer transition-colors hover:bg-al-hover"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a, button, input')) return
                    navegar(`/contas/${conta.id}`, { state: estadoDoLink })
                  }}
                >
                  <td className={cn(CELULA, 'sticky left-0 z-1 bg-al-bg')}>
                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${conta.nome}`}
                        className={CAIXA}
                        checked={selecionadas.includes(conta.id)}
                        onChange={() =>
                          setSelecionadas((atuais) =>
                            atuais.includes(conta.id) ? atuais.filter((id) => id !== conta.id) : [...atuais, conta.id],
                          )
                        }
                      />
                      <CelulaEmpresa conta={conta} estadoDoLink={estadoDoLink} />
                    </div>
                  </td>
                  <td className={CELULA}>
                    <CelulaQuente totalSinaisValidos={conta.totalSinaisValidos ?? 0} />
                  </td>
                  <td className={CELULA}>
                    <SeloDeAderencia aderencia={conta.aderencia} />
                  </td>
                  <td className={CELULA}>
                    <CelulaContatos conta={conta} estadoDoLink={estadoDoLink} />
                  </td>
                  <td className={CELULA}>
                    <CelulaUltimoSinal sinal={conta.ultimoSinal} hoje={hoje} />
                  </td>
                  <td className={CELULA}>
                    <CelulaSegmento segmento={conta.segmento} />
                  </td>
                  <td className={CELULA}>
                    <CelulaUltimoContato data={conta.ultimoContatoEm} hoje={hoje} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <DialogoCriacaoEmLote aberto={loteAberto} aoMudar={setLoteAberto} contaIds={selecionadas} />
    </Pagina>
  )
}

type Recorte = ReturnType<typeof useRecorteDasContas>

// Em telas estreitas, como no mock, os quatro grupos ficam em duas colunas: as bordas passam a separar as linhas.
const GRUPO_EM_DUAS_LINHAS = 'max-sm:nth-2:border-r-0 max-sm:nth-[-n+2]:border-b'

/**
 * O menu de filtros das contas, com os quatro grupos lado a lado. Aderência e Segmento têm seleção múltipla; Sinal
 * e Contatos, uma escolha só, que se desfaz clicando nela de novo.
 */
function MenuDeFiltrosDasContas({ contas, recorte }: { contas: ContaAlvo[]; recorte: Recorte }) {
  const { filtros, alternarOpcao, escolherPresenca, limparFiltros } = recorte
  const segmentos = [...new Set(contas.flatMap((conta) => conta.segmento ?? []))].toSorted(porTexto)

  const opcaoDePresenca = (grupo: GrupoDePresenca, valor: Presenca) => (
    <label className={OPCAO}>
      <input
        type="radio"
        name={`filtro-${grupo}`}
        className={CAIXA}
        checked={filtros[grupo] === valor}
        onChange={() => escolherPresenca(grupo, valor)}
        // Clicar na escolha já marcada a desfaz; o rádio sozinho não tem como voltar a "sem filtro".
        onClick={() => filtros[grupo] === valor && escolherPresenca(grupo, undefined)}
      />
      <span>{ROTULO_PRESENCA[grupo][valor]}</span>
    </label>
  )

  return (
    <MenuDeFiltros
      titulo="Filtrar contas"
      ativos={contarFiltros(filtros)}
      limparTudo={limparFiltros}
      largura="w-148"
      grade="grid-cols-2 sm:grid-cols-[1.15fr_1.45fr_1fr_1fr]"
    >
      <GrupoDeFiltros titulo="Aderência" className={GRUPO_EM_DUAS_LINHAS}>
        {ADERENCIAS.map((aderencia) => (
          <label key={aderencia} className={OPCAO}>
            <input
              type="checkbox"
              className={CAIXA}
              checked={filtros.aderencia.includes(aderencia)}
              onChange={() => alternarOpcao('aderencia', aderencia)}
            />
            <span>{ROTULO_ADERENCIA[aderencia]}</span>
            <small className="ml-auto text-xs text-al-muted" aria-hidden>
              {contas.filter((conta) => grupoDaConta(conta) === aderencia).length}
            </small>
          </label>
        ))}
      </GrupoDeFiltros>
      <GrupoDeFiltros titulo="Segmento" className={cn(GRUPO_EM_DUAS_LINHAS, 'max-h-64 overflow-y-auto')}>
        {segmentos.map((segmento) => (
          <label key={segmento} className={OPCAO}>
            <input
              type="checkbox"
              className={CAIXA}
              checked={filtros.segmento.includes(segmento)}
              onChange={() => alternarOpcao('segmento', segmento)}
            />
            <span className="truncate" title={segmento}>
              {segmento}
            </span>
          </label>
        ))}
      </GrupoDeFiltros>
      <GrupoDeFiltros titulo="Sinal" className={GRUPO_EM_DUAS_LINHAS}>
        {opcaoDePresenca('sinal', 'com')}
        {opcaoDePresenca('sinal', 'sem')}
      </GrupoDeFiltros>
      <GrupoDeFiltros titulo="Contatos" className={GRUPO_EM_DUAS_LINHAS}>
        {opcaoDePresenca('contatos', 'com')}
        {opcaoDePresenca('contatos', 'sem')}
      </GrupoDeFiltros>
    </MenuDeFiltros>
  )
}

/** Um chip por opção marcada, na ordem do menu. */
function filtrosAtivos({ filtros, alternarOpcao, escolherPresenca }: Recorte): FiltroAtivo[] {
  return [
    ...filtros.aderencia.map((aderencia) => ({
      rotulo: `Aderência: ${ROTULO_ADERENCIA[aderencia]}`,
      remover: () => alternarOpcao('aderencia', aderencia),
    })),
    ...filtros.segmento.map((segmento) => ({
      rotulo: `Segmento: ${segmento}`,
      remover: () => alternarOpcao('segmento', segmento),
    })),
    ...(['sinal', 'contatos'] as const).flatMap((grupo) => {
      const valor = filtros[grupo]
      return valor ? [{ rotulo: ROTULO_PRESENCA[grupo][valor], remover: () => escolherPresenca(grupo, undefined) }] : []
    }),
  ]
}

function CelulaEmpresa({ conta, estadoDoLink }: { conta: ContaAlvo; estadoDoLink: EstadoDaNavegacao }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <LogoDaConta nome={conta.nome} logo={conta.logo} deUmaCor={conta.logoDeUmaCor} />
      <div className="flex min-w-0 flex-col leading-tight">
        <PopUpDaEmpresa conta={conta}>
          <Link
            to={`/contas/${conta.id}`}
            state={estadoDoLink}
            className="truncate font-normal text-al-ink hover:text-al-accent hover:underline focus:outline-none"
          >
            {conta.nome}
          </Link>
        </PopUpDaEmpresa>
        <span className="truncate text-[0.6875rem] text-al-muted">{conta.dominio ?? 'Domínio não informado'}</span>
      </div>
    </div>
  )
}

function CelulaQuente({ totalSinaisValidos }: { totalSinaisValidos: number }) {
  if (totalSinaisValidos > 0) {
    return <Foguinho quantidade={totalSinaisValidos} />
  }

  return (
    <span
      title="Sem sinais válidos"
      aria-label="Sem sinais válidos"
      className="text-al-muted"
    >
      —
    </span>
  )
}

/**
 * Os links do site e do LinkedIn da empresa, num pop-up que abre ao passar o mouse sobre o nome (depois de um
 * pequeno atraso, para não piscar ao percorrer a tabela) ou quando o nome recebe o foco. Mostra só os links que
 * existem e, sem nenhum, não aparece. Fica num portal, porque o quadro da tabela corta o que transborda.
 */
function PopUpDaEmpresa({ conta, children }: { conta: ContaAlvo; children: ReactElement }) {
  const [aberto, setAberto] = useState(false)
  const nomeRef = useRef<HTMLAnchorElement>(null)
  const popUpRef = useRef<HTMLDivElement>(null)

  const links = [
    conta.siteUrl && { rotulo: 'Site', href: conta.siteUrl },
    conta.linkedinUrl && { rotulo: 'LinkedIn', href: conta.linkedinUrl },
  ].filter((link) => !!link)

  if (links.length === 0) return children

  // No fim do <body>, o portal fica fora da ordem do Tab. Ela é refeita à mão: do nome, o Tab entra nos links;
  // do primeiro link, o Shift+Tab volta ao nome; do último, o Tab devolve o foco ao nome e segue dali.
  function tabNoNome(e: KeyboardEvent) {
    const primeiro = popUpRef.current?.querySelector('a')
    if (e.key !== 'Tab' || e.shiftKey || !aberto || !primeiro) return
    e.preventDefault()
    primeiro.focus()
  }

  function tabNoPopUp(e: KeyboardEvent) {
    if (e.key !== 'Tab') return
    const linksDoPopUp = [...(popUpRef.current?.querySelectorAll('a') ?? [])]
    const primeiro = e.shiftKey && e.target === linksDoPopUp[0]
    const ultimo = !e.shiftKey && e.target === linksDoPopUp.at(-1)
    if (!primeiro && !ultimo) return
    // Voltando, o foco para no nome. Seguindo, o Tab continua a partir do nome, para o que vem depois dele.
    if (primeiro) e.preventDefault()
    setAberto(false)
    nomeRef.current?.focus()
  }

  return (
    <PreviewCard.Root open={aberto} onOpenChange={setAberto}>
      <PreviewCard.Trigger
        ref={nomeRef}
        delay={400}
        closeDelay={200}
        onKeyDown={tabNoNome}
        render={children}
      />
      <PreviewCard.Portal>
        <PreviewCard.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
          <PreviewCard.Popup
            ref={popUpRef}
            aria-label={`Links de ${conta.nome}`}
            onKeyDown={tabNoPopUp}
            // O portal tira o pop-up da linha no DOM, mas não na árvore do React: o clique não pode abrir o detalhe.
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg flex min-w-40 flex-col border border-al-line bg-al-surface py-1 text-sm text-al-ink shadow-md outline-none"
          >
            {links.map((link) => (
              <a
                key={link.rotulo}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 px-3 py-1.5 hover:bg-al-bg hover:text-al-accent focus-visible:bg-al-bg focus-visible:outline-none"
              >
                {link.rotulo}
                <ExternalLink className="size-3 text-al-muted" aria-hidden />
              </a>
            ))}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}

/**
 * Um link próprio para a seção Contatos do detalhe, mesmo sem nenhum Contato. É um link, então o clique da linha,
 * que abre o detalhe no topo, o ignora.
 */
function CelulaContatos({
  conta: { id, totalContatos: total, previaContatos: previa = [] },
  estadoDoLink,
}: {
  conta: ContaAlvo
  estadoDoLink: EstadoDaNavegacao
}) {
  return (
    <Link to={`/contas/${id}#contatos`} state={estadoDoLink} className="group inline-flex max-w-full items-center">
      {total === 0 ? (
        <span className="text-al-muted group-hover:text-al-accent group-hover:underline">Nenhum contato</span>
      ) : (
        <>
          {previa.slice(0, 3).map((contato, i) => (
            <AvatarDoContato key={i} contato={contato} className={i > 0 ? '-ml-1.5' : undefined} />
          ))}
          <span className="ml-2 text-[0.8125rem] whitespace-nowrap text-al-muted group-hover:text-al-accent group-hover:underline">
            {total} {total === 1 ? 'contato' : 'contatos'}
          </span>
        </>
      )}
    </Link>
  )
}

function CelulaUltimoSinal({ sinal, hoje }: { sinal?: ContaAlvo['ultimoSinal']; hoje: Date }) {
  if (!sinal) {
    return <span className="text-al-muted">Nenhum sinal</span>
  }

  const dataRelativa = formatarDataDoModulo(sinal.data, hoje, { maiuscula: false })
  const textoCompleto = `${sinal.frase} · ${formatarDataCompleta(sinal.data)}`

  // Numa linha só: a frase é truncada e a data continua sempre visível. O espaço entre as duas não aparece no
  // flex, mas mantém "frase · data" no texto da célula, ao copiar.
  return (
    <span title={textoCompleto} aria-label={textoCompleto} className="flex min-w-0 items-center gap-1.5">
      <RadioTower strokeWidth={1.8} className="size-3.5 shrink-0 text-al-accent" aria-hidden />
      <span className="truncate">{sinal.frase}</span>{' '}
      <span className="shrink-0 whitespace-nowrap text-al-muted">· {dataRelativa}</span>
    </span>
  )
}

function CelulaSegmento({ segmento }: { segmento?: string }) {
  if (!segmento) {
    return <span className="text-al-muted">—</span>
  }
  return (
    <span title={segmento} className="block truncate">
      {segmento}
    </span>
  )
}

const CAMPO_DO_FORMULARIO = 'rounded-md h-9 border border-al-line bg-al-surface px-3 text-sm text-al-ink'

/**
 * O cadastro manual de uma Conta-alvo: nome e URL da empresa, e o segmento, se houver. A Conta fica sob a
 * responsabilidade de quem a cria; uma URL que já existe no Workspace atualiza a Conta dessa URL.
 */
function FormularioNovaConta({
  salvar,
  fechar,
}: {
  salvar: NonNullable<FonteDeContas['salvarConta']>
  fechar: () => void
}) {
  const [nome, setNome] = useState('')
  const [url, setUrl] = useState('')
  const [segmento, setSegmento] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      const conta = await salvar({ nome, url, segmento })
      if (conta.arquivadaEm) {
        // A URL da empresa identifica a Conta que já existe: arquivada, ela continua arquivada até alguém restaurá-la.
        setErro('Esta empresa já está cadastrada e arquivada. Restaure-a em Arquivadas para voltar a trabalhar nela.')
        setSalvando(false)
        return
      }
      fechar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar a Conta-alvo.')
      setSalvando(false)
    }
  }

  return (
    <form
      aria-label="Nova Conta-alvo"
      onSubmit={enviar}
      className="rounded-xl flex flex-wrap items-end gap-3 border border-al-line bg-al-surface/40 p-4"
    >
      <label className="flex flex-col gap-1 text-xs text-al-muted">
        Nome da empresa
        <input required value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO_DO_FORMULARIO} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-al-muted">
        URL da empresa
        <input
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="empresa.com.br"
          className={CAMPO_DO_FORMULARIO}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-al-muted">
        Segmento (opcional)
        <input value={segmento} onChange={(e) => setSegmento(e.target.value)} className={CAMPO_DO_FORMULARIO} />
      </label>
      <Button
        type="submit"
        disabled={salvando}
        className="rounded-md h-9 border border-al-accent bg-al-accent px-4 text-sm font-medium tracking-[0.04em] text-al-on-accent hover:bg-al-accent-2"
      >
        Salvar
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={fechar}
        className="h-9 border-al-line text-sm tracking-[0.04em] hover:bg-al-surface"
      >
        Cancelar
      </Button>
      {erro && (
        <p role="alert" className="w-full text-sm text-al-atencao">
          {erro}
        </p>
      )}
    </form>
  )
}
