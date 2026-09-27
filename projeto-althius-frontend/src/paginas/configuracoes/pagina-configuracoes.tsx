import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { AbasSublinhadas } from '@/components/abas'
import { AvisoDeModuloIndisponivel } from '@/components/modulo-indisponivel'
import { Pagina } from '@/components/pagina'
import type { ModuloDoWorkspace } from '@/fonte/ambiente'
import { useAmbiente } from '@/fonte/contexto'
import { SecaoAjuda } from './secao-ajuda'
import { SecaoMemoria } from './secao-memoria'
import { SecaoPerfil, SecaoPerfilDoWorkspaceOperacional } from './secao-perfil'
import { SecaoPlano } from './secao-plano'
import { SecaoPreferencias } from './secao-preferencias'
import { SecaoWorkspace } from './secao-workspace'

/**
 * As seis seções aprovadas no mockup (ticket 01). Memória do Workspace e Ajuda e informações têm uma página por aba
 * (/configuracoes/memoria/icp, /configuracoes/ajuda/termos); as demais são uma página só. Uma seção informativa é só
 * conteúdo da Althius e não depende do backend do Workspace. Uma seção com `modulo` próprio fica disponível no
 * Workspace operacional assim que esse módulo tem backend, antes do resto de Configurações. Uma seção com parte já ligada
 * ao backend usa, no Workspace operacional, a versão `NoWorkspaceOperacional`, que mostra essa parte e diz que o resto
 * está indisponível.
 */
const SECOES: Record<
  string,
  {
    rotulo: string
    Componente: () => ReactNode
    NoWorkspaceOperacional?: () => ReactNode
    comPaginas?: boolean
    informativa?: boolean
    modulo?: ModuloDoWorkspace
  }
> = {
  perfil: { rotulo: 'Meu perfil', Componente: SecaoPerfil, NoWorkspaceOperacional: SecaoPerfilDoWorkspaceOperacional },
  preferencias: { rotulo: 'Preferências', Componente: SecaoPreferencias },
  workspace: { rotulo: 'Workspace', Componente: SecaoWorkspace, modulo: 'participantes' },
  memoria: { rotulo: 'Memória do Workspace', Componente: SecaoMemoria, comPaginas: true },
  plano: { rotulo: 'Plano', Componente: SecaoPlano },
  ajuda: { rotulo: 'Ajuda e informações', Componente: SecaoAjuda, comPaginas: true, informativa: true },
}

export function PaginaConfiguracoes() {
  const { secao, pagina } = useParams()
  const { disponivel } = useAmbiente()
  if (!(secao && secao in SECOES)) return <Navigate to="/configuracoes/perfil" replace />
  const { Componente, NoWorkspaceOperacional, comPaginas, informativa, modulo = 'configuracoes' } = SECOES[secao]
  if (pagina && !comPaginas) return <Navigate to={`/configuracoes/${secao}`} replace />

  return (
    <Pagina titulo="Configurações" className="gap-8">
      <AbasSublinhadas
        rotuloAcessivel="Seções de Configurações"
        abas={Object.entries(SECOES).map(([id, { rotulo }]) => ({ rotulo, para: `/configuracoes/${id}` }))}
      />
      {informativa || disponivel(modulo) ? (
        <Componente />
      ) : NoWorkspaceOperacional ? (
        <NoWorkspaceOperacional />
      ) : (
        <AvisoDeModuloIndisponivel modulo={modulo} />
      )}
    </Pagina>
  )
}
