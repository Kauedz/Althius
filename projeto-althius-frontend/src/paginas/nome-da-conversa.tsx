import { Pencil } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Mensagem } from '@/components/mensagem'
import { useDados, useFonte } from '@/fonte/contexto'
import { nomeDaConversa } from '@/fonte/tipos'
import { mensagemDeErro } from '@/lib/utils'

/**
 * O nome da Conversa coordenada em curso, com como mudá-lo. Sem nome dado, vale o primeiro pedido. Só onde as Conversas
 * ficam no banco; na Demonstração, o cabeçalho não aparece.
 */
export function NomeDaConversa({ respondendo }: { respondendo: boolean }) {
  const fonte = useFonte()
  if (!fonte.renomearConversa) return null
  return <Cabecalho respondendo={respondendo} />
}

function Cabecalho({ respondendo }: { respondendo: boolean }) {
  const fonte = useFonte()
  const [versao, setVersao] = useState(0)
  const salvas = useDados((f) => f.conversasSalvas?.() ?? Promise.resolve([]), [respondendo, versao])
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const id = fonte.conversaCoordenadaAtual?.() ?? null
  const conversa = salvas?.find((c) => c.id === id)
  if (!conversa) return null

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    try {
      await fonte.renomearConversa?.(conversa!.id, nome)
      setVersao((v) => v + 1)
      setEditando(false)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  if (!editando) {
    return (
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-al-line pb-4">
        <h2 className="titulo-secao min-w-0 truncate text-2xl">{nomeDaConversa(conversa)}</h2>
        <button
          type="button"
          onClick={() => {
            setNome(conversa.titulo ?? '')
            setEditando(true)
          }}
          className={BOTAO_DISCRETO}
        >
          <Pencil strokeWidth={1.8} className="size-3.5" aria-hidden />
          Renomear
        </button>
      </div>
    )
  }

  return (
    <form aria-label="Renomear a Conversa" noValidate onSubmit={salvar} className="mb-6 flex flex-col gap-3 border-b border-al-line pb-4">
      <label htmlFor="nome-da-conversa" className="rotulo">
        Nome da Conversa
      </label>
      <input
        id="nome-da-conversa"
        value={nome}
        maxLength={80}
        placeholder={conversa.primeiroPedido}
        onChange={(e) => setNome(e.target.value)}
        className="campo"
      />
      <Mensagem tipo="erro">{erro}</Mensagem>
      <div className="flex gap-2">
        <button type="submit" disabled={salvando} className={BOTAO_PRIMARIO}>
          Salvar
        </button>
        <button type="button" onClick={() => setEditando(false)} disabled={salvando} className={BOTAO_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
