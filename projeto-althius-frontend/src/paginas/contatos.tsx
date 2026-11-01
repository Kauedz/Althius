import { Archive, Building2, Mail } from 'lucide-react'
import { useState } from 'react'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { useDadosDeContas, useFonteDeContas } from '@/fonte/contexto'
import { normalizarParaBusca } from '@/lib/utils'
import { BOTAO_DO_CABECALHO, ContatosArquivados } from './arquivar-e-apagar'
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
import { ADERENCIAS, type GrupoDaPrioridade, grupoDaConta, posicaoDaAderencia, ROTULO_ADERENCIA } from './ordem-da-aderencia'
import { useRecorteNoEndereco } from './recorte-no-endereco'
import { DialogoRevelarEmailEmLote } from './revelar-email-em-lote'
import { type LinhaDeContato, TabelaDeContatos, temDadosDeContato } from './tabela-de-contatos'
import { useEstadoParaODetalhe, useRolagemDaLista } from './voltar-para-a-lista'

/** Aderência da empresa, na ordem de grupos da Prioridade; depois o nome da empresa e o da pessoa. */
function compararLinhas(a: LinhaDeContato, b: LinhaDeContato): number {
  return (
    posicaoDaAderencia(grupoDaConta(a.conta)) - posicaoDaAderencia(grupoDaConta(b.conta)) ||
    (a.conta?.nome ?? '').localeCompare(b.conta?.nome ?? '', 'pt-BR') ||
    a.contato.nome.localeCompare(b.contato.nome, 'pt-BR')
  )
}

/** Opções da Aderência se combinam com "ou"; os dois filtros, com "e". Um filtro vazio não se aplica. */
interface FiltrosDosContatos {
  /** O grupo da empresa do Contato: Quente, Fit ou Não fit. */
  aderencia: GrupoDaPrioridade[]
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
    alternarAderencia: (aderencia: GrupoDaPrioridade) => recorte.alternarOpcao('aderencia', aderencia),
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
      (filtros.aderencia.length === 0 || filtros.aderencia.some((grupo) => grupo === grupoDaConta(conta))) &&
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
  const listaVisivel = !carregando && !erro && linhas.length > 0
  const quadro = useRolagemDaLista(listaVisivel)
  const estadoDoLink = useEstadoParaODetalhe('Contatos')
  const [verArquivados, setVerArquivados] = useState(false)
  // Revelar e-mail em lote (enriquecimento 03): só existe onde a fonte oferece revelar um Contato por vez.
  const podeRevelarEmLote = !!fonte.revelarContato
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [loteAberto, setLoteAberto] = useState(false)
  const alternarSelecao = (contatoId: string) =>
    setSelecionados((atuais) => (atuais.includes(contatoId) ? atuais.filter((id) => id !== contatoId) : [...atuais, contatoId]))

  // Os Contatos arquivados ficam fora da lista padrão (CRM-18): esta visão os mostra, para restaurar ou apagar.
  if (verArquivados && fonte.contatosArquivados) {
    return (
      <Pagina titulo="Contatos" icone={Building2} ocupaAJanela>
        <AbasDoModulo />
        <div className="flex items-end justify-between gap-8">
          <h2 className="sr-only">Contatos arquivados</h2>
          <p className="text-sm text-al-muted">
            Contatos arquivados ficam fora das listas. Restaure um Contato para ele voltar aos Vínculos que tinha.
          </p>
          <Button type="button" variant="outline" onClick={() => setVerArquivados(false)} className={BOTAO_DO_CABECALHO}>
            Voltar aos Contatos
          </Button>
        </div>
        <ContatosArquivados />
      </Pagina>
    )
  }

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
        {fonte.contatosArquivados && (
          <Button type="button" variant="outline" onClick={() => setVerArquivados(true)} className={BOTAO_DO_CABECALHO}>
            <Archive className="mr-1.5 size-3.5" aria-hidden />
            Arquivados
          </Button>
        )}
        {podeRevelarEmLote && selecionados.length > 0 && (
          <Button type="button" variant="outline" onClick={() => setLoteAberto(true)} className={BOTAO_DO_CABECALHO}>
            <Mail className="mr-1.5 size-3.5" aria-hidden />
            Revelar E-mail em lote
          </Button>
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

      {listaVisivel && (
        // O mesmo quadro da tabela de Contas: cabeçalho fixo na rolagem vertical e o Nome fixo na horizontal.
        <div ref={quadro} className="min-h-0 overflow-auto">
          <TabelaDeContatos
            linhas={linhas}
            hoje={hoje}
            rotulo="Tabela de Contatos"
            estadoDoLink={estadoDoLink}
            selecionados={podeRevelarEmLote ? selecionados : undefined}
            aoAlternarSelecao={podeRevelarEmLote ? alternarSelecao : undefined}
          />
        </div>
      )}

      <DialogoRevelarEmailEmLote
        aberto={loteAberto}
        aoMudar={setLoteAberto}
        contatos={(contatos ?? []).filter((contato) => selecionados.includes(contato.id))}
      />
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
