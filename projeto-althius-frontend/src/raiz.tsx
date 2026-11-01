import { lazy, Suspense, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AplicativoAutenticado } from '@/auth/aplicativo'
import { carregarDemonstracaoSemLogin } from '@/auth/carregar-demonstracao'
import { ehCaminhoDeAcesso } from '@/auth/destino'
import { ehCaminhoDaDemonstracao } from '@/auth/rota-da-demonstracao'
import { PaginaDoDocumentoPublico, documentoPublicoDoCaminho } from '@/auth/documento-publico'
import { PaginaDeDescadastro, confirmarDescadastroPelaFuncao, tokenDeDescadastroDoCaminho } from '@/auth/pagina-de-descadastro'
import type { ServicosDoNavegador } from '@/auth/servicos-do-navegador'
import type { ModoDoAmbiente } from '@/fonte/ambiente'

/** A Demonstração sem login vem por `import()`: em produção, com o Supabase configurado, ela nunca é baixada. */
const AplicativoDeDemonstracao = lazy(() =>
  carregarDemonstracaoSemLogin().then((modulo) => ({ default: modulo.AplicativoDeDemonstracao })),
)

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
 *
 * Fora do desenvolvimento, não há Demonstração sem login: só a equipe Althius a abre, logada, em /demonstracao.
 */
export function RaizDoAplicativo({ cliente, servicos }: { cliente: SupabaseClient | null; servicos: ServicosDoNavegador }) {
  // As telas de acesso, inclusive o link de redefinição de senha, e o link de um convite são sempre do Workspace
  // operacional, mesmo num navegador que nunca o escolheu.
  const [abriuPeloAcesso] = useState(() => ehCaminhoDeAcesso(window.location.pathname))
  // A Demonstração da equipe pede login: é o Workspace operacional que confere, no banco, quem é da equipe.
  const [abriuADemonstracaoDaEquipe] = useState(() => ehCaminhoDaDemonstracao(window.location.pathname))
  const [documentoPublico] = useState(() => documentoPublicoDoCaminho(window.location.pathname))
  const [tokenDeDescadastro] = useState(() => tokenDeDescadastroDoCaminho(window.location.pathname, window.location.search))
  const [ambiente, setAmbiente] = useState<ModoDoAmbiente>(() => {
    const salvo = ambienteLembrado()
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'true' || params.get('demo') === 'false') return 'real'
    // Em produção, a escolha antiga pela Demonstração e o ?demo=true não valem: todos veem a tela de entrada.
    if (abriuADemonstracaoDaEquipe || !import.meta.env.DEV) return 'real'
    if (params.get('demo') === 'true') return 'demonstracao'
    if (abriuPeloAcesso) return 'real'
    // No desenvolvimento, a Demonstração é o padrão.
    return salvo ?? 'demonstracao'
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
  // O link de descadastro do rodapé dos e-mails também é público: quem abre é o Contato, não um usuário.
  if (tokenDeDescadastro !== null) {
    return (
      <PaginaDeDescadastro
        token={tokenDeDescadastro}
        confirmar={confirmarDescadastroPelaFuncao(import.meta.env.VITE_SUPABASE_URL ?? '')}
      />
    )
  }

  if (ambiente === 'demonstracao' || !cliente) {
    return (
      <Suspense fallback={null}>
        <AplicativoDeDemonstracao aoAlternarParaAutenticado={cliente ? () => escolherAmbiente('real') : undefined} />
      </Suspense>
    )
  }

  // O atalho para a Demonstração na tela de entrada é só do protótipo local.
  const aoAcessarDemonstracao = import.meta.env.DEV ? () => escolherAmbiente('demonstracao') : undefined
  return <AplicativoAutenticado cliente={cliente} servicos={servicos} aoAcessarDemonstracao={aoAcessarDemonstracao} />
}
