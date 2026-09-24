import { Building2 } from 'lucide-react'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { useDadosDeContas, useFonteDeContas } from '@/fonte/contexto'
import type { Aderencia } from '@/fonte/contas-tipos'
import { normalizarParaBusca } from '@/lib/utils'
import {
  AbasDoModulo,
  CAIXA,
  CampoDeBusca,
  ChipsDosFiltros,
  Contagem,
  FalhaAoCarregar,
  type FiltroAtivo,
  GrupoDeFiltros,
  MenuDeFiltros,
  OPCAO,
  SemResultado,
} from './modulo-contas-e-contatos'
import { ADERENCIAS, posicaoDaAderencia, ROTULO_ADERENCIA } from './ordem-da-aderencia'
import { useRecorteNoEndereco } from './recorte-no-endereco'
import { type LinhaDeContato, TabelaDeContatos, temDadosDeContato } from './tabela-de-contatos'

/** Aderência da empresa, na ordem de grupos da Prioridade; depois o nome da empresa e o da pessoa. */
function compararLinhas(a: LinhaDeContato, b: LinhaDeContato): number {
  return (
    posicaoDaAderencia(a.conta?.aderencia) - posicaoDaAderencia(b.conta?.aderencia) ||
    (a.conta?.nome ?? '').localeCompare(b.conta?.nome ?? '', 'pt-BR') ||
    a.contato.nome.localeCompare(b.contato.nome, 'pt-BR')
  )
}

/** Opções da Aderência se combinam com "ou"; os dois filtros, com "e". Um filtro vazio não se aplica. */
interface FiltrosDosContatos {
  /** A Aderência da empresa do Contato. */
  aderencia: Aderencia[]
  /** Só quem tem pelo menos um canal disponível. */
  comDados: boolean
}

const PARAMETROS_DOS_FILTROS = ['aderencia', 'dados'] as const

/**
 * A busca e os filtros vivem nos parâmetros do endereço (`busca`, `aderencia` e `dados=com`), e só lá: ao voltar de
 * uma Conta-alvo, a lista se reconstrói com eles.
 */
function useRecorteDosContatos() {
  const recorte = useRecorteNoEndereco(PARAMETROS_DOS_FILTROS)
  const filtros: FiltrosDosContatos = {
    aderencia: recorte.aderencias,
    comDados: recorte.parametros.get('dados') === 'com',
  }
  return {
    ...recorte,
    filtros,
    alternarAderencia: (aderencia: Aderencia) => recorte.alternarOpcao('aderencia', aderencia),
    alternarComDados: () => recorte.definir('dados', filtros.comDados ? '' : 'com', ''),
  }
}

type Recorte = ReturnType<typeof useRecorteDosContatos>

const contarFiltros = (filtros: FiltrosDosContatos) => filtros.aderencia.length + (filtros.comDados ? 1 : 0)

/** As linhas cujo nome, cargo ou empresa contém a busca, sem diferenciar maiúsculas e acentos. */
function buscarLinhas(linhas: LinhaDeContato[], busca: string): LinhaDeContato[] {
  const termo = normalizarParaBusca(busca)
  return linhas.filter(({ contato, conta }) =>
    [contato.nome, contato.cargo ?? '', conta?.nome ?? ''].some((campo) => normalizarParaBusca(campo).includes(termo)),
  )
}

function filtrarLinhas(linhas: LinhaDeContato[], filtros: FiltrosDosContatos): LinhaDeContato[] {
  return linhas.filter(
    ({ contato, conta }) =>
      (filtros.aderencia.length === 0 || (conta?.aderencia !== undefined && filtros.aderencia.includes(conta.aderencia))) &&
      (!filtros.comDados || temDadosDeContato(contato)),
  )
}

/** A aba Contatos: as pessoas de todas as Contas-alvo, numa ordem fixa. */
export function PaginaContatos() {
  const fonte = useFonteDeContas()
  // As contas vêm junto: dão o nome e a Aderência da empresa de cada Contato.
  const { dados, carregando, erro, recarregar } = useDadosDeContas(
    (f) => Promise.all([f.contatos(), f.contas()]),
    [],
  )

  const hoje = fonte.hoje()
  const [contatos, contas] = dados ?? []
  const contasPorId = new Map(contas?.map((conta) => [conta.id, conta]))
  const recorte = useRecorteDosContatos()
  const { busca, filtros } = recorte
  const todas = (contatos ?? []).map((contato) => ({ contato, conta: contasPorId.get(contato.contaId) }))
  const linhas = filtrarLinhas(buscarLinhas(todas, busca), filtros).toSorted(compararLinhas)
  const comBusca = normalizarParaBusca(busca) !== ''
  const recortada = comBusca || contarFiltros(filtros) > 0

  return (
    <Pagina titulo="Contatos" icone={Building2} ocupaAJanela>
      <AbasDoModulo />

      <div className="flex items-end justify-between gap-8">
        <h2 className="sr-only">Contatos</h2>
        <p className="text-sm text-al-muted">Pessoas das Contas-alvo, organizadas para a próxima abordagem.</p>
        {contatos && (
          <Contagem
            exibidos={linhas.length}
            total={contatos.length}
            recortada={recortada}
            singular="contato"
            plural="contatos"
          />
        )}
      </div>

      {contatos && contatos.length > 0 && (
        // A barra da aba Contas, sem "Ordenar por": a ordem desta aba é fixa.
        <div className="flex items-center gap-2.5 border-y border-al-line py-2">
          <CampoDeBusca
            rotulo="Buscar contatos"
            placeholder="Buscar por nome, cargo ou empresa"
            valor={busca}
            buscar={recorte.buscar}
          />
          <span className="flex-1" />
          <MenuDeFiltrosDosContatos recorte={recorte} />
        </div>
      )}

      {contarFiltros(filtros) > 0 && (
        <ChipsDosFiltros filtros={filtrosAtivos(recorte)} limparFiltros={recorte.limparFiltros} />
      )}

      {carregando && <Carregando />}

      {erro && <FalhaAoCarregar mensagem="Não foi possível carregar os contatos." tentarDeNovo={recarregar} />}

      {!carregando && !erro && contatos?.length === 0 && (
        <p className="py-12 text-sm text-al-muted">
          Nenhum Contato ainda. As pessoas aparecem aqui quando vierem do CRM, de enriquecimento ou de um Agente.
        </p>
      )}

      {!carregando && !erro && contatos && contatos.length > 0 && linhas.length === 0 && (
        <SemResultado
          mensagem={comBusca ? `Nenhum contato encontrado para “${busca.trim()}”.` : 'Nenhum contato encontrado.'}
          limparBuscaEFiltros={recorte.limparBuscaEFiltros}
        />
      )}

      {!carregando && !erro && linhas.length > 0 && (
        // O mesmo quadro da tabela de Contas: cabeçalho fixo na rolagem vertical e o Nome fixo na horizontal.
        <div className="min-h-0 overflow-auto">
          <TabelaDeContatos linhas={linhas} hoje={hoje} rotulo="Tabela de Contatos" />
        </div>
      )}
    </Pagina>
  )
}

/** O menu de filtros dos contatos: a Aderência da empresa, com seleção múltipla, e "Com algum canal". */
function MenuDeFiltrosDosContatos({ recorte }: { recorte: Recorte }) {
  const { filtros, alternarAderencia, alternarComDados, limparFiltros } = recorte
  return (
    <MenuDeFiltros
      titulo="Filtrar contatos"
      ativos={contarFiltros(filtros)}
      limparTudo={limparFiltros}
      largura="w-97.5"
      grade="grid-cols-[1.2fr_1fr]"
    >
      <GrupoDeFiltros titulo="Aderência da empresa">
        {ADERENCIAS.map((aderencia) => (
          <label key={aderencia} className={OPCAO}>
            <input
              type="checkbox"
              className={CAIXA}
              checked={filtros.aderencia.includes(aderencia)}
              onChange={() => alternarAderencia(aderencia)}
            />
            <span>{ROTULO_ADERENCIA[aderencia]}</span>
          </label>
        ))}
      </GrupoDeFiltros>
      <GrupoDeFiltros titulo="Dados de contato">
        <label className={OPCAO}>
          <input type="checkbox" className={CAIXA} checked={filtros.comDados} onChange={alternarComDados} />
          <span>Com algum canal</span>
        </label>
      </GrupoDeFiltros>
    </MenuDeFiltros>
  )
}

/** Um chip por filtro ativo, na ordem do menu. */
function filtrosAtivos({ filtros, alternarAderencia, alternarComDados }: Recorte): FiltroAtivo[] {
  return [
    ...filtros.aderencia.map((aderencia) => ({
      rotulo: `Aderência: ${ROTULO_ADERENCIA[aderencia]}`,
      remover: () => alternarAderencia(aderencia),
    })),
    ...(filtros.comDados ? [{ rotulo: 'Com dados de contato', remover: alternarComDados }] : []),
  ]
}
