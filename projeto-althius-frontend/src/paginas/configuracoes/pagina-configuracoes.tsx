import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { AbasSublinhadas } from '@/components/abas'
import { Pagina } from '@/components/pagina'
import { SecaoAjuda } from './secao-ajuda'
import { SecaoMemoria } from './secao-memoria'
import { SecaoPerfil } from './secao-perfil'
import { SecaoPlano } from './secao-plano'
import { SecaoPreferencias } from './secao-preferencias'
import { SecaoWorkspace } from './secao-workspace'

/**
 * As seis seções aprovadas no mockup (ticket 01). Memória do Workspace e Ajuda e informações têm uma página por aba
 * (/configuracoes/memoria/icp, /configuracoes/ajuda/termos); as demais são uma página só.
 */
const SECOES: Record<string, { rotulo: string; Componente: () => ReactNode; comPaginas?: boolean }> = {
  perfil: { rotulo: 'Meu perfil', Componente: SecaoPerfil },
  preferencias: { rotulo: 'Preferências', Componente: SecaoPreferencias },
  workspace: { rotulo: 'Workspace', Componente: SecaoWorkspace },
  memoria: { rotulo: 'Memória do Workspace', Componente: SecaoMemoria, comPaginas: true },
  plano: { rotulo: 'Plano', Componente: SecaoPlano },
  ajuda: { rotulo: 'Ajuda e informações', Componente: SecaoAjuda, comPaginas: true },
}

export function PaginaConfiguracoes() {
  const { secao, pagina } = useParams()
  if (!(secao && secao in SECOES)) return <Navigate to="/configuracoes/perfil" replace />
  const { Componente, comPaginas } = SECOES[secao]
  if (pagina && !comPaginas) return <Navigate to={`/configuracoes/${secao}`} replace />

  return (
    <Pagina titulo="Configurações" className="gap-8">
      <AbasSublinhadas
        rotuloAcessivel="Seções de Configurações"
        abas={Object.entries(SECOES).map(([id, { rotulo }]) => ({ rotulo, para: `/configuracoes/${id}` }))}
      />
      <Componente />
    </Pagina>
  )
}
