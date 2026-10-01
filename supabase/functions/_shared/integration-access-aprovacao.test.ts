// A escrita de um Agente com a Permissão Propor depois da Aprovação (Etapa 5b, CRM-15): `chamarFerramenta` com o
// `agenteId` e o `aprovacaoId` só escreve quando o banco confirma que a Aprovação deste Agente, nesta Integração, está
// sendo executada agora. Sem a confirmação, continua recusando, como antes.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { type BancoDeAcessos, chamarFerramenta, type DepsDeAcesso, type Permissao } from './integration-access.ts'
import { servidorMcpFalso } from './integracoes/servidor-mcp-falso.ts'

const AGORA = new Date('2026-10-01T12:00:00Z')
const PEDIDO = {
  workspaceId: 'ws-1',
  userId: 'u-1',
  integrationId: 'hubspot',
  ferramenta: 'criar',
  argumentos: {},
  agenteId: 'agente-1',
}

function montar(permissao: Permissao, emExecucao?: (a: unknown) => Promise<boolean>) {
  const servidor = servidorMcpFalso()
  const perguntas: unknown[] = []
  const banco: BancoDeAcessos = {
    acessoParaUso: () =>
      Promise.resolve({
        accessId: 'acesso-1',
        kind: 'oauth_mcp',
        state: 'conectado',
        expiresAt: new Date(AGORA.getTime() + 3600_000).toISOString(),
        appPortal: 'hub-1',
        accountLabel: 'ana@norte.test',
        segredo: JSON.stringify({ access_token: 'acc-111' }),
      }),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve(permissao),
    ...(emExecucao
      ? {
        aprovacaoEmExecucao: (a: unknown) => {
          perguntas.push(a)
          return emExecucao(a)
        },
      }
      : {}),
  }
  const deps: DepsDeAcesso = { banco, ambiente: () => undefined, fetch: servidor.fetch as typeof fetch, agora: () => AGORA }
  const escreveu = () => servidor.chamadas.some((c) => c.rpc === 'tools/call' && (c.corpo?.params as { name: string }).name === 'criar')
  return { deps, escreveu, perguntas }
}

Deno.test('com Propor e a Aprovação em execução confirmada pelo banco, o Agente escreve', async () => {
  const { deps, escreveu, perguntas } = montar('propor', () => Promise.resolve(true))
  const r = await chamarFerramenta(deps, { ...PEDIDO, aprovacaoId: 'ap-1' })
  assert(r.ok)
  assert(escreveu())
  assertEquals(perguntas, [{ approvalId: 'ap-1', workspaceId: 'ws-1', agenteId: 'agente-1', integrationId: 'hubspot' }])
})

Deno.test('com Propor e uma Aprovação que não está em execução, a escrita é recusada sem chegar ao app', async () => {
  const { deps, escreveu } = montar('propor', () => Promise.resolve(false))
  const r = await chamarFerramenta(deps, { ...PEDIDO, aprovacaoId: 'ap-1' })
  assert(!r.ok && r.erro.tipo === 'permissao_negada')
  assert(!escreveu())
})

Deno.test('sem o banco saber conferir a Aprovação, Propor continua recusando a escrita', async () => {
  const { deps, escreveu } = montar('propor')
  const r = await chamarFerramenta(deps, { ...PEDIDO, aprovacaoId: 'ap-1' })
  assert(!r.ok && r.erro.tipo === 'permissao_negada')
  assert(!escreveu())
})

Deno.test('a Aprovação não abre a escrita para quem só tem Ler', async () => {
  const { deps, escreveu } = montar('ler', () => Promise.resolve(true))
  const r = await chamarFerramenta(deps, { ...PEDIDO, aprovacaoId: 'ap-1' })
  assert(!r.ok && r.erro.tipo === 'permissao_negada')
  assert(!escreveu())
})

Deno.test('uma falha ao conferir a Aprovação recusa a escrita, nunca a libera', async () => {
  const { deps, escreveu } = montar('propor', () => Promise.reject(new Error('banco fora')))
  const r = await chamarFerramenta(deps, { ...PEDIDO, aprovacaoId: 'ap-1' })
  assert(!r.ok)
  assert(!escreveu())
})
