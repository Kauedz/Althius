// Ninguém escreve o endereço da Unipile nem lê a chave direto da variável de função (canais-16): a conexão ativa decide.
// O único lugar que conhece o endereço padrão e as variáveis de reserva é connection.ts.
//
// O teste lê os arquivos do repositório, então precisa de --allow-read. O `deno test supabase/functions` do CI roda sem
// permissões e o ignora; o passo próprio do CI (`deno test --allow-read=supabase/functions .../sem-base-fixa.test.ts`)
// o executa de verdade.
import { assertEquals } from 'jsr:@std/assert@1'

const FUNCTIONS = new URL('../../', import.meta.url)
const canRead = (await Deno.permissions.query({ name: 'read', path: FUNCTIONS })).state === 'granted'
const ALLOWED_ENV_READER = 'supabase/functions/_shared/unipile/connection.ts'

/** O código sem as linhas de comentário: o contrato descreve os endereços e as variáveis em comentários, e isso vale. */
const withoutComments = (text: string) => text.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n')

async function* sourceFiles(dir: URL): AsyncGenerator<{ path: string; text: string }> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? '/' : ''), dir)
    if (entry.isDirectory) yield* sourceFiles(url)
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      yield { path: url.pathname.slice(url.pathname.indexOf('supabase/functions/')), text: await Deno.readTextFile(url) }
    }
  }
}

Deno.test({
  name: 'nenhuma função escreve o endereço da Unipile, e só connection.ts lê as variáveis UNIPILE_*',
  ignore: !canRead,
  async fn() {
    const baseOutsideContract: string[] = []
    const envReaders: string[] = []
    for await (const { path, text } of sourceFiles(FUNCTIONS)) {
      const code = withoutComments(text)
      if (!path.startsWith('supabase/functions/_shared/unipile/') && /https:\/\/api\.unipile\.com/.test(code)) {
        baseOutsideContract.push(path)
      }
      if (/UNIPILE_(API_KEY|WEBHOOK_SECRET|API_URL)/.test(code) && path !== ALLOWED_ENV_READER) envReaders.push(path)
    }
    assertEquals(baseOutsideContract, [])
    assertEquals(envReaders, [])
  },
})

Deno.test({
  name: 'o único endereço escrito no contrato é o padrão da v2, em connection.ts',
  ignore: !canRead,
  async fn() {
    const writers: string[] = []
    for await (const { path, text } of sourceFiles(new URL('./', import.meta.url))) {
      // Em comentário vale (documenta); em código só o `DEFAULT_V2_BASE_URL`.
      if (/https:\/\/api\.unipile\.com/.test(withoutComments(text))) writers.push(path)
    }
    assertEquals(writers, ['supabase/functions/_shared/unipile/connection.ts'])
  },
})
