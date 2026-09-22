import { useCallback, useEffect, useState } from 'react'

export type Tema = 'escuro' | 'claro'

const CHAVE = 'althius:tema'

function temaSalvo(): Tema {
  try {
    return localStorage.getItem(CHAVE) === 'claro' ? 'claro' : 'escuro'
  } catch {
    return 'escuro'
  }
}

/** Tema escuro por padrão; a escolha fica só neste navegador. */
export function useTema() {
  const [tema, setTema] = useState<Tema>(temaSalvo)

  useEffect(() => {
    document.documentElement.dataset.theme = tema
    try {
      localStorage.setItem(CHAVE, tema)
    } catch {
      // Sem armazenamento disponível: o tema vale só nesta visita.
    }
  }, [tema])

  const alternar = useCallback(() => setTema((atual) => (atual === 'escuro' ? 'claro' : 'escuro')), [])
  return { tema, alternar }
}
