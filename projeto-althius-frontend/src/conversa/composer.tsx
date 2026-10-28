import { ArrowUp, Building2, FileText, Image as IconeDeImagem, Paperclip, Plus, Square, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { IconeDaEspecialidade } from '@/components/marca'
import { Link, useNavigate } from 'react-router-dom'
import { classificarPedido, type ClassificacaoDoPedido } from '@/conversa/classificar-pedido'
import { CartaoDaVitrine } from '@/paginas/sinais/vitrine-pecas'
import {
  ACEITOS_ARQUIVO,
  ACEITOS_IMAGEM,
  formatarTamanho,
  MAXIMO_DE_ANEXOS,
  motivoParaRecusar,
  nomeCurto,
  type EstadoDoAnexo,
} from '@/conversa/anexos-do-composer'
import { ListaDeMencoes, useMencao } from '@/conversa/mencao'
import { useDados, useFonte } from '@/fonte/contexto'
import type { AnexoDaMensagem } from '@/fonte/tipos'
import { cn, mensagemDeErro } from '@/lib/utils'

interface Props {
  /** Nome do formulário, para leitores de tela. */
  nome: string
  /** Rótulo do campo, só para leitores de tela: o texto de ajuda vai no placeholder. */
  rotulo: string
  placeholder: string
  /** Na página de Agentes, a faixa de baixo mostra também as Especialidades. */
  comEspecialidades?: boolean
  /** Enquanto o pedido anterior roda, o seguinte espera. */
  ocupado?: boolean
  aoEnviar: (texto: string, anexos: AnexoDaMensagem[]) => void
  /** Com ele, o Enviar vira Parar enquanto o pedido roda. */
  aoParar?: () => void
  /** Classifica pedidos do composer inicial antes de encaminhar à conversa. */
  classificarIntencao?: boolean
  /** Só o Workspace operacional abre o Plano no composer; a Demonstração mantém o fluxo simulado. */
  criarSinalNoComposer?: boolean
}

let proximaChave = 1

/** A miniatura da imagem antes de subir; sem ela (navegador que não cria a URL), o chip mostra o ícone. */
function miniaturaLocal(arquivo: File): string | undefined {
  try {
    return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(arquivo) : undefined
  } catch {
    return undefined
  }
}

/**
 * O composer da Coordenação e da Conversa com um Agente, no padrão de prompt input: uma caixa arredondada com a faixa
 * de anexos em cima, o campo que cresce com a mensagem e, embaixo, o "+" para anexar, o Workspace, as Especialidades, a
 * dica do teclado e o Enviar (que vira Parar enquanto o pedido roda). Dá para arrastar e soltar ou colar uma imagem. O @
 * abre o autocompletar de Agentes. Os anexos só existem onde há onde guardá-los (o Workspace operacional).
 */
export function Composer({ nome, rotulo, placeholder, comEspecialidades = false, ocupado = false, aoEnviar, aoParar, classificarIntencao = false, criarSinalNoComposer = false }: Props) {
  const fonte = useFonte()
  const navegar = useNavigate()
  const workspace = useDados((f) => f.workspace(), [])
  const agentes = useDados((f) => f.agentes(), []) ?? []
  const especialidades = useDados((f) => f.especialidades(), [])
  const [texto, setTexto] = useState('')
  const [anexos, setAnexos] = useState<EstadoDoAnexo[]>([])
  const [aviso, setAviso] = useState('')
  const [classificacao, setClassificacao] = useState<ClassificacaoDoPedido | null>(null)
  const [briefingDoSinal, setBriefingDoSinal] = useState('')
  const [menuAberto, setMenuAberto] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const mencao = useMencao(texto, setTexto, agentes)
  const campo = useRef<HTMLTextAreaElement>(null)
  const seletorDeArquivo = useRef<HTMLInputElement>(null)
  const seletorDeImagem = useRef<HTMLInputElement>(null)
  const idDoCampo = useId()
  const idDasMencoes = useId()
  const idDoMenu = useId()
  const comAnexos = typeof fonte.anexarArquivo === 'function'
  const subindo = anexos.some((anexo) => anexo.estado === 'subindo')
  const podeEnviar = !!texto.trim() && !ocupado && !subindo
  const previas = useRef(new Set<string>())

  // Cresce com a mensagem até o limite do CSS, e só então rola.
  useLayoutEffect(() => {
    const elemento = campo.current
    if (!elemento) return
    elemento.style.height = 'auto'
    elemento.style.height = `${elemento.scrollHeight}px`
  }, [texto])

  // As miniaturas locais saem da memória quando o composer sai da tela.
  useEffect(() => {
    const abertas = previas.current
    return () => abertas.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function atualizar(chave: string, mudanca: (anexo: EstadoDoAnexo) => EstadoDoAnexo) {
    setAnexos((atuais) => atuais.map((anexo) => (anexo.chave === chave ? mudanca(anexo) : anexo)))
  }

  async function anexar(arquivos: File[]) {
    if (!comAnexos || arquivos.length === 0) return
    setAviso('')
    let quantos = anexos.filter((anexo) => anexo.estado !== 'falhou').length
    for (const arquivo of arquivos) {
      const motivo = motivoParaRecusar(arquivo, quantos)
      if (motivo) {
        setAviso(motivo)
        continue
      }
      quantos++
      const chave = `anexo-${proximaChave++}`
      const previa = arquivo.type.startsWith('image/') ? miniaturaLocal(arquivo) : undefined
      if (previa) previas.current.add(previa)
      setAnexos((atuais) => [...atuais, { chave, estado: 'subindo', nome: arquivo.name, tamanho: arquivo.size, previa }])
      fonte.anexarArquivo!(arquivo).then(
        (anexo) => atualizar(chave, (atual) => ({ ...atual, estado: 'pronto', anexo })),
        (falha) => atualizar(chave, (atual) => ({ ...atual, estado: 'falhou', motivo: mensagemDeErro(falha) })),
      )
    }
  }

  function remover(chave: string) {
    const anexo = anexos.find((a) => a.chave === chave)
    setAnexos((atuais) => atuais.filter((a) => a.chave !== chave))
    if (anexo?.estado === 'pronto') void fonte.removerAnexo?.(anexo.anexo.id).catch(() => {})
    if (anexo?.previa) {
      URL.revokeObjectURL(anexo.previa)
      previas.current.delete(anexo.previa)
    }
  }

  function enviar(evento?: FormEvent) {
    evento?.preventDefault()
    if (!podeEnviar) return
    if (classificarIntencao) {
      const resultado = classificarPedido(texto.trim())
      if (resultado.caminho !== 'geral') {
        setBriefingDoSinal(resultado.caminho === 'plano_novo' ? texto.trim() : '')
        setClassificacao(resultado)
        setTexto('')
        setAnexos([])
        setAviso('')
        return
      }
      setClassificacao(null)
    }
    const prontos = anexos.flatMap((anexo) => (anexo.estado === 'pronto' ? [anexo.anexo] : []))
    aoEnviar(texto.trim(), prontos)
    setTexto('')
    setAnexos([])
    setAviso('')
  }

  function aoTeclar(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (mencao.aoTeclar(evento)) return
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault()
      enviar()
    }
  }

  function aoColar(evento: ClipboardEvent<HTMLTextAreaElement>) {
    if (!comAnexos) return
    const imagens = Array.from(evento.clipboardData?.files ?? []).filter((arquivo) => arquivo.type.startsWith('image/'))
    if (imagens.length === 0) return
    evento.preventDefault()
    void anexar(imagens)
  }

  const temArquivos = (evento: DragEvent) => Array.from(evento.dataTransfer?.types ?? []).includes('Files')

  return (
    <form
      aria-label={nome}
      onSubmit={enviar}
      onClick={(evento) => {
        if (!(evento.target as HTMLElement).closest('button, textarea, input, a, [role="option"], [role="menu"]')) {
          campo.current?.focus()
        }
      }}
      onDragOver={(evento) => {
        if (!comAnexos || !temArquivos(evento)) return
        evento.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setArrastando(false)
      }}
      onDrop={(evento) => {
        if (!comAnexos) return
        evento.preventDefault()
        setArrastando(false)
        void anexar(Array.from(evento.dataTransfer.files))
      }}
      className="composer relative"
    >
      {arrastando && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[inherit] border-2 border-dashed border-al-accent bg-al-bg/90 text-sm"
        >
          Solte para anexar
        </div>
      )}
      {mencao.aberta && (
        <ListaDeMencoes
          id={idDasMencoes}
          opcoes={mencao.opcoes}
          indice={mencao.indice}
          aoSelecionar={mencao.selecionar}
          className="absolute bottom-full left-4 mb-2 w-96"
        />
      )}
      {anexos.length > 0 && (
        <ul aria-label="Anexos do pedido" className="flex flex-wrap gap-2 px-3.5 pt-3">
          {anexos.map((anexo) => (
            <li
              key={anexo.chave}
              className={cn(
                'relative flex max-w-60 items-center gap-2 overflow-hidden rounded-md border bg-al-bg py-1.5 pr-1.5 pl-2 text-sm',
                anexo.estado === 'falhou' ? 'border-al-atencao' : 'border-al-line',
              )}
            >
              {anexo.previa ? (
                <img src={anexo.previa} alt="" className="size-8 shrink-0 rounded object-cover" />
              ) : (
                <FileText strokeWidth={1.8} className="size-5 shrink-0 text-al-muted" aria-hidden />
              )}
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate">{nomeCurto(anexo.nome)}</span>
                <span className="text-xs text-al-muted">
                  {anexo.estado === 'falhou' ? anexo.motivo : formatarTamanho(anexo.tamanho)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remover(anexo.chave)}
                aria-label={`Remover ${anexo.nome}`}
                className="grid size-6 shrink-0 place-items-center rounded-full text-al-muted hover:text-al-ink"
              >
                <X strokeWidth={1.8} className="size-3.5" aria-hidden />
              </button>
              {anexo.estado === 'subindo' && (
                <span
                  role="progressbar"
                  aria-label={`Enviando ${anexo.nome}`}
                  className="absolute right-0 bottom-0 left-0 h-0.5 animate-pulse bg-al-accent"
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={idDoCampo} className="sr-only">
        {rotulo}
      </label>
      <textarea
        ref={campo}
        id={idDoCampo}
        rows={1}
        value={texto}
        aria-controls={mencao.aberta ? idDasMencoes : undefined}
        onChange={(evento) => setTexto(evento.target.value)}
        onKeyDown={aoTeclar}
        onPaste={aoColar}
        placeholder={placeholder}
      />
      {aviso && (
        <p role="alert" className="px-3.5 text-sm text-al-atencao">
          {aviso}
        </p>
      )}
      {classificacao?.caminho === 'plano_novo' && criarSinalNoComposer && (
        <NavegarParaNovoSinal briefing={briefingDoSinal} aoNavegar={navegar} />
      )}
      {classificacao?.caminho === 'plano_novo' && !criarSinalNoComposer && (
        <div role="status" className="mx-3.5 rounded-md border border-al-line bg-al-bg p-3 text-sm">Entendi que você quer acompanhar algo novo. A criação por aqui está em construção.{' '}<Link className="text-al-accent underline" to="/sinais/novo">Descrever meu Sinal</Link></div>
      )}
      {classificacao?.caminho === 'modelo' && (
        <div role="status" className="mx-3.5 rounded-md border border-al-line bg-al-bg p-3 text-sm">
          <p className="mb-2">Encontrei Modelos que podem ajudar:</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {classificacao.modelos.map((modelo) => <CartaoDaVitrine key={modelo.id} card={modelo} ativos={0} abrirModelo mostrarAtivos={false} />)}
          </ul>
          <button type="button" className="mt-3 text-al-accent underline" onClick={() => setClassificacao(null)}>Descrever meu próprio Sinal</button>
        </div>
      )}
      <div className="flex items-center gap-1.5 pt-1.5 pr-2.5 pb-2.5 pl-3.5">
        {comAnexos && (
          <div className="relative">
            <button
              type="button"
              aria-label="Anexar"
              aria-haspopup="menu"
              aria-expanded={menuAberto}
              aria-controls={menuAberto ? idDoMenu : undefined}
              disabled={anexos.filter((a) => a.estado !== 'falhou').length >= MAXIMO_DE_ANEXOS}
              onClick={() => setMenuAberto((aberto) => !aberto)}
              className="grid size-7.5 place-items-center rounded-full bg-al-bg text-al-muted hover:text-al-ink disabled:opacity-50"
            >
              <Plus strokeWidth={1.8} className="size-4" aria-hidden />
            </button>
            {menuAberto && (
              <div
                id={idDoMenu}
                role="menu"
                className="absolute bottom-full left-0 z-20 mb-2 flex w-48 flex-col rounded-md border border-al-line bg-al-bg p-1 shadow-(--al-sombra-cartao)"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuAberto(false)
                    seletorDeArquivo.current?.click()
                  }}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-al-surface"
                >
                  <Paperclip strokeWidth={1.8} className="size-4 text-al-muted" aria-hidden />
                  Anexar arquivo
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuAberto(false)
                    seletorDeImagem.current?.click()
                  }}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-al-surface"
                >
                  <IconeDeImagem strokeWidth={1.8} className="size-4 text-al-muted" aria-hidden />
                  Anexar imagem
                </button>
              </div>
            )}
            <input
              ref={seletorDeArquivo}
              type="file"
              multiple
              accept={ACEITOS_ARQUIVO}
              aria-label="Escolher arquivos"
              className="sr-only"
              tabIndex={-1}
              onChange={(evento) => {
                void anexar(Array.from(evento.target.files ?? []))
                evento.target.value = ''
              }}
            />
            <input
              ref={seletorDeImagem}
              type="file"
              multiple
              accept={ACEITOS_IMAGEM}
              aria-label="Escolher imagens"
              className="sr-only"
              tabIndex={-1}
              onChange={(evento) => {
                void anexar(Array.from(evento.target.files ?? []))
                evento.target.value = ''
              }}
            />
          </div>
        )}
        <span className="inline-flex h-7.5 items-center gap-1.5 rounded-full bg-al-bg pr-3 pl-2.5 text-sm whitespace-nowrap">
          <Building2 strokeWidth={1.8} className="size-3.5 text-al-muted" aria-hidden />
          <span className="rotulo text-[0.6875rem]">Workspace</span>
          {workspace?.cliente}
        </span>
        {comEspecialidades && especialidades && (
          <ul
            aria-label="Especialidades disponíveis"
            className="inline-flex h-7.5 items-center gap-0.5 rounded-full bg-al-bg px-1"
          >
            {especialidades.map((especialidade) => (
              <li
                key={especialidade.id}
                title={especialidade.nome}
                className="grid size-6.5 place-items-center rounded-full text-al-muted hover:text-al-ink"
              >
                <IconeDaEspecialidade especialidade={especialidade.id} className="size-3.5" />
              </li>
            ))}
          </ul>
        )}
        <span className="ml-auto hidden text-xs text-al-muted md:inline">Enter envia, Shift+Enter quebra linha</span>
        {ocupado && aoParar ? (
          <button
            type="button"
            onClick={aoParar}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-al-ink bg-al-ink pr-3 pl-4 text-sm font-normal tracking-[0.04em] whitespace-nowrap text-al-bg"
          >
            Parar
            <span className="grid size-5.5 place-items-center rounded-full bg-al-bg text-al-ink" aria-hidden>
              <Square strokeWidth={1.8} className="size-3" />
            </span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!podeEnviar}
            className="group inline-flex h-9 items-center gap-1.5 rounded-full border border-al-ink bg-al-ink pr-3 pl-4 text-sm font-normal tracking-[0.04em] whitespace-nowrap text-al-bg transition-colors disabled:border-al-line disabled:bg-transparent disabled:text-al-muted max-md:ml-auto"
          >
            Enviar
            <span
              className="grid size-5.5 place-items-center rounded-full bg-al-bg text-al-ink group-disabled:bg-al-line group-disabled:text-al-muted"
              aria-hidden
            >
              <ArrowUp strokeWidth={1.8} className="size-3.5" />
            </span>
          </button>
        )}
      </div>
    </form>
  )
}

function NavegarParaNovoSinal({ briefing, aoNavegar }: { briefing: string; aoNavegar: ReturnType<typeof useNavigate> }) {
  useEffect(() => { aoNavegar('/sinais/novo', { state: { briefing, origem: 'composer' } }) }, [aoNavegar, briefing])
  return null
}
