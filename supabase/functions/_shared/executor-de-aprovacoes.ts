// O executor das Aprovações de Enviar ao CRM (Etapa 5b, CRM-15, ADR-0002 e ADR-0020). Uma Aprovação que um Agente propôs
// (`agent_propose_crm_handoff`) e que está liberada (um Administrador aprovou, ou a Permissão Executar a liberou ao nascer)
// é enviada assim, uma vez só:
//
//   1. `crm_handoff_approval`        lê a Aprovação; pela tela, confere que quem pede a execução é Administrador ativo;
//   2. `claim_approved_action`       reserva com o conteúdo guardado: o banco confere de novo estado, prazo, Permissão,
//                                    Integração, quem pediu e quem decidiu, e que o conteúdo é o aprovado;
//   3. `begin_approved_crm_handoff`  abre o envio ligado à Aprovação (`approval_id`), pelo Acesso de quem pediu ao Agente;
//   4. `escreverNoCrm`               com `chamarFerramenta` e o `agenteId` + `aprovacaoId` (nunca `decisaoDaPessoa`): a
//                                    escrita só passa com Executar ou com a Aprovação em execução confirmada pelo banco;
//   5. `finish_crm_handoff`          grava enviado (o cartão vai para No CRM) ou falhou;
//   6. `finish_approved_action`      fecha a Aprovação como executada ou falhou, com o motivo.
//
// Roda no servidor, de dois lugares: no motor dos Agentes, logo depois de uma proposta que nasceu liberada, e na Edge
// Function `crm-handoff` (`executar_aprovacao`), que a tela chama logo depois de o Administrador aprovar. Reservar é o que
// impede o envio duplo: só uma das duas chamadas recebe 'go'. Nenhuma resposta leva token nem chave.
import { escreverNoCrm, nomeDoCrm, type PayloadDoEnvio, type RefsDoCrm } from './envio-ao-crm.ts'
import { chamarFerramenta, type DepsDeAcesso, ErroDoBanco } from './integration-access.ts'
import type { TipoDeAcesso } from './integracoes/tipos.ts'

/** A Aprovação de envio como `crm_handoff_approval` devolve. */
export interface AprovacaoDeEnvio {
  workspaceId: string
  agenteId: string
  integrationId: string
  requestedBy: string | null
  targetAccountId: string | null
  estado: string
  /** `{ tipo: 'envio_ao_crm', integration_id, target_account_id, envio }`, exatamente como foi guardado. */
  payload: { envio?: PayloadDoEnvio } & Record<string, unknown>
}

export interface InicioDoEnvioAprovado {
  handoffId: string
  accessKind: TipoDeAcesso
  /** Quem pediu ao Agente: é o Acesso dele que escreve no CRM. */
  userId: string
  payload: PayloadDoEnvio
  previousRefs: RefsDoCrm
}

export interface BancoDoExecutor {
  /** RPC `crm_handoff_approval`. Lança ErroDoBanco (P0002, 42501). */
  lerAprovacao(approvalId: string, administrador: string | null): Promise<AprovacaoDeEnvio>
  /** RPC `claim_approved_action`: 'go' ou o motivo de não poder. */
  reservar(approvalId: string, payload: unknown): Promise<string>
  /** RPC `begin_approved_crm_handoff`. Lança ErroDoBanco (42501, P0002, 23505, 55000). */
  iniciarEnvio(approvalId: string): Promise<InicioDoEnvioAprovado>
  /** RPC `save_crm_handoff_progress`. */
  progresso(handoffId: string, refs: RefsDoCrm): Promise<void>
  /** RPC `finish_crm_handoff`. */
  concluirEnvio(a: { handoffId: string; ok: boolean; refs: RefsDoCrm; erro: string | null }): Promise<string>
  /** RPC `finish_approved_action`. */
  encerrar(approvalId: string, ok: boolean, falha: string | null): Promise<void>
}

export interface DepsDoExecutor {
  banco: BancoDoExecutor
  acesso: DepsDeAcesso
  log?: (campos: Record<string, unknown>) => void
}

export type DesfechoDoEnvioAprovado =
  | { status: 'enviado'; mensagem: string; pendencias: string[] }
  /** A Aprovação não estava liberada (pendente, recusada, vencida, já executada, conteúdo diferente…). Nada foi enviado. */
  | { status: 'nao_liberada'; motivo: string; mensagem: string }
  /** Quem pediu a execução não pode (não é Administrador) ou a Aprovação não existe. Nada mudou. */
  | { status: 'recusada'; mensagem: string }
  /** O envio começou e não terminou: a Aprovação fica como falhou, com o motivo. */
  | { status: 'falhou'; mensagem: string }

const MOTIVOS_DA_RESERVA: Record<string, string> = {
  not_found: 'Aprovação não encontrada.',
  expired: 'A Aprovação venceu sem decisão. Peça ao Agente de novo.',
  not_approved: 'A Aprovação não está liberada: ainda pendente, recusada, cancelada ou já executada.',
  payload_changed: 'O conteúdo do envio mudou depois da Aprovação. Nada foi enviado.',
  permission_revoked: 'A Permissão do Agente nesta Integração mudou depois da Aprovação. Nada foi enviado.',
  integration_disabled: 'A Integração foi desligada no Workspace. Nada foi enviado.',
  requester_inactive: 'Quem pediu ao Agente não participa mais do Workspace. Nada foi enviado.',
  decider_inactive: 'Quem aprovou não é mais Administrador ativo. Nada foi enviado.',
}

function motivoDoInicio(erro: unknown, crm: string): string {
  if (erro instanceof ErroDoBanco) {
    if (erro.codigo === '42501') {
      return erro.message.includes('responsible')
        ? 'Só o Vendedor responsável pela Conta-alvo a envia ao CRM, e quem pediu ao Agente não é mais o responsável.'
        : 'Quem pediu ao Agente não participa mais do Workspace.'
    }
    if (erro.codigo === 'P0002') return 'A Conta-alvo não está mais no Workspace.'
    if (erro.codigo === '23505') return 'Esta Conta-alvo já foi enviada ao CRM (ou está sendo enviada agora).'
    if (erro.codigo === '55000') {
      return erro.message.includes('not enabled')
        ? `O ${crm} não está habilitado neste Workspace.`
        : `Quem pediu ao Agente precisa conectar a própria conta do ${crm} em Conexões.`
    }
  }
  return 'Não foi possível começar o envio agora.'
}

export async function executarEnvioAprovado(
  deps: DepsDoExecutor,
  { approvalId, administrador = null }: { approvalId: string; administrador?: string | null },
): Promise<DesfechoDoEnvioAprovado> {
  const log = deps.log ?? ((campos) => console.log(JSON.stringify(campos)))
  const { banco } = deps

  let aprovacao: AprovacaoDeEnvio
  try {
    aprovacao = await banco.lerAprovacao(approvalId, administrador)
  } catch (erro) {
    if (erro instanceof ErroDoBanco && erro.codigo === '42501') {
      return { status: 'recusada', mensagem: 'Só Administradores do Workspace executam Aprovações.' }
    }
    if (erro instanceof ErroDoBanco && erro.codigo === 'P0002') {
      return { status: 'recusada', mensagem: 'Aprovação de envio ao CRM não encontrada.' }
    }
    throw erro
  }
  const crm = nomeDoCrm(aprovacao.integrationId)

  const reserva = await banco.reservar(approvalId, aprovacao.payload)
  if (reserva !== 'go') {
    log({ type: 'approval_executor', approvalId, etapa: 'reservar', motivo: reserva })
    return { status: 'nao_liberada', motivo: reserva, mensagem: MOTIVOS_DA_RESERVA[reserva] ?? 'A Aprovação não pôde ser executada.' }
  }

  // Daqui em diante a Aprovação está reservada: todo caminho a fecha, executada ou falhou.
  const encerrar = async (ok: boolean, falha: string | null) => {
    try {
      await banco.encerrar(approvalId, ok, falha)
    } catch (erro) {
      log({ type: 'approval_executor', approvalId, etapa: 'encerrar', erro: erro instanceof Error ? erro.message : 'desconhecido' })
    }
  }

  let inicio: InicioDoEnvioAprovado
  try {
    inicio = await banco.iniciarEnvio(approvalId)
  } catch (erro) {
    const mensagem = motivoDoInicio(erro, crm)
    log({ type: 'approval_executor', approvalId, etapa: 'iniciar', code: erro instanceof ErroDoBanco ? erro.codigo : 'desconhecido' })
    await encerrar(false, mensagem)
    return { status: 'falhou', mensagem }
  }

  const concluir = async (ok: boolean, refs: RefsDoCrm, erro: string | null) => {
    try {
      await banco.concluirEnvio({ handoffId: inicio.handoffId, ok, refs, erro })
    } catch (falha) {
      log({ type: 'approval_executor', approvalId, etapa: 'concluir', erro: falha instanceof Error ? falha.message : 'desconhecido' })
    }
  }

  // Como na Edge Function `crm-handoff`: pela autorização (OAuth no servidor MCP), as ferramentas de escrita do app não
  // estão confirmadas, então nada é inventado.
  if (inicio.accessKind !== 'api_key') {
    const mensagem =
      `Para enviar ao ${crm}, quem pediu ao Agente precisa conectar com a chave de API (Private App) em Conexões. Pela autorização no app, a Althius ainda não tem as ferramentas de escrita confirmadas.`
    await concluir(false, inicio.previousRefs, mensagem)
    await encerrar(false, mensagem)
    return { status: 'falhou', mensagem }
  }

  let resultado
  try {
    resultado = await escreverNoCrm({
      integrationId: aprovacao.integrationId,
      payload: inicio.payload,
      jaCriado: inicio.previousRefs,
      agora: deps.acesso.agora,
      chamar: (ferramenta, argumentos) =>
        chamarFerramenta(deps.acesso, {
          workspaceId: aprovacao.workspaceId,
          userId: inicio.userId,
          integrationId: aprovacao.integrationId,
          ferramenta,
          argumentos,
          agenteId: aprovacao.agenteId,
          aprovacaoId: approvalId,
        }),
      progresso: (refs) => banco.progresso(inicio.handoffId, refs),
    })
  } catch (erro) {
    const mensagem = `O envio ao ${crm} falhou. Confira no ${crm} o que já foi criado antes de tentar de novo.`
    log({ type: 'approval_executor', approvalId, etapa: 'escrever', erro: erro instanceof Error ? erro.name : 'desconhecido' })
    await concluir(false, inicio.previousRefs, mensagem)
    await encerrar(false, mensagem)
    return { status: 'falhou', mensagem }
  }

  await concluir(resultado.ok, resultado.refs, resultado.ok ? null : resultado.mensagem)
  await encerrar(resultado.ok, resultado.ok ? null : resultado.mensagem)
  log({ type: 'approval_executor', approvalId, etapa: 'fim', ok: resultado.ok, erro: resultado.erro?.tipo ?? null })
  return resultado.ok
    ? { status: 'enviado', mensagem: resultado.mensagem, pendencias: resultado.pendencias }
    : { status: 'falhou', mensagem: resultado.mensagem }
}

/** O banco do executor pelas RPCs de serviço (migrations 20261001130000, 20261001200000 e 20261001210000). */
export function bancoDoExecutor(
  rpc: (nome: string, parametros: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>,
): BancoDoExecutor {
  async function chamar<T>(nome: string, parametros: Record<string, unknown>): Promise<T> {
    const { data, error } = await rpc(nome, parametros)
    if (error) throw new ErroDoBanco(error.code ?? '', error.message)
    return data as T
  }
  const primeira = <T>(data: unknown): T | null => ((Array.isArray(data) ? data[0] : data) as T | undefined) ?? null
  return {
    async lerAprovacao(approvalId, administrador) {
      const linha = primeira<{
        workspace_id: string
        agent_id: string
        integration_id: string
        requested_by: string | null
        target_account_id: string | null
        state: string
        payload: AprovacaoDeEnvio['payload']
      }>(await chamar('crm_handoff_approval', { p_approval_id: approvalId, p_admin_user_id: administrador }))
      if (!linha) throw new ErroDoBanco('P0002', 'crm handoff approval not found')
      return {
        workspaceId: linha.workspace_id,
        agenteId: linha.agent_id,
        integrationId: linha.integration_id,
        requestedBy: linha.requested_by,
        targetAccountId: linha.target_account_id,
        estado: linha.state,
        payload: linha.payload,
      }
    },
    reservar: (approvalId, payload) => chamar<string>('claim_approved_action', { p_approval_id: approvalId, p_payload: payload }),
    async iniciarEnvio(approvalId) {
      const linha = primeira<{
        handoff_id: string
        access_kind: TipoDeAcesso
        user_id: string
        payload: PayloadDoEnvio
        previous_refs: RefsDoCrm
      }>(await chamar('begin_approved_crm_handoff', { p_approval_id: approvalId }))
      if (!linha) throw new ErroDoBanco('', 'O envio não começou.')
      return {
        handoffId: linha.handoff_id,
        accessKind: linha.access_kind,
        userId: linha.user_id,
        payload: linha.payload,
        previousRefs: linha.previous_refs ?? {},
      }
    },
    async progresso(handoffId, refs) {
      await chamar('save_crm_handoff_progress', { p_handoff_id: handoffId, p_crm_refs: refs })
    },
    concluirEnvio: (a) =>
      chamar<string>('finish_crm_handoff', { p_handoff_id: a.handoffId, p_ok: a.ok, p_crm_refs: a.refs, p_error: a.erro }),
    async encerrar(approvalId, ok, falha) {
      await chamar('finish_approved_action', { p_approval_id: approvalId, p_ok: ok, p_failure: falha })
    },
  }
}
