import { FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatarTamanho, nomeCurto } from '@/conversa/anexos-do-composer'
import { useFonte } from '@/fonte/contexto'
import type { AnexoDaMensagem } from '@/fonte/tipos'
import { mensagemDeErro } from '@/lib/utils'

/** Os anexos de um pedido enviado: miniatura na imagem, ícone no arquivo; abrir pede uma URL assinada curta. */
export function AnexosDaMensagem({ anexos, className }: { anexos?: AnexoDaMensagem[]; className?: string }) {
  const [erro, setErro] = useState('')
  if (!anexos?.length) return null
  return (
    <div className={className}>
      <ul aria-label="Anexos" className="flex flex-wrap justify-end gap-2">
        {anexos.map((anexo) => (
          <li key={anexo.id}>
            <Anexo anexo={anexo} aoFalhar={setErro} />
          </li>
        ))}
      </ul>
      {erro && (
        <p role="alert" className="mt-1 text-right text-sm text-al-atencao">
          {erro}
        </p>
      )}
    </div>
  )
}

function Anexo({ anexo, aoFalhar }: { anexo: AnexoDaMensagem; aoFalhar: (motivo: string) => void }) {
  const fonte = useFonte()
  const [miniatura, setMiniatura] = useState<string | null>(null)

  useEffect(() => {
    if (anexo.tipo !== 'imagem' || !fonte.urlDoAnexo) return
    let ativo = true
    fonte.urlDoAnexo(anexo.id).then((url) => ativo && setMiniatura(url), () => {})
    return () => {
      ativo = false
    }
  }, [anexo.id, anexo.tipo, fonte])

  async function abrir() {
    if (!fonte.urlDoAnexo) return
    // A janela abre já, no clique, para o navegador não bloquear; o endereço chega depois.
    const janela = window.open('', '_blank')
    try {
      const url = await fonte.urlDoAnexo(anexo.id)
      if (janela) {
        janela.opener = null
        janela.location.href = url
      } else window.open(url, '_blank', 'noopener')
    } catch (falha) {
      janela?.close()
      aoFalhar(mensagemDeErro(falha))
    }
  }

  return (
    <button
      type="button"
      onClick={abrir}
      aria-label={`Abrir o anexo ${anexo.nome}`}
      className="flex max-w-60 items-center gap-2 rounded-md border border-al-line bg-al-bg py-1.5 pr-3 pl-2 text-left text-sm hover:border-al-muted"
    >
      {miniatura ? (
        <img src={miniatura} alt="" className="size-8 shrink-0 rounded object-cover" />
      ) : (
        <FileText strokeWidth={1.8} className="size-5 shrink-0 text-al-muted" aria-hidden />
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate">{nomeCurto(anexo.nome)}</span>
        <span className="text-xs text-al-muted">{formatarTamanho(anexo.tamanho)}</span>
      </span>
    </button>
  )
}
