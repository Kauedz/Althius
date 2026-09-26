// A fronteira com o banco: as Edge Functions chamam RPCs que devolvem jsonb.
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>

export class RpcError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
  }
}

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown
    error: { message: string; code?: string } | null
  }>
}

export function supabaseRpc(client: RpcClient): Rpc {
  return async (name, args) => {
    const { data, error } = await client.rpc(name, args)
    if (error) throw new RpcError(error.message, error.code)
    return data
  }
}
