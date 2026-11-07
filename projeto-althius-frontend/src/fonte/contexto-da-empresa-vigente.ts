// O Contexto da empresa vigente para as telas que só o leem (catálogo de Sinais, Agentes): os três textos e a versão.
// É o mesmo contrato da tela de Configurações; nada vem do Playbook nem da Memória do Workspace (contexto-da-empresa 07).
import { useDados, useFonteDoContextoDaEmpresa } from './contexto'
import type { VersaoDoContexto } from './contexto-da-empresa-tipos'

/** A versão vigente; nula quando não há contexto (ou ele não pôde ser lido) e indefinida enquanto carrega. */
export function useContextoDaEmpresaVigente(): VersaoDoContexto | null | undefined {
  const fonte = useFonteDoContextoDaEmpresa()
  const contexto = useDados(fonte, (f) => f.contexto().catch(() => null), [])
  return contexto === undefined ? undefined : (contexto?.vigente ?? null)
}

/** O começo do Perfil de cliente ideal, para um resumo de uma linha: a primeira linha escrita, cortada. */
export function resumoDoPerfilDeClienteIdeal(icp: string, limite = 160): string {
  const linha = icp.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  return linha.length > limite ? `${linha.slice(0, limite - 1).trimEnd()}…` : linha
}
