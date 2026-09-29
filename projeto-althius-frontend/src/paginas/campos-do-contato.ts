import { useState } from 'react'

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
