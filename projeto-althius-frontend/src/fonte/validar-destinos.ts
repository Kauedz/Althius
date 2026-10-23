// A validação do e-mail e do WhatsApp que a pessoa digita para um Contato. Vale nos dois ambientes; fica fora das fontes
// simuladas para as telas não puxarem os dados de exemplo para o pacote principal.

export function normalizarWhatsApp(numero: string): string {
  const limpo = numero.trim()
  if (!limpo) return ''
  if (limpo.startsWith('+')) {
    const digitos = limpo.slice(1).replace(/\D/g, '')
    if (digitos.length < 8 || digitos.length > 15) {
      throw new Error('Número de WhatsApp inválido: deve conter entre 8 e 15 dígitos')
    }
    return `+${digitos}`
  }
  const digitos = limpo.replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) {
    return `+55${digitos}`
  }
  if (digitos.length >= 8 && digitos.length <= 15) {
    return `+${digitos}`
  }
  throw new Error('Número de WhatsApp inválido: deve conter entre 8 e 15 dígitos')
}

export function validarEmail(email: string): string {
  const limpo = email.trim().toLowerCase()
  if (!limpo) return ''
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!regex.test(limpo)) {
    throw new Error('Formato de e-mail inválido')
  }
  return limpo
}
