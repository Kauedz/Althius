// A API estável do Acesso à Integração para as Edge Functions e, depois, para os Agentes (conexoes-funcionais, ADR-0017 e
// ADR-0021): listar as ferramentas de uma Integração e chamar uma, em nome de quem pediu, com o Acesso dele, sempre sob a
// Permissão do Agente (ADR-0002).
//
//   listarFerramentas(deps, { workspaceId, userId, integrationId })
//   chamarFerramenta(deps, { workspaceId, userId, integrationId, ferramenta, argumentos, agenteId? })
//
// Ambas renovam o token quando ele está vencendo ou o app o recusa (gravando o refresh token novo junto com o access
// token), devolvem erros TIPADOS (`precisa_reconectar`, `nao_habilitada`, `permissao_negada`, `indisponivel`,
// `ferramenta_invalida`) e NUNCA devolvem token, chave nem cabeçalho. O banco, a rede e os segredos de ambiente entram
// por injeção de dependência: os testes vão do pedido ao resultado sem rede.
import { clienteDaRenovacao, type BancoDeClientesOAuth } from './integracoes/cliente-oauth.ts'
import { comSessaoMcp, type FerramentaMcp } from './integracoes/mcp-cliente.ts'
import { ErroDeOAuth, renovarToken } from './integracoes/oauth.ts'
import { type PerfilDeIntegracao, perfilDaIntegracao } from './integracoes/perfis.ts'
import { executarFerramentaRest, ferramentasRest } from './integracoes/rest.ts'
import {
  ErroDeProvedor,
  type ErroDeIntegracao,
  type FerramentaDaIntegracao,
  falha,
  ok,
  type Permissao,
  redigir,
  type Resultado,
  type ResultadoDaFerramenta,
  type TipoDeAcesso,
} from './integracoes/tipos.ts'

export type { ErroDeIntegracao, FerramentaDaIntegracao, Permissao, Resultado, ResultadoDaFerramenta }

/** O Acesso como o banco o entrega ao servidor (`integration_access_for_use`). O segredo é JSON e nunca sai daqui. */
export interface AcessoLido {
  accessId: string
  kind: TipoDeAcesso
  state: 'conectado' | 'precisa_reconectar'
  expiresAt: string | null
  appPortal: string | null
  accountLabel: string | null
  segredo: string | null
}

/** Um erro do banco com o código do Postgres, que a camada do Supabase cria a partir da resposta do PostgREST. */
export class ErroDoBanco extends Error {
  constructor(readonly codigo: string, mensagem: string) {
    super(mensagem)
    this.name = 'ErroDoBanco'
  }
}

export interface BancoDeAcessos extends BancoDeClientesOAuth {
  /** RPC `integration_access_for_use`; nulo quando a pessoa não tem Acesso. Lança ErroDoBanco (42501, 22023). */
  acessoParaUso(a: { workspaceId: string; userId: string; integrationId: string }): Promise<AcessoLido | null>
  /** RPC `rotate_integration_access`: grava o access token novo junto com o refresh token novo. */
  renovar(a: { accessId: string; accessToken: string; refreshToken: string | null; expiresIn: number | null }): Promise<void>
  /** RPC `mark_integration_access_reconnect`. */
  marcarReconexao(accessId: string, motivo: string): Promise<void>
  /** RPC `integration_agent_permission`; nulo quando o Agente não usa a Integração. */
  permissaoDoAgente(a: { workspaceId: string; agenteId: string; integrationId: string }): Promise<Permissao | null>
}

export interface DepsDeAcesso {
  banco: BancoDeAcessos
  /** Os segredos de ambiente (`Deno.env.get`). */
  ambiente: (nome: string) => string | undefined
  fetch?: typeof fetch
  agora?: () => Date
}

export interface PedidoDeAcesso {
  workspaceId: string
  userId: string
  integrationId: string
}

export interface PedidoDeChamada extends PedidoDeAcesso {
  ferramenta: string
  argumentos?: Record<string, unknown>
  /**
   * O Agente que pede. Com ele, a Permissão dele na Integração vale: Ler chama só ferramentas de leitura; Propor devolve
   * `permissao_negada` nas que escrevem (o motor cria a Aprovação); Executar chama tudo. Sem Agente (a própria pessoa),
   * só ferramentas de leitura.
   */
  agenteId?: string
  /** Recusa qualquer ferramenta que não seja de leitura, mesmo com a Permissão Executar (o que o navegador pede). */
  somenteLeitura?: boolean
}

interface SegredoOAuth {
  access_token: string
  refresh_token?: string
  token_endpoint?: string
  client_id?: string
  issuer?: string
  resource?: string
}

interface SegredoDeChave {
  api_key: string
}

const MARGEM_DE_RENOVACAO_MS = 60_000
const RANGO: Record<Permissao, number> = { ler: 1, propor: 2, executar: 3 }

/** Para a operação interromper o fluxo com um erro tipado, de dentro da sessão. */
class Parada extends Error {
  constructor(readonly erro: ErroDeIntegracao) {
    super(erro.mensagem)
  }
}

const MENSAGENS = {
  semAcesso: 'Você ainda não conectou a sua conta desta Integração. Conecte em Conexões.',
  revogado: 'O acesso da sua conta a esta Integração deixou de valer. Reconecte em Conexões.',
  inativa: 'A sua Participação neste Workspace está desativada, então o seu Acesso não é usado.',
  naoHabilitada: 'Esta Integração não está habilitada neste Workspace.',
  indisponivel: 'A Integração não respondeu agora. Tente de novo em instantes.',
}

function erroDoBanco(erro: unknown): ErroDeIntegracao {
  if (erro instanceof ErroDoBanco) {
    if (erro.codigo === '42501') return { tipo: 'precisa_reconectar', motivo: 'participacao_inativa', mensagem: MENSAGENS.inativa }
    if (erro.codigo === '22023') return { tipo: 'nao_habilitada', mensagem: MENSAGENS.naoHabilitada }
  }
  return { tipo: 'indisponivel', mensagem: MENSAGENS.indisponivel }
}

interface Credencial {
  acesso: AcessoLido
  segredo: SegredoOAuth | SegredoDeChave
}

function lerSegredo(acesso: AcessoLido): SegredoOAuth | SegredoDeChave | null {
  try {
    const json = JSON.parse(acesso.segredo ?? '') as Record<string, unknown>
    if (acesso.kind === 'api_key') return typeof json.api_key === 'string' && json.api_key ? { api_key: json.api_key } : null
    return typeof json.access_token === 'string' && json.access_token ? (json as unknown as SegredoOAuth) : null
  } catch {
    return null
  }
}

function segredosDe(segredo: SegredoOAuth | SegredoDeChave): string[] {
  return 'api_key' in segredo
    ? [segredo.api_key]
    : [segredo.access_token, segredo.refresh_token ?? '']
}

async function lerCredencial(deps: DepsDeAcesso, pedido: PedidoDeAcesso): Promise<Resultado<Credencial>> {
  let acesso: AcessoLido | null
  try {
    acesso = await deps.banco.acessoParaUso(pedido)
  } catch (erro) {
    return falha(erroDoBanco(erro))
  }
  if (!acesso) return falha({ tipo: 'precisa_reconectar', motivo: 'sem_acesso', mensagem: MENSAGENS.semAcesso })
  if (acesso.state !== 'conectado') return falha({ tipo: 'precisa_reconectar', motivo: 'revogado', mensagem: MENSAGENS.revogado })
  const segredo = lerSegredo(acesso)
  if (!segredo) {
    await deps.banco.marcarReconexao(acesso.accessId, 'O segredo do Acesso não pôde ser lido.').catch(() => {})
    return falha({ tipo: 'precisa_reconectar', motivo: 'revogado', mensagem: MENSAGENS.revogado })
  }
  return ok({ acesso, segredo })
}

/**
 * Renova o token do Acesso e grava o par novo. Se o app recusar a renovação mas outra chamada já tiver renovado (o refresh
 * token do banco mudou), usa o token dela em vez de marcar o Acesso a reconectar à toa.
 */
async function renovarAcesso(
  deps: DepsDeAcesso,
  pedido: PedidoDeAcesso,
  perfil: PerfilDeIntegracao,
  credencial: Credencial,
): Promise<Resultado<Credencial>> {
  const { acesso } = credencial
  const segredo = credencial.segredo as SegredoOAuth
  const reconectar = async (): Promise<Resultado<Credencial>> => {
    await deps.banco.marcarReconexao(acesso.accessId, 'O app recusou a renovação do Acesso.').catch(() => {})
    return falha({ tipo: 'precisa_reconectar', motivo: 'revogado', mensagem: MENSAGENS.revogado })
  }
  if (!segredo.refresh_token || !segredo.token_endpoint || !segredo.client_id || !segredo.issuer) return await reconectar()
  const cliente = await clienteDaRenovacao(
    { banco: deps.banco, ambiente: deps.ambiente, fetch: deps.fetch },
    perfil,
    { clientId: segredo.client_id, issuer: segredo.issuer },
  )
  if (!cliente) return await reconectar()
  try {
    const tokens = await renovarToken({
      tokenEndpoint: segredo.token_endpoint,
      cliente,
      refreshToken: segredo.refresh_token,
      recurso: perfil.mcp?.oauth?.enviarRecurso ? segredo.resource : undefined,
      fetch: deps.fetch,
    })
    const novo: SegredoOAuth = {
      ...segredo,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken ?? segredo.refresh_token,
    }
    // O HubSpot e o Notion trocam o refresh token a cada renovação: gravar falhando perderia o Acesso, então tenta de novo.
    const gravar = () => deps.banco.renovar({
      accessId: acesso.accessId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiraEm,
    })
    try {
      await gravar()
    } catch {
      await gravar()
    }
    const agora = (deps.agora?.() ?? new Date()).getTime()
    return ok({
      acesso: { ...acesso, expiresAt: tokens.expiraEm ? new Date(agora + tokens.expiraEm * 1000).toISOString() : null },
      segredo: novo,
    })
  } catch (erro) {
    if (erro instanceof ErroDeOAuth && erro.tipo === 'recusado') {
      // Outra chamada pode ter renovado primeiro e invalidado o refresh token que usamos.
      const outra = await lerCredencial(deps, pedido)
      if (outra.ok && 'access_token' in outra.valor.segredo && outra.valor.segredo.refresh_token !== segredo.refresh_token) {
        return outra
      }
      return await reconectar()
    }
    if (erro instanceof ErroDeOAuth) return falha({ tipo: 'indisponivel', mensagem: MENSAGENS.indisponivel })
    return falha({ tipo: 'indisponivel', mensagem: MENSAGENS.indisponivel })
  }
}

function vencendo(acesso: AcessoLido, deps: DepsDeAcesso): boolean {
  if (!acesso.expiresAt) return false
  const fim = Date.parse(acesso.expiresAt)
  return Number.isFinite(fim) && fim - (deps.agora?.() ?? new Date()).getTime() < MARGEM_DE_RENOVACAO_MS
}

/** Uma sessão de ferramentas sobre o servidor MCP ou a API REST, escondendo qual dos dois é. */
interface SessaoDeFerramentas {
  ferramentas(): Promise<FerramentaDaIntegracao[]>
  chamar(nome: string, argumentos: Record<string, unknown>): Promise<ResultadoDaFerramenta>
}

type Transporte = <T>(fn: (sessao: SessaoDeFerramentas) => Promise<T>) => Promise<T>

function ferramentaDoMcp(f: FerramentaMcp): FerramentaDaIntegracao {
  return {
    nome: f.name,
    descricao: f.description ?? '',
    esquema: f.inputSchema ?? { type: 'object' },
    // Só quem declara `readOnlyHint` é leitura; o que não declara é tratado como escrita (padrão seguro).
    escreve: f.annotations?.readOnlyHint !== true,
  }
}

function transporteDe(
  perfil: PerfilDeIntegracao,
  acesso: AcessoLido,
  segredo: SegredoOAuth | SegredoDeChave,
  buscar: typeof fetch | undefined,
): Transporte | null {
  const mcp = perfil.mcp
  if (acesso.kind === 'oauth_mcp' && mcp && 'access_token' in segredo) {
    return (fn) => comSessaoMcp({ url: mcp.url, cabecalhos: { Authorization: `Bearer ${segredo.access_token}` }, fetch: buscar }, (s) =>
      fn({
        ferramentas: async () => (await s.ferramentas()).map(ferramentaDoMcp),
        chamar: async (nome, argumentos) => {
          const r = await s.chamar(nome, argumentos)
          return { conteudo: r.content, estruturado: r.structuredContent, erro: r.isError === true }
        },
      }))
  }
  if (acesso.kind === 'api_key' && 'api_key' in segredo) {
    if (perfil.chaveDeApi?.via === 'mcp' && mcp?.chave) {
      const cabecalho = { [mcp.chave.cabecalho]: `${mcp.chave.prefixo ?? ''}${segredo.api_key}` }
      return (fn) => comSessaoMcp({ url: mcp.url, cabecalhos: cabecalho, fetch: buscar }, (s) =>
        fn({
          ferramentas: async () => (await s.ferramentas()).map(ferramentaDoMcp),
          chamar: async (nome, argumentos) => {
            const r = await s.chamar(nome, argumentos)
            return { conteudo: r.content, estruturado: r.structuredContent, erro: r.isError === true }
          },
        }))
    }
    const rest = perfil.rest
    if (perfil.chaveDeApi?.via === 'rest' && rest) {
      return (fn) => fn({
        ferramentas: () => Promise.resolve(ferramentasRest(rest)),
        chamar: (nome, argumentos) => executarFerramentaRest(rest, nome, argumentos, segredo.api_key, buscar),
      })
    }
  }
  return null
}

/** Roda `operacao` com o Acesso de quem pediu: renova antes se estiver vencendo e uma vez se o app o recusar. */
async function comAcesso<T>(
  deps: DepsDeAcesso,
  pedido: PedidoDeAcesso,
  operacao: (sessao: SessaoDeFerramentas) => Promise<T>,
): Promise<Resultado<T>> {
  const perfil = perfilDaIntegracao(pedido.integrationId)
  if (!perfil) return falha({ tipo: 'nao_habilitada', mensagem: 'Esta Integração ainda não está disponível.' })
  const lida = await lerCredencial(deps, pedido)
  if (!lida.ok) return lida
  let credencial = lida.valor
  let renovou = false
  const podeRenovar = (c: Credencial) => c.acesso.kind === 'oauth_mcp' && 'refresh_token' in c.segredo && !!c.segredo.refresh_token

  if (credencial.acesso.kind === 'oauth_mcp' && vencendo(credencial.acesso, deps) && podeRenovar(credencial)) {
    const renovada = await renovarAcesso(deps, pedido, perfil, credencial)
    if (!renovada.ok) return renovada
    credencial = renovada.valor
    renovou = true
  }

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const transporte = transporteDe(perfil, credencial.acesso, credencial.segredo, deps.fetch)
    if (!transporte) return falha({ tipo: 'nao_habilitada', mensagem: 'Esta Integração não tem como usar este tipo de Acesso.' })
    try {
      return ok(await transporte(operacao))
    } catch (erro) {
      if (erro instanceof Parada) return falha(erro.erro)
      if (!(erro instanceof ErroDeProvedor)) throw erro
      const segredos = segredosDe(credencial.segredo)
      if (erro.tipo === 'nao_autorizado') {
        if (!renovou && podeRenovar(credencial)) {
          const renovada = await renovarAcesso(deps, pedido, perfil, credencial)
          if (!renovada.ok) return renovada
          credencial = renovada.valor
          renovou = true
          continue
        }
        await deps.banco.marcarReconexao(credencial.acesso.accessId, 'O app recusou o acesso.').catch(() => {})
        return falha({ tipo: 'precisa_reconectar', motivo: 'revogado', mensagem: MENSAGENS.revogado })
      }
      if (erro.tipo === 'rpc' && (erro.codigo === -32602 || erro.codigo === -32601)) {
        return falha({ tipo: 'ferramenta_invalida', mensagem: redigir(erro.message, segredos) })
      }
      return falha({ tipo: 'indisponivel', mensagem: MENSAGENS.indisponivel })
    }
  }
  return falha({ tipo: 'indisponivel', mensagem: MENSAGENS.indisponivel })
}

/** As ferramentas que o servidor da Integração oferece, com `escreve` marcando as que escrevem ou gastam. */
export function listarFerramentas(deps: DepsDeAcesso, pedido: PedidoDeAcesso): Promise<Resultado<FerramentaDaIntegracao[]>> {
  return comAcesso(deps, pedido, (sessao) => sessao.ferramentas())
}

/** Chama uma ferramenta em nome de quem pediu, sob a Permissão do Agente (ver `PedidoDeChamada`). */
export async function chamarFerramenta(
  deps: DepsDeAcesso,
  pedido: PedidoDeChamada,
): Promise<Resultado<ResultadoDaFerramenta>> {
  let atual: Permissao | null = null
  if (pedido.agenteId) {
    try {
      atual = await deps.banco.permissaoDoAgente({
        workspaceId: pedido.workspaceId,
        agenteId: pedido.agenteId,
        integrationId: pedido.integrationId,
      })
    } catch {
      return falha({ tipo: 'indisponivel', mensagem: MENSAGENS.indisponivel })
    }
    // Sem linha, o Agente não usa a Integração: nem a rede é tocada.
    if (!atual) {
      return falha({
        tipo: 'permissao_negada',
        exigida: 'ler',
        atual: null,
        mensagem: 'Este Agente não tem Permissão nesta Integração.',
      })
    }
  }
  return comAcesso(deps, pedido, async (sessao) => {
    const ferramentas = await sessao.ferramentas()
    const ferramenta = ferramentas.find((f) => f.nome === pedido.ferramenta)
    if (!ferramenta) {
      throw new Parada({ tipo: 'ferramenta_invalida', mensagem: `A Integração não tem a ferramenta "${pedido.ferramenta}".` })
    }
    const exigida: Permissao = ferramenta.escreve ? 'executar' : 'ler'
    if (ferramenta.escreve && pedido.somenteLeitura) {
      throw new Parada({
        tipo: 'permissao_negada',
        exigida: 'executar',
        atual,
        mensagem: 'Esta ferramenta escreve ou gasta, e só um Agente com a Permissão Executar a chama.',
      })
    }
    if (pedido.agenteId) {
      if (!atual || RANGO[atual] < RANGO[exigida]) {
        throw new Parada({
          tipo: 'permissao_negada',
          exigida,
          atual,
          mensagem: atual === 'propor'
            ? 'A Permissão deste Agente é Propor: esta ação precisa de Aprovação.'
            : 'Este Agente não tem a Permissão necessária para esta ferramenta.',
        })
      }
    } else if (ferramenta.escreve) {
      throw new Parada({
        tipo: 'permissao_negada',
        exigida: 'executar',
        atual: null,
        mensagem: 'Esta ferramenta escreve ou gasta, e só um Agente com a Permissão Executar a chama.',
      })
    }
    return await sessao.chamar(pedido.ferramenta, pedido.argumentos ?? {})
  })
}
