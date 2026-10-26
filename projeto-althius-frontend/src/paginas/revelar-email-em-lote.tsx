import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Contato } from '@/fonte/contas-tipos'
import { useFonteDeContas } from '@/fonte/contexto'
import { mensagemDaRevelacaoDeEmail } from './comite-e-enriquecimento'

/** Quem a ação em lote tentaria revelar: ninguém que já tem e-mail entra na busca. */
function precisaEmail(contato: Contato): boolean {
  return !contato.email && !contato.canais.email
}

interface ResultadoDoContato {
  contatoId: string
  mensagem: string
}

interface Props {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  contatos: Contato[]
}

/**
 * Revelar e-mail em lote: consulta o custo máximo na Fonte antes de rodar,
 * e só chama `revelarContato` depois da confirmação.
 */
export function DialogoRevelarEmailEmLote({ aberto, aoMudar, contatos }: Props) {
  const [revelando, setRevelando] = useState(false)
  return (
    <Dialog open={aberto} onOpenChange={(valor) => { if (!revelando) aoMudar(valor) }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!revelando}>
        {aberto && (
          <FormularioDoLote
            contatos={contatos}
            revelando={revelando}
            setRevelando={setRevelando}
            aoFechar={() => { if (!revelando) aoMudar(false) }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FormularioDoLote({ contatos, aoFechar, revelando, setRevelando }: {
  contatos: Contato[]
  aoFechar: () => void
  revelando: boolean
  setRevelando: (valor: boolean) => void
}) {
  const fonte = useFonteDeContas()
  const [resultados, setResultados] = useState<ResultadoDoContato[] | null>(null)

  const semEmail = contatos.filter(precisaEmail)
  const [cotacoes, setCotacoes] = useState<Awaited<ReturnType<NonNullable<typeof fonte.cotarRevelacaoContato>>>[] | null>(null)
  const [erroCotacao, setErroCotacao] = useState<string | null>(null)
  const idsSemEmail = semEmail.map((c) => c.id).join(',')

  useEffect(() => {
    let ativo = true
    setCotacoes(null)
    setErroCotacao(null)
    async function cotar() {
      try {
        if (!fonte.cotarRevelacaoContato) throw new Error('Cotação indisponível.')
        const cotadas = await Promise.all(idsSemEmail.split(',').filter(Boolean).map((id) => fonte.cotarRevelacaoContato!(id, 'email')))
        if (ativo) setCotacoes(cotadas)
      } catch {
        if (ativo) setErroCotacao('A cotação não está disponível.')
      }
    }
    void cotar()
    return () => { ativo = false }
  }, [fonte, idsSemEmail])

  const custoMaximo = cotacoes?.reduce((total, c) => total + c.creditos, 0) ?? 0
  const podeRevelar = cotacoes !== null && cotacoes.every((c) => c.podeRevelar)

  async function confirmar() {
    if (!fonte.revelarContato || semEmail.length === 0 || revelando || !podeRevelar) return
    setRevelando(true)
    const saida: ResultadoDoContato[] = []
    for (const contato of semEmail) {
      try {
        const res = await fonte.revelarContato(contato.id, 'email')
        saida.push({ contatoId: contato.id, mensagem: mensagemDaRevelacaoDeEmail(res) })
      } catch (e) {
        saida.push({
          contatoId: contato.id,
          // A falha da busca de um Contato é falha dele, não trava os demais do lote.
          mensagem: e instanceof Error ? e.message : 'A busca do e-mail falhou.',
        })
      }
    }
    setResultados(saida)
    setRevelando(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Revelar E-mail em lote</DialogTitle>
        <DialogDescription>
          A Althius busca o e-mail profissional de cada Contato selecionado que ainda não tem e-mail.
        </DialogDescription>
      </DialogHeader>

      {!resultados ? (
        <div className="rounded border border-al-line bg-al-surface p-3 text-xs">
          <span className="rotulo block text-al-muted">Custo máximo da ação</span>
          <span className="text-sm font-semibold text-al-ink">
            {cotacoes ? `${custoMaximo} ${custoMaximo === 1 ? 'crédito' : 'créditos'}` : erroCotacao ? 'Cotação indisponível' : 'Consultando cotação...'}
          </span>
          <span className="mt-1 block text-[0.6875rem] text-al-muted">
            {contatos.length} {contatos.length === 1 ? 'selecionado' : 'selecionados'} · {semEmail.length}{' '}
            sem e-mail{cotacoes?.length && cotacoes.every((c) => c.creditos === cotacoes[0].creditos) ? ` (${cotacoes[0].creditos} créditos cada)` : ''} · {contatos.length - semEmail.length} já com e-mail (sem custo).
          </span>
          <span className="mt-1 block text-[0.6875rem] text-al-muted">
            Importante: os créditos só são debitados do saldo por e-mail novo que for encontrado e gravado.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
            {resultados.map((r) => {
              const nome = contatos.find((c) => c.id === r.contatoId)?.nome ?? r.contatoId
              return (
                <li key={r.contatoId}>
                  {nome}: {r.mensagem}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {erroCotacao && <p role="alert">{erroCotacao}</p>}
      {cotacoes && !podeRevelar && <p role="alert">Não é possível revelar este lote: verifique o saldo e as permissões dos Contatos.</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={revelando} onClick={aoFechar}>
          {resultados ? 'Fechar' : 'Cancelar'}
        </Button>
        {!resultados && (
          <Button
            type="button"
            disabled={revelando || semEmail.length === 0 || !podeRevelar}
            onClick={() => void confirmar()}
            className="rounded-lg border border-al-accent bg-al-accent font-medium text-al-on-accent hover:bg-al-accent-2"
          >
            {revelando ? 'Buscando...' : 'Confirmar e Revelar'}
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}
