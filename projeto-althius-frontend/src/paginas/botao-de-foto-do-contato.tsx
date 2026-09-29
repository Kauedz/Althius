import { Camera, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import type { Contato } from '@/fonte/contas-tipos'
import { useFonteDeContas } from '@/fonte/contexto'
import { cn } from '@/lib/utils'

const DICAS = {
  nunca: 'Buscar a foto pública do LinkedIn',
  'nao-encontrada': 'O perfil não tem foto pública. Buscar de novo',
  falhou: 'A última busca falhou. Tentar de novo',
} as const

/**
 * A ação de buscar a foto pública do Contato pelo LinkedIn dele. Só aparece quando a fonte oferece a busca (o
 * Workspace operacional), o Contato tem LinkedIn e ainda não tem foto. A busca parte do clique, nunca da lista; o
 * resultado chega pela própria fonte, que avisa a tela, e sem foto o avatar segue com as iniciais.
 */
export function BotaoDeFotoDoContato({ contato }: { contato: Contato }) {
  const fonte = useFonteDeContas()
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState<string>()
  if (!fonte.consultarFotoDoContato || !contato.linkedin || contato.foto) return null

  const dica = erro ?? DICAS[contato.fotoConsulta ?? 'nunca']

  async function buscar() {
    setBuscando(true)
    setErro(undefined)
    try {
      await fonte.consultarFotoDoContato!(contato.id)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível buscar a foto agora.')
    } finally {
      setBuscando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={buscar}
        disabled={buscando}
        aria-label={`Buscar foto de ${contato.nome}`}
        title={dica}
        className={cn(
          'grid size-6 shrink-0 cursor-pointer place-items-center text-al-muted hover:text-al-ink disabled:cursor-progress',
          erro && 'text-al-erro',
        )}
      >
        {buscando ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Camera className="size-3.5" aria-hidden />}
      </button>
      {erro && (
        <span role="alert" className="sr-only">
          {erro}
        </span>
      )}
    </>
  )
}
