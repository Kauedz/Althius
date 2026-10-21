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
import { copiarTemplate, type TemplateDaAlthius } from '@/fonte/templates-althius'

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
  const [templateProprioId, setTemplateProprioId] = useState('')
  const [templateProprioLocal, setTemplateProprioLocal] = useState<TemplateDaAlthius | null>(null)
  const [previaPropria, setPreviaPropria] = useState<{ nome: string; resumo: string; passos: { id: string; titulo: string; canal: string }[] } | null>(null)
  const [nomeProprio, setNomeProprio] = useState('')
  const [salvandoTemplate, setSalvandoTemplate] = useState(false)
  const [avisoProprio, setAvisoProprio] = useState('')
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
  const { dados: templatesProprios } = useDadosDeSequencias((f) => f.templatesProprios(), [])
  const templates = templatesDaAlthius ?? []
  const meusTemplates = templatesProprios ?? []
  const opcoesProprias = templateProprioLocal && !meusTemplates.some((template) => template.id === templateProprioLocal.id)
    ? [templateProprioLocal, ...meusTemplates]
    : meusTemplates
  const templateEscolhido = templates.find((template) => template.id === templateId)
  const templateProprioEscolhido = meusTemplates.find((template) => template.id === templateProprioId)
    ?? (templateProprioLocal?.id === templateProprioId ? templateProprioLocal : undefined)

  function aoMudarConta(novoId: string) {
    setContaId(novoId)
    setJustificativa('')
    setAvisoSugestao('')
    setAvisoProprio('')
    setPreviaPropria(null)
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
      const steps = templateProprioEscolhido
        ? copiarTemplate(templateProprioEscolhido, participantesIds[0])
        : templateEscolhido
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

  function literaisAtuais() {
    const conta = contas?.find((item) => item.id === contaId)
    return contatos
      .filter((contato) => participantesIds.includes(contato.id))
      .map((contato) => ({
        nome: contato.nome,
        email: contato.email,
        cargo: contato.cargo,
        empresa: conta?.nome,
      }))
  }

  function estruturaAtual() {
    if (templateEscolhido) {
      return { nome: templateEscolhido.nome, resumo: templateEscolhido.resumo, passos: templateEscolhido.passos }
    }
    if (templateProprioEscolhido) {
      return {
        nome: templateProprioEscolhido.nome,
        resumo: templateProprioEscolhido.resumo,
        passos: templateProprioEscolhido.passos,
      }
    }
    if (comModelo && usarModelo && modelo.toques.length > 0) {
      return {
        nome: 'Cadência do Playbook',
        resumo: 'Estrutura da Cadência, sem destinatário.',
        passos: passosDoModelo(modelo.toques, participantesIds[0] ?? 'sem-contato'),
      }
    }
    return null
  }

  async function abrirPrevia() {
    const estrutura = estruturaAtual()
    if (!estrutura || salvandoTemplate) return
    setSalvandoTemplate(true)
    setAvisoProprio('')
    setErro('')
    try {
      const previa = await fonteSequencias.previaDeTemplateProprio({
        ...estrutura,
        literais: literaisAtuais(),
      })
      setPreviaPropria(previa)
      setNomeProprio(previa.nome)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível montar a prévia.')
    } finally {
      setSalvandoTemplate(false)
    }
  }

  async function confirmarSalvamento() {
    if (!previaPropria || salvandoTemplate) return
    setSalvandoTemplate(true)
    setErro('')
    try {
      const literais = literaisAtuais()
      const segura = await fonteSequencias.previaDeTemplateProprio({
        nome: nomeProprio.trim() || previaPropria.nome,
        resumo: previaPropria.resumo,
        passos: previaPropria.passos,
        literais,
      })
      if (segura.nome !== (nomeProprio.trim() || previaPropria.nome)) {
        setPreviaPropria(segura)
        setNomeProprio(segura.nome)
        setAvisoProprio('O nome foi parametrizado. Confira a prévia e confirme de novo.')
        return
      }
      const gravado = await fonteSequencias.salvarTemplateProprio({ ...segura, literais })
      setTemplateProprioLocal(gravado)
      setTemplateProprioId(gravado.id)
      setTemplateId('')
      setUsarModelo(false)
      setPreviaPropria(null)
      setAvisoProprio('')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar o template.')
    } finally {
      setSalvandoTemplate(false)
    }
  }

  async function pedirSugestaoPropria() {
    if (!contaId || sugerindo) return
    setSugerindo(true)
    setAvisoProprio('')
    try {
      const sugestao = await fonteSequencias.sugerirTemplateProprio(contaId)
      const legivel = meusTemplates.some((template) => template.id === sugestao.templateId)
      if (sugestao.motivo === 'ok' && sugestao.templateId && legivel) {
        setTemplateProprioId(sugestao.templateId)
        setTemplateId('')
        setUsarModelo(false)
        setJustificativa(sugestao.justificativa)
        return
      }
      setAvisoProprio(
        sugestao.motivo === 'teto'
          ? 'A sugestão não rodou por causa do limite de créditos. A escolha manual continua.'
          : 'Não há template próprio seu para sugerir. A escolha manual e os templates da Althius continuam.',
      )
    } catch {
      setAvisoProprio('A sugestão falhou. A escolha manual e os templates da Althius continuam.')
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

      {contaId && !jaTemSequencia && (
        <div className="rounded-xl flex flex-col gap-2 border border-al-line bg-al-surface p-3 text-xs text-al-ink">
          <label htmlFor="select-template-proprio" className="rotulo text-xs text-al-muted">
            Meu template
          </label>
          <select
            id="select-template-proprio"
            aria-label="Meu template"
            value={templateProprioId}
            onChange={(e) => {
              setTemplateProprioId(e.target.value)
              setAvisoProprio('')
              setPreviaPropria(null)
              if (e.target.value) {
                setTemplateId('')
                setUsarModelo(false)
              }
            }}
            className="campo h-10 text-sm text-al-ink bg-al-bg"
          >
            <option value="">Não usar</option>
            {opcoesProprias.map((template) => (
              <option key={template.id} value={template.id}>
                {template.nome}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={abrirPrevia}
              disabled={!estruturaAtual() || salvandoTemplate}
              className="text-xs font-medium text-al-ink underline-offset-2 hover:underline disabled:opacity-50"
            >
              Salvar esta estrutura como meu template
            </button>
            <button
              type="button"
              onClick={pedirSugestaoPropria}
              disabled={sugerindo}
              className="text-xs font-medium text-al-ink underline-offset-2 hover:underline disabled:opacity-50"
            >
              Sugerir meu template
            </button>
          </div>
          {avisoProprio && (
            <p role="status" className="text-al-muted">
              {avisoProprio}
            </p>
          )}
          {previaPropria && (
            <div role="region" aria-label="Prévia do template" className="flex flex-col gap-2">
              <label htmlFor="nome-template-proprio" className="rotulo text-xs text-al-muted">
                Nome do meu template
              </label>
              <input
                id="nome-template-proprio"
                aria-label="Nome do meu template"
                value={nomeProprio}
                onChange={(e) => setNomeProprio(e.target.value)}
                className="campo h-10 text-sm text-al-ink bg-al-bg"
              />
              <ol className="flex flex-col gap-1 text-al-muted">
                {previaPropria.passos.map((passo) => {
                  const canal = passo.canal === 'email' ? 'E-mail' : passo.canal === 'linkedin' ? 'LinkedIn' : 'WhatsApp'
                  return <li key={passo.id}>{`${passo.titulo} (${canal})`}</li>
                })}
              </ol>
              <p className="text-al-muted">A prévia não leva destinatário, histórico nem autorização.</p>
              <button
                type="button"
                onClick={confirmarSalvamento}
                disabled={salvandoTemplate}
                className="text-xs font-medium text-al-ink underline-offset-2 hover:underline disabled:opacity-50"
              >
                Confirmar salvamento
              </button>
            </div>
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
