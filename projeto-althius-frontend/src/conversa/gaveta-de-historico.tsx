import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BOTAO_DISCRETO } from '@/components/botoes'
import { Mensagem } from '@/components/mensagem'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useFonte } from '@/fonte/contexto'
import type { AgenteId, FonteDeAgentes, ResumoDeConversa } from '@/fonte/tipos'
import { mensagemDeErro } from '@/lib/utils'
import { agruparConversas } from './historico-grupos'
import { LinhaDeConversa } from './linha-de-conversa'

export const POR_PAGINA = 30

/** A Demonstração não tem histórico: as telas escondem o botão e o bloco Recentes. */
export function temHistorico(fonte: Pick<FonteDeAgentes, 'historicoDeConversas'>): boolean {
  return typeof fonte.historicoDeConversas === 'function'
}

interface Controle {
  conversas: ResumoDeConversa[] | null
  haMais: boolean
  erro: string
  busca: string
  definirBusca(valor: string): void
  carregarMais(): Promise<void>
  editando: string | null
  nome: string
  definirNome(valor: string): void
  iniciarRenome(conversa: ResumoDeConversa): void
  cancelarRenome(): void
  salvarNome(evento: FormEvent, id: string): Promise<void>
  arquivar(id: string): Promise<void>
  podeRenomear: boolean
  podeArquivar: boolean
  definirErro(mensagem: string): void
  /** Escape da edição não fecha a gaveta: vale no mesmo instante do teclado, antes do render. */
  editandoAgora(): string | null
}

/** A lista de Conversas, com busca, páginas, renomear e arquivar. `ativo` adia a leitura até a gaveta abrir. */
export function useHistoricoDeConversas(agenteId: AgenteId | null, versao?: unknown, ativo = true): Controle {
  const fonte = useFonte()
  const [conversas, setConversas] = useState<ResumoDeConversa[] | null>(null)
  const [haMais, setHaMais] = useState(false)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [releitura, setReleitura] = useState(0)
  const editandoRef = useRef<string | null>(null)

  function marcarEdicao(id: string | null) {
    editandoRef.current = id
    setEditando(id)
  }

  useEffect(() => {
    if (!ativo || !fonte.historicoDeConversas) return
    let vivo = true
    fonte.historicoDeConversas(agenteId).then(
      (lista) => {
        if (!vivo) return
        setConversas(lista)
        setHaMais(lista.length >= POR_PAGINA)
        setErro('')
      },
      (falha) => {
        if (vivo) setErro(mensagemDeErro(falha))
      },
    )
    return () => {
      vivo = false
    }
  }, [fonte, agenteId, versao, releitura, ativo])

  async function carregarMais() {
    const ultima = conversas?.at(-1)
    if (!ultima || !fonte.historicoDeConversas) return
    try {
      const pagina = await fonte.historicoDeConversas(agenteId, ultima.atualizadaEm)
      setConversas((atuais) => {
        const ids = new Set((atuais ?? []).map((conversa) => conversa.id))
        return [...(atuais ?? []), ...pagina.filter((conversa) => !ids.has(conversa.id))]
      })
      setHaMais(pagina.length >= POR_PAGINA)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  async function salvarNome(evento: FormEvent, id: string) {
    evento.preventDefault()
    setErro('')
    try {
      await fonte.renomearConversa?.(id, nome)
      marcarEdicao(null)
      setReleitura((n) => n + 1)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  async function arquivar(id: string) {
    setErro('')
    try {
      await fonte.arquivarConversa?.(id)
      setConversas((atuais) => atuais?.filter((conversa) => conversa.id !== id) ?? null)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return {
    conversas,
    haMais,
    erro,
    busca,
    definirBusca: setBusca,
    carregarMais,
    editando,
    nome,
    definirNome: setNome,
    iniciarRenome(conversa) {
      setNome(conversa.titulo ?? '')
      marcarEdicao(conversa.id)
    },
    cancelarRenome() {
      marcarEdicao(null)
    },
    salvarNome,
    arquivar,
    podeRenomear: typeof fonte.renomearConversa === 'function',
    podeArquivar: typeof fonte.arquivarConversa === 'function',
    definirErro: setErro,
    editandoAgora: () => editandoRef.current,
  }
}

interface Props {
  aberto: boolean
  aoMudar(aberto: boolean): void
  /** O Agente do histórico, ou nulo para a Coordenação. */
  agenteId: AgenteId | null
  /** O nome do Agente, no título. Sem Agente, o título é "Conversas coordenadas". */
  nome?: string
  atual?: string | null
  aoAbrir(conversa: ResumoDeConversa): Promise<void> | void
  /** Muda quando a lista deve ser lida de novo. */
  versao?: unknown
  /** Instante fixo para o tempo relativo. Nos testes, deixa os grupos determinísticos. */
  agora?: Date
}

/**
 * O histórico de Conversas num dialog lateral. Só existe onde as Conversas ficam no banco; na Demonstração, não
 * renderiza nada.
 */
export function GavetaDeHistorico(props: Props) {
  const fonte = useFonte()
  if (!temHistorico(fonte)) return null
  return <Gaveta {...props} />
}

function Gaveta({ aberto, aoMudar, agenteId, nome, atual, aoAbrir, versao, agora }: Props) {
  const historico = useHistoricoDeConversas(agenteId, versao, aberto)
  const buscaRef = useRef<HTMLInputElement>(null)
  const retornoDoFoco = useRef<HTMLElement | null>(null)
  const estavaAberto = useRef(false)
  const instante = agora ?? new Date()
  const [esquerda, setEsquerda] = useState('0px')
  const titulo = agenteId == null ? 'Conversas coordenadas' : `Conversas do ${nome ?? 'Agente'}`

  // O clique no véu não devolve o foco sozinho: guarda quem abriu, antes de o dialog mover o foco para a busca.
  if (aberto && !estavaAberto.current) {
    const ativo = document.activeElement
    if (ativo instanceof HTMLElement && ativo !== document.body) retornoDoFoco.current = ativo
  }
  estavaAberto.current = aberto

  useEffect(() => {
    if (!aberto) return
    const grade = document.querySelector('main')?.parentElement
    const medida = grade ? getComputedStyle(grade).getPropertyValue('--barra-lateral').trim() : ''
    setEsquerda(medida || '0px')
  }, [aberto])

  // O clique no véu não devolve o foco no jsdom (o dialog só restaura se o browser anuncia
  // `focus({ preventScroll })`). A gente devolve no microtask, depois do dialog desmontar.
  function devolverFoco() {
    const destino = retornoDoFoco.current
    if (!destino?.isConnected) return
    queueMicrotask(() => destino.focus())
  }

  function lidar(proximo: boolean, detalhes: { reason: string }) {
    if (!proximo && detalhes.reason === 'escape-key' && historico.editandoAgora()) {
      historico.cancelarRenome()
      return
    }
    if (!proximo) devolverFoco()
    aoMudar(proximo)
  }

  async function abrir(conversa: ResumoDeConversa) {
    try {
      await aoAbrir(conversa)
      devolverFoco()
      aoMudar(false)
    } catch (falha) {
      historico.definirErro(mensagemDeErro(falha))
    }
  }

  const carregando = historico.conversas === null && !historico.erro
  const grupos = agruparConversas(historico.conversas ?? [], historico.busca, instante)

  return (
    <Dialog open={aberto} onOpenChange={lidar}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="gaveta-veu"
          className="fixed top-0 right-0 bottom-0 z-40"
          style={{ left: esquerda, background: 'rgba(19,19,19,.16)' }}
        />
        <DialogPrimitive.Popup
          initialFocus={buscaRef}
          finalFocus={retornoDoFoco}
          aria-modal="true"
          className="fixed top-0 right-0 z-50 flex h-dvh w-[380px] max-w-full flex-col border-l border-al-line bg-al-surface shadow-(--al-sombra-flutuante)"
          style={{ maxWidth: `min(380px, calc(100% - ${esquerda}))` }}
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
            <DialogPrimitive.Title className="rotulo min-w-0 truncate">{titulo}</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Fechar" className={`${BOTAO_DISCRETO} size-8 justify-center px-0`}>
              <X strokeWidth={1.8} className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <label className="mx-4 mb-2 flex items-center gap-2 rounded-[10px] border border-al-line px-3 py-1.5 focus-within:border-al-line-forte">
            <Search strokeWidth={1.8} className="size-4 shrink-0 text-al-muted" aria-hidden />
            <input
              ref={buscaRef}
              aria-label="Buscar conversas"
              value={historico.busca}
              placeholder="Buscar conversas"
              onChange={(evento) => historico.definirBusca(evento.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm"
            />
          </label>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-4">
            {historico.erro && <Mensagem tipo="erro">{historico.erro}</Mensagem>}
            {carregando && (
              <div className="flex flex-col gap-1 px-2">
                <p role="status" className="sr-only">
                  Carregando conversas
                </p>
                {Array.from({ length: 5 }, (_, indice) => (
                  <Skeleton key={indice} className="h-[52px] w-full" />
                ))}
              </div>
            )}
            {!carregando && grupos.length === 0 && historico.conversas !== null && (
              <p className="px-2 text-sm text-al-muted">
                {historico.busca.trim() ? 'Nenhuma Conversa com esse texto.' : 'Nenhuma Conversa ainda.'}
              </p>
            )}
            {grupos.map((grupo) => (
              <div key={grupo.nome} className="flex flex-col">
                <h3 className="rotulo px-2 py-1.5 text-[0.6875rem]">{grupo.nome}</h3>
                <ul>
                  {grupo.conversas.map((conversa) => (
                    <LinhaDeConversa
                      key={conversa.id}
                      conversa={conversa}
                      atual={conversa.id === atual}
                      agora={instante}
                      editando={historico.editando === conversa.id}
                      nome={historico.nome}
                      aoMudarNome={historico.definirNome}
                      aoAbrir={() => void abrir(conversa)}
                      aoIniciarRenome={historico.podeRenomear ? () => historico.iniciarRenome(conversa) : undefined}
                      aoCancelarRenome={historico.cancelarRenome}
                      aoSalvarNome={(evento) => void historico.salvarNome(evento, conversa.id)}
                      aoArquivar={historico.podeArquivar ? () => void historico.arquivar(conversa.id) : undefined}
                    />
                  ))}
                </ul>
              </div>
            ))}
            {historico.haMais && !historico.busca.trim() && (
              <button type="button" onClick={() => void historico.carregarMais()} className={`${BOTAO_DISCRETO} self-center`}>
                Carregar mais
              </button>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </Dialog>
  )
}
