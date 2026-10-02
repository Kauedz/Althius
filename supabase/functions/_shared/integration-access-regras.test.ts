// A regra de cada ferramenta no Acesso (ADR-0022): com o banco das regras, `chamarFerramenta` nunca chama o que a regra
// somada à Permissão do Agente recusa, em qualquer caminho (Agente, Aprovação, decisão da própria pessoa). O servidor MCP
// é um dublê: "buscar" é leitura, "criar" escreve.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { type BancoDeAcessos, chamarFerramenta, type DepsDeAcesso, type Permissao } from './integration-access.ts'
import type { RegrasDaIntegracao } from './integracoes/regras.ts'
import { servidorMcpFalso } from './integracoes/servidor-mcp-falso.ts'

const PEDIDO = { workspaceId: 'ws-1', userId: 'u-1', integrationId: 'notion', argumentos: {} }

function montar(opcoes: { permissao?: Permissao; regras?: RegrasDaIntegracao | Error; emExecucao?: boolean } = {}) {
  const servidor = servidorMcpFalso({ token: 'acc-111111' })
  const consultas: unknown[] = []
  const banco: BancoDeAcessos = {
    acessoParaUso: () =>
      Promise.resolve({
        accessId: 'acesso-1',
        kind: 'oauth_mcp',
        state: 'conectado',
        expiresAt: null,
        appPortal: null,
        accountLabel: null,
        segredo: JSON.stringify({ access_token: 'acc-111111' }),
      }),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve(opcoes.permissao ?? 'executar'),
    aprovacaoEmExecucao: () => Promise.resolve(opcoes.emExecucao === true),
    regrasDasFerramentas: (a) => {
      consultas.push(a)
      return opcoes.regras instanceof Error ? Promise.reject(opcoes.regras) : Promise.resolve(opcoes.regras ?? {})
    },
  }
  const deps: DepsDeAcesso = { banco, ambiente: () => undefined, fetch: servidor.fetch }
  const chamou = (nome: string) =>
    servidor.chamadas.some((c) => c.rpc === 'tools/call' && (c.corpo?.params as { name: string }).name === nome)
  return { deps, chamou, consultas }
}

Deno.test('bloqueada vence tudo: nem Executar, nem a Aprovação, nem a decisão da própria pessoa chamam', async () => {
  const { deps, chamou, consultas } = montar({ regras: { criar: 'bloqueada', buscar: 'bloqueada' }, emExecucao: true })
  const comAgente = await chamarFerramenta(deps, { ...PEDIDO, ferramenta: 'criar', agenteId: 'ag-1', aprovacaoId: 'ap-1' })
  assert(!comAgente.ok && comAgente.erro.tipo === 'permissao_negada')
  assertEquals(comAgente.erro.mensagem, 'O Administrador bloqueou esta ferramenta neste Workspace.')
  const pessoa = await chamarFerramenta(deps, { ...PEDIDO, ferramenta: 'criar', decisaoDaPessoa: true })
  assert(!pessoa.ok && pessoa.erro.tipo === 'permissao_negada')
  const leitura = await chamarFerramenta(deps, { ...PEDIDO, ferramenta: 'buscar' })
  assert(!leitura.ok && leitura.erro.tipo === 'permissao_negada')
  assert(!chamou('criar') && !chamou('buscar'))
  assertEquals(consultas[0], { workspaceId: 'ws-1', integrationId: 'notion' })
})

Deno.test('sem regra, a escrita de um Agente com Executar pede Aprovação; com a Aprovação em execução, sai', async () => {
  const sem = montar({ permissao: 'executar' })
  const r = await chamarFerramenta(sem.deps, { ...PEDIDO, ferramenta: 'criar', agenteId: 'ag-1' })
  assert(!r.ok && r.erro.tipo === 'permissao_negada')
  assertEquals(r.erro.mensagem, 'Esta ferramenta pede Aprovação neste Workspace.')
  assert(!sem.chamou('criar'))

  const com = montar({ permissao: 'executar', emExecucao: true })
  const aprovada = await chamarFerramenta(com.deps, { ...PEDIDO, ferramenta: 'criar', agenteId: 'ag-1', aprovacaoId: 'ap-1' })
  assert(aprovada.ok)
  assert(com.chamou('criar'))
})

Deno.test('"sempre" com Executar escreve na hora; com Propor, ainda pede Aprovação', async () => {
  const executar = montar({ permissao: 'executar', regras: { criar: 'sempre' } })
  assert((await chamarFerramenta(executar.deps, { ...PEDIDO, ferramenta: 'criar', agenteId: 'ag-1' })).ok)
  assert(executar.chamou('criar'))

  const propor = montar({ permissao: 'propor', regras: { criar: 'sempre' } })
  const r = await chamarFerramenta(propor.deps, { ...PEDIDO, ferramenta: 'criar', agenteId: 'ag-1' })
  assert(!r.ok && r.erro.tipo === 'permissao_negada')
  assertEquals(r.erro.mensagem, 'A Permissão deste Agente é Propor: esta ação precisa de Aprovação.')
})

Deno.test('uma leitura com "aprovacao": Ler não usa, Executar precisa da Aprovação', async () => {
  const ler = montar({ permissao: 'ler', regras: { buscar: 'aprovacao' } })
  const r = await chamarFerramenta(ler.deps, { ...PEDIDO, ferramenta: 'buscar', agenteId: 'ag-1' })
  assert(!r.ok && r.erro.tipo === 'permissao_negada')
  const executar = montar({ permissao: 'executar', regras: { buscar: 'aprovacao' } })
  const semAprovacao = await chamarFerramenta(executar.deps, { ...PEDIDO, ferramenta: 'buscar', agenteId: 'ag-1' })
  assert(!semAprovacao.ok)
  assert(!ler.chamou('buscar') && !executar.chamou('buscar'))
  // A própria pessoa lê (a regra de Aprovação é para os Agentes).
  assert((await chamarFerramenta(executar.deps, { ...PEDIDO, ferramenta: 'buscar' })).ok)
})

Deno.test('se as regras não puderem ser lidas, nada é chamado (a autorização nunca abre por falha)', async () => {
  const { deps, chamou } = montar({ regras: new Error('banco fora') })
  const r = await chamarFerramenta(deps, { ...PEDIDO, ferramenta: 'buscar', agenteId: 'ag-1' })
  assert(!r.ok && r.erro.tipo === 'indisponivel')
  assert(!chamou('buscar'))
})
