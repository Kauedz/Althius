// O banco do Envio ao CRM como a Edge Function o usa: as RPCs de serviço da migration 20261001200000 (chamadas com a chave
// de serviço), traduzidas para `BancoDoEnvio`. Recebe só uma função `rpc`, como `_shared/integracoes/banco-supabase.ts`.
import type { PayloadDoEnvio, RefsDoCrm } from '../_shared/envio-ao-crm.ts'
import { ErroDoBanco } from '../_shared/integration-access.ts'
import type { Rpc } from '../_shared/integracoes/banco-supabase.ts'
import type { TipoDeAcesso } from '../_shared/integracoes/tipos.ts'
import type { BancoDoEnvio } from './handler.ts'

export function bancoDoEnvio(rpc: Rpc): BancoDoEnvio {
  async function chamar<T>(nome: string, parametros: Record<string, unknown>): Promise<T> {
    const { data, error } = await rpc(nome, parametros)
    if (error) throw new ErroDoBanco(error.code ?? '', error.message)
    return data as T
  }
  return {
    async iniciar(a) {
      const linhas = await chamar<{ handoff_id: string; access_kind: TipoDeAcesso; payload: PayloadDoEnvio; previous_refs: RefsDoCrm }[]>(
        'begin_crm_handoff',
        { p_workspace_id: a.workspaceId, p_target_account_id: a.targetAccountId, p_user_id: a.userId, p_integration_id: a.integrationId },
      )
      const linha = Array.isArray(linhas) ? linhas[0] : null
      if (!linha) throw new ErroDoBanco('', 'O envio não começou.')
      return { handoffId: linha.handoff_id, accessKind: linha.access_kind, payload: linha.payload, previousRefs: linha.previous_refs ?? {} }
    },
    async progresso(handoffId, refs) {
      await chamar('save_crm_handoff_progress', { p_handoff_id: handoffId, p_crm_refs: refs })
    },
    async concluir(a) {
      return await chamar<string>('finish_crm_handoff', { p_handoff_id: a.handoffId, p_ok: a.ok, p_crm_refs: a.refs, p_error: a.erro })
    },
  }
}
