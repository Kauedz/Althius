import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { AbasSublinhadas } from '@/components/abas'
import { Pagina } from '@/components/pagina'
import { SecaoEmPreparo } from './secao-em-preparo'
import { SecaoMemoria } from './secao-memoria'
import { SecaoPerfil } from './secao-perfil'
import { SecaoPreferencias } from './secao-preferencias'
import { SecaoWorkspace } from './secao-workspace'

/**
 * As seis seções aprovadas no mockup (ticket 01). Meu perfil, Preferências, Workspace e Memória do Workspace (ICP e
 * Personas) já têm implementação funcional; as demais chegam nos tickets seguintes (ver comentário do ticket 01).
 */
const SECOES: Record<string, { rotulo: string; Componente: () => ReactNode }> = {
  perfil: { rotulo: 'Meu perfil', Componente: SecaoPerfil },
  preferencias: { rotulo: 'Preferências', Componente: SecaoPreferencias },
  workspace: { rotulo: 'Workspace', Componente: SecaoWorkspace },
  memoria: { rotulo: 'Memória do Workspace', Componente: SecaoMemoria },
  plano: {
    rotulo: 'Plano',
    Componente: () => (
      <SecaoEmPreparo
        titulo="Plano"
        descricao="O plano atual, os participantes e as Execuções de Agentes no período."
        alcance="Compartilhado com o Workspace"
      />
    ),
  },
  ajuda: {
    rotulo: 'Ajuda e informações',
    Componente: () => (
      <SecaoEmPreparo
        titulo="Ajuda e informações"
        descricao="Ajuda básica, formulário de feedback, termos de serviço e política de privacidade."
        alcance="Althius"
      />
    ),
  },
}

export function PaginaConfiguracoes() {
  const { secao, documento } = useParams()
  if (!(secao && secao in SECOES)) return <Navigate to="/configuracoes/perfil" replace />
  // Só a Memória do Workspace tem um documento por aba (/configuracoes/memoria/icp).
  if (documento && secao !== 'memoria') return <Navigate to={`/configuracoes/${secao}`} replace />

  const { Componente } = SECOES[secao]

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
