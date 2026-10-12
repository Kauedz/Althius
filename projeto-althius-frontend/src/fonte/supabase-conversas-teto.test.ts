import { describe, expect, it } from 'vitest'
import { mensagemDaFalha } from './supabase-conversas'

describe('o teto da Rotina que para a Execução', () => {
  it('diz em palavras de quem pediu que o teto do mês foi atingido', () => {
    expect(mensagemDaFalha('automation_cap_reached')).toBe(
      'O teto mensal desta Rotina foi atingido, e a Execução parou antes de gastar mais. Um Administrador pode subir o teto em Configurações.',
    )
  })
})
