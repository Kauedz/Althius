// Os passos do ICP E (indústria: fornecedores B2B): a implementação do que o banco registra nas cascatas deste ICP (`signal_cascade_steps.handler`).
// Cada handler daqui tem um teste ao lado e um passo registrado na migração do ICP.
import type { RegistroDePassos } from '../tipos.ts'

export function passosDoIcp_e(_fetchFn: typeof fetch = fetch): RegistroDePassos {
  return { passos: {}, fontes: {} }
}
