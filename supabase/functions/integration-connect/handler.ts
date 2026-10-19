// Conectar o PRÓPRIO Acesso a uma Integração habilitada (conexoes-funcionais 03, 08, 10 a 14 e 17; ADR-0017 e ADR-0021).
// O participante pede, com o JWT dele, `{ action, workspaceId, integrationId }`:
//   iniciar  OAuth no servidor MCP oficial do app: descobre o servidor de autorização, escolhe o cliente (app pré-registrado
//            pelos segredos de ambiente ou registro dinâmico), abre a tentativa no banco (state + PKCE, 10 minutos) e
//            devolve `{ url }`, o endereço de consentimento para onde o navegador vai. O retorno cai em `integration-callback`.
//   chave    caminho da chave de API (`chave`): valida a chave chamando o app e só então a guarda no Vault; devolve a conta
//            e o portal. A chave nunca volta ao navegador.
//   desconectar  desconecta o PRÓPRIO Acesso (conector-clay 02): revoga o token no app quando o servidor de autorização
//            anuncia onde (RFC 7009) e apaga o Acesso mesmo se a revogação falhar; devolve `{ desconectado, revogacao }`.
// O banco confere a Participação ativa e a habilitação (RPCs de serviço com o participante que o JWT identificou). O token
// e a chave nunca aparecem em resposta, em log nem em mensagem de erro. Banco, rede e segredos entram por injeção de
// dependência: o teste vai da requisição à resposta sem rede.
import { comCors, origemDoAppParaLink } from '../_shared/cors.ts'
import type { BancoDaConexao } from '../_shared/integracoes/banco-supabase.ts'
import { clienteDaConexao } from '../_shared/integracoes/cliente-oauth.ts'
import { identificarConta } from '../_shared/integracoes/identificacao.ts'
import { listarFerramentasMcp } from '../_shared/integracoes/mcp-cliente.ts'
import { desafioPkce, descobrirServidorDeAutorizacao, ErroDeOAuth, urlDeConsentimento } from '../_shared/integracoes/oauth.ts'
import { perfilDaIntegracao } from '../_shared/integracoes/perfis.ts'
import { ErroDeProvedor } from '../_shared/integracoes/tipos.ts'
import { type BancoDeDesconexao, desconectarAcesso, ErroDoBanco } from '../_shared/integration-access.ts'

export interface Db extends BancoDaConexao {
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string; email: string | null } | null>
}

export interface Deps {
  db: Db
  /** Os Acessos, para desconectar. Sem eles, `desconectar` responde indisponível. */
  acessos?: BancoDeDesconexao
  /** Os segredos de ambiente (`Deno.env.get`). */
  ambiente: (nome: string) => string | undefined
  appOrigin: string
  /** O endereço público da `integration-callback`, o mesmo cadastrado como URL de retorno no app de autorização. */
  urlDeRetorno: string
  fetch?: typeof fetch
  log?: (campos: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const ID_DA_INTEGRACAO = /^[a-z][a-z0-9-]{0,39}$/

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  const erro = (status: number, code: string, mensagem: string) => responder({ error: mensagem, code }, status)

  /** O que um erro do banco quer dizer para quem conecta. */
  function falhaDoBanco(e: unknown): Response {
    if (e instanceof ErroDoBanco) {
      if (e.codigo === '42501') return erro(403, 'sem_participacao', 'Você precisa participar do Workspace para conectar.')
      if (e.message.includes('integration not enabled')) {
        return erro(409, 'nao_habilitada', 'Um Administrador precisa habilitar esta Integração no Workspace primeiro.')
      }
      if (e.message.includes('integration portal mismatch')) {
        return erro(
          409,
          'portal_diferente',
          'Esta conta é de outro portal que não o do Workspace. Um Administrador pode retirar a Integração e habilitar de novo para trocar o portal.',
        )
      }
      if (e.message.includes('integration portal unknown')) {
        return erro(422, 'portal_nao_identificado', 'Não foi possível identificar o portal desta conta. Tente de novo ou fale com a Althius.')
      }
      if (e.message.includes('integration kind not supported')) {
        return erro(400, 'caminho_indisponivel', 'Esta Integração não conecta por esse caminho.')
      }
    }
    log({ type: 'integration_connect_error', detalhe: e instanceof Error ? e.name : 'desconhecido' })
    return erro(502, 'indisponivel', 'Não foi possível conectar agora. Tente de novo em instantes.')
  }

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return erro(405, 'metodo', 'Método não permitido.')
    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const user = authorization.startsWith('Bearer ') && apikey ? await deps.db.userFromJwt(authorization, apikey) : null
    if (!user) return erro(401, 'sem_sessao', 'Entre na sua Conta de usuário para continuar.')

    let corpo: Record<string, unknown>
    try {
      corpo = await req.json()
    } catch {
      return erro(400, 'corpo', 'Corpo inválido.')
    }
    const workspaceId = typeof corpo?.workspaceId === 'string' ? corpo.workspaceId : ''
    const integrationId = typeof corpo?.integrationId === 'string' ? corpo.integrationId : ''
    if (!UUID.test(workspaceId)) return erro(400, 'workspace', 'Workspace obrigatório.')
    if (!ID_DA_INTEGRACAO.test(integrationId)) return erro(400, 'integracao', 'Integração obrigatória.')
    if (corpo.action === 'desconectar') {
      if (!deps.acessos) return erro(503, 'indisponivel', 'Não foi possível desconectar agora. Tente de novo em instantes.')
      const r = await desconectarAcesso(
        { banco: deps.acessos, ambiente: deps.ambiente, fetch: deps.fetch },
        { workspaceId, userId: user.userId, integrationId },
      )
      if (!r.ok) {
        log({ type: 'integration_disconnect', integrationId, resultado: r.erro.tipo })
        if (r.erro.tipo === 'precisa_reconectar') return erro(403, 'sem_participacao', r.erro.mensagem)
        return erro(502, 'indisponivel', 'Não foi possível desconectar agora. Tente de novo em instantes.')
      }
      log({ type: 'integration_disconnect', integrationId, resultado: r.valor.revogacao, desconectado: r.valor.desconectado })
      return responder(r.valor)
    }

    const perfil = perfilDaIntegracao(integrationId)
    if (!perfil) return erro(404, 'em_breve', 'Esta Integração ainda não conecta.')

    if (corpo.action === 'iniciar') {
      const oauth = perfil.mcp?.oauth
      if (!perfil.mcp || !oauth) return erro(400, 'caminho_indisponivel', `O ${perfil.nome} não conecta por autorização no app.`)
      try {
        const descoberta = await descobrirServidorDeAutorizacao({
          urlMcp: perfil.mcp.url,
          autorizacao: oauth.autorizacao,
          token: oauth.token,
          fetch: deps.fetch,
        })
        const cliente = await clienteDaConexao(
          { banco: deps.db, ambiente: deps.ambiente, fetch: deps.fetch },
          perfil,
          descoberta,
          deps.urlDeRetorno,
        )
        if (!cliente.ok) {
          if (cliente.motivo === 'nao_configurada') {
            log({ type: 'integration_connect', integrationId, resultado: 'nao_configurada' })
            return erro(
              503,
              'nao_configurada',
              `Precisa configurar: o app de autorização do ${perfil.nome} ainda não foi cadastrado na Althius. Fale com quem administra a Althius.`,
            )
          }
          return erro(502, 'indisponivel', `Não foi possível falar com o ${perfil.nome} agora. Tente de novo em instantes.`)
        }
        const recurso = oauth.enviarRecurso ? descoberta.resource : undefined
        const tentativa = await deps.db.iniciarTentativa({
          workspaceId,
          userId: user.userId,
          integrationId,
          issuer: descoberta.issuer,
          redirectUri: deps.urlDeRetorno,
          tokenEndpoint: descoberta.token_endpoint,
          clientId: cliente.cliente.clientId,
          resource: recurso ?? null,
          returnTo: origemDoAppParaLink(req, deps.appOrigin) ?? null,
        })
        const url = urlDeConsentimento({
          endpointDeAutorizacao: descoberta.authorization_endpoint,
          clientId: cliente.cliente.clientId,
          urlDeRetorno: deps.urlDeRetorno,
          state: tentativa.state,
          desafio: await desafioPkce(tentativa.codeVerifier),
          escopo: oauth.escopos?.join(' '),
          recurso,
        })
        log({ type: 'integration_connect', integrationId, resultado: 'iniciada' })
        return responder({ url })
      } catch (e) {
        if (e instanceof ErroDeOAuth) {
          log({ type: 'integration_connect', integrationId, resultado: `oauth_${e.tipo}` })
          return erro(502, 'indisponivel', `Não foi possível falar com o ${perfil.nome} agora. Tente de novo em instantes.`)
        }
        return falhaDoBanco(e)
      }
    }

    if (corpo.action === 'chave') {
      const caminho = perfil.chaveDeApi
      if (!caminho) return erro(400, 'caminho_indisponivel', `O ${perfil.nome} não conecta por chave de API.`)
      const chave = typeof corpo.chave === 'string' ? corpo.chave.trim() : ''
      if (chave.length < 8 || chave.length > 500 || /\s/.test(chave)) {
        return erro(422, 'chave_invalida', 'Informe a chave de API inteira, sem espaços.')
      }

      let conta: string | null = null
      let portal: string | null = null
      if (caminho.via === 'mcp') {
        const mcp = perfil.mcp
        if (!mcp?.chave) return erro(400, 'caminho_indisponivel', `O ${perfil.nome} não conecta por chave de API.`)
        try {
          await listarFerramentasMcp({
            url: mcp.url,
            cabecalhos: { [mcp.chave.cabecalho]: `${mcp.chave.prefixo ?? ''}${chave}` },
            fetch: deps.fetch,
          })
        } catch (e) {
          if (e instanceof ErroDeProvedor && e.tipo === 'nao_autorizado') {
            return erro(422, 'chave_recusada', `O ${perfil.nome} recusou a chave. Confira se copiou a chave inteira e se ela está ativa.`)
          }
          log({ type: 'integration_connect', integrationId, resultado: 'validacao_indisponivel' })
          return erro(502, 'indisponivel', `Não foi possível validar a chave no ${perfil.nome} agora. Tente de novo em instantes.`)
        }
      } else {
        const identificada = await identificarConta(caminho.identificacao, chave, 'chave', { fetch: deps.fetch })
        if (!identificada.ok) {
          log({ type: 'integration_connect', integrationId, resultado: `chave_${identificada.motivo}` })
          if (identificada.motivo === 'recusada') {
            return erro(422, 'chave_recusada', `O ${perfil.nome} recusou a chave. Confira se copiou a chave inteira e se ela está ativa.`)
          }
          if (identificada.motivo === 'indisponivel') {
            return erro(502, 'indisponivel', `Não foi possível validar a chave no ${perfil.nome} agora. Tente de novo em instantes.`)
          }
          return erro(422, 'chave_nao_validada', `Não foi possível validar a chave no ${perfil.nome}. Confira se é a chave certa.`)
        }
        conta = identificada.conta
        portal = identificada.portal
        if (perfil.portalFixo && portal === null) {
          return erro(422, 'portal_nao_identificado', 'Não foi possível identificar o portal desta conta. Tente de novo ou fale com a Althius.')
        }
      }
      try {
        await deps.db.salvarChave({
          workspaceId,
          userId: user.userId,
          integrationId,
          apiKey: chave,
          accountLabel: conta,
          appPortal: portal,
        })
      } catch (e) {
        return falhaDoBanco(e)
      }
      log({ type: 'integration_connect', integrationId, resultado: 'chave_guardada' })
      return responder({ ok: true, conta, portal })
    }

    return erro(400, 'acao', 'Ação desconhecida.')
  })
}
