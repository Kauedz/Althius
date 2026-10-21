import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
import {
  useDados,
  useDadosDeContas,
  useDadosDeSequencias,
  useFonteDeContas,
  useFonteDeSequencias,
  useFonteDoPlaybook,
} from '@/fonte/contexto'
import type { Contato } from '@/fonte/contas-tipos'
import { modeloDeCadencia, passosDoModelo } from '@/fonte/modelo-de-cadencia'
import { copiarTemplate } from '@/fonte/templates-althius'

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
  const [usarModelo, setUsarModelo] = useState(true)
  const [templateId, setTemplateId] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [avisoSugestao, setAvisoSugestao] = useState('')
  const [sugerindo, setSugerindo] = useState(false)

  // O modelo vem da Cadência do Playbook (playbook 05); sem Playbook ou sem Cadência preenchida, a Sequência nasce vazia.
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
  const comModelo = modelo.toques.length > 0
  const { dados: templatesDaAlthius } = useDadosDeSequencias((f) => f.templatesDaAlthius(), [])
  const templates = templatesDaAlthius ?? []
  const templateEscolhido = templates.find((template) => template.id === templateId)

  function aoMudarConta(novoId: string) {
    setContaId(novoId)
    setJustificativa('')
    setAvisoSugestao('')
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
      const steps = templateEscolhido
        ? copiarTemplate(templateEscolhido, participantesIds[0])
        : comModelo && usarModelo
          ? passosDoModelo(modelo.toques, participantesIds[0])
          : undefined
      const nova = await fonteSequencias.criarSequencia({
        contaId,
        participantesIds,
        ...(steps ? { steps } : {}),
      })
      aoFechar()
      navegar(`/sequencias/${nova.id}`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível criar a sequência.')
      setCriando(false)
    }
  }

  async function pedirSugestao() {
    if (!contaId || sugerindo) return
    setSugerindo(true)
    setAvisoSugestao('')
    setJustificativa('')
    try {
      const sugestao = await fonteSequencias.sugerirTemplateDaAlthius(contaId)
      if (sugestao.motivo === 'ok' && sugestao.templateId && templates.some((template) => template.id === sugestao.templateId)) {
        setTemplateId(sugestao.templateId)
        setUsarModelo(false)
        setJustificativa(sugestao.justificativa)
        return
      }
      setAvisoSugestao(
        sugestao.motivo === 'teto'
          ? 'A sugestão não rodou por causa do limite de créditos. A escolha manual continua.'
          : 'Não há Sinal recente desta Conta para sugerir um template. A escolha manual continua.',
      )
    } catch {
      setAvisoSugestao('A sugestão falhou. A escolha manual continua.')
    } finally {
      setSugerindo(false)
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
        <div role="alert" className="rounded-xl border border-al-erro/40 bg-al-erro/10 p-3 text-xs text-al-ink">
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
            <p className="rounded-xl border border-al-line bg-al-surface p-3 text-xs text-al-muted">
              Nenhum contato mapeado nesta Conta-alvo. Mapeie ao menos um contato antes de criar a sequência.
            </p>
          )}

          {!carregandoContatos && contatos.length > 0 && (
            <div className="rounded-xl flex max-h-48 flex-col gap-1.5 overflow-y-auto border border-al-line bg-al-surface p-3">
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
                      className="size-4"
                    />
                    <span className="font-medium">{contato.nome}</span>
                    {contato.cargo && <span className="text-al-muted">· {contato.cargo}</span>}
                    {contato.persona && (
                      <span className="rotulo text-[0.6875rem] text-al-muted">
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

      {contaId && !jaTemSequencia && templates.length > 0 && (
        <div className="rounded-xl flex flex-col gap-2 border border-al-line bg-al-surface p-3 text-xs text-al-ink">
          <label htmlFor="select-template-althius" className="rotulo text-xs text-al-muted">
            Template da Althius
          </label>
          <select
            id="select-template-althius"
            aria-label="Template da Althius"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value)
              setAvisoSugestao('')
              if (e.target.value) setUsarModelo(false)
            }}
            className="campo h-10 text-sm text-al-ink bg-al-bg"
          >
            <option value="">Do zero</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.nome}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={pedirSugestao}
              disabled={sugerindo}
              className="text-xs font-medium text-al-ink underline-offset-2 hover:underline disabled:opacity-50"
            >
              {sugerindo ? 'Sugerindo...' : 'Sugerir com os dados da Conta'}
            </button>
          </div>
          {avisoSugestao && (
            <p role="status" className="text-al-muted">
              {avisoSugestao}
            </p>
          )}
          {justificativa && <p className="text-al-muted">{justificativa}</p>}
          {templateEscolhido && (
            <>
              <ol className="flex flex-col gap-1 text-al-muted">
                {templateEscolhido.passos.map((passo) => (
                  <li key={passo.id}>
                    {passo.titulo} ({passo.canal === 'email' ? 'E-mail' : passo.canal === 'linkedin' ? 'LinkedIn' : 'WhatsApp'})
                  </li>
                ))}
              </ol>
              <p className="text-al-muted">A cópia é sua. Criar a Sequência não envia nada.</p>
            </>
          )}
        </div>
      )}

      {contaId && !jaTemSequencia && comModelo && (
        <div className="rounded-xl flex flex-col gap-2 border border-al-line bg-al-surface p-3 text-xs text-al-ink">
          <label className="flex cursor-pointer items-center gap-2.5 font-medium">
            <input
              type="checkbox"
              checked={usarModelo}
              onChange={(e) => setUsarModelo(e.target.checked)}
              className="size-4"
            />
            Usar a Cadência do Playbook como modelo ({modelo.toques.length} {modelo.toques.length === 1 ? 'toque' : 'toques'})
          </label>
          {usarModelo && (
            <>
              <ol className="flex flex-col gap-1 text-al-muted">
                {modelo.toques.map((toque) => (
                  <li key={`${toque.dia}-${toque.titulo}`}>
                    Dia {toque.dia} · {toque.titulo} ({toque.canal === 'email' ? 'E-mail' : toque.canal === 'linkedin' ? 'LinkedIn' : 'WhatsApp'})
                    {toque.dependeDoCanal && <span className="ml-1.5 text-al-atencao">depende do canal</span>}
                  </li>
                ))}
              </ol>
              {modelo.foraDoEscopo.length > 0 && (
                <p className="text-al-muted">
                  Ficam de fora, por ainda não terem canal: {modelo.foraDoEscopo.join(', ')}.
                </p>
              )}
              <p className="text-al-muted">Nenhum toque sai sem a sua confirmação de passo.</p>
            </>
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
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={!podeCriar}
          className="rounded-md h-9 border border-al-accent bg-al-accent px-4 text-sm font-medium tracking-[0.04em] text-al-on-accent hover:bg-al-accent-2 disabled:opacity-50"
        >
          {criando ? 'Criando...' : 'Criar sequência'}
        </Button>
      </DialogFooter>
    </form>
  )
}
