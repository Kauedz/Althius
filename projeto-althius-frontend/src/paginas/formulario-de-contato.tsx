import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CanaisDoContato } from '@/fonte/canais-do-contato'
import type { Contato } from '@/fonte/contas-tipos'
import { useFonteDeContas } from '@/fonte/contexto'
import { cn } from '@/lib/utils'
import {
  type CamposDoFormularioDeContato,
  canaisSemLinhasEmBranco,
  mesmosCanais,
  useCamposDoContato,
} from './campos-do-contato'
import { ListasDeCanais } from './canais-do-contato'

export const CAMPO = 'rounded-md h-9 border border-al-line bg-al-surface px-3 text-sm text-al-ink'
const BOTAO_SECUNDARIO = 'h-9 border-al-line text-sm tracking-[0.04em] hover:bg-al-surface'
const BOTAO_PRIMARIO =
  'rounded-md h-9 border border-al-accent bg-al-accent px-4 text-sm font-medium tracking-[0.04em] text-al-on-accent hover:bg-al-accent-2 disabled:opacity-50'

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
  semEmailETelefone = false,
}: {
  campos: CamposDoFormularioDeContato
  editar: (nome: keyof CamposDoFormularioDeContato) => (e: { target: { value: string } }) => void
  /** Cada campo ocupa a largura toda, como no diálogo. */
  cheios?: boolean
  /** O e-mail e o telefone saem: quem os edita são as listas de canais. */
  semEmailETelefone?: boolean
}) {
  const classe = cn(CAMPO, cheios && 'w-full')
  const opcionais = ROTULOS_OPCIONAIS.filter(([nome]) => !(semEmailETelefone && (nome === 'email' || nome === 'whatsapp')))
  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-al-muted">
        Nome
        <input required value={campos.nome} onChange={editar('nome')} className={classe} />
      </label>
      {opcionais.map(([nome, rotulo]) => (
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
  // Com as listas de e-mails e telefones, o diálogo é mais largo e rola se passar da tela.
  const largo = !!useFonteDeContas().salvarCanaisDoContato && !!contato.emails && !!contato.telefones
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className={cn('max-h-[90vh] gap-5 overflow-y-auto p-6', largo ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
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
  // Com as listas (só o Workspace operacional as informa, e só se chegaram inteiras), o e-mail e o telefone se editam nelas.
  const comListas = !!fonte.salvarCanaisDoContato && !!contato.emails && !!contato.telefones
  const canaisAtuais: CanaisDoContato = { emails: contato.emails ?? [], telefones: contato.telefones ?? [] }
  const [canais, setCanais] = useState(canaisAtuais)
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
      if (comListas) {
        // As listas primeiro: é onde o banco recusa mais (valor de outro Contato). Nome, cargo e LinkedIn vão depois,
        // sem e-mail nem telefone, que a edição mantém.
        const novos = canaisSemLinhasEmBranco(canais)
        if (!mesmosCanais(novos, canaisAtuais)) await fonte.salvarCanaisDoContato!(contato.id, novos)
        await fonte.editarContato!(contato.id, { nome: campos.nome, cargo: campos.cargo, linkedin: campos.linkedin })
      } else {
        await fonte.editarContato!(contato.id, campos)
      }
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
        <CamposDoContato campos={campos} editar={editar} cheios semEmailETelefone={comListas} />
        {comListas && <ListasDeCanais canais={canais} aoMudar={setCanais} />}
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
