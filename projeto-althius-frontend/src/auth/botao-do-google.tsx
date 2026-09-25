import { useEffect, useRef, useState } from 'react'
import { useAutenticacao } from './contexto'
import { ENDERECO_DA_POLITICA_DE_PRIVACIDADE, ENDERECO_DOS_TERMOS_DE_USO } from './termos'

/**
 * O "Continuar com Google" no topo de /entrar e /cadastro: o botão oficial do Google Identity Services, o One Tap e o
 * separador "ou" antes dos campos de e-mail. Sem o Client ID do Google, não aparece nada. Só as telas de acesso o
 * montam, então o One Tap nunca aparece dentro do app.
 */
export function ContinuarComGoogle({ contexto }: { contexto: 'signin' | 'signup' }) {
  const { iniciarGoogle } = useAutenticacao()
  const elemento = useRef<HTMLDivElement>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!iniciarGoogle || !elemento.current) return
    return iniciarGoogle(elemento.current, { contexto, aoFalhar: setErro })
  }, [iniciarGoogle, contexto])

  if (!iniciarGoogle) return null

  return (
    <div className="flex flex-col gap-3">
      <div ref={elemento} className="flex min-h-10 justify-center" />
      {/* Em /cadastro, o aceite abaixo do botão principal já vale para o Google. */}
      {contexto === 'signin' && (
        <p className="text-xs text-al-muted">
          Ao continuar com Google, você concorda com os{' '}
          <a href={ENDERECO_DOS_TERMOS_DE_USO} target="_blank" rel="noreferrer" className="underline">Termos de Uso</a> e a{' '}
          <a href={ENDERECO_DA_POLITICA_DE_PRIVACIDADE} target="_blank" rel="noreferrer" className="underline">Política de Privacidade</a>.
        </p>
      )}
      {erro && <p role="alert" className="text-sm text-al-erro">{erro}</p>}
      <div className="relative my-1 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-al-line" />
        </div>
        <span className="relative bg-al-bg px-2 text-xs uppercase tracking-wider text-al-muted">ou</span>
      </div>
    </div>
  )
}
