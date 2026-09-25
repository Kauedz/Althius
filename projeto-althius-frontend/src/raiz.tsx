import { useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { App } from '@/App'
import { AplicativoAutenticado } from '@/auth/aplicativo'
import { ROTA_DE_ENTRADA } from '@/auth/destino'
import type { ServicosDoNavegador } from '@/auth/servicos-do-navegador'
import type { ModoDoAmbiente } from '@/fonte/ambiente'
import { criarAmbienteDeDemonstracao } from '@/fonte/composicao'

/** O último ambiente escolhido neste navegador. O nome antigo da chave fica, para não perder as escolhas já salvas. */
const CHAVE_DO_AMBIENTE = 'althius:modo_demo'

/**
 * A escolha do ambiente: a Demonstração ou o acesso ao Workspace operacional. Sem Supabase configurado, só existe a
 * Demonstração. Cada ambiente monta as próprias fontes; trocar de um para outro desmonta o anterior inteiro.
 */
export function RaizDoAplicativo({ cliente, servicos }: { cliente: SupabaseClient | null; servicos: ServicosDoNavegador }) {
  const [ambiente, setAmbiente] = useState<ModoDoAmbiente>(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'true' || params.get('demo') === 'false') return 'real'
    if (params.get('demo') === 'true') return 'demonstracao'
    if (window.location.pathname === ROTA_DE_ENTRADA) return 'real'
    const salvo = localStorage.getItem(CHAVE_DO_AMBIENTE)
    if (salvo !== null) return salvo === 'true' ? 'demonstracao' : 'real'
    // No protótipo, a Demonstração é o padrão.
    return 'demonstracao'
  })

  const escolherAmbiente = (escolhido: ModoDoAmbiente) => {
    localStorage.setItem(CHAVE_DO_AMBIENTE, String(escolhido === 'demonstracao'))
    setAmbiente(escolhido)
  }

  if (ambiente === 'demonstracao' || !cliente) {
    return <AplicativoDeDemonstracao aoAlternarParaAutenticado={cliente ? () => escolherAmbiente('real') : undefined} />
  }

  return <AplicativoAutenticado cliente={cliente} servicos={servicos} aoAcessarDemonstracao={() => escolherAmbiente('demonstracao')} />
}

function AplicativoDeDemonstracao({ aoAlternarParaAutenticado }: { aoAlternarParaAutenticado?: () => void }) {
  const ambiente = useMemo(() => criarAmbienteDeDemonstracao({ armazenamento: window.localStorage }), [])

  return (
    <>
      {aoAlternarParaAutenticado && (
        <div className="flex items-center justify-between border-b border-al-line bg-al-surface/40 px-4 py-1.5 text-xs text-al-muted">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
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
