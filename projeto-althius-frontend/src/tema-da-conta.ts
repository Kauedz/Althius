import { useCallback, useState } from 'react'
import { useAmbiente, useFonte } from '@/fonte/contexto'
import { useTema, type Tema } from '@/tema'

/** Onde está a escolha do tema: nada a salvar, a caminho do backend, salva ou recusada (e com qual tema). */
export type SalvamentoDoTema =
  | { estado: 'ocioso' }
  | { estado: 'salvando'; tema: Tema }
  | { estado: 'salvo'; tema: Tema }
  | { estado: 'falhou'; tema: Tema }

/**
 * O tema da Conta de usuário. Na Demonstração, a escolha vale na hora e fica só no navegador. No Workspace operacional,
 * ela é salva nas Preferências da Conta de usuário e só muda a tela depois de o backend confirmar; recusada, o tema
 * continua como estava e a escolha pode ser repetida.
 */
export function useTemaDaConta() {
  const { tema, escolher: aplicar } = useTema()
  const { modo } = useAmbiente()
  const fonte = useFonte()
  const [salvamento, setSalvamento] = useState<SalvamentoDoTema>({ estado: 'ocioso' })

  const escolher = useCallback(
    async (novo: Tema) => {
      if (modo !== 'real') {
        aplicar(novo)
        return
      }
      setSalvamento({ estado: 'salvando', tema: novo })
      try {
        await fonte.salvarPreferencias({ tema: novo })
        aplicar(novo)
        setSalvamento({ estado: 'salvo', tema: novo })
      } catch {
        setSalvamento({ estado: 'falhou', tema: novo })
      }
    },
    [modo, fonte, aplicar],
  )

  const alternar = useCallback(() => escolher(tema === 'escuro' ? 'claro' : 'escuro'), [escolher, tema])
  return { tema, escolher, alternar, salvamento }
}
