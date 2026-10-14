import { ArrowRight, Clock, History, PencilLine } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { ConteudoDoPlaybookEmLeitura } from '@/components/conteudo-do-playbook'
import { SecoesDoDocumento } from '@/components/documento-da-memoria'
import { Carregando, IconeAgente, Pulso } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAmbiente, useDados, useFonte, useFonteDoPlaybook } from '@/fonte/contexto'
import { formatarDataCompleta, formatarDiaIsoPorExtenso } from '@/fonte/formatar-data'
import { ehRevisaoDoPlaybook } from '@/fonte/regras'
import { DOCUMENTOS_DA_MEMORIA, ehDocumentoDaMemoria, frasesDo, maiuscula, revisoesDo } from '@/fonte/regras-memoria'
import type { DocumentoDaMemoria } from '@/fonte/tipos'
import { mensagemDeErro } from '@/lib/utils'
import { AbasDasPaginas, SecaoDeConfiguracoes } from './componentes'

/** Uma aba por documento do contexto: /configuracoes/memoria/icp e /configuracoes/memoria/personas. */
const PAGINAS = Object.fromEntries(Object.entries(DOCUMENTOS_DA_MEMORIA).map(([id, { nome }]) => [id, nome]))

/** Quem usa cada documento, em linguagem de cliente. */
const ONDE_E_USADO: Record<DocumentoDaMemoria, string> = {
  icp: 'Usado por Scopus na nota de aderência, por Ethos no Comitê e por Rhetor nas mensagens.',
  personas: 'Usadas por Ethos no Comitê, por Scopus na nota de aderência e por Rhetor nas mensagens.',
}

/**
 * Memória do Workspace (memoria-e-contexto): uma visão de leitura do Contexto do Workspace, que é o Playbook. O ICP e
 * as Personas são seções do Playbook; aqui a pessoa vê o que os Agentes sabem hoje e vai ao Playbook para editar
 * (Administrador) ou propor uma revisão (os outros). O mesmo componente serve à Demonstração e ao Workspace
 * operacional; só a fonte muda.
 */
export function SecaoMemoria() {
  const { pagina: documento } = useParams()
  if (!ehDocumentoDaMemoria(documento)) return <Navigate to="/configuracoes/memoria/icp" replace />
  return (
    <SecaoDeConfiguracoes
      id="memoria-do-workspace"
      titulo="Memória do Workspace"
      alcance="workspace"
      descricao="O que os Agentes sabem hoje sobre o seu negócio. É o mesmo contexto do Playbook: quem administra edita lá, e os outros participantes propõem revisões."
    >
      <AbasDasPaginas secao="memoria" paginas={PAGINAS} rotuloAcessivel="Documentos da Memória do Workspace" />
      <ContextoDoDocumento key={documento} documento={documento} />
    </SecaoDeConfiguracoes>
  )
}

function ContextoDoDocumento({ documento }: { documento: DocumentoDaMemoria }) {
  const fonteDoPlaybook = useFonteDoPlaybook()
  const { modo } = useAmbiente()
  const [pedindo, setPedindo] = useState(false)
  const aprovacoes = useDados((fonte) => fonte.aprovacoes(), [])
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const dados = useDados((fonte) => fonte.participantesDoWorkspace(), [])
  const real = modo === 'real'
  const secao = useDados(fonteDoPlaybook, (f) => f.secao(documento), [documento])
  // A Demonstração só troca a fonte: lê o documento simulado da Memória em vez da seção do Playbook.
  const memoria = useDados((fonte) => (real ? Promise.resolve(null) : fonte.memoriaDoWorkspace()), [real])
  const { nome, oNome, agente, especialidade } = DOCUMENTOS_DA_MEMORIA[documento]
  const { concordar, oVigente, naoMudou } = frasesDo(documento)
  if (!secao || !workspace || memoria === undefined) return <Carregando />
  const simulado = memoria?.[documento]

  // A fila vem da mais nova para a mais antiga: a primeira decidida é a última decisão. A Demonstração guarda as
  // revisões pedidas aqui; o operacional, as revisões do Playbook.
  const lista = aprovacoes ?? []
  const revisoes: { estado: string; decididaPor?: string }[] = [
    ...lista
      .filter((a) => ehRevisaoDoPlaybook(a) && a.revisao.secao === documento)
      .map((a) => ({ estado: a.estado, decididaPor: (ehRevisaoDoPlaybook(a) && a.revisao.decididaPor) || undefined })),
    ...revisoesDo(documento, lista).map((r) => ({ estado: r.estado, decididaPor: 'decididaPor' in r.revisao ? r.revisao.decididaPor.nome : undefined })),
  ]
  const pendente = revisoes.find((r) => r.estado === 'pendente')
  const ultimaDecidida = revisoes.find((r) => r.estado !== 'pendente')
  const recusada = ultimaDecidida?.estado === 'rejeitada' ? ultimaDecidida : undefined
  const quemRecusou =
    dados?.participantes.find((p) => p.conta.id === recusada?.decididaPor)?.conta.nome ??
    (recusada?.decididaPor && !/^[0-9a-f-]{36}$/.test(recusada.decididaPor) ? recusada.decididaPor : undefined)
  const doPlaybook = secao.vigente
  const vigente = simulado
    ? {
        linha: `${concordar('Aprovado', 'Aprovadas')} em ${formatarDiaIsoPorExtenso(simulado.aprovadoEm)} por ${simulado.aprovadoPor.nome} · ${concordar('mantido', 'mantidas')} pelo ${agente}`,
        corpo: <SecoesDoDocumento secoes={simulado.secoes} className="gap-y-4" />,
      }
    : doPlaybook && {
        linha: `Versão ${doPlaybook.versao}, atualizada em ${formatarDataCompleta(doPlaybook.em)} por ${doPlaybook.autor ?? 'alguém que já não está no Workspace'}`,
        corpo: <ConteudoDoPlaybookEmLeitura secao={documento} conteudo={doPlaybook.conteudo} />,
      }
  const ehAdministrador = workspace.papel === 'administrador'
  const noPlaybook = `/configuracoes/playbook/${documento}`

  return (
    <section aria-label={`${nome} ${concordar('vigente', 'vigentes')}`} className="flex max-w-[720px] flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <IconeAgente especialidade={especialidade} tamanho="lg" />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h3 className="titulo-secao text-2xl">{nome}</h3>
              {vigente && (
                <span className="selo border-al-sucesso/60 text-al-ink">
                  <span className="size-1.5 rounded-full bg-al-sucesso" aria-hidden />
                  Vigente
                </span>
              )}
              {pendente && (
                <span className="selo border-al-atencao/60 text-al-ink">
                  <span className="size-1.5 rounded-full bg-al-atencao" aria-hidden />
                  Revisão pendente
                </span>
              )}
            </div>
            <span className="text-sm text-al-muted">
              {vigente ? vigente.linha : 'Ainda sem versão'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pendente && (
            <Link to="/aprovacoes" className={BOTAO_SECUNDARIO}>
              Ver proposta pendente
              <ArrowRight strokeWidth={1.8} className="size-4" aria-hidden />
            </Link>
          )}
          {real && ehAdministrador ? (
            <Link to={noPlaybook} className={BOTAO_PRIMARIO}>
              <PencilLine strokeWidth={1.8} className="size-4" aria-hidden />
              Editar no Playbook
            </Link>
          ) : real ? (
            <Link to={noPlaybook} className={BOTAO_PRIMARIO}>
              Pedir revisão
            </Link>
          ) : (
            !pendente && (
              <button type="button" onClick={() => setPedindo(true)} className={BOTAO_PRIMARIO}>
                Pedir revisão ao {agente}
              </button>
            )
          )}
          {doPlaybook && real && (
            <Link to={noPlaybook} className={BOTAO_SECUNDARIO}>
              <History strokeWidth={1.8} className="size-4" aria-hidden />
              Ver histórico
            </Link>
          )}
        </div>
      </div>

      {pendente && (
        <div className="rounded-xl flex items-start gap-3 border border-al-atencao/50 bg-al-atencao/5 p-4">
          <Clock strokeWidth={1.8} className="mt-0.5 size-4 shrink-0 text-al-atencao" aria-hidden />
          <p className="text-sm">
            <span className="font-normal">Proposta pendente do {agente}.</span>{' '}
            <span className="text-al-muted">
              {vigente
                ? `Enquanto um Administrador não decidir, ${oNome} abaixo ${concordar('continua', 'continuam')} valendo em todo o Workspace.`
                : 'Enquanto um Administrador não decidir, nada muda no Workspace.'}
            </span>
          </p>
        </div>
      )}
      {!pendente && recusada && (
        <Mensagem tipo="info">
          A última proposta do {agente} foi recusada{quemRecusou ? ` por ${quemRecusou}` : ''}.{' '}
          {vigente ? `${maiuscula(oVigente)} ${naoMudou}.` : 'O Playbook não mudou.'}
        </Mensagem>
      )}

      {simulado && !pendente && ultimaDecidida?.estado === 'aprovada' && (
        <Mensagem tipo="sucesso">
          {concordar(`Este ${nome} substituiu o anterior`, `Estas ${nome} substituíram as anteriores`)} com a aprovação de{' '}
          {formatarDiaIsoPorExtenso(simulado.aprovadoEm)}, e os Agentes já usam o novo contexto.
        </Mensagem>
      )}

      {vigente ? (
        <div className="cartao p-6">
          {vigente.corpo}
        </div>
      ) : (
        <div role="status" className="rounded-2xl flex flex-col items-start gap-2 border border-dashed border-al-line px-5 py-4">
          <p className="text-al-ink">
            Ainda não há {nome}. Importe o Playbook ou peça ao {agente} para montar.
          </p>
          <Link to={noPlaybook} className="text-sm text-al-ink underline underline-offset-2">
            Abrir o Playbook
          </Link>
        </div>
      )}

      {documento === 'personas' && (
        <p className="text-sm text-al-muted">
          Cada Persona descreve um papel do Comitê de compra. As Personas classificam os Contatos em Contas e Contatos e não
          são participantes do Workspace.
        </p>
      )}
      <p className="text-sm text-al-muted">{ONDE_E_USADO[documento]}</p>

      <DialogoDeRevisao documento={documento} aberto={pedindo} aoFechar={() => setPedindo(false)} />
    </section>
  )
}

/** A Conversa demonstrativa com o Agente do documento: o pedido vira uma proposta pendente em Aprovações. */
function DialogoDeRevisao({
  documento,
  aberto,
  aoFechar,
}: {
  documento: DocumentoDaMemoria
  aberto: boolean
  aoFechar: () => void
}) {
  const fonte = useFonte()
  const { oNome, comArtigo, agente, especialidade, exemploDePedido } = DOCUMENTOS_DA_MEMORIA[documento]
  const { concordar } = frasesDo(documento)
  const workspace = useDados((f) => f.workspace(), [])
  const [pedido, setPedido] = useState('')
  const [erro, setErro] = useState<string | undefined>()
  const [etapa, setEtapa] = useState<'escrevendo' | 'preparando' | 'pronta'>('escrevendo')
  const [enviado, setEnviado] = useState('')
  const [resposta, setResposta] = useState('')

  function fechar() {
    setPedido('')
    setErro(undefined)
    setEtapa('escrevendo')
    aoFechar()
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!pedido.trim()) {
      setErro(`Conte ao ${agente} o que deveria mudar.`)
      return
    }
    setEnviado(pedido.trim())
    setEtapa('preparando')
    try {
      const proposta = await fonte.solicitarRevisao(documento, pedido)
      setResposta(proposta.justificativa)
      setEtapa('pronta')
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEtapa('escrevendo')
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && etapa !== 'preparando' && fechar()}>
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        <div className="flex items-center gap-3">
          <IconeAgente especialidade={especialidade} />
          <DialogTitle className="titulo-secao text-2xl">Revisão {comArtigo}</DialogTitle>
        </div>
        <DialogDescription className="text-al-muted">
          Uma Conversa com o {agente}, que prepara a proposta e a envia para Aprovações. {maiuscula(oNome)} só{' '}
          {concordar('muda', 'mudam')} quando um Administrador aprovar.
        </DialogDescription>

        {etapa === 'escrevendo' ? (
          <form aria-label={`Pedido ao ${agente}`} noValidate onSubmit={enviar} className="flex flex-col gap-3">
            <label htmlFor="pedido-de-revisao" className="rotulo">
              O que deveria mudar?
            </label>
            <div className="composer">
              <textarea
                id="pedido-de-revisao"
                rows={3}
                value={pedido}
                onChange={(e) => setPedido(e.target.value)}
                aria-invalid={Boolean(erro)}
                placeholder={exemploDePedido}
              />
              <div className="flex justify-end px-3 pb-3">
                <button type="submit" className={BOTAO_PRIMARIO}>
                  Enviar ao {agente}
                </button>
              </div>
            </div>
            {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
          </form>
        ) : (
          <ol aria-label={`Conversa com o ${agente}`} className="flex flex-col gap-4">
            <li className="flex flex-col gap-1 border-l-2 border-al-line pl-4">
              <span className="text-sm font-normal">{workspace?.usuario.nome}</span>
              <p>{enviado}</p>
            </li>
            <li className="flex flex-col gap-1 border-l-2 border-al-accent pl-4">
              <span className="text-sm font-normal">
                {agente}
                <span className="rotulo ml-2">Agente Althius</span>
              </span>
              {etapa === 'preparando' ? (
                <span role="status" className="flex items-center gap-3 text-al-muted">
                  <span className="relative size-4">
                    <Pulso className="absolute inset-0" />
                  </span>
                  Preparando a proposta
                </span>
              ) : (
                <div className="flex flex-col gap-2">
                  <p>{resposta}</p>
                  <p className="text-al-muted">A proposta está em Aprovações, aguardando a decisão de um Administrador.</p>
                </div>
              )}
            </li>
          </ol>
        )}

        {etapa === 'pronta' && (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={fechar} className={BOTAO_SECUNDARIO}>
              Fechar
            </button>
            <Link to="/aprovacoes" onClick={fechar} className={BOTAO_PRIMARIO}>
              Ver em Aprovações
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
