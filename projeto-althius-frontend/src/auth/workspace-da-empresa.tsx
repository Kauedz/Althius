import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'

/** O limite da função do banco para o nome da empresa. */
const MAXIMO_DO_NOME = 100

/** O Workspace da empresa que a função do banco devolve: o identificador e o nome. */
export interface WorkspaceDaEmpresaCriado {
  id: string
  name: string
}

/** As recusas da função create_company_workspace (migration workspace_da_empresa), com o texto para a pessoa. */
const RECUSAS: [code: string, trecho: string, texto: string][] = [
  ['22023', 'company name is required', 'Informe o nome da empresa.'],
  ['22023', 'company name is too long', `Use até ${MAXIMO_DO_NOME} caracteres no nome da empresa.`],
  ['42501', 'email not verified', 'Confirme seu e-mail antes de criar um Workspace da empresa.'],
  ['42501', 'active workspace membership required', 'Você não participa mais do Workspace criado por este pedido. Volte e crie de novo.'],
]

const FALHA = 'Não foi possível criar o Workspace da empresa agora. Verifique sua conexão e tente de novo.'

/**
 * A chave do pedido ainda sem resposta, guardada na aba. Se a resposta se perde e a pessoa volta, reabre o formulário ou
 * recarrega a página, o pedido repete a mesma chave e o banco devolve o Workspace já criado em vez de criar outro.
 */
const CHAVE_DO_PEDIDO = 'althius:pedido-do-workspace-da-empresa'

function chaveDoPedido() {
  try {
    const guardada = sessionStorage.getItem(CHAVE_DO_PEDIDO)
    if (guardada) return guardada
    const nova = crypto.randomUUID()
    sessionStorage.setItem(CHAVE_DO_PEDIDO, nova)
    return nova
  } catch {
    return crypto.randomUUID()
  }
}

function esquecerPedido() {
  try {
    sessionStorage.removeItem(CHAVE_DO_PEDIDO)
  } catch {
    // Sem armazenamento na aba, não há chave guardada.
  }
}

/**
 * Cria o Workspace da empresa, com a pessoa da sessão como Administradora, na mesma transação do banco. A `chave` torna
 * o pedido repetível: com a mesma chave, o banco devolve o Workspace já criado em vez de criar outro.
 */
async function criarWorkspaceDaEmpresa(cliente: SupabaseClient, nome: string, chave: string) {
  const { data, error } = await cliente.rpc('create_company_workspace', { p_name: nome, p_request_id: chave })
  if (error) {
    const recusa = RECUSAS.find(([code, trecho]) => error.code === code && error.message.includes(trecho))
    throw new Error(recusa ? recusa[2] : FALHA)
  }
  const { id, name } = data as WorkspaceDaEmpresaCriado
  return { id, name }
}

/**
 * "Criar Workspace da empresa": a escolha explícita, a partir do Workspace pessoal, com o nome da empresa. O novo
 * Workspace nasce vazio, com dados e plano próprios; o Workspace pessoal não muda de nome e continua disponível.
 */
export function CriarWorkspaceDaEmpresa({
  cliente,
  aoCriar,
  aoVoltar,
}: {
  cliente: SupabaseClient
  aoCriar: (workspace: WorkspaceDaEmpresaCriado) => void
  aoVoltar: () => void
}) {
  // Uma chave por pedido ainda sem resposta: clique duplo, nova tentativa, reabrir o formulário e recarregar repetem o
  // mesmo pedido.
  const [chave] = useState(chaveDoPedido)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const enviandoAgora = useRef(false)
  // Se a sessão muda enquanto o pedido está no ar, o formulário sai da tela e a resposta não abre nada.
  const montado = useRef(false)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (enviandoAgora.current) return
    const empresa = nome.trim()
    if (!empresa) {
      setErro('Informe o nome da empresa.')
      return
    }
    enviandoAgora.current = true
    setEnviando(true)
    setErro('')
    try {
      const criado = await criarWorkspaceDaEmpresa(cliente, empresa, chave)
      esquecerPedido()
      if (montado.current) aoCriar(criado)
    } catch (err) {
      if (!montado.current) return
      setErro(err instanceof Error ? err.message : FALHA)
      enviandoAgora.current = false
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={criar} className="flex w-full max-w-md flex-col gap-5">
      <div>
        <h1 className="titulo-secao text-2xl">Criar Workspace da empresa</h1>
        <p className="mt-2 text-sm text-al-muted">
          O Workspace da empresa tem dados e plano próprios, com você no papel de Administrador. Nada do seu Workspace
          pessoal é copiado nem movido: Contas-alvo, Contatos, Sequências, Memória do Workspace, Contas remetentes e
          plano ficam onde estão, e ele continua disponível com o mesmo nome.
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="nome-da-empresa">Nome da empresa
        <input
          id="nome-da-empresa"
          autoComplete="organization"
          maxLength={MAXIMO_DO_NOME}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="campo h-10 bg-al-bg px-3 text-al-ink"
        />
      </label>
      {erro && <p role="alert" className="text-sm text-al-erro">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={enviando}>{enviando ? 'Criando…' : 'Criar Workspace da empresa'}</Button>
        <Button type="button" variant="outline" disabled={enviando} onClick={aoVoltar}>Voltar ao Workspace pessoal</Button>
      </div>
    </form>
  )
}
