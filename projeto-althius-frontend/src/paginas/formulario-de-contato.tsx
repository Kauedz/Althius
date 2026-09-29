import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Contato } from '@/fonte/contas-tipos'
import { useFonteDeContas } from '@/fonte/contexto'
import { cn } from '@/lib/utils'
import { type CamposDoFormularioDeContato, useCamposDoContato } from './campos-do-contato'

export const CAMPO = 'h-9 border border-al-line bg-al-surface px-3 text-sm text-al-ink'
const BOTAO_SECUNDARIO = 'h-9 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface'
const BOTAO_PRIMARIO =
  'h-9 border border-al-accent bg-al-accent px-4 text-xs font-medium tracking-rotulo text-al-on-accent uppercase hover:bg-al-accent-2 disabled:opacity-50'

const ROTULOS_OPCIONAIS: [keyof CamposDoFormularioDeContato, string][] = [
  ['cargo', 'Cargo (opcional)'],
  ['email', 'E-mail (opcional)'],
  ['whatsapp', 'Telefone (opcional)'],
  ['linkedin', 'LinkedIn (opcional)'],
]

/** Os cinco campos do Contato, os mesmos no cadastro e na edição: só o nome é obrigatório. */
export function CamposDoContato({
  campos,
  editar,
  cheios = false,
}: {
  campos: CamposDoFormularioDeContato
  editar: (nome: keyof CamposDoFormularioDeContato) => (e: { target: { value: string } }) => void
  /** Cada campo ocupa a largura toda, como no diálogo. */
  cheios?: boolean
}) {
  const classe = cn(CAMPO, cheios && 'w-full')
  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-al-muted">
        Nome
        <input required value={campos.nome} onChange={editar('nome')} className={classe} />
      </label>
      {ROTULOS_OPCIONAIS.map(([nome, rotulo]) => (
        <label key={nome} className="flex flex-col gap-1 text-xs text-al-muted">
          {rotulo}
          <input value={campos[nome]} onChange={editar(nome)} className={classe} />
        </label>
      ))}
    </>
  )
}

/**
 * A edição de um Contato num diálogo, com os valores de agora. Salvar com e-mail, telefone ou LinkedIn esvaziados apaga
 * o canal; o nome não pode ficar vazio. O banco confere de novo a permissão e as duplicidades, e a razão da recusa fica
 * no diálogo, que continua aberto.
 */
export function DialogoDeEdicaoDoContato({
  contato,
  aberto,
  aoMudar,
}: {
  contato: Contato
  aberto: boolean
  aoMudar: (aberto: boolean) => void
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        {aberto && <CorpoDaEdicao contato={contato} aoMudar={aoMudar} />}
      </DialogContent>
    </Dialog>
  )
}

function CorpoDaEdicao({ contato, aoMudar }: { contato: Contato; aoMudar: (aberto: boolean) => void }) {
  const fonte = useFonteDeContas()
  const { campos, editar } = useCamposDoContato({
    nome: contato.nome,
    cargo: contato.cargo ?? '',
    email: contato.email ?? '',
    whatsapp: contato.whatsapp ?? '',
    linkedin: contato.linkedin ?? '',
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!campos.nome.trim()) {
      setErro('Informe o nome do Contato.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      await fonte.editarContato!(contato.id, campos)
      aoMudar(false)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar o Contato.')
      setSalvando(false)
    }
  }

  return (
    <form aria-label="Editar Contato" noValidate onSubmit={salvar} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Editar {contato.nome}</DialogTitle>
        <DialogDescription className="text-sm text-al-muted">
          Vale para o Contato em todas as Contas em que ele atua. Um campo esvaziado apaga o valor guardado.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <CamposDoContato campos={campos} editar={editar} cheios />
      </div>
      {erro && (
        <p role="alert" className="text-sm text-al-atencao">
          {erro}
        </p>
      )}
      <DialogFooter className="mt-1 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => aoMudar(false)} className={BOTAO_SECUNDARIO}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvando} className={BOTAO_PRIMARIO}>
          {salvando ? 'Aguarde...' : 'Salvar'}
        </Button>
      </DialogFooter>
    </form>
  )
}
