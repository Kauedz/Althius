import { useMemo, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { App } from '@/App'
import { BOTAO_SECUNDARIO } from '@/components/botoes'
import { criarAmbienteDeDemonstracao } from '@/fonte/composicao-da-demonstracao'
import { criarArmazenamentoDoVisitante, protegerAmbienteDoVisitante } from '@/fonte/protecao-do-visitante'
import { ModalFaleComAEquipe } from './fale-com-a-equipe'

/**
 * A Demonstração do Workspace visitante, só leitura, com o banner fixo. Qualquer ação paga abre "Fale com a equipe
 * Althius". Carregada por `carregarDemonstracaoDoVisitante`, só quando o visitante vê a Demonstração.
 */
export function DemonstracaoDoVisitante({
  cliente,
  email,
  sair,
}: {
  cliente: SupabaseClient
  email: string
  sair: ReactNode
}) {
  const [modalAberto, setModalAberto] = useState(false)
  const ambiente = useMemo(
    () =>
      protegerAmbienteDoVisitante(
        criarAmbienteDeDemonstracao({ armazenamento: criarArmazenamentoDoVisitante() }),
        () => setModalAberto(true),
      ),
    [],
  )

  return (
    <>
      <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-al-line bg-al-surface px-4 py-2 text-sm">
        <p role="status" className="font-medium text-al-ink">
          Você está vendo uma demonstração
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-al-muted">
          <span>{email}</span>
          <button type="button" className={BOTAO_SECUNDARIO} onClick={() => setModalAberto(true)}>
            Fale com a equipe Althius
          </button>
          {sair}
        </div>
      </div>
      <App ambiente={ambiente} />
      <ModalFaleComAEquipe cliente={cliente} aberto={modalAberto} aoMudar={setModalAberto} />
    </>
  )
}
