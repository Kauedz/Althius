import { vi } from 'vitest'
import { armazenamentoEmMemoria } from './armazenamento'

/**
 * Observa por onde um texto digitado poderia sair do formulário: o armazenamento demonstrativo (passe `armazenamento`
 * para a app), o localStorage, o console e a rede. Chame `restaurar` no fim do teste.
 */
export function observarRastros() {
  const armazenamento = armazenamentoEmMemoria()
  const gravacoes: string[] = []
  const gravar = armazenamento.setItem
  armazenamento.setItem = (chave, valor) => {
    gravacoes.push(`${chave}=${valor}`)
    gravar(chave, valor)
  }
  const registros = (['log', 'info', 'warn', 'error', 'debug'] as const).map((metodo) =>
    vi.spyOn(console, metodo).mockImplementation(() => {}),
  )
  const envio = vi.spyOn(globalThis, 'fetch')

  return {
    armazenamento,
    /** O que foi gravado no armazenamento demonstrativo, como `chave=valor`. */
    gravacoes,
    envio,
    /** Tudo o que ficou gravado ou registrado até agora, como texto. */
    rastros() {
      const doNavegador = Object.keys(window.localStorage).map((chave) => `${chave}=${window.localStorage.getItem(chave)}`)
      const registrado = registros.flatMap((espiao) => espiao.mock.calls.map((chamada) => chamada.map(String).join(' ')))
      return [...gravacoes, ...doNavegador, ...registrado]
    },
    restaurar() {
      registros.forEach((espiao) => espiao.mockRestore())
      envio.mockRestore()
    },
  }
}
