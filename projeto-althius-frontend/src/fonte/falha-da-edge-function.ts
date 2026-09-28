// Como uma chamada a uma Edge Function falhou, para as fontes do Workspace operacional explicarem a falha.

/**
 * Por que a chamada a uma Edge Function falhou, em palavras de quem opera o Workspace: a função não publicada, a
 * função que não subiu (segredo ausente), a origem do app fora do APP_ORIGIN (o navegador bloqueia a resposta) ou o
 * status e o código devolvidos. Usado quando a função não respondeu com a mensagem própria dela.
 */
export async function motivoDaFalhaDaFuncao(
  nome: string,
  error: unknown,
  segredos = 'UNIPILE_API_KEY e APP_ORIGIN',
): Promise<string> {
  const falha = error as { name?: string; context?: unknown }
  if (falha?.name === 'FunctionsFetchError') {
    return `A Edge Function ${nome} não respondeu ao navegador. Confira se ela está publicada e se o segredo APP_ORIGIN é a origem deste app (${window.location.origin}).`
  }
  if (falha?.context instanceof Response) {
    const status = falha.context.status
    const corpo = await corpoDoErroDaFuncao(error)
    const codigo = typeof corpo?.code === 'string' ? corpo.code : ''
    if (status === 404 || codigo === 'NOT_FOUND') return `A Edge Function ${nome} não está publicada neste projeto.`
    if (codigo === 'BOOT_ERROR' || status === 503) {
      return `A Edge Function ${nome} não conseguiu iniciar. Confira os segredos ${segredos}.`
    }
    const detalhe = typeof corpo?.message === 'string' ? `: ${corpo.message}` : ''
    return `A Edge Function ${nome} respondeu HTTP ${status}${codigo ? ` (${codigo})` : ''}${detalhe}.`
  }
  return `Não foi possível falar com a Edge Function ${nome}.`
}

/** O corpo JSON de uma resposta fora de 2xx de uma Edge Function, quando houver. */
export async function corpoDoErroDaFuncao(error: unknown): Promise<Record<string, unknown> | null> {
  const contexto = (error as { context?: unknown })?.context
  if (!(contexto instanceof Response)) return null
  try {
    const corpo = await contexto.clone().json()
    return corpo && typeof corpo === 'object' ? corpo as Record<string, unknown> : null
  } catch {
    return null
  }
}
