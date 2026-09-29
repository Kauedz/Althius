import { useState } from 'react'
import type { CanaisDoContato } from '@/fonte/canais-do-contato'

export interface CamposDoFormularioDeContato {
  nome: string
  cargo: string
  email: string
  whatsapp: string
  linkedin: string
}

/** Os campos do formulário e o `onChange` de cada um, para o cadastro e a edição guardarem o que a pessoa digita. */
export function useCamposDoContato(inicial: CamposDoFormularioDeContato) {
  const [campos, setCampos] = useState(inicial)
  const editar = (nome: keyof CamposDoFormularioDeContato) => (e: { target: { value: string } }) =>
    setCampos((atuais) => ({ ...atuais, [nome]: e.target.value }))
  return { campos, editar }
}

/** As listas como a pessoa as edita: uma linha em branco vale "nenhum valor" e não é gravada. */
export const canaisSemLinhasEmBranco = (canais: CanaisDoContato): CanaisDoContato => ({
  emails: canais.emails.filter((e) => e.valor.trim()),
  telefones: canais.telefones.filter((t) => t.valor.trim()),
})

export const mesmosCanais = (a: CanaisDoContato, b: CanaisDoContato) => JSON.stringify(a) === JSON.stringify(b)
