import { useFonteDeSinais } from '@/fonte/contexto'
import { TIPOS_DO_PLANO } from './campos-do-plano'
import type { VisaoDoCatalogo } from './catalogo-funcional'

/**
 * Se a pessoa pode descrever um Sinal: a Fonte sabe montar e salvar Planos e há ao menos um Sinal que roda de verdade.
 * Onde ninguém pode criar Monitoramento (a Fonte não oferece Planos, ou nenhum Sinal está disponível), não há botão.
 */
export function usePodeDescreverSinal(visao: VisaoDoCatalogo): boolean {
  const fonte = useFonteDeSinais()
  if (typeof fonte.montarPlano !== 'function' || typeof fonte.salvarPlano !== 'function') return false
  if (visao.carregando || visao.erro) return false
  // Sem estado (a Demonstração) tudo é simulado e pode ser criado; no operacional, algum coletor precisa estar disponível.
  const disponibilidades = Object.keys(TIPOS_DO_PLANO).map((tipo) => visao.disponibilidadeDe({ coletores: [tipo] }))
  return disponibilidades.some((d) => d === undefined || d === 'disponivel')
}
