import { useEffect, useState } from 'react'
import { MS_POR_CARACTERE } from '@/conversa/contexto'

/**
 * Mostra o texto com efeito de digitação. Parágrafos separados por linha em branco; "- " vira lista.
 * Sem animação, o texto aparece inteiro (ex.: ao voltar para uma resposta que já terminou).
 */
export function TextoDigitado({ texto, animar }: { texto: string; animar: boolean }) {
  const [visiveis, setVisiveis] = useState(animar ? 0 : texto.length)

  useEffect(() => {
    if (!animar) return
    const passo = 3
    const intervalo = setInterval(() => {
      setVisiveis((atual) => {
        if (atual + passo >= texto.length) clearInterval(intervalo)
        return Math.min(atual + passo, texto.length)
      })
    }, MS_POR_CARACTERE * passo)
    return () => clearInterval(intervalo)
  }, [texto, animar])

  return <TextoFormatado texto={animar ? texto.slice(0, visiveis) : texto} />
}

function TextoFormatado({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col gap-2">
      {texto.split('\n\n').map((bloco, i) => {
        const linhas = bloco.split('\n')
        const itensDeLista = linhas.filter((l) => l.startsWith('- '))
        if (itensDeLista.length === 0) return <p key={i} className="whitespace-pre-line">{bloco}</p>
        const introducao = linhas.filter((l) => !l.startsWith('- '))
        return (
          <div key={i}>
            {introducao.length > 0 && <p>{introducao.join('\n')}</p>}
            <ul className="flex list-none flex-col gap-1 pl-0">
              {itensDeLista.map((linha, j) => (
                <li key={j} className="flex gap-2">
                  <span className="text-al-accent" aria-hidden>
                    ·
                  </span>
                  {linha.slice(2)}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
