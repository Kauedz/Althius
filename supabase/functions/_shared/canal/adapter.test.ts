import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createCanalCloud, createCanalSimulado, criarAdaptadorCanal, assinaturaWhatsAppValida, type EventoWhatsApp } from './index.ts'

const corpoTexto = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: { messaging_product: 'whatsapp', messages: [{ id: 'wamid.1', from: '5511999999999', timestamp: '1761264000', type: 'text', text: { body: 'Olá' } }] } }] }],
})

async function assinar(segredo: string, corpo: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(corpo)))
  return `sha256=${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

Deno.test('valida X-Hub-Signature-256 em tempo constante e normaliza mensagem de texto', async () => {
  const signature = await assinar('segredo', corpoTexto)
  assert(await assinaturaWhatsAppValida({ corpo: corpoTexto, assinatura: signature, segredo: 'segredo' }))
  assert(!(await assinaturaWhatsAppValida({ corpo: `${corpoTexto} `, assinatura: signature, segredo: 'segredo' })))
  assert(!(await assinaturaWhatsAppValida({ corpo: corpoTexto, assinatura: signature, segredo: 'outro' })))
  const adapter = createCanalSimulado({ segredoWebhook: 'segredo' })
  const eventos = await adapter.normalizarWebhook({ corpo: corpoTexto, assinatura: signature })
  assertEquals(eventos[0], { tipo: 'mensagem', id: 'wamid.1', de: '5511999999999', recebidoEm: '1761264000', conteudo: { tipo: 'texto', texto: 'Olá' } })
})

Deno.test('normaliza áudio, clique em botão e status com pricing sem perder os dados de cobrança', async () => {
  const evento = {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: {
      messages: [
        { id: 'a1', from: '1', timestamp: '10', type: 'audio', audio: { id: 'media-a', mime_type: 'audio/ogg' } },
        { id: 'b1', from: '2', timestamp: '11', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'approve:9', title: 'Aprovar' } } },
      ],
      statuses: [{ id: 'wamid.sent', status: 'delivered', timestamp: '12', pricing: { billable: true, pricing_model: 'PMP', category: 'utility', type: 'regular' } }],
    } }] }],
  }
  const adapter = createCanalSimulado()
  const result = await adapter.normalizarWebhook({ corpo: JSON.stringify(evento), assinatura: await assinar('s', JSON.stringify(evento)), segredo: 's' })
  assertEquals(result.map((item) => item.tipo), ['mensagem', 'mensagem', 'status'])
  assertEquals((result[0] as Extract<EventoWhatsApp, { tipo: 'mensagem' }>).conteudo, { tipo: 'audio', midiaId: 'media-a', mimeType: 'audio/ogg' })
  assertEquals((result[1] as Extract<EventoWhatsApp, { tipo: 'mensagem' }>).conteudo, { tipo: 'botao', id: 'approve:9', titulo: 'Aprovar' })
  assertEquals((result[2] as Extract<EventoWhatsApp, { tipo: 'status' }>).pricing, {
    billable: true,
    pricingModel: 'PMP',
    category: 'utility',
    type: 'regular',
  })
})

Deno.test('o simulador guarda envios de texto, botões e template e baixa mídia fixture', async () => {
  const adapter = createCanalSimulado({ segredoWebhook: 'segredo', midias: { media1: { bytes: new Uint8Array([1, 2]), mimeType: 'audio/ogg' } } })
  await adapter.enviarTexto({ para: '5511', texto: 'Olá' })
  await adapter.enviarBotoes({ para: '5511', texto: 'Confirmar?', botoes: [{ id: 'sim', titulo: 'Aprovar' }, { id: 'nao', titulo: 'Recusar' }] })
  await adapter.enviarTemplate({ para: '5511', nome: 'codigo_login', idioma: 'pt_BR', parametros: ['123456'], categoria: 'autenticacao' })
  assertEquals(adapter.envios.map((envio) => envio.tipo), ['texto', 'botoes', 'template'])
  const midia = await adapter.baixarMidia('media1')
  assertEquals([...midia.bytes], [1, 2])
  assertEquals(midia.mimeType, 'audio/ogg')
})

Deno.test('um único seletor escolhe simulador no desenvolvimento e adaptador real quando explicitamente configurado', () => {
  assertEquals(criarAdaptadorCanal({ modo: 'desenvolvimento' }).modo, 'simulado')
  assertEquals(criarAdaptadorCanal({ modo: 'cloud', token: 'token', phoneNumberId: '123', apiVersion: 'vXX.0', segredoWebhook: 's' }).modo, 'cloud')
})

Deno.test('o adaptador real traduz texto, botões e template e baixa a mídia identificada sem expor erro externo', async () => {
  const pedidos: Request[] = []
  const fetchFalso = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    pedidos.push(request.clone())
    if (request.url === 'https://graph.facebook.com/vXX.0/media-1') return Response.json({ url: 'https://lookaside.fbsbx.com/media-1', mime_type: 'audio/ogg' })
    if (request.url === 'https://lookaside.fbsbx.com/media-1') return new Response(new Uint8Array([7, 8]), { headers: { 'Content-Type': 'audio/ogg' } })
    return Response.json({ messages: [{ id: 'wamid.out' }] })
  }) as typeof fetch
  const adapter = createCanalCloud({ token: 'token-secreto', phoneNumberId: 'phone-1', apiVersion: 'vXX.0', segredoWebhook: 'app-secret', fetch: fetchFalso })
  await adapter.enviarTexto({ para: '5511', texto: 'Olá' })
  await adapter.enviarBotoes({ para: '5511', texto: 'Confirmar?', botoes: [{ id: 'ok', titulo: 'Aprovar' }] })
  await adapter.enviarTemplate({ para: '5511', nome: 'codigo_login', idioma: 'pt_BR', parametros: ['123456'], categoria: 'autenticacao' })
  const media = await adapter.baixarMidia('media-1')
  assertEquals(pedidos.slice(0, 3).map((request) => request.url), Array(3).fill('https://graph.facebook.com/vXX.0/phone-1/messages'))
  assertEquals(pedidos.slice(0, 3).map((request) => request.headers.get('Authorization')), Array(3).fill('Bearer token-secreto'))
  assertEquals(await pedidos[0].json(), { messaging_product: 'whatsapp', to: '5511', type: 'text', text: { body: 'Olá' } })
  assertEquals(await pedidos[1].json(), { messaging_product: 'whatsapp', to: '5511', type: 'interactive', interactive: { type: 'button', body: { text: 'Confirmar?' }, action: { buttons: [{ type: 'reply', reply: { id: 'ok', title: 'Aprovar' } }] } } })
  assertEquals(await pedidos[2].json(), { messaging_product: 'whatsapp', to: '5511', type: 'template', template: { name: 'codigo_login', language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: '123456' }] }] } })
  assertEquals([...media.bytes], [7, 8])
  assertEquals(pedidos[3].url, 'https://graph.facebook.com/vXX.0/media-1')

  const recusado = createCanalCloud({ token: 'nao-vazar', phoneNumberId: 'p', apiVersion: 'vXX.0', segredoWebhook: 's', fetch: async () => new Response('fornecedor detalhou erro com segredo', { status: 403 }) })
  try {
    await recusado.enviarTexto({ para: '5511', texto: 'oi' })
    assert(false, 'esperava erro genérico')
  } catch (error) {
    assertEquals((error as Error).message, 'Não foi possível concluir a operação do Canal.')
    assert(!(error as Error).message.includes('fornecedor'))
    assert(!(error as Error).message.includes('nao-vazar'))
  }
})
