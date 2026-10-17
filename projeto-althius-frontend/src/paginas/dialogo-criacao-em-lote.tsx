import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useDados,
  useDadosDeContas,
  useDadosDeSequencias,
  useFonteDeSequencias,
  useFonteDoPlaybook,
} from '@/fonte/contexto'
import { JANELA_PADRAO, REGRA_DE_PAUSE_PADRAO } from '@/fonte/dados-sequencias-demo'
import { modeloDeCadencia, passosDoModelo, type ToqueDoModelo } from '@/fonte/modelo-de-cadencia'
import {
  classificarContasDoLote,
  rotuloDoDesfechoDoLote,
  rotuloDoMotivoForaDoLote,
  type DesfechoDoLote,
} from '@/fonte/previsao-do-lote-de-sequencias'
import type { ResultadoDoLoteDeSequencias, StepSequencia } from '@/fonte/sequencias-tipos'

interface Props {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  contaIds: string[]
}

function passosSemContato(toques: ToqueDoModelo[]): Omit<StepSequencia, 'contatoId'>[] {
  return passosDoModelo(toques, '').map(({ contatoId: _contatoId, ...passo }) => passo)
}

export function DialogoCriacaoEmLote({ aberto, aoMudar, contaIds }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="gap-6 p-6 sm:max-w-xl">
        {aberto && <FormularioDoLote contaIds={contaIds} aoFechar={() => aoMudar(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function FormularioDoLote({ contaIds, aoFechar }: { contaIds: string[]; aoFechar: () => void }) {
  const fonteSequencias = useFonteDeSequencias()
  const { dados: contas } = useDadosDeContas((f) => f.contas(), [])
  const { dados: contatos } = useDadosDeContas((f) => f.contatos(), [])
  const { dados: sequencias } = useDadosDeSequencias((f) => f.sequencias(), [])
  const fonteDoPlaybook = useFonteDoPlaybook()
  const cadenciaDoPlaybook = useDados(fonteDoPlaybook, (f) => f.secao('cadencia').catch(() => undefined), [])
  const templatesDoPlaybook = useDados(fonteDoPlaybook, (f) => f.secao('templates').catch(() => undefined), [])
  const modelo = useMemo(
    () =>
      modeloDeCadencia(
        cadenciaDoPlaybook?.vigente?.conteudo.linhas ?? [],
        templatesDoPlaybook?.vigente?.conteudo.linhas ?? [],
      ),
    [cadenciaDoPlaybook, templatesDoPlaybook],
  )

  const [supressoes, setSupressoes] = useState<{ kind: 'email' | 'domain'; value: string }[]>([])
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultados, setResultados] = useState<ResultadoDoLoteDeSequencias[] | null>(null)

  useEffect(() => {
    let ativo = true
    fonteSequencias.supressoesDoWorkspace?.().then(
      (lista) => {
        if (ativo) setSupressoes(lista)
      },
      () => {
        if (ativo) setSupressoes([])
      },
    )
    return () => {
      ativo = false
    }
  }, [fonteSequencias])

  const selecionadas = (contas ?? []).filter((c) => contaIds.includes(c.id))
  const previsao = classificarContasDoLote({
    contas: selecionadas,
    contatos: contatos ?? [],
    sequencias: sequencias ?? [],
    supressoes,
  })
  const comModelo = modelo.toques.length > 0
  const primeira = previsao.criar[0]
  const contatoDaPrevia = (contatos ?? []).find((c) => c.contaId === primeira?.id)
  const primeiroPasso = modelo.toques[0]

  async function confirmar() {
    if (previsao.criar.length === 0 || !comModelo || criando) return
    setCriando(true)
    setErro('')
    try {
      const template = {
        janelaPadrao: JANELA_PADRAO,
        regraDePause: REGRA_DE_PAUSE_PADRAO,
        steps: passosSemContato(modelo.toques),
      }
      if (fonteSequencias.criarSequenciasEmLote) {
        setResultados(await fonteSequencias.criarSequenciasEmLote(previsao.criar.map((c) => c.id), template))
        return
      }
      const saida: ResultadoDoLoteDeSequencias[] = []
      for (const conta of previsao.criar) {
        const contato = (contatos ?? []).find((c) => c.contaId === conta.id)
        const nova = await fonteSequencias.criarSequencia({
          contaId: conta.id,
          participantesIds: contato ? [contato.id] : [],
          steps: contato ? passosDoModelo(modelo.toques, contato.id) : [],
          janelaPadrao: JANELA_PADRAO,
          regraDePause: REGRA_DE_PAUSE_PADRAO,
        })
        saida.push({ contaId: conta.id, desfecho: 'created', sequenciaId: nova.id })
      }
      for (const fora of previsao.fora) {
        saida.push({
          contaId: fora.id,
          desfecho:
            fora.motivo === 'sequencia_ativa'
              ? 'sequence_in_progress'
              : fora.motivo === 'outro_responsavel'
                ? 'not_responsible'
                : 'no_eligible_contact',
        })
      }
      setResultados(saida)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível criar as Sequências.')
      setCriando(false)
    }
  }

  const criadas = resultados?.filter((r) => r.desfecho === 'created').length ?? 0

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle className="titulo-secao text-xl text-al-ink">Criar Sequências em lote</DialogTitle>
        <DialogDescription className="text-sm text-al-muted">
          Uma Sequência por Conta-alvo, com a mesma Cadência. Cada Conta-alvo tem no máximo uma Sequência em andamento.
        </DialogDescription>
      </DialogHeader>

      {erro && (
        <div role="alert" className="rounded-xl border border-al-erro/40 bg-al-erro/10 p-3 text-xs text-al-ink">
          {erro}
        </div>
      )}

      {comModelo ? (
        <div className="rounded-xl flex flex-col gap-2 border border-al-line bg-al-surface p-3 text-xs text-al-ink">
          <label className="flex items-center gap-2.5 font-medium">
            <input type="checkbox" checked readOnly className="size-4" />
            Usar a Cadência do Playbook como modelo ({modelo.toques.length}{' '}
            {modelo.toques.length === 1 ? 'toque' : 'toques'})
          </label>
          <ol className="flex flex-col gap-1 text-al-muted">
            {modelo.toques.map((toque) => (
              <li key={`${toque.dia}-${toque.titulo}`}>
                Dia {toque.dia} · {toque.titulo} (
                {toque.canal === 'email' ? 'E-mail' : toque.canal === 'linkedin' ? 'LinkedIn' : 'WhatsApp'})
              </li>
            ))}
          </ol>
          {primeira && primeiroPasso && (
            <p>
              Prévia do primeiro passo para {primeira.nome}
              {contatoDaPrevia ? ` · ${contatoDaPrevia.nome}` : ''}: {primeiroPasso.titulo}
              {primeiroPasso.assunto ? ` — ${primeiroPasso.assunto}` : ''}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-al-muted">A Cadência do Playbook ainda não tem toques. Nada é criado sem ela.</p>
      )}

      {resultados ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            {criadas} {criadas === 1 ? 'Sequência criada' : 'Sequências criadas'}
          </p>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
            {resultados.map((item) => {
              const nome = selecionadas.find((c) => c.id === item.contaId)?.nome ?? item.contaId
              return (
                <li key={item.contaId}>
                  {nome}: {rotuloDoDesfechoDoLote(item.desfecho as DesfechoDoLote)}
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            {previsao.criar.length} {previsao.criar.length === 1 ? 'Sequência será criada' : 'Sequências serão criadas'}.
          </p>
          {previsao.fora.length > 0 && (
            <div>
              <p className="text-al-muted">Ficam de fora:</p>
              <ul className="mt-1 flex max-h-36 flex-col gap-1 overflow-y-auto text-xs">
                {previsao.fora.map((conta) => (
                  <li key={conta.id}>
                    {conta.nome}: {rotuloDoMotivoForaDoLote(conta.motivo)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <DialogFooter className="mt-2 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={aoFechar}
          className="h-9 border-al-line text-sm tracking-[0.04em] hover:bg-al-surface"
        >
          {resultados ? 'Fechar' : 'Cancelar'}
        </Button>
        {!resultados && (
          <Button
            type="button"
            disabled={previsao.criar.length === 0 || !comModelo || criando}
            onClick={() => void confirmar()}
            className="rounded-md h-9 border border-al-accent bg-al-accent px-4 text-sm font-medium tracking-[0.04em] text-al-on-accent hover:bg-al-accent-2 disabled:opacity-50"
          >
            {criando ? 'Criando…' : 'Confirmar criação'}
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}
