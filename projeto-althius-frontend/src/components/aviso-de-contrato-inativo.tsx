import { Info } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useClienteOpcional } from '@/auth/contexto'
import { ModalFaleComAEquipe } from '@/auth/fale-com-a-equipe'
import { BOTAO_SECUNDARIO } from '@/components/botoes'
import { useDados } from '@/fonte/contexto'
import type { ResumoDoContrato } from '@/fonte/tipos'

const TEXTO = 'Contrato inativo. Fale com a equipe Althius para reativar.'
const DESCRICAO = 'O contrato deste Workspace não está ativo. Conte como podemos ajudar e a equipe Althius responde.'

type Leitura = { tipo: 'ausente' } | { tipo: 'resumo'; resumo: ResumoDoContrato | null }

function rotaComAviso(pathname: string) {
  return pathname === '/' || pathname.startsWith('/sinais') || pathname.startsWith('/sequencias')
}

function contratoParado(leitura: Leitura | undefined) {
  if (!leitura || leitura.tipo !== 'resumo') return false
  if (leitura.resumo?.ilimitado) return false
  return leitura.resumo === null || leitura.resumo.estado !== 'ativo'
}

/**
 * O Workspace sem contrato ativo fica pausado. O aviso fica na home (Agentes), em Sinais e em Sequências.
 * A Demonstração não lê contrato, então não mostra nada.
 */
export function AvisoDeContratoInativo() {
  const { pathname } = useLocation()
  const cliente = useClienteOpcional()
  const [aberto, setAberto] = useState(false)
  const leitura = useDados(async (fonte): Promise<Leitura> => {
    if (!fonte.contratoDoWorkspace) return { tipo: 'ausente' }
    return { tipo: 'resumo', resumo: await fonte.contratoDoWorkspace() }
  }, [])

  if (!rotaComAviso(pathname) || !contratoParado(leitura)) return null

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-al-line bg-al-hover px-6 py-3 text-sm">
        <p className="flex items-start gap-2 text-al-ink">
          <Info strokeWidth={1.8} className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{TEXTO}</span>
        </p>
        <button type="button" className={BOTAO_SECUNDARIO} onClick={() => setAberto(true)}>
          Fale com a equipe Althius
        </button>
      </div>
      <ModalFaleComAEquipe cliente={cliente} aberto={aberto} aoMudar={setAberto} descricao={DESCRICAO} />
    </>
  )
}
