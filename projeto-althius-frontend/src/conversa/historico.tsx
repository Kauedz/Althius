import { Archive, Check, MessageSquare, Pencil, Plus, Search, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { BOTAO_DISCRETO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Mensagem } from '@/components/mensagem'
import { useFonte } from '@/fonte/contexto'
import { formatarDataCompleta } from '@/fonte/formatar-data'
import { nomeDaConversa, type AgenteId, type ResumoDeConversa } from '@/fonte/tipos'
import { cn, mensagemDeErro } from '@/lib/utils'
import { agruparConversas } from './historico-grupos'

const POR_PAGINA = 30

interface Props {
  /** O Agente do histórico, ou nulo para a Coordenação. */
  agenteId: AgenteId | null
  /** A Conversa aberta agora, para marcar na lista. */
  atual?: string | null
  aoAbrir(id: string): Promise<void> | void
  aoNova?(): void
  /** Muda quando a lista deve ser lida de novo (um pedido terminou, por exemplo). */
  versao?: unknown
  /** Sem Conversas e sem busca, a lista some (como na página de Agentes). */
  ocultarVazio?: boolean
  className?: string
}

/**
 * O histórico de Conversas de quem está na sessão, com busca, grupos por data, renomear e arquivar. Só onde as
 * Conversas ficam no banco (o Workspace operacional); na Demonstração, não aparece.
 */
export function HistoricoDeConversas(props: Props) {
  const fonte = useFonte()
  if (!fonte.historicoDeConversas) return null
  return <Historico {...props} />
}

function Historico({ agenteId, atual, aoAbrir, aoNova, versao, ocultarVazio, className }: Props) {
  const fonte = useFonte()
  const [conversas, setConversas] = useState<ResumoDeConversa[] | null>(null)
  const [haMais, setHaMais] = useState(false)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [releitura, setReleitura] = useState(0)

  useEffect(() => {
    let ativo = true
    fonte.historicoDeConversas?.(agenteId).then(
      (lista) => {
        if (!ativo) return
        setConversas(lista)
        setHaMais(lista.length >= POR_PAGINA)
      },
      (falha) => ativo && setErro(mensagemDeErro(falha)),
    )
    return () => {
      ativo = false
    }
  }, [fonte, agenteId, versao, releitura])

  async function carregarMais() {
    const ultima = conversas?.at(-1)
    if (!ultima) return
    try {
      const pagina = (await fonte.historicoDeConversas?.(agenteId, ultima.atualizadaEm)) ?? []
      setConversas((atuais) => [...(atuais ?? []), ...pagina.filter((c) => !atuais?.some((a) => a.id === c.id))])
      setHaMais(pagina.length >= POR_PAGINA)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  async function abrir(id: string) {
    setErro('')
    try {
      await aoAbrir(id)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  async function salvarNome(evento: FormEvent, id: string) {
    evento.preventDefault()
    setErro('')
    try {
      await fonte.renomearConversa?.(id, nome)
      setEditando(null)
      setReleitura((n) => n + 1)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  async function arquivar(id: string) {
    setErro('')
    try {
      await fonte.arquivarConversa?.(id)
      setConversas((atuais) => atuais?.filter((c) => c.id !== id) ?? null)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  if (!conversas) return erro ? <Mensagem tipo="erro">{erro}</Mensagem> : null
  if (ocultarVazio && conversas.length === 0) return null
  const grupos = agruparConversas(conversas, busca)

  return (
    <section aria-label="Conversas anteriores" className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="rotulo">Conversas anteriores</h2>
        {aoNova && (
          <button type="button" onClick={aoNova} className={BOTAO_SECUNDARIO}>
            <Plus strokeWidth={1.8} className="size-4" aria-hidden />
            Nova conversa
          </button>
        )}
      </div>
      <label className="flex items-center gap-2 rounded-md border border-al-line px-3 py-1.5 focus-within:border-al-line-forte">
        <Search strokeWidth={1.8} className="size-4 shrink-0 text-al-muted" aria-hidden />
        <input
          aria-label="Buscar nas Conversas"
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Buscar"
          className="min-w-0 flex-1 bg-transparent text-sm focus-visible:outline-none"
        />
      </label>
      <Mensagem tipo="erro">{erro}</Mensagem>
      {grupos.length === 0 && (
        <p className="text-sm text-al-muted">{busca.trim() ? 'Nenhuma Conversa com esse texto.' : 'Nenhuma Conversa ainda.'}</p>
      )}
      {grupos.map((grupo) => (
        <div key={grupo.nome} className="flex flex-col gap-2">
          <h3 className="text-sm text-al-muted">{grupo.nome}</h3>
          <ul className="rounded-lg overflow-hidden flex flex-col divide-y divide-al-line border border-al-line">
            {grupo.conversas.map((conversa) => {
              const titulo = nomeDaConversa(conversa)
              return (
                <li
                  key={conversa.id}
                  aria-current={conversa.id === atual ? 'true' : undefined}
                  className={cn('flex flex-col gap-2 py-3 pr-3 pl-4', conversa.id === atual && 'bg-al-surface')}
                >
                  {editando === conversa.id ? (
                    <form onSubmit={(evento) => salvarNome(evento, conversa.id)} className="flex items-center gap-2">
                      <input
                        aria-label="Novo nome da Conversa"
                        value={nome}
                        maxLength={80}
                        onChange={(evento) => setNome(evento.target.value)}
                        className="min-w-0 flex-1 rounded-md border border-al-line bg-transparent px-2 py-1 text-sm"
                      />
                      <button type="submit" aria-label="Salvar o nome" className={BOTAO_DISCRETO}>
                        <Check strokeWidth={1.8} className="size-4" aria-hidden />
                      </button>
                      <button type="button" aria-label="Cancelar" onClick={() => setEditando(null)} className={BOTAO_DISCRETO}>
                        <X strokeWidth={1.8} className="size-4" aria-hidden />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <MessageSquare strokeWidth={1.8} className="size-4 shrink-0 text-al-muted" aria-hidden />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{titulo}</span>
                          <span className="text-sm text-al-muted">
                            {formatarDataCompleta(conversa.atualizadaEm)}
                            {conversa.emAndamento && ' · respondendo'}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {fonte.renomearConversa && (
                          <button
                            type="button"
                            aria-label={`Renomear a Conversa ${titulo}`}
                            onClick={() => {
                              setNome(conversa.titulo ?? '')
                              setEditando(conversa.id)
                            }}
                            className={BOTAO_DISCRETO}
                          >
                            <Pencil strokeWidth={1.8} className="size-4" aria-hidden />
                          </button>
                        )}
                        {fonte.arquivarConversa && (
                          <button
                            type="button"
                            aria-label={`Arquivar a Conversa ${titulo}`}
                            onClick={() => arquivar(conversa.id)}
                            className={BOTAO_DISCRETO}
                          >
                            <Archive strokeWidth={1.8} className="size-4" aria-hidden />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => abrir(conversa.id)}
                          aria-label={`Abrir a Conversa ${titulo}`}
                          className={BOTAO_SECUNDARIO}
                        >
                          Abrir
                        </button>
                      </span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {haMais && !busca.trim() && (
        <button type="button" onClick={carregarMais} className={BOTAO_DISCRETO}>
          Carregar mais
        </button>
      )}
    </section>
  )
}
