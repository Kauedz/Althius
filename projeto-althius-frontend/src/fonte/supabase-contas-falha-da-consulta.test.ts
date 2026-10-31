import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { criarFonteDeContasSupabase } from './supabase-contas'

// prospeccao-funcional B6: a falha da consulta de CNPJ chega à tela com a causa da função, e o comitê diz quantas
// pessoas achadas não foram gravadas.

function clienteCom(invoke: ReturnType<typeof vi.fn>) {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: async () => ({ data: { name: 'LogiFlow', linkedin_url: null, domain: 'logiflow.com.br' }, error: null }),
  }
  return { functions: { invoke }, from: () => consulta } as unknown as SupabaseClient
}

function fonte(invoke: ReturnType<typeof vi.fn>) {
  return criarFonteDeContasSupabase(clienteCom(invoke), () => 'ws-1', () => 'user-1')
}

describe('Falha da consulta de CNPJ e do comitê (B6)', () => {
  it('a consulta de CNPJ que falhou rejeita com a mensagem da função, não com o erro genérico', async () => {
    const corpo = new Response(JSON.stringify({ error: 'A consulta do CNPJ falhou: a BrasilAPI respondeu 503.' }), { status: 502 })
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: corpo } })

    await expect(fonte(invoke).enriquecerReceita!('conta-1', '07.526.557/0001-00'))
      .rejects.toThrow('A consulta do CNPJ falhou: a BrasilAPI respondeu 503.')
  })

  it('o CNPJ não encontrado continua dizendo não encontrado', async () => {
    const corpo = new Response(JSON.stringify({ error: 'Dados do CNPJ não encontrados' }), { status: 404 })
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: corpo } })

    await expect(fonte(invoke).enriquecerReceita!('conta-1', '07.526.557/0001-00')).rejects.toThrow('Dados do CNPJ não encontrados')
  })

  it('o comitê devolve quantas pessoas achadas não foram gravadas', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { contactsFound: 1, contactsAdded: 1, contactsAlreadyKnown: 0, contactsNotSaved: 2 },
      error: null,
    })

    await expect(fonte(invoke).buscarComite!('conta-1')).resolves.toEqual({ encontradas: 1, novas: 1, jaEncontradas: 0, naoGravadas: 2 })
  })

  it('sem o campo na resposta, nenhuma pessoa fica como não gravada', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { contactsFound: 1, contactsAdded: 1, contactsAlreadyKnown: 0 }, error: null })

    const resultado = await fonte(invoke).buscarComite!('conta-1')
    expect(resultado.naoGravadas ?? 0).toBe(0)
  })
})
