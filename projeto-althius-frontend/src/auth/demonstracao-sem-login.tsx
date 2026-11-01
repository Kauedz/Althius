import { useMemo } from 'react'
import { App } from '@/App'
import { criarAmbienteDeDemonstracao } from '@/fonte/composicao-da-demonstracao'

/**
 * A Demonstração sem login: o protótipo do desenvolvimento, com o banner para ir à tela de login, ou o app sem
 * Supabase configurado. Carregada por `carregarDemonstracaoSemLogin`.
 */
export function AplicativoDeDemonstracao({ aoAlternarParaAutenticado }: { aoAlternarParaAutenticado?: () => void }) {
  const ambiente = useMemo(() => criarAmbienteDeDemonstracao({ armazenamento: window.localStorage }), [])

  return (
    <>
      {aoAlternarParaAutenticado && import.meta.env.DEV && (
        <div className="flex items-center justify-between border-b border-al-line bg-al-surface/40 px-4 py-1.5 text-xs text-al-muted">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-al-sucesso" />
            <span className="font-medium text-al-ink">Modo Protótipo (Completo)</span>
            <span>· Navegação sem necessidade de e-mail</span>
          </div>
          <button
            type="button"
            onClick={aoAlternarParaAutenticado}
            className="cursor-pointer text-al-accent hover:underline"
          >
            Acessar tela de login Supabase
          </button>
        </div>
      )}
      <App ambiente={ambiente} />
    </>
  )
}
