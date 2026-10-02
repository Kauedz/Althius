import { useFonteDeContas } from '@/fonte/contexto'
import type { ContaAlvo } from '@/fonte/contas-tipos'

/**
 * Se a Fonte oferece "Enviar ao CRM" para esta Conta (kanban-de-prospeccao 05): só ao Vendedor responsável, com a Conta
 * ativa. A Demonstração não envia. Vale para o detalhe da Conta e para o cartão do Kanban.
 */
export function useOfereceEnvioAoCrm(conta: ContaAlvo): boolean {
  const fonte = useFonteDeContas()
  return !!fonte.enviarAoCrm && !!fonte.envioAoCrm && conta.sobMinhaResponsabilidade !== false && !conta.arquivadaEm
}
