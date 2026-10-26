import { assertEquals } from 'jsr:@std/assert@1'
import { createCanalSimulado } from '../_shared/canal/index.ts'
import { createHandler, type Db, type SessaoWhatsApp, type WorkspaceElegivel } from './handler.ts'

const SEGREDO = 'segredo-de-teste'
const USUARIO = '5d000000-0000-0000-0000-000000000001'
const WORKSPACE = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const TELEFONE = '5511999999999'

async function assinatura(corpo: string) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(SEGREDO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo)))
  return `sha256=${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function montar(opcoes: { workspaces?: WorkspaceElegivel[]; bloqueios?: number; suspenso?: boolean } = {}) {
  const adaptador = createCanalSimulado()
  const eventosReservados = new Set<string>()
  const recusasDesconhecidos = new Set<string>()
  const chamadas: Record<string, unknown>[] = []
  const auditoria: Record<string, unknown>[] = []
  const pendentes: Promise<unknown>[] = []
  const sessoes = new Map<string, SessaoWhatsApp>()
  const db: Db = {
    reservarEvento: async (id) => {
      if (eventosReservados.has(id)) return false
      eventosReservados.add(id)
      return true
    },
    permitirMensagem: async () => (opcoes.bloqueios ?? 0) === 0,
    registrarAuditoria: async (registro) => { auditoria.push(registro) },
    contaPorTelefone: async (telefone) => telefone === TELEFONE && !opcoes.suspenso ? USUARIO : null,
    registrarStatus: async () => {},
    workspacesElegiveis: async () => opcoes.workspaces ?? [{ id: WORKSPACE, nome: 'Norte' }],
    respostaPendente: async () => null,
    sessao: async (userId) => sessoes.get(userId) ?? { workspaceId: null, aguardandoWorkspace: false, novaConversa: false },
    salvarSessao: async (userId, sessao) => { sessoes.set(userId, sessao) },
    alterarPreferenciaDeAvisos: async (_userId, parar) => { chamadas.push({ comando: parar ? 'parar' : 'voltar' }) },
    registrarRecusaDesconhecido: async (telefone) => {
      if (recusasDesconhecidos.has(telefone)) return false
      recusasDesconhecidos.add(telefone)
      return true
    },
    abrirExecucao: async (pedido) => {
      chamadas.push({ ...pedido })
      return { kind: 'aberto', conversationId: 'conversa-1', runId: 'execucao-1' }
    },
  }
  const handler = createHandler({
    db,
    adaptador,
    segredoWebhook: SEGREDO,
    esperarDepois: (promise) => { pendentes.push(promise) },
  })
  const enviar = async (id: string, telefone: string, texto: string) => {
    const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id, from: telefone, timestamp: '1792800000', type: 'text', text: { body: texto } }] } }] }] })
    const resposta = await handler(new Request('https://exemplo.test', {
      method: 'POST', headers: { 'X-Hub-Signature-256': await assinatura(corpo) }, body: corpo,
    }))
    await Promise.all(pendentes.splice(0))
    return resposta
  }
  return { adaptador, chamadas, auditoria, enviar }
}

Deno.test('número desconhecido recebe uma recusa sem iniciar execução, uma vez por dia', async () => {
  const m = montar()
  await m.enviar('wamid-1', '5511888888888', 'oi')
  await m.enviar('wamid-2', '5511888888888', 'oi de novo')
  assertEquals(m.adaptador.envios, [{ tipo: 'texto', para: '5511888888888', texto: 'Não reconheci seu número. Conecte seu telefone em Meu perfil: https://app.althius.com.br/configuracoes/perfil' }])
  assertEquals(m.chamadas, [])
})

Deno.test('limite por número recusa mensagens excedentes sem abrir execução', async () => {
  const m = montar({ bloqueios: 1 })
  await m.enviar('wamid-limitado', TELEFONE, 'oi')
  assertEquals(m.chamadas, [])
  assertEquals(m.adaptador.envios.map((envio) => envio.tipo === 'texto' ? envio.texto : ''), ['Você atingiu o limite de mensagens. Tente novamente mais tarde.'])
})

Deno.test('auditoria registra hash e resultado sem guardar o texto recebido', async () => {
  const m = montar()
  await m.enviar('wamid-auditado', TELEFONE, 'pergunta confidencial')
  assertEquals(m.auditoria.length, 1)
  assertEquals(m.auditoria[0].userId, USUARIO)
  assertEquals(m.auditoria[0].workspaceId, WORKSPACE)
  assertEquals(m.auditoria[0].resultado, 'execucao_aberta')
  assertEquals(typeof m.auditoria[0].hashPayload === 'string' && /^sha256:[0-9a-f]{64}$/.test(m.auditoria[0].hashPayload as string), true)
  assertEquals(JSON.stringify(m.auditoria).includes('pergunta confidencial'), false)
})

Deno.test('telefone sem login recente é tratado como desconhecido pelo handler', async () => {
  const m = montar({ suspenso: true })
  await m.enviar('wamid-suspenso', TELEFONE, 'oi')
  assertEquals(m.chamadas, [])
  assertEquals(m.adaptador.envios[0]?.tipo, 'texto')
  assertEquals(m.adaptador.envios[0]?.tipo === 'texto' ? m.adaptador.envios[0].texto : '', 'Não reconheci seu número. Conecte seu telefone em Meu perfil: https://app.althius.com.br/configuracoes/perfil')
})

Deno.test('PARAR, VOLTAR e AJUDA são respondidos sem abrir execução', async () => {
  const m = montar()
  await m.enviar('wamid-parar', TELEFONE, 'PARAR')
  await m.enviar('wamid-ajuda', TELEFONE, 'AJUDA')
  await m.enviar('wamid-voltar', TELEFONE, 'VOLTAR')
  assertEquals(m.chamadas, [{ comando: 'parar' }, { comando: 'voltar' }])
  assertEquals(m.adaptador.envios.map((envio) => envio.tipo === 'texto' ? envio.texto : ''), [
    'Avisos desligados. Envie VOLTAR para religar.',
    'Acesse a Central de ajuda da Althius: https://app.althius.com.br/configuracoes/ajuda/central',
    'Avisos religados.',
  ])
})

Deno.test('pedido normal reserva o wamid e abre execução no Workspace elegível', async () => {
  const m = montar()
  await m.enviar('wamid-pergunta', TELEFONE, 'Quantos Créditos tenho?')
  await m.enviar('wamid-pergunta', TELEFONE, 'Quantos Créditos tenho?')
  assertEquals(m.chamadas, [{ workspaceId: WORKSPACE, userId: USUARIO, texto: 'Quantos Créditos tenho?', eventId: 'wamid-pergunta', novaConversa: false }])
})

Deno.test('primeiro pedido em mais de um Workspace lista opções e uma escolha numérica fixa o Workspace', async () => {
  const m = montar({ workspaces: [{ id: WORKSPACE, nome: 'Norte' }, { id: 'workspace-sul', nome: 'Sul' }] })
  await m.enviar('wamid-primeiro', TELEFONE, 'oi')
  await m.enviar('wamid-escolha', TELEFONE, '2')
  await m.enviar('wamid-seguinte', TELEFONE, 'Quantos Créditos?')
  assertEquals(m.adaptador.envios[0], { tipo: 'texto', para: TELEFONE, texto: 'Em qual Workspace?\n1. Norte\n2. Sul\nResponda com o número.' })
  assertEquals(m.chamadas[0], { workspaceId: 'workspace-sul', userId: USUARIO, texto: 'Quantos Créditos?', eventId: 'wamid-seguinte', novaConversa: false })
})
