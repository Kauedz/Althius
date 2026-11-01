import { assertEquals } from 'jsr:@std/assert@1'
import { createCanalSimulado } from '../_shared/canal/index.ts'
import { createHandler, montarEmailAlertaUsoWhatsApp, type AberturaDeExecucao, type Db, type SessaoWhatsApp, type WorkspaceElegivel } from './handler.ts'

const SEGREDO = 'segredo-de-teste'
const USUARIO = '5d000000-0000-0000-0000-000000000001'
const WORKSPACE = '6f1c2d3e-4a5b-4c6d-8e7f-000000000001'
const TELEFONE = '5511999999999'

async function assinatura(corpo: string) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(SEGREDO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo)))
  return `sha256=${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function montar(opcoes: { workspaces?: WorkspaceElegivel[]; aberturas?: AberturaDeExecucao[]; bloqueios?: number; suspenso?: boolean; respostasPendentes?: string[]; alertasStatus?: (800 | 1000)[] } = {}) {
  const adaptador = createCanalSimulado()
  const eventosReservados = new Set<string>()
  const recusasDesconhecidos = new Set<string>()
  const chamadas: Record<string, unknown>[] = []
  const auditoria: Record<string, unknown>[] = []
  const statusRegistrados: unknown[] = []
  const alertasEquipe: number[] = []
  const logs: Record<string, unknown>[] = []
  const pendentes: Promise<unknown>[] = []
  const sessoes = new Map<string, SessaoWhatsApp>()
  let indiceAbertura = 0
  const db: Db = {
    reservarEvento: async (id) => {
      if (eventosReservados.has(id)) return false
      eventosReservados.add(id)
      return true
    },
    permitirMensagem: async () => (opcoes.bloqueios ?? 0) === 0,
    registrarAuditoria: async (registro) => { auditoria.push(registro) },
    contaPorTelefone: async (telefone) => telefone === TELEFONE && !opcoes.suspenso ? USUARIO : null,
    registrarStatus: async (evento) => {
      statusRegistrados.push(evento)
      return opcoes.alertasStatus?.shift() ?? null
    },
    workspacesElegiveis: async () => opcoes.workspaces ?? [{ id: WORKSPACE, nome: 'Norte' }],
    respostaPendente: async () => opcoes.respostasPendentes?.shift() ?? null,
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
      const abertura = opcoes.aberturas?.[indiceAbertura++]
      if (abertura) return abertura
      return { kind: 'aberto', conversationId: 'conversa-1', runId: 'execucao-1' }
    },
  }
  const handler = createHandler({
    db,
    adaptador,
    segredoWebhook: SEGREDO,
    esperarDepois: (promise) => { pendentes.push(promise) },
    alertarEquipe: async (limite) => { alertasEquipe.push(limite) },
    log: (campos) => { logs.push(campos) },
  })
  const enviar = async (id: string, telefone: string, texto: string) => {
    const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id, from: telefone, timestamp: '1792800000', type: 'text', text: { body: texto } }] } }] }] })
    const resposta = await handler(new Request('https://exemplo.test', {
      method: 'POST', headers: { 'X-Hub-Signature-256': await assinatura(corpo) }, body: corpo,
    }))
    await Promise.all(pendentes.splice(0))
    return resposta
  }
  const enviarStatus = async (id: string, estado: string, atualizadoEm: string) => {
    const corpo = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id, status: estado, timestamp: atualizadoEm, pricing: { billable: true, category: 'service' } }] } }] }] })
    const resposta = await handler(new Request('https://exemplo.test', {
      method: 'POST', headers: { 'X-Hub-Signature-256': await assinatura(corpo) }, body: corpo,
    }))
    await Promise.all(pendentes.splice(0))
    return resposta
  }
  return { adaptador, chamadas, auditoria, logs, statusRegistrados, alertasEquipe, enviar, enviarStatus }
}

Deno.test('entrega todas as respostas pendentes em ordem antes de tratar a mensagem nova', async () => {
  const m = montar({ respostasPendentes: ['Em *Norte*:\nprimeira resposta', 'Em *Sul*:\nsegunda resposta'] })
  await m.enviar('wamid-depois-das-pendentes', TELEFONE, 'pergunta nova')

  assertEquals(m.adaptador.envios, [
    { tipo: 'texto', para: TELEFONE, texto: 'Em *Norte*:\nprimeira resposta' },
    { tipo: 'texto', para: TELEFONE, texto: 'Em *Sul*:\nsegunda resposta' },
  ])
  assertEquals(m.chamadas.length, 1)
})

Deno.test('avisos de 800 e 1.000 respostas chegam à equipe sem interromper o Canal', async () => {
  const agoraOriginal = Date.now
  Date.now = () => new Date('2026-10-26T15:00:00Z').getTime()
  try {
    const m = montar({ alertasStatus: [800, 1000] })
    const atualizadoEm = String(Math.floor(Date.now() / 1000))
    await m.enviarStatus('wamid-alerta-800', 'sent', atualizadoEm)
    await m.enviarStatus('wamid-alerta-1000', 'sent', atualizadoEm)

    assertEquals(m.alertasEquipe, [800, 1000])
    assertEquals(m.statusRegistrados.map((evento) => (evento as { atualizadoEm: string }).atualizadoEm), [atualizadoEm, atualizadoEm])
    assertEquals(m.adaptador.envios, [])
    assertEquals(montarEmailAlertaUsoWhatsApp(1000, 'Althius <contato@althius.com.br>').to, 'althius.relacionamento@gmail.com')
    assertEquals(montarEmailAlertaUsoWhatsApp(1000, 'Althius <contato@althius.com.br>').text.includes('continua enviando'), true)
    assertEquals(montarEmailAlertaUsoWhatsApp(800, 'Althius <contato@althius.com.br>').text.includes('respostas de serviço e templates somados'), true)
  } finally {
    Date.now = agoraOriginal
  }
})

Deno.test('número desconhecido recebe uma recusa sem iniciar execução, uma vez por dia', async () => {
  const m = montar()
  await m.enviar('wamid-1', '5511888888888', 'oi')
  await m.enviar('wamid-2', '5511888888888', 'oi de novo')
  assertEquals(m.adaptador.envios, [{ tipo: 'texto', para: '5511888888888', texto: 'Não reconheci seu número. Conecte seu telefone em Meu perfil: https://app.althius.com.br/configuracoes/perfil' }])
  assertEquals(m.chamadas, [])
  assertEquals(m.logs.map((log) => log.resultado), ['numero_desconhecido', 'numero_desconhecido'])
  assertEquals(JSON.stringify(m.logs).includes('5511888888888'), false)
})

Deno.test('limite por número recusa mensagens excedentes sem abrir execução', async () => {
  const m = montar({ bloqueios: 1 })
  await m.enviar('wamid-limitado', TELEFONE, 'oi')
  assertEquals(m.chamadas, [])
  assertEquals(m.adaptador.envios.map((envio) => envio.tipo === 'texto' ? envio.texto : ''), ['Você atingiu o limite de mensagens. Tente novamente mais tarde.'])
  assertEquals(m.logs.map((log) => log.resultado), ['limite_por_numero'])
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
  assertEquals(m.logs.map((log) => log.resultado), ['numero_desconhecido'])
})

Deno.test('sem Workspace registra o resultado sem conteúdo ou telefone', async () => {
  const m = montar({ workspaces: [] })
  await m.enviar('wamid-sem-workspace', TELEFONE, 'texto confidencial')
  assertEquals(m.logs.map((log) => log.resultado), ['sem_workspace'])
  assertEquals(JSON.stringify(m.logs).includes('texto confidencial'), false)
  assertEquals(JSON.stringify(m.logs).includes(TELEFONE), false)
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

Deno.test('trocar de Workspace e escolher outro abre a próxima Conversa como nova sem iniciar execução', async () => {
  const m = montar({ workspaces: [{ id: WORKSPACE, nome: 'Norte' }, { id: 'workspace-sul', nome: 'Sul' }] })
  await m.enviar('wamid-inicial', TELEFONE, 'oi')
  await m.enviar('wamid-trocar', TELEFONE, 'trocar de workspace')
  await m.enviar('wamid-selecionar-sul', TELEFONE, '2')

  assertEquals(m.chamadas, [])
  assertEquals(m.adaptador.envios.slice(1).map((envio) => envio.tipo === 'texto' ? envio.texto : ''), [
    'Em qual Workspace?\n1. Norte\n2. Sul\nResponda com o número.',
    'Workspace *Sul* selecionado. Envie sua pergunta.',
  ])

  await m.enviar('wamid-pergunta-sul', TELEFONE, 'oi no Sul')
  assertEquals(m.chamadas[0], { workspaceId: 'workspace-sul', userId: USUARIO, texto: 'oi no Sul', eventId: 'wamid-pergunta-sul', novaConversa: true })
})

Deno.test('nova conversa é comando sem IA e não abre execução', async () => {
  const m = montar()
  await m.enviar('wamid-nova', TELEFONE, 'nova conversa')
  assertEquals(m.chamadas, [])
  assertEquals(m.adaptador.envios[0], { tipo: 'texto', para: TELEFONE, texto: 'Certo. Sua próxima mensagem começa uma Conversa nova.' })
  await m.enviar('wamid-depois-da-nova', TELEFONE, 'oi')
  assertEquals(m.chamadas[0], { workspaceId: WORKSPACE, userId: USUARIO, texto: 'oi', eventId: 'wamid-depois-da-nova', novaConversa: true })
})

Deno.test('nova conversa continua marcada quando a abertura da Execução é recusada', async () => {
  const m = montar({ aberturas: [{ kind: 'recusado', motivo: 'ocupado' }] })
  await m.enviar('wamid-nova-recusada', TELEFONE, 'nova conversa')
  await m.enviar('wamid-tentativa-recusada', TELEFONE, 'primeira pergunta')
  await m.enviar('wamid-tentativa-seguinte', TELEFONE, 'segunda pergunta')

  assertEquals(m.chamadas.map((chamada) => (chamada as { novaConversa: boolean }).novaConversa), [true, true])
})
