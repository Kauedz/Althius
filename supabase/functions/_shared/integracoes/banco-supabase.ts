// O banco das Integrações como as Edge Functions o usam: as RPCs de serviço da migration 20261001160000 (chamadas com a
// chave de serviço), traduzidas para as interfaces tipadas de `integration-access.ts` e da conexão. Recebe só uma função
// `rpc`, para o teste trocar o Supabase por um dublê sem importar o SDK aqui.
import { type AcessoLido, type BancoDeDesconexao, ErroDoBanco } from '../integration-access.ts'
import type { BancoDeClientesOAuth, ClienteGuardado } from './cliente-oauth.ts'
import type { RegraDaFerramenta, RegrasDaIntegracao } from './regras.ts'
import type { Permissao, TipoDeAcesso } from './tipos.ts'

export type Rpc = (
  nome: string,
  parametros: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>

/** O que a tentativa de conexão guardou (`integration_connect_attempt`). Fora do `ok`, só o motivo e o retorno. */
export interface Tentativa {
  status: 'ok' | 'usada' | 'expirada' | 'participacao_inativa' | 'nao_habilitada'
  workspaceId: string
  userId: string | null
  integrationId: string
  issuer: string | null
  codeVerifier: string | null
  redirectUri: string | null
  returnTo: string | null
  tokenEndpoint: string | null
  clientId: string | null
}

export interface BancoDaConexao extends BancoDeClientesOAuth {
  iniciarTentativa(a: {
    workspaceId: string
    userId: string
    integrationId: string
    issuer: string
    redirectUri: string
    tokenEndpoint: string
    clientId: string
    resource: string | null
    returnTo: string | null
  }): Promise<{ state: string; codeVerifier: string }>
  tentativa(state: string): Promise<(Tentativa & { resource: string | null }) | null>
  concluir(a: {
    state: string
    accessToken: string
    refreshToken: string | null
    expiresIn: number | null
    accountLabel: string | null
    appPortal: string | null
    scopes: string | null
  }): Promise<string>
  salvarChave(a: {
    workspaceId: string
    userId: string
    integrationId: string
    apiKey: string
    accountLabel: string | null
    appPortal: string | null
  }): Promise<string>
}

export function bancoDasIntegracoes(rpc: Rpc): BancoDeDesconexao & BancoDaConexao {
  async function chamar<T>(nome: string, parametros: Record<string, unknown>): Promise<T> {
    const { data, error } = await rpc(nome, parametros)
    if (error) throw new ErroDoBanco(error.code ?? '', error.message)
    return data as T
  }
  const primeira = <T>(data: unknown): T | null => {
    const linhas = Array.isArray(data) ? data : data ? [data] : []
    return (linhas[0] as T | undefined) ?? null
  }

  return {
    async acessoParaUso(a) {
      const linha = primeira<{
        access_id: string
        kind: TipoDeAcesso
        state: 'conectado' | 'precisa_reconectar'
        expires_at: string | null
        app_portal: string | null
        account_label: string | null
        secret: string | null
      }>(await chamar('integration_access_for_use', {
        p_workspace_id: a.workspaceId,
        p_user_id: a.userId,
        p_integration_id: a.integrationId,
      }))
      if (!linha) return null
      const acesso: AcessoLido = {
        accessId: linha.access_id,
        kind: linha.kind,
        state: linha.state,
        expiresAt: linha.expires_at,
        appPortal: linha.app_portal,
        accountLabel: linha.account_label,
        segredo: linha.secret,
      }
      return acesso
    },
    async renovar(a) {
      await chamar('rotate_integration_access', {
        p_access_id: a.accessId,
        p_access_token: a.accessToken,
        p_refresh_token: a.refreshToken,
        p_expires_in: a.expiresIn,
      })
    },
    async apagarAcesso(a) {
      return (await chamar<boolean | null>('disconnect_integration_access_for_user', {
        p_workspace_id: a.workspaceId,
        p_user_id: a.userId,
        p_integration_id: a.integrationId,
      })) === true
    },
    async acessosParaRetirada(a) {
      const linhas = await chamar<{ user_id: string; kind: TipoDeAcesso; state: 'conectado' | 'precisa_reconectar'; secret: string | null }[]>(
        'integration_accesses_for_revocation', {
          p_workspace_id: a.workspaceId,
          p_user_id: a.userId,
          p_integration_id: a.integrationId,
        },
      )
      return (linhas ?? []).map((linha) => ({ userId: linha.user_id, kind: linha.kind, state: linha.state, segredo: linha.secret }))
    },
    async marcarReconexao(accessId, motivo) {
      await chamar('mark_integration_access_reconnect', { p_access_id: accessId, p_reason: motivo })
    },
    async permissaoDoAgente(a) {
      const permissao = await chamar<string | null>('integration_agent_permission', {
        p_workspace_id: a.workspaceId,
        p_agent_id: a.agenteId,
        p_integration_id: a.integrationId,
      })
      return permissao === 'ler' || permissao === 'propor' || permissao === 'executar' ? (permissao as Permissao) : null
    },
    async aprovacaoEmExecucao(a) {
      return (await chamar<boolean | null>('approval_in_execution', {
        p_approval_id: a.approvalId,
        p_workspace_id: a.workspaceId,
        p_agent_id: a.agenteId,
        p_integration_id: a.integrationId,
      })) === true
    },
    async regrasDasFerramentas(a): Promise<RegrasDaIntegracao> {
      const linhas = await chamar<{ tool_name: string; rule: RegraDaFerramenta }[] | null>('integration_tool_rules_for_use', {
        p_workspace_id: a.workspaceId,
        p_integration_id: a.integrationId,
      })
      return Object.fromEntries((linhas ?? []).map((l) => [l.tool_name, l.rule]))
    },
    async clienteOAuth(a) {
      const linha = primeira<{ client_id: string; client_secret: string | null }>(await chamar('integration_oauth_client', {
        p_integration_id: a.integrationId,
        p_issuer: a.issuer,
        p_redirect_uri: a.redirectUri ?? null,
        p_client_id: a.clientId ?? null,
      }))
      return linha ? { clientId: linha.client_id, clientSecret: linha.client_secret } : null
    },
    async salvarClienteOAuth(a): Promise<ClienteGuardado> {
      const linha = primeira<{ client_id: string; client_secret: string | null }>(await chamar('save_integration_oauth_client', {
        p_integration_id: a.integrationId,
        p_issuer: a.issuer,
        p_redirect_uri: a.redirectUri,
        p_client_id: a.clientId,
        p_client_secret: a.clientSecret,
      }))
      if (!linha) throw new ErroDoBanco('', 'O cliente OAuth não foi guardado.')
      return { clientId: linha.client_id, clientSecret: linha.client_secret }
    },
    async iniciarTentativa(a) {
      const linha = primeira<{ state: string; code_verifier: string }>(await chamar('start_integration_connect', {
        p_workspace_id: a.workspaceId,
        p_user_id: a.userId,
        p_integration_id: a.integrationId,
        p_issuer: a.issuer,
        p_redirect_uri: a.redirectUri,
        p_token_endpoint: a.tokenEndpoint,
        p_client_id: a.clientId,
        p_resource: a.resource,
        p_return_to: a.returnTo,
      }))
      if (!linha) throw new ErroDoBanco('', 'A tentativa de conexão não foi aberta.')
      return { state: linha.state, codeVerifier: linha.code_verifier }
    },
    async tentativa(state) {
      const linha = primeira<{
        status: Tentativa['status']
        workspace_id: string
        user_id: string | null
        integration_id: string
        issuer: string | null
        code_verifier: string | null
        redirect_uri: string | null
        return_to: string | null
        token_endpoint: string | null
        client_id: string | null
        resource: string | null
      }>(await chamar('integration_connect_attempt', { p_state: state }))
      if (!linha) return null
      return {
        status: linha.status,
        workspaceId: linha.workspace_id,
        userId: linha.user_id,
        integrationId: linha.integration_id,
        issuer: linha.issuer,
        codeVerifier: linha.code_verifier,
        redirectUri: linha.redirect_uri,
        returnTo: linha.return_to,
        tokenEndpoint: linha.token_endpoint,
        clientId: linha.client_id,
        resource: linha.resource,
      }
    },
    async concluir(a) {
      return await chamar<string>('complete_integration_connect', {
        p_state: a.state,
        p_access_token: a.accessToken,
        p_refresh_token: a.refreshToken,
        p_expires_in: a.expiresIn,
        p_account_label: a.accountLabel,
        p_app_portal: a.appPortal,
        p_scopes: a.scopes,
      })
    },
    async salvarChave(a) {
      return await chamar<string>('save_integration_api_key', {
        p_workspace_id: a.workspaceId,
        p_user_id: a.userId,
        p_integration_id: a.integrationId,
        p_api_key: a.apiKey,
        p_account_label: a.accountLabel,
        p_app_portal: a.appPortal,
      })
    },
  }
}
