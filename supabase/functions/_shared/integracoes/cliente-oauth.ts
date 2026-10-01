// De onde vem o cliente OAuth de uma Integração: dos segredos de ambiente nomeados no perfil (o app de autorização criado
// à mão no provedor, como o MCP Auth App do HubSpot), do registro dinâmico já guardado no banco ou de um registro novo
// (RFC 7591), que o primeiro uso grava para ser reaproveitado (registrar de novo deixa órfãs as autorizações anteriores).
import {
  autenticacaoDoCliente,
  type ClienteOAuth,
  type DescobertaDoServidor,
  ErroDeOAuth,
  registrarClienteDinamico,
} from './oauth.ts'
import type { PerfilDeIntegracao } from './perfis.ts'

export interface ClienteGuardado {
  clientId: string
  clientSecret: string | null
}

/** O que a Edge Function precisa do banco sobre clientes OAuth (RPCs de serviço `integration_oauth_client` e `save_…`). */
export interface BancoDeClientesOAuth {
  clienteOAuth(a: { integrationId: string; issuer: string; redirectUri?: string; clientId?: string }): Promise<ClienteGuardado | null>
  salvarClienteOAuth(a: {
    integrationId: string
    issuer: string
    redirectUri: string
    clientId: string
    clientSecret: string | null
  }): Promise<ClienteGuardado>
}

export interface DepsDeCliente {
  banco: BancoDeClientesOAuth
  ambiente: (nome: string) => string | undefined
  fetch?: typeof fetch
}

export type ClienteResolvido =
  | { ok: true; cliente: ClienteOAuth }
  | { ok: false; motivo: 'nao_configurada' | 'indisponivel' | 'recusado' }

function doAmbiente(deps: DepsDeCliente, perfil: PerfilDeIntegracao): ClienteOAuth | null {
  const oauth = perfil.mcp?.oauth
  if (!oauth) return null
  const clientId = deps.ambiente(oauth.segredos.clientId)?.trim()
  if (!clientId) return null
  const segredo = deps.ambiente(oauth.segredos.clientSecret)?.trim() || null
  return { clientId, clientSecret: segredo, autenticacao: autenticacaoDoCliente(segredo, oauth.autenticacaoDoToken) }
}

/** O cliente para uma conexão nova (e para o retorno dela, com a mesma `urlDeRetorno`). */
export async function clienteDaConexao(
  deps: DepsDeCliente,
  perfil: PerfilDeIntegracao,
  descoberta: DescobertaDoServidor,
  urlDeRetorno: string,
): Promise<ClienteResolvido> {
  const oauth = perfil.mcp?.oauth
  if (!oauth) return { ok: false, motivo: 'nao_configurada' }
  const doApp = doAmbiente(deps, perfil)
  // O app pré-registrado do HubSpot é confidencial: sem o secret, não há como trocar o código.
  if (doApp && (doApp.clientSecret || oauth.registro === 'dinamico')) return { ok: true, cliente: doApp }
  if (oauth.registro === 'preregistrado') return { ok: false, motivo: 'nao_configurada' }

  const guardado = await deps.banco.clienteOAuth({ integrationId: perfil.id, issuer: descoberta.issuer, redirectUri: urlDeRetorno })
  if (guardado) {
    return {
      ok: true,
      cliente: {
        clientId: guardado.clientId,
        clientSecret: guardado.clientSecret,
        autenticacao: autenticacaoDoCliente(guardado.clientSecret, oauth.autenticacaoDoToken),
      },
    }
  }
  if (!descoberta.registration_endpoint) return { ok: false, motivo: 'nao_configurada' }
  try {
    const novo = await registrarClienteDinamico({
      endpointDeRegistro: descoberta.registration_endpoint,
      urlDeRetorno,
      nomeDoCliente: 'Althius',
      metodosDeAutenticacao: descoberta.token_endpoint_auth_methods_supported,
      escopo: oauth.escopos?.join(' '),
      fetch: deps.fetch,
    })
    // Se outro registro chegou primeiro, o dele vale: o banco devolve o que ficou guardado.
    const ficou = await deps.banco.salvarClienteOAuth({
      integrationId: perfil.id,
      issuer: descoberta.issuer,
      redirectUri: urlDeRetorno,
      clientId: novo.clientId,
      clientSecret: novo.clientSecret,
    })
    return {
      ok: true,
      cliente: {
        clientId: ficou.clientId,
        clientSecret: ficou.clientSecret,
        autenticacao: autenticacaoDoCliente(ficou.clientSecret, oauth.autenticacaoDoToken),
      },
    }
  } catch (erro) {
    if (erro instanceof ErroDeOAuth) return { ok: false, motivo: erro.tipo === 'indisponivel' ? 'indisponivel' : 'recusado' }
    throw erro
  }
}

/** O cliente que emitiu os tokens de um Acesso, para renová-los: o do ambiente, se for o mesmo, senão o guardado no banco. */
export async function clienteDaRenovacao(
  deps: DepsDeCliente,
  perfil: PerfilDeIntegracao,
  emitidoPor: { clientId: string; issuer: string },
): Promise<ClienteOAuth | null> {
  const oauth = perfil.mcp?.oauth
  if (!oauth) return null
  const doApp = doAmbiente(deps, perfil)
  if (doApp && doApp.clientId === emitidoPor.clientId) return doApp
  const guardado = await deps.banco.clienteOAuth({
    integrationId: perfil.id,
    issuer: emitidoPor.issuer,
    clientId: emitidoPor.clientId,
  })
  if (!guardado) return null
  return {
    clientId: guardado.clientId,
    clientSecret: guardado.clientSecret,
    autenticacao: autenticacaoDoCliente(guardado.clientSecret, oauth.autenticacaoDoToken),
  }
}
