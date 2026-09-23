import { ArrowUp, Building2 } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { IconeDaEspecialidade } from '@/components/marca'
import { ListaDeMencoes, useMencao } from '@/conversa/mencao'
import { useDados } from '@/fonte/contexto'

interface Props {
  /** Nome do formulário, para leitores de tela. */
  nome: string
  /** Rótulo do campo, só para leitores de tela: o texto de ajuda vai no placeholder. */
  rotulo: string
  placeholder: string
  /** Na página de Agentes, a faixa de baixo mostra também as Especialidades. */
  comEspecialidades?: boolean
  /** Enquanto a Coordenação trabalha, o pedido seguinte espera. */
  ocupado?: boolean
  aoEnviar: (texto: string) => void
}

/**
 * O composer da Coordenação: uma superfície arredondada com um campo que cresce com a mensagem e,
 * na faixa de baixo, o Workspace, as Especialidades e o Enviar. O @ abre o autocompletar de Agentes.
 */
export function Composer({ nome, rotulo, placeholder, comEspecialidades = false, ocupado = false, aoEnviar }: Props) {
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const agentes = useDados((fonte) => fonte.agentes(), []) ?? []
  const especialidades = useDados((fonte) => fonte.especialidades(), [])
  const [texto, setTexto] = useState('')
  const mencao = useMencao(texto, setTexto, agentes)
  const campo = useRef<HTMLTextAreaElement>(null)
  const idDoCampo = useId()
  const idDasMencoes = useId()
  const podeEnviar = !!texto.trim() && !ocupado

  // Cresce com a mensagem até o limite do CSS, e só então rola.
  useLayoutEffect(() => {
    const elemento = campo.current
    if (!elemento) return
    elemento.style.height = 'auto'
    elemento.style.height = `${elemento.scrollHeight}px`
  }, [texto])

  function enviar(evento?: FormEvent) {
    evento?.preventDefault()
    if (!podeEnviar) return
    aoEnviar(texto.trim())
    setTexto('')
  }

  function aoTeclar(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (mencao.aoTeclar(evento)) return
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault()
      enviar()
    }
  }

  return (
    <form
      aria-label={nome}
      onSubmit={enviar}
      onClick={(evento) => {
        if (!(evento.target as HTMLElement).closest('button, textarea, [role="option"]')) campo.current?.focus()
      }}
      className="composer relative"
    >
      {mencao.aberta && (
        <ListaDeMencoes
          id={idDasMencoes}
          opcoes={mencao.opcoes}
          indice={mencao.indice}
          aoSelecionar={mencao.selecionar}
          className="absolute bottom-full left-4 mb-2 w-96"
        />
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
        placeholder={placeholder}
      />
      <div className="flex items-center gap-1.5 pt-1.5 pr-2.5 pb-2.5 pl-3.5">
        <span className="inline-flex h-7.5 items-center gap-1.5 rounded-full bg-al-bg pr-3 pl-2.5 text-sm whitespace-nowrap">
          <Building2 strokeWidth={1.8} className="size-3.5 text-al-muted" aria-hidden />
          <span className="rotulo text-[0.5625rem]">Workspace</span>
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
        <button
          type="submit"
          disabled={!podeEnviar}
          className="group ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-al-ink bg-al-ink pr-3 pl-4 text-xs font-normal tracking-rotulo whitespace-nowrap text-al-bg uppercase transition-colors disabled:border-al-line disabled:bg-transparent disabled:text-al-muted"
        >
          Enviar
          <span
            className="grid size-5.5 place-items-center rounded-full bg-al-bg text-al-ink group-disabled:bg-al-line group-disabled:text-al-muted"
            aria-hidden
          >
            <ArrowUp strokeWidth={1.8} className="size-3.5" />
          </span>
        </button>
      </div>
    </form>
  )
}
