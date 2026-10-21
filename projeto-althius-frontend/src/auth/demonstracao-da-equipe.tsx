import { useMemo } from 'react'
import { App } from '@/App'
import { BOTAO_SECUNDARIO } from '@/components/botoes'
import { criarAmbienteDeDemonstracao } from '@/fonte/composicao'

/** Onde a equipe Althius abre a Demonstração para mostrar a plataforma. Não aparece em nenhum menu. */
export const ROTA_DA_DEMONSTRACAO = '/demonstracao'

/** Se o caminho é a Demonstração da equipe ou uma tela dentro dela (`/demonstracao/contas`). */
export function ehCaminhoDaDemonstracao(caminho: string): boolean {
  return caminho === ROTA_DA_DEMONSTRACAO || caminho.startsWith(`${ROTA_DA_DEMONSTRACAO}/`)
}

/**
 * A Demonstração aberta pela equipe Althius, logada. As fontes são as simuladas, só no navegador: nada lê nem grava no
 * banco, e nada chega ao Workspace operacional. As rotas ficam sob `/demonstracao`, para atualizar a página continuar
 * nela; sair volta ao início do app normal.
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
