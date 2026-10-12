import { UserRoundCog } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ContaAlvo } from '@/fonte/contas-tipos'
import { useDadosDeContas, useFonteDeContas } from '@/fonte/contexto'

const BOTAO_SECUNDARIO = 'h-9 border-al-line text-sm tracking-[0.04em] hover:bg-al-surface'
const BOTAO_PRIMARIO =
  'rounded-md h-9 border border-al-accent bg-al-accent px-4 text-sm font-medium tracking-[0.04em] text-al-on-accent hover:bg-al-accent-2 disabled:opacity-50'

/**
 * Depois que o Vendedor responsável sai do Workspace, o Administrador transfere a Conta-alvo a um Participante ativo,
 * com o motivo (CRM-06). É uma ação excepcional: o banco a registra e só ela troca o responsável. Sem o método na fonte
 * ou com o responsável ainda no Workspace, nada aparece.
 */
export function TransferirResponsabilidade({ conta }: { conta: ContaAlvo }) {
  const fonte = useFonteDeContas()
  const [aberto, setAberto] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  if (!fonte.transferirResponsabilidade || conta.responsavelAusente !== true || conta.arquivadaEm) return null

  return (
    <div className="rounded-xl flex flex-col gap-2 border border-al-line bg-al-surface p-3 text-sm">
      <p>O Vendedor responsável por esta Conta saiu do Workspace. Um Administrador pode passar a Conta a outra pessoa.</p>
      <div>
        <Button type="button" variant="outline" onClick={() => setAberto(true)} className={BOTAO_SECUNDARIO}>
          <UserRoundCog aria-hidden className="size-4" /> Transferir responsabilidade
        </Button>
      </div>
      {resultado && (
        <p role="status" className="text-xs text-al-muted">
          {resultado}
        </p>
      )}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="gap-5 p-6 sm:max-w-lg">
          {aberto && (
            <FormularioDaTransferencia
              conta={conta}
              aoConcluir={() => {
                setAberto(false)
                setResultado('Responsabilidade transferida. A transferência fica registrada.')
              }}
              aoCancelar={() => setAberto(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FormularioDaTransferencia({
  conta,
  aoConcluir,
  aoCancelar,
}: {
  conta: ContaAlvo
  aoConcluir: () => void
  aoCancelar: () => void
}) {
  const fonte = useFonteDeContas()
  const { dados: participantes } = useDadosDeContas((f) => f.participantesParaTransferir?.() ?? Promise.resolve([]), [])
  const [novoResponsavel, setNovoResponsavel] = useState('')
  const [motivo, setMotivo] = useState('')
  const [agindo, setAgindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const podeEnviar = novoResponsavel !== '' && motivo.trim() !== '' && !agindo

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!podeEnviar) return
    setAgindo(true)
    setErro(null)
    try {
      await fonte.transferirResponsabilidade!(conta.id, novoResponsavel, motivo.trim())
      aoConcluir()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível transferir a responsabilidade.')
      setAgindo(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Transferir responsabilidade</DialogTitle>
        <DialogDescription className="text-sm text-al-muted">
          {conta.nome} passa a ser da pessoa que você escolher. A Sequência do responsável anterior não é transferida: a
          nova pessoa começa a dela.
        </DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-1.5 text-xs text-al-muted">
        Novo responsável
        <select
          aria-label="Novo responsável"
          value={novoResponsavel}
          onChange={(e) => setNovoResponsavel(e.target.value)}
          className="rounded-md h-9 border border-al-line bg-al-bg px-2 text-sm text-al-ink"
        >
          <option value="">Escolha um Participante...</option>
          {(participantes ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-xs text-al-muted">
        Motivo
        <textarea
          aria-label="Motivo da transferência"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          className="rounded-lg border border-al-line bg-al-surface px-3 py-2 text-sm text-al-ink"
        />
      </label>
      {erro && (
        <p role="alert" className="text-sm text-al-atencao">
          {erro}
        </p>
      )}
      <DialogFooter className="mt-1 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={aoCancelar} className={BOTAO_SECUNDARIO}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!podeEnviar} className={BOTAO_PRIMARIO}>
          {agindo ? 'Aguarde...' : 'Transferir'}
        </Button>
      </DialogFooter>
    </form>
  )
}
