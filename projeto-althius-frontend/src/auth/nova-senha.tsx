import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'

/** A política de senha do cadastro e da redefinição: só um tamanho mínimo, sem regras de composição. */
export const TAMANHO_MINIMO_DA_SENHA = 8

/**
 * A força da senha, sem regras de composição: o tamanho pesa mais, e misturar tipos de caractere ajuda.
 * Abaixo do mínimo, a senha é recusada.
 */
function forcaDaSenha(senha: string): 'muito curta' | 'fraca' | 'razoável' | 'boa' | 'forte' {
  if (senha.length < TAMANHO_MINIMO_DA_SENHA) return 'muito curta'
  const tipos = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((tipo) => tipo.test(senha)).length
  const pontos = Number(senha.length >= 12) + Number(senha.length >= 16) + Number(tipos >= 3)
  return (['fraca', 'razoável', 'boa', 'forte'] as const)[pontos]
}

/** O campo de uma senha nova: medidor de força, mostrar/ocultar e a sugestão do gerenciador de senhas. */
export function CampoDeNovaSenha({
  id,
  rotulo,
  senha,
  aoMudar,
}: {
  id: string
  rotulo: string
  senha: string
  aoMudar: (senha: string) => void
}) {
  const [senhaVisivel, setSenhaVisivel] = useState(false)
  const idDaForca = useId()

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id}>{rotulo}</label>
      <div className="flex gap-2">
        <input
          id={id}
          type={senhaVisivel ? 'text' : 'password'}
          autoComplete="new-password"
          required
          aria-describedby={idDaForca}
          value={senha}
          onChange={(e) => aoMudar(e.target.value)}
          className="campo h-10 min-w-0 flex-1 bg-al-bg px-3 text-al-ink"
        />
        <Button type="button" variant="outline" onClick={() => setSenhaVisivel((v) => !v)}>
          {senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
        </Button>
      </div>
      <p id={idDaForca} aria-live="polite" className="text-xs text-al-muted">
        {senha ? `Força da senha: ${forcaDaSenha(senha)}` : `Mínimo de ${TAMANHO_MINIMO_DA_SENHA} caracteres. Uma frase longa é mais forte.`}
      </p>
    </div>
  )
}
