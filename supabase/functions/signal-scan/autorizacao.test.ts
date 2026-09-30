import { assertEquals } from 'jsr:@std/assert@1'
import { autorizadoComoServidor } from './autorizacao.ts'

// JWTs de mentira, só com o payload que importa: a assinatura é conferida pelo gateway (verify_jwt = true).
const jwt = (payload: Record<string, unknown>) =>
  ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'), 'assinatura']
    .join('.')

const DO_AMBIENTE = 'sb_secret_chave-que-o-supabase-injeta-na-funcao'

Deno.test('a chave de serviço do ambiente passa', async () => {
  assertEquals(await autorizadoComoServidor(`Bearer ${DO_AMBIENTE}`, DO_AMBIENTE), true)
})

Deno.test('o JWT de serviço passa mesmo quando a chave do ambiente é outra (a legada do painel e do CLI)', async () => {
  assertEquals(await autorizadoComoServidor(`Bearer ${jwt({ iss: 'supabase', role: 'service_role' })}`, DO_AMBIENTE), true)
})

Deno.test('o JWT do navegador, o anônimo, um token quebrado e nada não passam', async () => {
  for (const cabecalho of [
    `Bearer ${jwt({ role: 'authenticated', sub: 'usuario-1' })}`,
    `Bearer ${jwt({ role: 'anon' })}`,
    `Bearer ${jwt({ sub: 'sem-papel' })}`,
    'Bearer nao.e-um.jwt',
    'Bearer COLE_A_CHAVE_AQUI',
    jwt({ role: 'service_role' }),
    '',
  ]) {
    assertEquals(await autorizadoComoServidor(cabecalho, DO_AMBIENTE), false, cabecalho)
  }
})
