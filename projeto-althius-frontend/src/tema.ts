import { useCallback, useEffect, useState } from 'react'

export type Tema = 'escuro' | 'claro'

const CHAVE_DO_TEMA = 'althius:tema'

/** Quem usa `useTema()` em outro ponto da árvore (ex.: Casca e Preferências) fica sincronizado. */
const ouvintes = new Set<() => void>()

function ehTema(valor: unknown): valor is Tema {
  return valor === 'escuro' || valor === 'claro'
}

/** Lê sempre do navegador: sem cache em módulo, para não vazar o tema de um teste para o outro. */
function lerTema(): Tema {
  try {
    const bruto = localStorage.getItem(CHAVE_DO_TEMA)
    return ehTema(bruto) ? bruto : 'escuro'
  } catch {
    return 'escuro'
  }
}

function definirTema(tema: Tema) {
  document.documentElement.dataset.theme = tema
  try {
    localStorage.setItem(CHAVE_DO_TEMA, tema)
  } catch {
    // Sem armazenamento disponível, o tema vale só até recarregar.
  }
  ouvintes.forEach((ouvinte) => ouvinte())
}

/** Tema escuro por padrão; a escolha é gravada no navegador e volta na abertura seguinte. */
export function useTema() {
  const [tema, setTema] = useState<Tema>(lerTema)

  useEffect(() => {
    document.documentElement.dataset.theme = tema
    const ouvinte = () => setTema(lerTema())
    ouvintes.add(ouvinte)
    return () => {
      ouvintes.delete(ouvinte)
    }
    // Só na montagem: mudanças próprias já passam por `definirTema`, que também avisa este ouvinte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const alternar = useCallback(() => definirTema(lerTema() === 'escuro' ? 'claro' : 'escuro'), [])
  return { tema, alternar, escolher: definirTema }
}
