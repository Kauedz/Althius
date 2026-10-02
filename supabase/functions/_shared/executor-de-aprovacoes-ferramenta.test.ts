// O executor das Aprovações de ferramenta (ADR-0022): uma Aprovação `{ tipo: 'ferramenta', … }` executa exatamente aquela
// chamada, uma vez, pelo Acesso de quem pediu ao Agente. O banco das Aprovações fica em memória, com a reserva igual à do
// banco (`claim_approved_action`: estado, hash do payload); o servidor MCP é um dublê.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  type AprovacaoDeFerramenta,
  type BancoDoExecutorDeFerramenta,
  executarChamadaAprovada,
} from './executor-de-aprovacoes.ts'
import { type BancoDeAcessos, ErroDoBanco } from './integration-access.ts'
import { servidorMcpFalso } from './integracoes/servidor-mcp-falso.ts'

const PAYLOAD = {
  tipo: 'ferramenta',
  integration_id: 'notion',
  ferramenta: 'criar',
  argumentos: { titulo: 'Pauta da Alfa' },
}

function montar(opcoes: { estado?: string; administradores?: string[]; resultado?: { content: unknown[]; isError?: boolean } } = {}) {
  const aprovacao = { estado: opcoes.estado ?? 'aprovada' }
  const encerramentos: { ok: boolean; falha: string | null }[] = []
  const reservas: unknown[] = []
  const banco: BancoDoExecutorDeFerramenta = {
    lerAprovacao(_id, administrador) {
      if (administrador && !(opcoes.administradores ?? ['usuario-ana']).includes(administrador)) {
        return Promise.reject(new ErroDoBanco('42501', 'only administrators can execute approvals'))
      }
      const lida: AprovacaoDeFerramenta = {
        workspaceId: 'ws-1',
        agenteId: 'agente-rhetor',
        integrationId: 'notion',
        requestedBy: 'usuario-bruno',
        estado: aprovacao.estado,
        payload: structuredClone(PAYLOAD),
      }
      return Promise.resolve(lida)
    },
    reservar(_id, payload) {
      reservas.push(payload)
      if (aprovacao.estado !== 'aprovada') return Promise.resolve('not_approved')
      if (JSON.stringify(payload) !== JSON.stringify(PAYLOAD)) return Promise.resolve('payload_changed')
      aprovacao.estado = 'executando'
      return Promise.resolve('go')
    },
    encerrar(_id, ok, falha) {
      encerramentos.push({ ok, falha })
      aprovacao.estado = ok ? 'executada' : 'falhou'
      return Promise.resolve()
    },
  }
  const servidor = servidorMcpFalso({
    token: 'acc-bruno-111',
    ...(opcoes.resultado ? { resultados: { criar: opcoes.resultado } } : {}),
  })
  const pedidosDeAcesso: unknown[] = []
  const acessos: BancoDeAcessos = {
    acessoParaUso: (a) => (
      pedidosDeAcesso.push(a),
        Promise.resolve({
          accessId: 'acesso-bruno',
          kind: 'oauth_mcp',
          state: 'conectado',
          expiresAt: null,
          appPortal: null,
          accountLabel: null,
          segredo: JSON.stringify({ access_token: 'acc-bruno-111' }),
        })
    ),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve('propor'),
    aprovacaoEmExecucao: (a) => Promise.resolve(a.approvalId === 'ap-1' && aprovacao.estado === 'executando'),
    regrasDasFerramentas: () => Promise.resolve({}),
  }
  const deps = { banco, acesso: { banco: acessos, ambiente: () => undefined, fetch: servidor.fetch }, log: () => {} }
  const chamadas = () =>
    servidor.chamadas.filter((c) => c.rpc === 'tools/call').map((c) => c.corpo?.params as { name: string; arguments: unknown })
  return { deps, chamadas, encerramentos, reservas, pedidosDeAcesso, aprovacao }
}

Deno.test('a Aprovação de ferramenta executa exatamente aquela chamada, pelo Acesso de quem pediu, e fecha executada', async () => {
  const { deps, chamadas, encerramentos, reservas, pedidosDeAcesso } = montar()
  const desfecho = await executarChamadaAprovada(deps, { approvalId: 'ap-1', administrador: 'usuario-ana' })
  assertEquals(desfecho.status, 'executada')
  assertEquals(reservas, [PAYLOAD], 'reserva com o payload guardado')
  assertEquals(chamadas(), [{ name: 'criar', arguments: { titulo: 'Pauta da Alfa' } }])
  const { workspaceId, userId, integrationId } = pedidosDeAcesso[0] as Record<string, unknown>
  assertEquals({ workspaceId, userId, integrationId }, { workspaceId: 'ws-1', userId: 'usuario-bruno', integrationId: 'notion' })
  assertEquals(encerramentos, [{ ok: true, falha: null }])
  assert(!JSON.stringify(desfecho).includes('acc-bruno-111'), 'nenhum token no desfecho')
})

Deno.test('uma vez só: a segunda execução não é liberada e nada é chamado de novo', async () => {
  const { deps, chamadas } = montar()
  await executarChamadaAprovada(deps, { approvalId: 'ap-1' })
  const segunda = await executarChamadaAprovada(deps, { approvalId: 'ap-1' })
  assertEquals(segunda.status, 'nao_liberada')
  assertEquals(chamadas().length, 1)
})

Deno.test('pendente ou recusada não sai; quem não é Administrador não pede a execução', async () => {
  const pendente = montar({ estado: 'pendente' })
  assertEquals((await executarChamadaAprovada(pendente.deps, { approvalId: 'ap-1' })).status, 'nao_liberada')
  assertEquals(pendente.chamadas(), [])
  assertEquals(pendente.encerramentos, [])

  const membro = montar()
  const r = await executarChamadaAprovada(membro.deps, { approvalId: 'ap-1', administrador: 'usuario-bruno' })
  assertEquals(r.status, 'recusada')
  assertEquals(membro.reservas, [])
})

Deno.test('a ferramenta recusou: a Aprovação fecha como falhou, com o motivo do app', async () => {
  const { deps, encerramentos } = montar({ resultado: { content: [{ type: 'text', text: 'Página sem permissão' }], isError: true } })
  const r = await executarChamadaAprovada(deps, { approvalId: 'ap-1' })
  assertEquals(r.status, 'falhou')
  assertStringIncludes(r.mensagem, 'Página sem permissão')
  assertEquals(encerramentos.length, 1)
  assertEquals(encerramentos[0].ok, false)
})
