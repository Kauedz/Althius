import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDados, useFonte } from '@/fonte/contexto'
import { mostrarNoNavegador } from '@/notificacoes-do-navegador'

/**
 * Mostra pelo navegador os Avisos do Workspace destinados à Conta de usuário da sessão, enquanto o aplicativo está
 * aberto e a pessoa quer recebê-los. Clicar num aviso leva ao assunto; decidir continua exigindo o papel.
 */
export function AvisosDoNavegador() {
  const fonte = useFonte()
  const navegar = useNavigate()
  const workspace = useDados((f) => f.workspace(), [])
  const preferencias = useDados((f) => f.preferencias(), [])
  const contaId = workspace?.usuario.id
  const querReceber = preferencias?.notificacoesDoNavegador === true

  useEffect(() => {
    // Com a preferência desligada, a Althius nem acompanha os avisos; a permissão do navegador fica como estava.
    if (!contaId || !querReceber) return
    return fonte.observarAvisos((aviso) => {
      if (aviso.destinatarios.includes(contaId)) mostrarNoNavegador(aviso, () => navegar(aviso.para))
    })
  }, [fonte, contaId, querReceber, navegar])

  return null
}
