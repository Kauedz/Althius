import { ErroDoBanco, type RevogacaoNoApp } from '../_shared/integration-access.ts'

type Pedido = {
  workspaceId: string
  userId: string
  integrationId: string
  resultados: { userId: string; resultado: RevogacaoNoApp }[]
}

type RespostaRpc = {
  data: unknown
  error: { code?: string; message: string } | null
}

export function criarRetiradaIntegracao(
  rpc: (nome: string, parametros: Record<string, unknown>) => PromiseLike<RespostaRpc>,
) {
  return async (pedido: Pedido): Promise<number> => {
    const { data, error } = await rpc('disable_workspace_integration_with_revocation_results', {
      p_workspace_id: pedido.workspaceId,
      p_user_id: pedido.userId,
      p_integration_id: pedido.integrationId,
      p_results: pedido.resultados.map((resultado) => ({
        user_id: resultado.userId,
        result: resultado.resultado,
      })),
    })
    if (error) throw new ErroDoBanco(error.code ?? '', error.message)
    return Number(data ?? 0)
  }
}
