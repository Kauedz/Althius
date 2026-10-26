/** Descritores de ferramentas da plataforma disponíveis ao Canal WhatsApp. Risco é política do servidor. */
export type RiscoDaFerramenta = 'leitura' | 'reversivel' | 'irreversivel' | 'oauth'
export type PapelDaFerramenta = 'administrador' | 'membro'
export type AreaDaFerramenta =
  | 'creditos'
  | 'contatos'
  | 'sinais'
  | 'sequencias'
  | 'respostas'
  | 'rotinas'
  | 'playbooks'
  | 'agentes'
  | 'aprovacoes'
  | 'participacoes'
  | 'integracoes'
  | 'contas_remetentes'

export interface DescritorDeFerramentaPlataforma {
  nome: string
  rpc: string
  papeis: readonly PapelDaFerramenta[]
  risco: RiscoDaFerramenta
  area: AreaDaFerramenta
}

const AMBOS_OS_PAPEIS: readonly PapelDaFerramenta[] = ['administrador', 'membro']
const leitura = (nome: string, rpc: string, area: AreaDaFerramenta): DescritorDeFerramentaPlataforma => ({
  nome,
  rpc,
  papeis: AMBOS_OS_PAPEIS,
  risco: 'leitura',
  area,
})

/** Leituras iniciais do mapa de ferramentas em arquitetura-controle-total-sms.md, seção 3. */
export const CATALOGO_FERRAMENTAS_WHATSAPP: readonly DescritorDeFerramentaPlataforma[] = [
  leitura('consultar_saldo_de_creditos', 'get_credit_balance', 'creditos'),
  leitura('consultar_lancamentos_de_creditos', 'list_credit_entries', 'creditos'),
  leitura('consultar_resumo_do_contrato', 'get_contract_summary', 'creditos'),
  leitura('consultar_relatorio_de_custos', 'get_cost_report', 'creditos'),
  leitura('listar_canais_de_contato', 'list_contact_channels', 'contatos'),
  leitura('listar_sinais', 'list_signals', 'sinais'),
  leitura('listar_sinais_da_conta', 'list_account_signals', 'sinais'),
  leitura('listar_catalogo_de_sinais', 'list_visible_signal_catalog', 'sinais'),
  leitura('detalhar_sequencia', 'get_owned_sequence', 'sequencias'),
  leitura('listar_envios_da_sequencia', 'list_sequence_step_sends', 'sequencias'),
  leitura('listar_resultados_de_envios', 'list_send_outcomes', 'respostas'),
  leitura('consultar_taxas_de_resultado', 'send_outcome_rates', 'creditos'),
  leitura('consultar_taxas_por_abordagem', 'send_outcome_rates_by_approach', 'creditos'),
  leitura('listar_respostas_de_chat', 'list_received_chat_messages', 'respostas'),
  leitura('listar_respostas_de_email', 'list_received_emails', 'respostas'),
  leitura('listar_propostas_de_resposta', 'list_reply_proposals', 'respostas'),
  leitura('listar_rotinas', 'list_agent_routines', 'rotinas'),
  leitura('listar_secoes_do_playbook', 'list_playbook_sections', 'playbooks'),
  leitura('consultar_secao_do_playbook', 'get_playbook_section', 'playbooks'),
  leitura('listar_agentes', 'list_agents', 'agentes'),
  leitura('listar_memoria_do_agente', 'list_agent_memory', 'agentes'),
  leitura('listar_aprovacoes', 'list_approvals', 'aprovacoes'),
  leitura('listar_participantes', 'list_workspace_participants', 'participacoes'),
  leitura('listar_convites', 'list_workspace_invitations', 'participacoes'),
  leitura('listar_integracoes', 'list_workspace_integrations', 'integracoes'),
  leitura('consultar_acesso_a_integracoes', 'integration_access_status', 'integracoes'),
  leitura('listar_contas_remetentes', 'list_owned_sender_accounts', 'contas_remetentes'),
]

/** Classifica pelo catálogo imutável; qualquer risco declarado pelo modelo é ignorado. */
export function classificarFerramentaWhatsApp(
  nome: string,
  _declaracaoDoModelo: unknown = undefined,
  papel?: PapelDaFerramenta,
): DescritorDeFerramentaPlataforma | null {
  const descritor = CATALOGO_FERRAMENTAS_WHATSAPP.find((ferramenta) => ferramenta.nome === nome)
  if (!descritor) return null
  if (papel && !descritor.papeis.includes(papel)) throw new Error('Papel sem acesso à ferramenta')
  return descritor
}
