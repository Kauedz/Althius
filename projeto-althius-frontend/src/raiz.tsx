import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { App } from '@/App'
import { AplicativoAutenticado } from '@/auth/aplicativo'
import { ehCaminhoDeAcesso } from '@/auth/destino'
import { PaginaDoDocumentoPublico, documentoPublicoDoCaminho } from '@/auth/documento-publico'
import type { ServicosDoNavegador } from '@/auth/servicos-do-navegador'
import type { ModoDoAmbiente } from '@/fonte/ambiente'
import { criarAmbienteDeDemonstracao } from '@/fonte/composicao'

/**
 * O ambiente deste navegador: o último escolhido, ou o Workspace operacional de quem abriu uma tela de acesso ou um
 * convite.
 */
const CHAVE_DO_AMBIENTE = 'althius:ambiente'
/**
 * A chave do protótipo, que guardava `true` para a Demonstração. Em produção ela não vale mais: quem abriu a
 * Demonstração antes não fica preso nela. No desenvolvimento, o valor dela passa para a chave nova. Nos dois, é apagada.
 */
const CHAVE_DO_PROTOTIPO = 'althius:modo_demo'

function lembrarAmbiente(ambiente: ModoDoAmbiente) {
  localStorage.setItem(CHAVE_DO_AMBIENTE, ambiente)
}

function ambienteLembrado(): ModoDoAmbiente | null {
  const doPrototipo = localStorage.getItem(CHAVE_DO_PROTOTIPO)
  if (doPrototipo !== null) {
    localStorage.removeItem(CHAVE_DO_PROTOTIPO)
    if (import.meta.env.DEV) lembrarAmbiente(doPrototipo === 'true' ? 'demonstracao' : 'real')
  }
  const salvo = localStorage.getItem(CHAVE_DO_AMBIENTE)
  return salvo === 'demonstracao' || salvo === 'real' ? salvo : null
}

/**
 * A escolha do ambiente: a Demonstração ou o acesso ao Workspace operacional. Sem Supabase configurado, só existe a
 * Demonstração. Cada ambiente monta as próprias fontes; trocar de um para outro desmonta o anterior inteiro.
 */
export function RaizDoAplicativo({ cliente, servicos }: { cliente: SupabaseClient | null; servicos: ServicosDoNavegador }) {
  // As telas de acesso, inclusive o link de redefinição de senha, e o link de um convite são sempre do Workspace
  // operacional, mesmo num navegador que nunca o escolheu.
  const [abriuPeloAcesso] = useState(() => ehCaminhoDeAcesso(window.location.pathname))
  const [documentoPublico] = useState(() => documentoPublicoDoCaminho(window.location.pathname))
  const [ambiente, setAmbiente] = useState<ModoDoAmbiente>(() => {
    const salvo = ambienteLembrado()
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'true' || params.get('demo') === 'false') return 'real'
    if (params.get('demo') === 'true') return 'demonstracao'
    if (abriuPeloAcesso) return 'real'
    if (salvo) return salvo
    // Em produção, quem chega sem escolha vê a tela de entrada; no desenvolvimento, a Demonstração é o padrão.
    return import.meta.env.DEV ? 'demonstracao' : 'real'
  })

  // E fica lembrado neste navegador: os links de confirmação do cadastro e de entrada por código voltam ao destino, fora
  // das telas de acesso, e também precisam abrir o Workspace operacional.
  useEffect(() => {
    if (abriuPeloAcesso && cliente) lembrarAmbiente('real')
  }, [abriuPeloAcesso, cliente])

  const escolherAmbiente = (escolhido: ModoDoAmbiente) => {
    lembrarAmbiente(escolhido)
    setAmbiente(escolhido)
  }

  // Os Termos e a Política de Privacidade são públicos: não pedem login, não abrem a Demonstração nem escolhem ambiente.
  if (documentoPublico) return <PaginaDoDocumentoPublico documento={documentoPublico} />

  if (ambiente === 'demonstracao' || !cliente) {
    return <AplicativoDeDemonstracao aoAlternarParaAutenticado={cliente ? () => escolherAmbiente('real') : undefined} />
  }

  return <AplicativoAutenticado cliente={cliente} servicos={servicos} aoAcessarDemonstracao={() => escolherAmbiente('demonstracao')} />
}

/**
 * A Demonstração sem login. No desenvolvimento, com o banner do protótipo; em produção, só o aviso de que é uma
 * demonstração e o caminho de volta à tela de entrada, para quem a abriu não ficar preso nela.
 */
function AplicativoDeDemonstracao({ aoAlternarParaAutenticado }: { aoAlternarParaAutenticado?: () => void }) {
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
      {aoAlternarParaAutenticado && !import.meta.env.DEV && (
        <div className="flex items-center justify-between border-b border-al-line bg-al-surface/40 px-4 py-1.5 text-xs text-al-muted">
          <span className="font-medium text-al-ink">Você está vendo uma demonstração</span>
          <button
            type="button"
            onClick={aoAlternarParaAutenticado}
            className="cursor-pointer text-al-accent hover:underline"
          >
            Entrar no Workspace
          </button>
        </div>
      )}
      <App ambiente={ambiente} />
    </>
  )
}
