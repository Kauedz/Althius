// O executor das Aprovações de Enviar ao CRM (Etapa 5b, CRM-15): da Aprovação ao CRM falso, com o banco das Aprovações
// e dos envios em memória e a regra de reservar como a do banco (`claim_approved_action`). A rede é um dublê da API REST
// do HubSpot, e a escrita passa pelo Acesso com o `agenteId` (Propor só escreve com a Aprovação em execução).
import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { PayloadDoEnvio, RefsDoCrm } from './envio-ao-crm.ts'
import { type AprovacaoDeEnvio, type BancoDoExecutor, executarEnvioAprovado } from './executor-de-aprovacoes.ts'
import { type BancoDeAcessos, ErroDoBanco, type Permissao } from './integration-access.ts'

const CHAVE = 'pat-na1-segredo-123456'
const ENVIO: PayloadDoEnvio = {
  empresa: { nome: 'Alfa', dominio: 'alfa.test', site: 'https://alfa.test', cnpj: null, segmento: 'Logística', linkedin: null },
  contatos: [{ id: 'contato-maria', nome: 'Maria Souza', cargo: 'Diretora', email: 'maria@alfa.test', telefone: null, linkedin: null }],
  nota: 'Enviada pela Althius.',
}
const PAYLOAD = { tipo: 'envio_ao_crm', integration_id: 'hubspot', target_account_id: 'conta-alfa', envio: ENVIO }

type Estado = 'pendente' | 'aprovada' | 'recusada' | 'expirada' | 'executando' | 'executada' | 'falhou'

function montar(opcoes: { estado?: Estado; permissao?: Permissao; administradores?: string[]; kind?: 'api_key' | 'oauth_mcp' } = {}) {
  const aprovacao = { estado: opcoes.estado ?? 'aprovada' as Estado, payload: structuredClone(PAYLOAD) }
  const chamadasAoCrm: string[] = []
  const conclusoes: { ok: boolean; refs: RefsDoCrm; erro: string | null }[] = []
  const encerramentos: { ok: boolean; falha: string | null }[] = []
  const lida = (): AprovacaoDeEnvio => ({
    workspaceId: 'ws-1',
    agenteId: 'agente-rhetor',
    integrationId: 'hubspot',
    requestedBy: 'usuario-ana',
    targetAccountId: 'conta-alfa',
    estado: aprovacao.estado,
    payload: aprovacao.payload,
  })
  const banco: BancoDoExecutor = {
    lerAprovacao(_id, administrador) {
      if (administrador && !(opcoes.administradores ?? ['usuario-ana']).includes(administrador)) {
        return Promise.reject(new ErroDoBanco('42501', 'only administrators can execute approvals'))
      }
      return Promise.resolve(lida())
    },
    reservar(_id, payload) {
      if (aprovacao.estado === 'expirada') return Promise.resolve('expired')
      if (aprovacao.estado !== 'aprovada') return Promise.resolve('not_approved')
      if (JSON.stringify(payload) !== JSON.stringify(PAYLOAD)) return Promise.resolve('payload_changed')
      aprovacao.estado = 'executando'
      return Promise.resolve('go')
    },
    iniciarEnvio() {
      if (aprovacao.estado !== 'executando') return Promise.reject(new ErroDoBanco('55000', 'the approval is not being executed'))
      return Promise.resolve({
        handoffId: 'envio-1',
        accessKind: opcoes.kind ?? 'api_key',
        userId: 'usuario-ana',
        payload: aprovacao.payload.envio,
        previousRefs: {},
      })
    },
    progresso: () => Promise.resolve(),
    concluirEnvio: (a) => (conclusoes.push({ ok: a.ok, refs: a.refs, erro: a.erro }), Promise.resolve(a.ok ? 'enviado' : 'falhou')),
    encerrar(_id, ok, falha) {
      encerramentos.push({ ok, falha })
      aprovacao.estado = ok ? 'executada' : 'falhou'
      return Promise.resolve()
    },
  }
  const acessos: BancoDeAcessos = {
    acessoParaUso: () =>
      Promise.resolve({
        accessId: 'acesso-1',
        kind: 'api_key',
        state: 'conectado',
        expiresAt: null,
        appPortal: null,
        accountLabel: null,
        segredo: JSON.stringify({ api_key: CHAVE }),
      }),
    renovar: () => Promise.resolve(),
    marcarReconexao: () => Promise.resolve(),
    clienteOAuth: () => Promise.resolve(null),
    salvarClienteOAuth: (a) => Promise.resolve({ clientId: a.clientId, clientSecret: a.clientSecret }),
    permissaoDoAgente: () => Promise.resolve(opcoes.permissao ?? 'propor'),
    aprovacaoEmExecucao: () => Promise.resolve(aprovacao.estado === 'executando'),
  }
  const ids: Record<string, string> = {
    '/crm/v3/objects/companies': 'hs-company-1',
    '/crm/v3/objects/contacts': 'hs-contact-1',
    '/crm/v3/objects/notes': 'hs-note-1',
  }
  const fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada))
    chamadasAoCrm.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    const id = ids[url.pathname]
    return id ? new Response(JSON.stringify({ id }), { status: 201 }) : new Response('{}', { status: 404 })
  }) as typeof globalThis.fetch
  const deps = { banco, acesso: { banco: acessos, ambiente: () => undefined, fetch }, log: () => {} }
  return { deps, aprovacao, chamadasAoCrm, conclusoes, encerramentos }
}

Deno.test('aprovada: reserva, envia ao CRM uma vez pelo Acesso de quem pediu e fecha a Aprovação como executada', async () => {
  const m = montar()
  const r = await executarEnvioAprovado(m.deps, { approvalId: 'ap-1', administrador: 'usuario-ana' })
  assertEquals(r.status, 'enviado')
  assertEquals(m.chamadasAoCrm, ['POST /crm/v3/objects/companies', 'POST /crm/v3/objects/contacts', 'POST /crm/v3/objects/notes'])
  assertEquals(m.conclusoes.map((c) => c.ok), [true])
  assertEquals(m.encerramentos, [{ ok: true, falha: null }])
  assertEquals(m.aprovacao.estado, 'executada')

  // Executar de novo (outro clique, ou o motor e a tela juntos) não envia outra vez.
  const outra = await executarEnvioAprovado(m.deps, { approvalId: 'ap-1', administrador: 'usuario-ana' })
  assertEquals(outra.status, 'nao_liberada')
  assertEquals(m.chamadasAoCrm.length, 3)
})

Deno.test('recusada, pendente ou expirada: nada vai ao CRM e o motivo volta em português', async () => {
  for (const estado of ['recusada', 'pendente', 'expirada'] as const) {
    const m = montar({ estado })
    const r = await executarEnvioAprovado(m.deps, { approvalId: 'ap-1' })
    assertEquals(r.status, 'nao_liberada')
    assert(r.mensagem.length > 0)
    assertEquals(m.chamadasAoCrm, [])
    assertEquals(m.encerramentos, [])
  }
})

Deno.test('um conteúdo diferente do aprovado não sai', async () => {
  const m = montar()
  m.aprovacao.payload.envio.empresa.nome = 'Outra'
  const r = await executarEnvioAprovado(m.deps, { approvalId: 'ap-1' })
  assertEquals(r.status, 'nao_liberada')
  assert(r.status === 'nao_liberada' && r.motivo === 'payload_changed')
  assertEquals(m.chamadasAoCrm, [])
})

Deno.test('só um Administrador pede a execução pela tela', async () => {
  const m = montar({ administradores: ['usuario-ana'] })
  const r = await executarEnvioAprovado(m.deps, { approvalId: 'ap-1', administrador: 'usuario-bruno' })
  assertEquals(r.status, 'recusada')
  assertEquals(m.aprovacao.estado, 'aprovada')
  assertEquals(m.chamadasAoCrm, [])
})

Deno.test('com a Permissão Ler (revogada depois de aprovar), a escrita é recusada e a Aprovação fecha como falha', async () => {
  const m = montar({ permissao: 'ler' })
  const r = await executarEnvioAprovado(m.deps, { approvalId: 'ap-1' })
  assertEquals(r.status, 'falhou')
  assertEquals(m.chamadasAoCrm, [])
  assertEquals(m.conclusoes.map((c) => c.ok), [false])
  assertEquals(m.encerramentos.map((e) => e.ok), [false])
})

Deno.test('pela autorização no app (OAuth), não há escrita confirmada: falha honesta, sem chamar o CRM', async () => {
  const m = montar({ kind: 'oauth_mcp' })
  const r = await executarEnvioAprovado(m.deps, { approvalId: 'ap-1' })
  assertEquals(r.status, 'falhou')
  assert(r.mensagem.includes('chave de API'))
  assertEquals(m.chamadasAoCrm, [])
  assertEquals(m.encerramentos.map((e) => e.ok), [false])
})

Deno.test('nenhuma resposta leva a chave do CRM', async () => {
  const m = montar()
  const r = await executarEnvioAprovado(m.deps, { approvalId: 'ap-1' })
  assert(!JSON.stringify(r).includes(CHAVE))
})
