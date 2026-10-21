import { useMemo } from 'react'
import { App } from '@/App'
import { BOTAO_SECUNDARIO } from '@/components/botoes'
import { criarAmbienteDeDemonstracao } from '@/fonte/composicao-da-demonstracao'
import { ROTA_DA_DEMONSTRACAO } from './rota-da-demonstracao'

/**
 * A Demonstração aberta pela equipe Althius, logada. As fontes são as simuladas, só no navegador: nada lê nem grava no
 * banco, e nada chega ao Workspace operacional. As rotas ficam sob `/demonstracao`, para atualizar a página continuar
 * nela; sair volta ao início do app normal. Carregado por `carregarDemonstracaoDaEquipe`, só depois de o banco confirmar
 * a equipe.
 */
export function AplicativoDaDemonstracaoDaEquipe({ aoSair }: { aoSair: () => void }) {
  const ambiente = useMemo(() => criarAmbienteDeDemonstracao({ armazenamento: window.localStorage }), [])

  return (
    <>
      <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-al-line bg-al-surface px-4 py-2 text-sm">
        <p role="status" className="font-medium text-al-ink">
          Você está vendo uma demonstração
        </p>
        <button type="button" className={BOTAO_SECUNDARIO} onClick={aoSair}>
          Sair da demonstração
        </button>
      </div>
      <App ambiente={ambiente} basename={ROTA_DA_DEMONSTRACAO} />
    </>
  )
}
