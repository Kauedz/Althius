import { Archive, Check, MessageSquare, Pencil, Plus, Search, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { BOTAO_DISCRETO } from '@/components/botoes'
import { Mensagem } from '@/components/mensagem'
import { useFonte } from '@/fonte/contexto'
import { formatarDataCompleta } from '@/fonte/formatar-data'
import { nomeDaConversa, type AgenteId, type ResumoDeConversa } from '@/fonte/tipos'
import { cn, mensagemDeErro } from '@/lib/utils'
import { agruparConversas, rotuloDeQuando } from './historico-grupos'

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
  /**
   * `lateral`: a coluna ao lado da Conversa com um Agente (linhas enxutas, ação ao passar o mouse). `pagina`: a lista da
   * página de Agentes, num quadro, com o primeiro pedido embaixo do nome.
   */
  variante?: 'lateral' | 'pagina'
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

function Historico({ agenteId, atual, aoAbrir, aoNova, versao, ocultarVazio, variante = 'lateral', className }: Props) {
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

  const naPagina = variante === 'pagina'

  return (
    <section aria-label="Conversas anteriores" className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="rotulo">Conversas anteriores</h2>
        {aoNova && (
          <button
            type="button"
            onClick={aoNova}
            className="rounded-lg inline-flex h-8 shrink-0 items-center gap-1.5 border border-al-line bg-al-bg px-3 text-sm text-al-ink transition-colors hover:border-al-muted hover:bg-al-surface"
          >
            <Plus strokeWidth={1.8} className="size-4" aria-hidden />
            Nova conversa
          </button>
        )}
      </div>
      <label className="flex items-center gap-2 rounded-full border border-al-line bg-al-bg px-3.5 py-1.5 transition-colors focus-within:border-al-ink-muted">
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
        <p className="px-1 text-sm text-al-muted">{busca.trim() ? 'Nenhuma Conversa com esse texto.' : 'Nenhuma Conversa ainda.'}</p>
      )}
      {grupos.map((grupo) => (
        <div key={grupo.nome} className="flex flex-col gap-1">
          <h3 className="rotulo px-3 pt-2 pb-1 text-[0.6875rem]">{grupo.nome}</h3>
          <ul
            className={cn(
              'flex flex-col gap-0.5',
              naPagina && 'cartao overflow-hidden divide-y divide-al-line p-1',
            )}
          >
            {grupo.conversas.map((conversa) => {
              const titulo = nomeDaConversa(conversa)
              const ativa = conversa.id === atual
              const resumo = naPagina && conversa.titulo && conversa.primeiroPedido && conversa.primeiroPedido !== conversa.titulo
                ? conversa.primeiroPedido
                : null
              return (
                <li
                  key={conversa.id}
                  aria-current={ativa ? 'true' : undefined}
                  className={cn(
                    'group relative rounded-xl transition-colors',
                    ativa ? 'bg-al-surface shadow-(--al-sombra-cartao) ring-1 ring-al-line' : 'hover:bg-al-hover',
                    naPagina && 'rounded-lg',
                  )}
                >
                  {editando === conversa.id ? (
                    <form onSubmit={(evento) => salvarNome(evento, conversa.id)} className="flex items-center gap-2 px-2.5 py-2">
                      <input
                        aria-label="Novo nome da Conversa"
                        value={nome}
                        maxLength={80}
                        onChange={(evento) => setNome(evento.target.value)}
                        className="min-w-0 flex-1 rounded-md border border-al-line bg-al-bg px-2 py-1 text-sm"
                      />
                      <button type="submit" aria-label="Salvar o nome" className={BOTAO_DISCRETO}>
                        <Check strokeWidth={1.8} className="size-4" aria-hidden />
                      </button>
                      <button type="button" aria-label="Cancelar" onClick={() => setEditando(null)} className={BOTAO_DISCRETO}>
                        <X strokeWidth={1.8} className="size-4" aria-hidden />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => abrir(conversa.id)}
                        aria-label={`Abrir a Conversa ${titulo}`}
                        className="flex w-full min-w-0 items-center gap-3 rounded-[inherit] px-3 py-2.5 text-left"
                      >
                        <MessageSquare
                          strokeWidth={1.8}
                          className={cn('size-4 shrink-0', ativa ? 'text-al-accent' : 'text-al-muted')}
                          aria-hidden
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={cn('truncate text-[0.9375rem] leading-snug', ativa && 'font-medium')}>{titulo}</span>
                          {resumo && <span className="truncate text-sm text-al-muted">{resumo}</span>}
                        </span>
                        {conversa.emAndamento ? (
                          <span className="rotulo flex shrink-0 items-center gap-1.5 text-[0.6875rem] text-al-accent group-hover:invisible group-focus-within:invisible">
                            <span className="size-1.5 animate-pulse rounded-full bg-al-accent" aria-hidden />
                            respondendo
                          </span>
                        ) : (
                          <time
                            dateTime={conversa.atualizadaEm}
                            title={formatarDataCompleta(conversa.atualizadaEm)}
                            className="shrink-0 text-xs text-al-muted tabular-nums group-hover:invisible group-focus-within:invisible"
                          >
                            {rotuloDeQuando(conversa.atualizadaEm)}
                          </time>
                        )}
                      </button>
                      <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5 rounded-lg bg-al-surface/90 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        {fonte.renomearConversa && (
                          <button
                            type="button"
                            aria-label={`Renomear a Conversa ${titulo}`}
                            onClick={() => {
                              setNome(conversa.titulo ?? '')
                              setEditando(conversa.id)
                            }}
                            className={cn(BOTAO_DISCRETO, 'size-7 justify-center px-0')}
                          >
                            <Pencil strokeWidth={1.8} className="size-4" aria-hidden />
                          </button>
                        )}
                        {fonte.arquivarConversa && (
                          <button
                            type="button"
                            aria-label={`Arquivar a Conversa ${titulo}`}
                            onClick={() => arquivar(conversa.id)}
                            className={cn(BOTAO_DISCRETO, 'size-7 justify-center px-0')}
                          >
                            <Archive strokeWidth={1.8} className="size-4" aria-hidden />
                          </button>
                        )}
                      </span>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {haMais && !busca.trim() && (
        <button type="button" onClick={carregarMais} className={cn(BOTAO_DISCRETO, 'self-start')}>
          Carregar mais
        </button>
      )}
    </section>
  )
}
