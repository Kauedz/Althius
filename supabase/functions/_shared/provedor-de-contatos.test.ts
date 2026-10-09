import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { ApifyProvedorDeContatos } from './provedor-de-contatos.ts'
import type { Apify } from '../signal-scan/handler.ts'

// B3: formato real da saída do harvestapi~linkedin-profile-scraper (build 0.0.135, modo
// 'Profile details + email search ($10 per 1k)'), confirmado nos runs 4uNBrExLfebRmntCf (com e-mail)
// e JINU8l6sWgWksEUIH (`emails: null`).
function perfilReal(emails: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    firstName: 'Mariana',
    lastName: 'Souza',
    linkedinUrl: 'https://www.linkedin.com/in/marianasouza',
    // validEmailServer da empresa não é e-mail.
    companyWebsites: [{ url: 'https://techcorp.com.br', validEmailServer: true }],
    emails,
    ...extra,
  }
}

function itemDeEmail(email: unknown, status = 'risky'): Record<string, unknown> {
  return { email, status, qualityScore: 60, validEmailServer: true, catchAllDomain: false, free: false }
}

async function revelar(items: unknown[]) {
  const apify: Apify = {
    async run() {
      return { runId: 'apify-run-perfil', items }
    },
  }
  const provedor = new ApifyProvedorDeContatos({ apify })
  return await provedor.revelarContato(
    { nome: 'Mariana Souza', linkedinUrl: 'https://www.linkedin.com/in/marianasouza' },
    'email',
  )
}

Deno.test('revelarContato: `emails` null é "não encontrado" (run JINU8l6sWgWksEUIH)', async () => {
  assertEquals(await revelar([perfilReal(null)]), null)
})

Deno.test('revelarContato: perfil sem o campo `emails` é "não encontrado"', async () => {
  const perfil = perfilReal(undefined)
  delete perfil.emails
  assertEquals(await revelar([perfil]), null)
})

Deno.test('revelarContato: `emails` vazio é "não encontrado"', async () => {
  assertEquals(await revelar([perfilReal([])]), null)
})

Deno.test('revelarContato: um item devolve emails[0].email (run 4uNBrExLfebRmntCf)', async () => {
  assertEquals(await revelar([perfilReal([itemDeEmail('mariana@techcorp.com.br')])]), {
    canal: 'email',
    valor: 'mariana@techcorp.com.br',
    fonte: 'apify:harvestapi~linkedin-profile-scraper',
  })
})

Deno.test('revelarContato: o e-mail volta sem espaços nas pontas', async () => {
  const revelado = await revelar([perfilReal([itemDeEmail('  mariana@techcorp.com.br ')])])
  assertEquals(revelado?.valor, 'mariana@techcorp.com.br')
})

Deno.test('revelarContato: item sem e-mail válido é ignorado', async () => {
  const revelado = await revelar([perfilReal([
    itemDeEmail(null),
    itemDeEmail(''),
    itemDeEmail('   '),
    itemDeEmail(42),
    itemDeEmail('nao-e-email'),
    { status: 'valid', qualityScore: 90 },
    null,
    'mariana@techcorp.com.br',
  ])])
  assertEquals(revelado, null)
})

Deno.test('revelarContato: vários itens devolvem o primeiro e-mail válido com status diferente de "invalid"', async () => {
  const revelado = await revelar([perfilReal([
    itemDeEmail(''),
    itemDeEmail('velho@techcorp.com.br', 'invalid'),
    itemDeEmail('mariana@techcorp.com.br', 'risky'),
    itemDeEmail('mariana.souza@techcorp.com.br', 'valid'),
  ])])
  assertEquals(revelado?.valor, 'mariana@techcorp.com.br')
})

Deno.test('revelarContato: só e-mails com status "invalid" é "não encontrado"', async () => {
  const revelado = await revelar([perfilReal([itemDeEmail('velho@techcorp.com.br', 'INVALID')])])
  assertEquals(revelado, null)
})

Deno.test('revelarContato: companyWebsites[i].validEmailServer não vira e-mail', async () => {
  assertEquals(await revelar([perfilReal(null, { email: undefined })]), null)
})

Deno.test('revelarContato: `emails` em formato inesperado é falha, não "não encontrado"', async () => {
  await assertRejects(
    () => revelar([perfilReal('mariana@techcorp.com.br')]),
    Error,
    'formato inesperado',
  )
  await assertRejects(() => revelar([perfilReal({ email: 'mariana@techcorp.com.br' })]), Error, 'formato inesperado')
})