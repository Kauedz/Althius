// Os passos do ICP D (energia e mercado livre): a implementação do que o banco registra nas cascatas deste ICP (`signal_cascade_steps.handler`).
// Cada handler daqui tem um teste ao lado e um passo registrado na migração do ICP.
import type { RegistroDePassos } from '../tipos.ts'

export function passosDoIcp_d(_fetchFn: typeof fetch = fetch): RegistroDePassos {
  return { passos: {}, fontes: {} }
}
