// O retorno do OAuth (conexoes-funcionais 03, ADR-0017): o app de autorização redireciona o navegador para cá com
// `?code=…&state=…` (ou `?error=…`). Não há JWT (é um redirecionamento do navegador, `verify_jwt = false`): quem vale é o
// `state`, que casa com uma tentativa pendente no banco, dentro do prazo, de um participante ainda ativo, com Integração
// habilitada. A função troca o código pelos tokens com o verificador PKCE, identifica a conta e o portal, grava o Acesso
// no Vault (o banco recusa um retorno forjado, repetido, vencido ou de outro portal) e redireciona o navegador de volta
// ao app, em /conexoes, com o resultado na URL. O token nunca passa pelo navegador nem pelo log.
import type { BancoDaConexao } from '../_shared/integracoes/banco-supabase.ts'
import { clienteDaRenovacao } from '../_shared/integracoes/cliente-oauth.ts'
import { identificarConta } from '../_shared/integracoes/identificacao.ts'
import { ErroDeOAuth, trocarCodigo } from '../_shared/integracoes/oauth.ts'
import { perfilDaIntegracao } from '../_shared/integracoes/perfis.ts'
import { origensPermitidas } from '../_shared/cors.ts'
import { ErroDoBanco } from '../_shared/integration-access.ts'

export type Db = Pick<BancoDaConexao, 'tentativa' | 'concluir' | 'clienteOAuth' | 'salvarClienteOAuth'>

export interface Deps {
  db: Db
  ambiente: (nome: string) => string | undefined
  appOrigin: string
  fetch?: typeof fetch
  log?: (campos: Record<string, unknown>) => void
}

/** Por que a conexão não concluiu, no vocabulário que a tela entende (`?conexao=erro&motivo=…`). */
export type MotivoDoRetorno =
  | 'invalida'
  | 'usada'
  | 'expirada'
  | 'participacao_inativa'
  | 'nao_habilitada'
  | 'recusada'
  | 'falha_na_troca'
  | 'indisponivel'
  | 'portal_diferente'
  | 'portal_nao_identificado'
  | 'erro'

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const origens = origensPermitidas(deps.appOrigin)

  function voltar(origem: string | null, integracao: string | null, resultado: 'ok' | MotivoDoRetorno): Response {
    // Só volta para uma origem do APP_ORIGIN: a `return_to` da tentativa é conferida de novo aqui.
    const destino = new URL('/conexoes', origem && origens.includes(origem) ? origem : origens[0])
    destino.searchParams.set('conexao', resultado === 'ok' ? 'ok' : 'erro')
    if (integracao) destino.searchParams.set('integracao', integracao)
    if (resultado !== 'ok') destino.searchParams.set('motivo', resultado)
    return new Response(null, {
      status: 302,
      headers: { Location: destino.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    })
  }

  return async (req) => {
    if (req.method !== 'GET') return new Response('Método não permitido.', { status: 405 })
    const parametros = new URL(req.url).searchParams
    const state = parametros.get('state') ?? ''
    const codigo = parametros.get('code') ?? ''

    let tentativa
    try {
      tentativa = state ? await deps.db.tentativa(state) : null
    } catch {
      log({ type: 'integration_callback', resultado: 'banco_indisponivel' })
      return voltar(null, null, 'erro')
    }
    // Um state que nenhuma tentativa conhece é um retorno forjado: não associa nada e volta ao app sem dizer mais.
    if (!tentativa) {
      log({ type: 'integration_callback', resultado: 'state_desconhecido' })
      return voltar(null, null, 'invalida')
    }
    const integracao = tentativa.integrationId
    const origem = tentativa.returnTo
    const encerrar = (motivo: MotivoDoRetorno) => {
      log({ type: 'integration_callback', integrationId: integracao, resultado: motivo })
      return voltar(origem, integracao, motivo)
    }

    if (tentativa.status !== 'ok') return encerrar(tentativa.status)
    // O consentimento recusado volta com `error=access_denied`; a tentativa fica até vencer e nada é gravado.
    if (parametros.get('error')) return encerrar('recusada')
    if (!codigo) return encerrar('invalida')

    const perfil = perfilDaIntegracao(integracao)
    const oauth = perfil?.mcp?.oauth
    if (
      !perfil || !perfil.mcp || !oauth || !tentativa.tokenEndpoint || !tentativa.clientId || !tentativa.issuer ||
      !tentativa.codeVerifier || !tentativa.redirectUri
    ) {
      return encerrar('invalida')
    }

    try {
      const cliente = await clienteDaRenovacao(
        { banco: deps.db, ambiente: deps.ambiente, fetch: deps.fetch },
        perfil,
        { clientId: tentativa.clientId, issuer: tentativa.issuer },
      )
      if (!cliente) return encerrar('erro')
      const tokens = await trocarCodigo({
        tokenEndpoint: tentativa.tokenEndpoint,
        cliente,
        codigo,
        urlDeRetorno: tentativa.redirectUri,
        verificador: tentativa.codeVerifier,
        recurso: oauth.enviarRecurso ? tentativa.resource ?? undefined : undefined,
        fetch: deps.fetch,
      })
      const identificada = await identificarConta(oauth.identificacao, tokens.accessToken, 'token', {
        fetch: deps.fetch,
        respostaDoToken: tokens.bruto,
        mcp: { url: perfil.mcp.url, cabecalhos: { Authorization: `Bearer ${tokens.accessToken}` }, fetch: deps.fetch },
      })
      const conta = identificada.ok ? identificada.conta : null
      const portal = identificada.ok ? identificada.portal : null
      // O HubSpot fixa o portal do Workspace: sem identificá-lo, não há como saber se é o portal certo.
      if (perfil.portalFixo && portal === null) return encerrar('portal_nao_identificado')

      await deps.db.concluir({
        state,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiraEm,
        accountLabel: conta,
        appPortal: portal,
        scopes: tokens.escopo,
      })
      log({ type: 'integration_callback', integrationId: integracao, resultado: 'conectada' })
      return voltar(origem, integracao, 'ok')
    } catch (e) {
      if (e instanceof ErroDeOAuth) return encerrar(e.tipo === 'indisponivel' ? 'indisponivel' : 'falha_na_troca')
      if (e instanceof ErroDoBanco) {
        if (e.message.includes('integration portal mismatch')) return encerrar('portal_diferente')
        if (e.message.includes('integration portal unknown')) return encerrar('portal_nao_identificado')
        if (e.message.includes('already used')) return encerrar('usada')
        if (e.message.includes('expired')) return encerrar('expirada')
        if (e.codigo === '42501') return encerrar('participacao_inativa')
        if (e.message.includes('integration not enabled')) return encerrar('nao_habilitada')
      }
      return encerrar('erro')
    }
  }
}
