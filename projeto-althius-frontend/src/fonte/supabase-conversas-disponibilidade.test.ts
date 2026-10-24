import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso } from '@/test/supabase-falso'
import { conversasDisponiveis } from './supabase-conversas'

describe('motivo da indisponibilidade das Conversas', () => {
  it.each(['motor_fora_do_ar', 'sem_modelo'])('preserva o motivo conhecido %s da capability', async (motivo) => {
    const { cliente } = criarSupabaseFalso({
      funcoes: { 'agent-conversation': () => ({ status: 200, corpo: { available: false, motivo } }) },
    })
    expect(await conversasDisponiveis(cliente, true)).toEqual({ available: false, motivo })
  })

  it('não transmite detalhes desconhecidos do backend para a tela', async () => {
    const { cliente } = criarSupabaseFalso({
      funcoes: { 'agent-conversation': () => ({ status: 200, corpo: { available: false, motivo: 'fornecedor: segredo' } }) },
    })
    expect(await conversasDisponiveis(cliente, true)).toEqual({ available: false })
  })

  it('não atribui motivo a uma falha de comunicação', async () => {
    const { cliente } = criarSupabaseFalso({
      funcoes: { 'agent-conversation': () => ({ status: 503, corpo: { motivo: 'motor_fora_do_ar' } }) },
    })
    expect(await conversasDisponiveis(cliente, true)).toEqual({ available: false })
  })

  it('remove motivo residual quando as Conversas estão disponíveis', async () => {
    const { cliente } = criarSupabaseFalso({
      funcoes: { 'agent-conversation': () => ({ status: 200, corpo: { available: true, motivo: 'motor_fora_do_ar' } }) },
    })
    expect(await conversasDisponiveis(cliente, true)).toEqual({ available: true })
  })
})
