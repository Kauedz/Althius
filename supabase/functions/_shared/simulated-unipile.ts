// Unipile v1 simulada para os testes: registra as chamadas e responde o que cada teste programar.
type Responder = (request: Request) => Response | Promise<Response>

export interface RecordedRequest {
  url: string
  method: string
  headers: Headers
  form: FormData
}

export function simulatedUnipile() {
  let sendResponder: Responder = () => Response.json({ object: 'EmailSent', tracking_id: 'trk-simulado' })
  let searchResponder: Responder = () => Response.json({ object: 'EmailList', items: [] })
  const sends: RecordedRequest[] = []
  const searches: RecordedRequest[] = []

  async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.pathname !== '/api/v1/emails') return new Response('Not found', { status: 404 })
    const signal = init?.signal
    const recorded: RecordedRequest = {
      url: request.url,
      method: request.method,
      headers: request.headers,
      form: request.method === 'POST' ? await request.formData() : new FormData(),
    }
    const respond = request.method === 'POST' ? sendResponder : searchResponder
    ;(request.method === 'POST' ? sends : searches).push(recorded)
    const response = Promise.resolve(respond(request))
    if (!signal) return response
    return await new Promise<Response>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      response.then(resolve, reject)
    })
  }

  return {
    fetch: fakeFetch as typeof fetch,
    sends,
    searches,
    onSend(responder: Responder) { sendResponder = responder },
    onSearch(responder: Responder) { searchResponder = responder },
  }
}
