// Os passos do ICP G (corretoras de benefícios): a implementação do que o banco registra nas cascatas deste ICP (`signal_cascade_steps.handler`).
// Cada handler daqui tem um teste ao lado e um passo registrado na migração do ICP.
import type { RegistroDePassos } from '../tipos.ts'

export function passosDoIcp_g(_fetchFn: typeof fetch = fetch): RegistroDePassos {
  return { passos: {}, fontes: {} }
}
