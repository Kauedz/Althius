import { assertEquals } from 'jsr:@std/assert@1'
import { adaptadorConfigurado, createHandler } from './handler.ts'

Deno.test('o simulador padrão deixa o Canal disponível para habilitação', () => {
  assertEquals(adaptadorConfigurado(() => undefined), true)
})

Deno.test('o modo Cloud só fica disponível com todas as configurações obrigatórias', () => {
  const ambiente = new Map([
    ['CANAL_WHATSAPP_MODE', 'cloud'],
    ['WHATSAPP_ACCESS_TOKEN', 'token'],
    ['WHATSAPP_PHONE_NUMBER_ID', 'phone'],
    ['WHATSAPP_API_VERSION', 'v1'],
    ['WHATSAPP_APP_SECRET', 'secret'],
  ])
  assertEquals(adaptadorConfigurado((nome) => ambiente.get(nome)), true)
  ambiente.delete('WHATSAPP_APP_SECRET')
  assertEquals(adaptadorConfigurado((nome) => ambiente.get(nome)), false)
})

Deno.test('o status responde com CORS e não expõe nenhuma configuração', async () => {
  const handler = createHandler({ appOrigin: 'https://app.test', ambiente: () => undefined })
  const response = await handler(new Request('https://edge.test/status', {
    method: 'POST',
    headers: { Origin: 'https://app.test' },
  }))
  assertEquals(response.status, 200)
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), 'https://app.test')
  assertEquals(await response.json(), { configurado: true })
})
