import { useSearchParams } from 'react-router-dom'
import { ADERENCIAS } from './ordem-da-aderencia'

/**
 * A busca e os filtros da lista vivem nos parâmetros do endereço, e só lá: abrir o endereço reconstrói o recorte.
 * A busca é o parâmetro `busca`; os filtros são os `parametrosDosFiltros`, lidos pela aba. Os valores padrão não
 * aparecem no endereço, e cada opção marcada de um grupo de seleção múltipla é um parâmetro repetido.
 */
export function useRecorteNoEndereco(parametrosDosFiltros: readonly string[]) {
  const [parametros, setParametros] = useSearchParams()

  // Cada mudança substitui a entrada do histórico, para o voltar não refazer a digitação nem cada clique.
  function alterar(mudar: (parametros: URLSearchParams) => void) {
    setParametros(
      (atuais) => {
        const novos = new URLSearchParams(atuais)
        mudar(novos)
        return novos
      },
      { replace: true },
    )
  }

  function definir(parametro: string, valor: string, padrao: string) {
    alterar((novos) => {
      if (valor === padrao) novos.delete(parametro)
      else novos.set(parametro, valor)
    })
  }

  const removerFiltros = (novos: URLSearchParams) => parametrosDosFiltros.forEach((p) => novos.delete(p))

  return {
    parametros,
    busca: parametros.get('busca') ?? '',
    /** As Aderências marcadas no parâmetro `aderencia`: na ordem do menu, sem repetições e sem as desconhecidas. */
    aderencias: ADERENCIAS.filter((aderencia) => parametros.getAll('aderencia').includes(aderencia)),
    definir,
    buscar: (valor: string) => definir('busca', valor, ''),
    /** Marca ou desmarca uma opção de um grupo de seleção múltipla. */
    alternarOpcao: (parametro: string, valor: string) =>
      alterar((novos) => {
        if (novos.getAll(parametro).includes(valor)) novos.delete(parametro, valor)
        else novos.append(parametro, valor)
      }),
    limparFiltros: () => alterar(removerFiltros),
    limparBuscaEFiltros: () =>
      alterar((novos) => {
        removerFiltros(novos)
        novos.delete('busca')
      }),
  }
}
