// O executor das Aprovações de ferramenta fechando o Enviar ao CRM pelo conector (ADR-0023): a Aprovação cuja chamada
// declara `efeito: 'empresa_no_crm'`, depois de encerrada, pede ao banco o fechamento da tentativa da mesma Execução
// (`finish_crm_handoff_by_tool_approval`, que lê o desfecho do estado da Aprovação). Sem o efeito, nada muda.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  type AprovacaoDeFerramenta,
  type BancoDoExecutorDeFerramenta,
  bancoDoExecutorDeFerramenta,
  executarChamadaAprovada,
} from './executor-de-aprovacoes.ts'
import { type BancoDeAcessos, ErroDoBanco } from './integration-access.ts'
import { servidorMcpFalso } from './integracoes/servidor-mcp-falso.ts'

const COM_EFEITO = {
  tipo: 'ferramenta',
  integration_id: 'hubspot',
  ferramenta: 'criar',
  argumentos: { nome: 'Alfa' },
  efeito: 'empresa_no_crm',
}

function montar(opcoes: {
  payload?: Record<string, unknown>
  recusaDoApp?: boolean
  fechar?: () => Promise<string>
  semFechar?: boolean
} = {}) {
  const payload = opcoes.payload ?? COM_EFEITO
  const aprovacao = { estado: 'aprovada' }
  const ordem: string[] = []
  const banco: BancoDoExecutorDeFerramenta = {
    lerAprovacao() {
      const lida: AprovacaoDeFerramenta = {
        workspaceId: 'ws-1',
        agenteId: 'agente-rhetor',
        integrationId: 'hubspot',
        requestedBy: 'usuario-ana',
        estado: aprovacao.estado,
        payload: structuredClone(payload),
      }
      return Promise.resolve(lida)
    },
    reservar() {
      aprovacao.estado = 'executando'
      return Promise.resolve('go')
    },
    encerrar(_id, ok) {
      ordem.push(`encerrar:${ok}`)
      aprovacao.estado = ok ? 'executada' : 'falhou'
      return Promise.resolve()
    },
    ...(opcoes.semFechar ? {} : {
      fecharEnvioPeloEfeito: (id: string) => {
        ordem.push(`fechar:${id}:${aprovacao.estado}`)
        return (opcoes.fechar ?? (() => Promise.resolve(aprovacao.estado === 'executada' ? 'enviado' : 'falhou')))()
      },
    }),
  }
  const servidor = servidorMcpFalso({
    token: 'acc-ana-111',
    ...(opcoes.recusaDoApp ? { resultados: { criar: { content: [{ type: 'text', text: 'Domínio já existe' }], isError: true } } } : {}),
  })
  const acessos: BancoDeAcessos = {
    acessoParaUso: () =>
      Promise.resolve({
        accessId: 'acesso-ana',
        kind: 'oauth_mcp',
        state: 'conectado',
        expiresAt: null,
        appPortal: null,
        accountLabel: null,
        segredo: JSON.stringify({ access_token: 'acc-ana-111' }),
      }),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve('propor'),
    aprovacaoEmExecucao: () => Promise.resolve(aprovacao.estado === 'executando'),
    regrasDasFerramentas: () => Promise.resolve({}),
  }
  const deps = { banco, acesso: { banco: acessos, ambiente: () => undefined, fetch: servidor.fetch }, log: () => {} }
  return { deps, ordem }
}

Deno.test('a chamada com o efeito, executada, fecha o envio depois de encerrar a Aprovação', async () => {
  const { deps, ordem } = montar()
  const desfecho = await executarChamadaAprovada(deps, { approvalId: 'ap-1', administrador: 'usuario-ana' })
  assertEquals(desfecho.status, 'executada')
  assert(desfecho.status === 'executada' && desfecho.envioAoCrm === 'enviado')
  assertEquals(ordem, ['encerrar:true', 'fechar:ap-1:executada'])
})

Deno.test('a chamada com o efeito que o app recusa fecha o envio como falha', async () => {
  const { deps, ordem } = montar({ recusaDoApp: true })
  const desfecho = await executarChamadaAprovada(deps, { approvalId: 'ap-1' })
  assertEquals(desfecho.status, 'falhou')
  assertEquals(ordem, ['encerrar:false', 'fechar:ap-1:falhou'])
})

Deno.test('sem o efeito, o executor não toca no Envio ao CRM, e o desfecho é o de antes', async () => {
  const { deps, ordem } = montar({ payload: { tipo: 'ferramenta', integration_id: 'hubspot', ferramenta: 'criar', argumentos: {} } })
  const desfecho = await executarChamadaAprovada(deps, { approvalId: 'ap-1' })
  assertEquals(desfecho.status, 'executada')
  assert(!('envioAoCrm' in desfecho))
  assertEquals(ordem, ['encerrar:true'])
})

Deno.test('o banco que recusa o fechamento não desfaz a chamada executada', async () => {
  const { deps } = montar({ fechar: () => Promise.reject(new ErroDoBanco('P0002', 'crm handoff attempt not found for this run')) })
  const desfecho = await executarChamadaAprovada(deps, { approvalId: 'ap-1' })
  assertEquals(desfecho.status, 'executada')
  assert(desfecho.status === 'executada' && desfecho.envioAoCrm === 'nao_fechado')
})

Deno.test('um banco sem o fechamento executa a chamada com o efeito como qualquer outra', async () => {
  const { deps, ordem } = montar({ semFechar: true })
  const desfecho = await executarChamadaAprovada(deps, { approvalId: 'ap-1' })
  assertEquals(desfecho.status, 'executada')
  assert(!('envioAoCrm' in desfecho))
  assertEquals(ordem, ['encerrar:true'])
})

Deno.test('o banco do executor fecha pela RPC de serviço, só com a Aprovação', async () => {
  const pedidos: [string, Record<string, unknown>][] = []
  const banco = bancoDoExecutorDeFerramenta((nome, parametros) => (pedidos.push([nome, parametros]), Promise.resolve({ data: 'enviado', error: null })))
  assertEquals(await banco.fecharEnvioPeloEfeito!('ap-1'), 'enviado')
  assertEquals(pedidos, [['finish_crm_handoff_by_tool_approval', { p_approval_id: 'ap-1' }]])
})
