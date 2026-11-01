import { lazy, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BOTAO_PRIMARIO } from '@/components/botoes'
import { carregarDemonstracaoDoVisitante } from './carregar-demonstracao'
import { ModalFaleComAEquipe } from './fale-com-a-equipe'

/**
 * Se o Workspace visitante mostra a Demonstração (ADR-0025). Com `false`, quem entra sem contrato vê só "Fale com a
 * equipe Althius", sem a Demonstração nem o código dela. O padrão segue o de hoje até a decisão do Kauê.
 */
export const VISITANTE_VE_DEMONSTRACAO = true

const DemonstracaoDoVisitante = lazy(() =>
  carregarDemonstracaoDoVisitante().then((modulo) => ({ default: modulo.DemonstracaoDoVisitante })),
)

const DESCRICAO_SEM_DEMONSTRACAO =
  'O Workspace da sua empresa nasce depois do contrato: conte um pouco sobre vocês e a equipe Althius responde.'

/**
 * O Workspace visitante: quem entra sem Participação num Workspace contratado. Com `veDemonstracao`, vê a Demonstração,
 * só leitura, com o banner fixo; sem, só o pedido "Fale com a equipe Althius". O Workspace da empresa só nasce do
 * contrato, e só a Althius o cria. Quem renderiza põe o `Suspense` em volta: a Demonstração chega por `import()`.
 */
export function AplicativoDoVisitante({
  cliente,
  email,
  sair,
  veDemonstracao = VISITANTE_VE_DEMONSTRACAO,
}: {
  cliente: SupabaseClient
  email: string
  sair: ReactNode
  veDemonstracao?: boolean
}) {
  if (veDemonstracao) return <DemonstracaoDoVisitante cliente={cliente} email={email} sair={sair} />
  return <FaleComAEquipeDoVisitante cliente={cliente} email={email} sair={sair} />
}

function FaleComAEquipeDoVisitante({ cliente, email, sair }: { cliente: SupabaseClient; email: string; sair: ReactNode }) {
  const [modalAberto, setModalAberto] = useState(false)

  return (
    <main className="grid min-h-screen place-items-center bg-al-bg p-6 text-al-ink">
      <div className="flex max-w-xl flex-col items-start gap-4">
        <h1 className="titulo-secao text-2xl">Fale com a equipe Althius</h1>
        <p className="text-sm text-al-muted">{DESCRICAO_SEM_DEMONSTRACAO}</p>
        <p className="text-sm text-al-muted">Você entrou como {email}.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BOTAO_PRIMARIO} onClick={() => setModalAberto(true)}>
            Fale com a equipe Althius
          </button>
          {sair}
        </div>
      </div>
      <ModalFaleComAEquipe
        cliente={cliente}
        aberto={modalAberto}
        aoMudar={setModalAberto}
        descricao={DESCRICAO_SEM_DEMONSTRACAO}
      />
    </main>
  )
}
