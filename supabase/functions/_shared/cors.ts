// CORS das Edge Functions chamadas pelo navegador. O APP_ORIGIN pode listar várias origens separadas por vírgula
// (o endereço publicado e o de desenvolvimento); http://localhost e http://127.0.0.1 em qualquer porta também valem,
// porque CORS não é autenticação aqui: toda função exige o JWT do usuário. A resposta devolve a origem de quem
// chamou quando ela é permitida, e libera os cabeçalhos que o supabase-js manda em functions.invoke.

const CABECALHOS_PERMITIDOS = 'authorization, x-client-info, apikey, content-type, x-supabase-api-version'
const ORIGEM_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

/** As origens do APP_ORIGIN, sem barra no fim e sem espaços. */
export function origensPermitidas(appOrigin: string): string[] {
  return appOrigin.split(',').map((origem) => origem.trim().replace(/\/+$/, '')).filter(Boolean)
}

function cabecalhosCors(req: Request, appOrigin: string): Record<string, string> {
  const origem = req.headers.get('Origin') ?? ''
  const permitidas = origensPermitidas(appOrigin)
  const permitida = permitidas.includes(origem) || ORIGEM_LOCAL.test(origem)
  return {
    'Access-Control-Allow-Origin': permitida ? origem : permitidas[0] ?? 'null',
    'Access-Control-Allow-Headers': CABECALHOS_PERMITIDOS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

/** Responde ao preflight e carimba os cabeçalhos de CORS em toda resposta do handler. */
export function comCors(
  appOrigin: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const cors = cabecalhosCors(req, appOrigin)
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    const resposta = await handler(req)
    const headers = new Headers(resposta.headers)
    for (const [nome, valor] of Object.entries(cors)) headers.set(nome, valor)
    return new Response(resposta.body, { status: resposta.status, statusText: resposta.statusText, headers })
  }
}
