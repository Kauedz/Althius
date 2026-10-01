// Enviar ao CRM (kanban-de-prospeccao 05, ADR-0020): o Vendedor responsável pede, com o JWT dele,
//   POST { action: 'enviar', workspaceId, targetAccountId, integrationId }
// e a função leva a Conta-alvo, os Contatos ativos e a nota ao CRM em que ELE tem Acesso conectado:
//   1. `begin_crm_handoff` confere Participação, responsabilidade, Integração de CRM habilitada e Acesso conectado, e
//      devolve o que vai e o que uma tentativa anterior já criou;
//   2. o escritor do CRM (`_shared/envio-ao-crm.ts`) cria empresa, Contatos e nota pelo Acesso da própria pessoa
//      (`chamarFerramenta` com `decisaoDaPessoa`: quem clica já é quem decide, então não há Aprovação — ADR-0002), gravando
//      o progresso a cada objeto criado;
//   3. `finish_crm_handoff` grava enviado (e o cartão vai para No CRM) ou falhou (com o que já foi criado).
// As respostas vêm em português e nunca carregam token nem chave.
import { comCors } from '../_shared/cors.ts'
import { escreverNoCrm, nomeDoCrm, type PayloadDoEnvio, type RefsDoCrm } from '../_shared/envio-ao-crm.ts'
import { chamarFerramenta, type DepsDeAcesso, ErroDoBanco } from '../_shared/integration-access.ts'
import type { TipoDeAcesso } from '../_shared/integracoes/tipos.ts'

export interface InicioDoEnvio {
  handoffId: string
  accessKind: TipoDeAcesso
  payload: PayloadDoEnvio
  previousRefs: RefsDoCrm
}

export interface BancoDoEnvio {
  /** RPC `begin_crm_handoff`. Lança ErroDoBanco (42501, P0002, 23505, 55000). */
  iniciar(a: { workspaceId: string; targetAccountId: string; userId: string; integrationId: string }): Promise<InicioDoEnvio>
  /** RPC `save_crm_handoff_progress`. */
  progresso(handoffId: string, refs: RefsDoCrm): Promise<void>
  /** RPC `finish_crm_handoff`; devolve o status gravado. */
  concluir(a: { handoffId: string; ok: boolean; refs: RefsDoCrm; erro: string | null }): Promise<string>
}

export interface Deps {
  banco: BancoDoEnvio
  acesso: DepsDeAcesso
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  appOrigin: string
  log?: (campos: Record<string, unknown>) => void
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const ID_DA_INTEGRACAO = /^[a-z][a-z0-9-]{0,39}$/

function recusaDoBanco(erro: unknown, crm: string): { status: number; mensagem: string; code: string } {
  if (erro instanceof ErroDoBanco) {
    const m = erro.message
    if (erro.codigo === '42501') {
      return m.includes('responsible')
        ? { status: 403, code: 'nao_responsavel', mensagem: 'Só o Vendedor responsável pela Conta-alvo a envia ao CRM.' }
        : { status: 403, code: 'participacao', mensagem: 'A sua Participação neste Workspace não está ativa.' }
    }
    if (erro.codigo === 'P0002') return { status: 404, code: 'conta', mensagem: 'Conta-alvo não encontrada.' }
    if (erro.codigo === '23505') {
      return {
        status: 409,
        code: 'ja_enviada',
        mensagem: 'Esta Conta-alvo já foi enviada ao CRM (ou está sendo enviada agora). Depois do envio, o CRM é a fonte da verdade.',
      }
    }
    if (erro.codigo === '55000') {
      if (m.includes('not a CRM')) return { status: 400, code: 'nao_crm', mensagem: 'Esta Integração não é um CRM.' }
      if (m.includes('not enabled')) {
        return { status: 409, code: 'nao_habilitada', mensagem: `O ${crm} não está habilitado neste Workspace.` }
      }
      return { status: 409, code: 'sem_acesso', mensagem: `Conecte a sua conta do ${crm} em Conexões para enviar.` }
    }
  }
  return { status: 502, code: 'indisponivel', mensagem: 'Não foi possível começar o envio agora. Tente de novo em instantes.' }
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

  return comCors(deps.appOrigin, async (req) => {
    if (req.method !== 'POST') return responder({ error: 'Método não permitido.', code: 'metodo' }, 405)
    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''
    const user = authorization.startsWith('Bearer ') && apikey ? await deps.userFromJwt(authorization, apikey) : null
    if (!user) return responder({ error: 'Entre na sua Conta de usuário para continuar.', code: 'sem_sessao' }, 401)

    let corpo: Record<string, unknown>
    try {
      corpo = await req.json()
    } catch {
      return responder({ error: 'Corpo inválido.', code: 'corpo' }, 400)
    }
    if (corpo?.action !== 'enviar') return responder({ error: 'Ação desconhecida.', code: 'acao' }, 400)
    const workspaceId = typeof corpo.workspaceId === 'string' ? corpo.workspaceId : ''
    const targetAccountId = typeof corpo.targetAccountId === 'string' ? corpo.targetAccountId : ''
    const integrationId = typeof corpo.integrationId === 'string' ? corpo.integrationId : ''
    if (!UUID.test(workspaceId)) return responder({ error: 'Workspace obrigatório.', code: 'workspace' }, 400)
    if (!UUID.test(targetAccountId)) return responder({ error: 'Conta-alvo obrigatória.', code: 'conta' }, 400)
    if (!ID_DA_INTEGRACAO.test(integrationId)) return responder({ error: 'Integração obrigatória.', code: 'integracao' }, 400)
    const crm = nomeDoCrm(integrationId)

    let inicio: InicioDoEnvio
    try {
      inicio = await deps.banco.iniciar({ workspaceId, targetAccountId, userId: user.userId, integrationId })
    } catch (erro) {
      const recusa = recusaDoBanco(erro, crm)
      log({ type: 'crm_handoff', etapa: 'iniciar', integrationId, code: recusa.code })
      return responder({ error: recusa.mensagem, code: recusa.code }, recusa.status)
    }

    const concluir = async (ok: boolean, refs: RefsDoCrm, erro: string | null) => {
      try {
        await deps.banco.concluir({ handoffId: inicio.handoffId, ok, refs, erro })
        return true
      } catch (falha) {
        log({ type: 'crm_handoff', etapa: 'concluir', integrationId, erro: falha instanceof Error ? falha.message : 'desconhecido' })
        return false
      }
    }

    // Pela autorização (OAuth no servidor MCP), as ferramentas de escrita do app não estão confirmadas: nada é inventado.
    if (inicio.accessKind !== 'api_key') {
      const mensagem =
        `Para enviar ao ${crm}, conecte com a chave de API (Private App) em Conexões. Pela autorização no app, a Althius ainda não tem as ferramentas de escrita confirmadas.`
      await concluir(false, inicio.previousRefs, mensagem)
      log({ type: 'crm_handoff', etapa: 'caminho', integrationId, code: 'caminho_sem_escrita' })
      return responder({ error: mensagem, code: 'caminho_sem_escrita', status: 'falhou' }, 409)
    }

    let resultado
    try {
      resultado = await escreverNoCrm({
        integrationId,
        payload: inicio.payload,
        jaCriado: inicio.previousRefs,
        agora: deps.acesso.agora,
        chamar: (ferramenta, argumentos) =>
          chamarFerramenta(deps.acesso, { workspaceId, userId: user.userId, integrationId, ferramenta, argumentos, decisaoDaPessoa: true }),
        progresso: (refs) => deps.banco.progresso(inicio.handoffId, refs),
      })
    } catch (erro) {
      const mensagem = `O envio ao ${crm} falhou. Confira no ${crm} o que já foi criado antes de tentar de novo.`
      await concluir(false, inicio.previousRefs, mensagem)
      log({ type: 'crm_handoff', etapa: 'escrever', integrationId, erro: erro instanceof Error ? erro.name : 'desconhecido' })
      return responder({ error: mensagem, code: 'falhou', status: 'falhou' }, 502)
    }

    const gravou = await concluir(resultado.ok, resultado.refs, resultado.ok ? null : resultado.mensagem)
    log({ type: 'crm_handoff', etapa: 'fim', integrationId, ok: resultado.ok, erro: resultado.erro?.tipo ?? null })
    if (!resultado.ok) {
      const code = resultado.erro?.tipo ?? 'falhou'
      const status = code === 'precisa_reconectar' || code === 'nao_habilitada' ? 409 : 502
      return responder({ error: resultado.mensagem, code, status: 'falhou' }, status)
    }
    if (!gravou) {
      return responder({
        error: `A Conta foi enviada ao ${crm}, mas a Althius não conseguiu registrar o envio. Tente de novo daqui a 10 minutos: o que já foi criado não é criado outra vez.`,
        code: 'registro',
      }, 502)
    }
    return responder({ status: 'enviado', mensagem: resultado.mensagem, pendencias: resultado.pendencias })
  })
}
