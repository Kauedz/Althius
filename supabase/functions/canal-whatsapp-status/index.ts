import { createHandler } from './handler.ts'

Deno.serve(createHandler({
  appOrigin: Deno.env.get('APP_ORIGIN') ?? '',
  ambiente: (nome) => Deno.env.get(nome),
}))
