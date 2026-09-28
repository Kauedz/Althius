import { useEffect } from 'react'
import { useAmbiente, useDados } from '@/fonte/contexto'
import { useTema } from '@/tema'

/**
 * No Workspace operacional, aplica o tema salvo na Conta de usuário ao entrar, em qualquer dispositivo. Sem tema salvo
 * (ou se a leitura falhar), fica o do navegador.
 */
export function TemaSalvoNaConta() {
  const { modo } = useAmbiente()
  return modo === 'real' ? <AplicarTemaSalvo /> : null
}

function AplicarTemaSalvo() {
  const preferencias = useDados((fonte) => fonte.preferencias(), [])
  const { tema, escolher } = useTema()
  const salvo = preferencias?.tema

  useEffect(() => {
    if (salvo && salvo !== tema) escolher(salvo)
    // Só quando o tema salvo muda (ao entrar, ou depois de a pessoa salvar outro): o que vale é o que o backend guardou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salvo])

  return null
}
