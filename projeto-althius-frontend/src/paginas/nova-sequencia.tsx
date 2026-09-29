import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDadosDeContas, useDadosDeSequencias, useFonteDeContas, useFonteDeSequencias } from '@/fonte/contexto'
import type { Contato } from '@/fonte/contas-tipos'

interface Props {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  contaIdInicial?: string
}

export function DialogoNovaSequencia({ aberto, aoMudar, contaIdInicial }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="gap-6 p-6 sm:max-w-xl">
        {aberto && (
          <FormularioNovaSequencia
            contaIdInicial={contaIdInicial}
            aoFechar={() => aoMudar(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FormularioNovaSequencia({
  contaIdInicial,
  aoFechar,
}: {
  contaIdInicial?: string
  aoFechar: () => void
}) {
  const fonteContas = useFonteDeContas()
  const fonteSequencias = useFonteDeSequencias()
  const navegar = useNavigate()

  const { dados: contas } = useDadosDeContas((f) => f.contas(), [])
  const { dados: sequencias } = useDadosDeSequencias((f) => f.sequencias(), [])

  const [contaId, setContaId] = useState<string>(contaIdInicial ?? '')
  const [contatos, setContatos] = useState<Contato[]>([])
  const [participantesIds, setParticipantesIds] = useState<string[]>([])
  const [carregandoContatos, setCarregandoContatos] = useState(false)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')

  function aoMudarConta(novoId: string) {
    setContaId(novoId)
    if (!novoId) {
      setContatos([])
      setParticipantesIds([])
    }
  }

  // Ao mudar de Conta-alvo, carrega os contatos dela
  useEffect(() => {
    if (!contaId) return

    let cancelado = false
    setCarregandoContatos(true)
    setErro('')

    fonteContas
      .contatosDaConta(contaId)
      .then((lista) => {
        if (cancelado) return
        setContatos(lista)
        // Por padrão, sugere todos os contatos da conta
        setParticipantesIds(lista.map((c) => c.id))
      })
      .catch((e) => {
        if (cancelado) return
        setErro(e instanceof Error ? e.message : 'Falha ao buscar contatos da conta.')
      })
      .finally(() => {
        if (!cancelado) setCarregandoContatos(false)
      })

    return () => {
      cancelado = true
    }
  }, [contaId, fonteContas])

  // A Sequência encerrada (depois de uma Transferência de responsabilidade, por exemplo) é histórico: não segura a Conta.
  const contasComSequencia = new Set(sequencias?.filter((s) => s.status !== 'encerrada').map((s) => s.contaId) ?? [])
  const jaTemSequencia = contaId ? contasComSequencia.has(contaId) : false
  // Só o Vendedor responsável cria a Sequência da Conta (ADR-0009). Uma fonte que não informa a responsabilidade
  // (a Demonstração) não restringe a lista.
  const contaDoOutroResponsavel = (conta: { sobMinhaResponsabilidade?: boolean }) => conta.sobMinhaResponsabilidade === false

  const podeCriar =
    Boolean(contaId) &&
    !jaTemSequencia &&
    participantesIds.length > 0 &&
    !criando &&
    !carregandoContatos

  function alternarContato(id: string) {
    setParticipantesIds((anteriores) =>
      anteriores.includes(id)
        ? anteriores.filter((item) => item !== id)
        : [...anteriores, id],
    )
  }

  async function submeter(e: FormEvent) {
    e.preventDefault()
    if (!podeCriar) return

    setCriando(true)
    setErro('')

    try {
      const nova = await fonteSequencias.criarSequencia({
        contaId,
        participantesIds,
      })
      aoFechar()
      navegar(`/sequencias/${nova.id}`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível criar a sequência.')
      setCriando(false)
    }
  }

  const contasOrdenadas = contas ? [...contas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) : []

  return (
    <form onSubmit={submeter} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle className="titulo-secao text-xl text-al-ink">Nova sequência</DialogTitle>
        <DialogDescription className="text-sm text-al-muted">
          Escolha uma Conta-alvo sob a sua responsabilidade. Cada Conta-alvo pode ter no máximo uma sequência em andamento.
        </DialogDescription>
      </DialogHeader>

      {erro && (
        <div role="alert" className="border border-al-erro/40 bg-al-erro/10 p-3 text-xs text-al-ink">
          {erro}
        </div>
      )}

      {/* Seleção de Conta-alvo */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="select-conta-alvo" className="rotulo text-xs text-al-muted">
          Conta-alvo
        </label>
        <select
          id="select-conta-alvo"
          aria-label="Conta-alvo"
          value={contaId}
          onChange={(e) => aoMudarConta(e.target.value)}
          className="campo h-10 text-sm text-al-ink bg-al-bg"
          disabled={Boolean(contaIdInicial)}
        >
          <option value="">Selecione uma empresa...</option>
          {contasOrdenadas.map((conta) => {
            const possui = contasComSequencia.has(conta.id)
            const deOutro = contaDoOutroResponsavel(conta)
            return (
              <option key={conta.id} value={conta.id} disabled={possui || deOutro}>
                {conta.nome} {possui
                  ? '(já possui sequência)'
                  : deOutro
                    ? '(outro responsável)'
                    : `(${conta.totalContatos} ${conta.totalContatos === 1 ? 'contato' : 'contatos'})`}
              </option>
            )
          })}
        </select>
        {jaTemSequencia && (
          <p className="text-xs text-al-atencao">
            Esta Conta-alvo já possui uma sequência. No máximo uma sequência por Conta.
          </p>
        )}
      </div>

      {/* Seleção de Participantes */}
      {contaId && !jaTemSequencia && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="rotulo text-xs text-al-muted">
              Participantes ({participantesIds.length} de {contatos.length} selecionados)
            </span>
          </div>

          {carregandoContatos && (
            <p className="py-2 text-xs text-al-muted">Carregando contatos...</p>
          )}

          {!carregandoContatos && contatos.length === 0 && (
            <p className="border border-al-line bg-al-surface p-3 text-xs text-al-muted">
              Nenhum contato mapeado nesta Conta-alvo. Mapeie ao menos um contato antes de criar a sequência.
            </p>
          )}

          {!carregandoContatos && contatos.length > 0 && (
            <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto border border-al-line bg-al-surface p-3">
              {contatos.map((contato) => {
                const marcado = participantesIds.includes(contato.id)
                return (
                  <label
                    key={contato.id}
                    className="flex items-center gap-2.5 py-1 text-xs text-al-ink cursor-pointer hover:text-white"
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternarContato(contato.id)}
                      className="size-4 rounded-none accent-al-accent"
                    />
                    <span className="font-medium">{contato.nome}</span>
                    {contato.cargo && <span className="text-al-muted">· {contato.cargo}</span>}
                    {contato.persona && (
                      <span className="rotulo text-[10px] text-al-muted">
                        ({contato.persona})
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      <DialogFooter className="mt-2 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={aoFechar}
          className="h-9 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={!podeCriar}
          className="h-9 border border-al-accent bg-al-accent px-4 text-xs font-medium tracking-rotulo text-al-on-accent uppercase hover:bg-al-accent-2 disabled:opacity-50"
        >
          {criando ? 'Criando...' : 'Criar sequência'}
        </Button>
      </DialogFooter>
    </form>
  )
}
