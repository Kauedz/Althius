import { ArrowRight, CircleCheck, Clock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Carregando, IconeAgente, Pulso } from '@/components/marca'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useDados, useFonte } from '@/fonte/contexto'
import { formatarDiaIsoPorExtenso } from '@/fonte/formatar-data'
import { dependentesDoIcp, DOCUMENTOS_DA_MEMORIA } from '@/fonte/regras-memoria'
import type { Aprovacao, IcpVigente } from '@/fonte/tipos'
import { mensagemDeErro } from '@/lib/utils'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/paginas/sinais/componentes'
import { Bloco, Mensagem } from './componentes'

const { nome, comArtigo, agente, especialidade } = DOCUMENTOS_DA_MEMORIA.icp

/**
 * Memória do Workspace: o ICP vigente, a referência que os módulos leem. Não há edição direta: qualquer
 * participante pede revisão ao Scopus, e o ICP só muda quando um Administrador aprova a proposta.
 */
export function SecaoMemoria() {
  const memoria = useDados((fonte) => fonte.memoriaDoWorkspace(), [])
  const aprovacoes = useDados((fonte) => fonte.aprovacoes(), [])

  return (
    <section aria-labelledby="titulo-memoria-do-workspace" className="flex max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 id="titulo-memoria-do-workspace" className="titulo-secao text-3xl">
            Memória do Workspace
          </h2>
          <span className="selo border-al-accent/50 text-al-ink">Compartilhado com o Workspace</span>
        </div>
        <p className="text-al-muted">
          O contexto que os Agentes e os módulos usam como referência. É do Workspace, separado da Memória de cada
          Agente, e só muda depois da aprovação de um Administrador.
        </p>
      </div>
      {!memoria || !aprovacoes ? (
        <Carregando />
      ) : (
        <DocumentoIcp icp={memoria.icp} revisoes={aprovacoes.filter((a) => a.revisao?.documento === 'icp')} />
      )}
      <p className="border border-al-line bg-al-surface px-4 py-3 text-sm text-al-muted">
        As Personas do Ethos entram na Memória do Workspace num próximo ticket.
      </p>
    </section>
  )
}

function DocumentoIcp({ icp, revisoes }: { icp: IcpVigente; revisoes: Aprovacao[] }) {
  const [pedindo, setPedindo] = useState(false)
  const pendente = revisoes.find((r) => r.estado === 'pendente')
  // As revisões vêm da mais nova para a mais antiga: a primeira decidida é a última decisão.
  const ultimaDecidida = revisoes.find((r) => r.estado !== 'pendente')
  const aprovadoEm = formatarDiaIsoPorExtenso(icp.aprovadoEm)
  const veioDeRevisao = ultimaDecidida?.estado === 'aprovada'

  return (
    <>
      <section aria-label={`${nome} vigente`} className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <IconeAgente especialidade={especialidade} tamanho="lg" />
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <h3 className="titulo-secao text-2xl">{nome}</h3>
                <span className="selo border-al-sucesso/60 text-al-ink">
                  <span className="size-1.5 rounded-full bg-al-sucesso" aria-hidden />
                  Vigente
                </span>
              </div>
              <span className="text-sm text-al-muted">
                Aprovado em {aprovadoEm} por {icp.aprovadoPor.nome} · mantido pelo {agente}
              </span>
            </div>
          </div>
          {pendente ? (
            <Link to="/aprovacoes" className={BOTAO_SECUNDARIO}>
              Ver proposta pendente
              <ArrowRight strokeWidth={1.8} className="size-4" aria-hidden />
            </Link>
          ) : (
            <button type="button" onClick={() => setPedindo(true)} className={BOTAO_PRIMARIO}>
              Solicitar revisão ao {agente}
            </button>
          )}
        </div>

        {pendente && (
          <div className="flex items-start gap-3 border border-al-atencao/50 bg-al-atencao/5 p-4">
            <Clock strokeWidth={1.8} className="mt-0.5 size-4 shrink-0 text-al-atencao" aria-hidden />
            <p className="text-sm">
              <span className="font-normal">Proposta pendente do {agente}.</span>{' '}
              <span className="text-al-muted">
                Enquanto um Administrador não decidir, o {nome} abaixo continua valendo em todo o Workspace.
              </span>
            </p>
          </div>
        )}
        {!pendente && ultimaDecidida?.estado === 'rejeitada' && (
          <Mensagem tipo="info">
            A última proposta do {agente} foi recusada por {ultimaDecidida.revisao?.decididaPor?.nome}. O {nome} vigente
            não mudou.
          </Mensagem>
        )}
        {veioDeRevisao && (
          <Mensagem tipo="sucesso">
            Este {nome} substituiu o anterior com a aprovação de {aprovadoEm}, e as configurações abaixo já usam o novo
            contexto.
          </Mensagem>
        )}

        <dl className="cartao grid grid-cols-[12rem_1fr] gap-x-8 gap-y-4 p-6">
          {icp.secoes.map((secao) => (
            <div key={secao.titulo} className="contents">
              <dt className="rotulo pt-0.5">{secao.titulo}</dt>
              <dd className="leading-relaxed">{secao.texto}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-al-muted">
          A Memória do Workspace guarda só a versão vigente: não há histórico nem restauração. Para mudar o {nome},
          peça ao {agente}; não há edição direta.
        </p>
      </section>

      <Bloco
        titulo="Onde este contexto é usado"
        descricao={`Estas configurações leem o ${nome} vigente. Uma aprovação atualiza todas de uma vez, sem novas aprovações por módulo.`}
      >
        <ul aria-label={`Configurações que usam o ${nome}`} className="flex flex-col">
          {dependentesDoIcp(icp.secoes).map((dependente) => (
            <li
              key={dependente.nome}
              aria-label={dependente.nome}
              className="grid grid-cols-[12rem_1fr_auto] items-baseline gap-x-8 border-b border-al-line py-3 last:border-b-0"
            >
              <span className="rotulo">{dependente.modulo}</span>
              <span className="flex flex-col">
                <span className="font-normal">{dependente.nome}</span>
                <span className="text-sm text-al-muted">{dependente.resumo}</span>
              </span>
              {veioDeRevisao ? (
                <span className="inline-flex items-center gap-1 text-xs text-al-sucesso">
                  <CircleCheck strokeWidth={1.8} className="size-3.5" aria-hidden />
                  Atualizada em {aprovadoEm}
                </span>
              ) : (
                <span className="text-xs text-al-muted">Em uso</span>
              )}
            </li>
          ))}
        </ul>
      </Bloco>

      <DialogoDeRevisao aberto={pedindo} aoFechar={() => setPedindo(false)} />
    </>
  )
}

/** A Conversa demonstrativa com o Scopus: o pedido vira uma proposta pendente em Aprovações. */
function DialogoDeRevisao({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const fonte = useFonte()
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
      const proposta = await fonte.solicitarRevisao('icp', pedido)
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
          Uma Conversa com o {agente}, que prepara a proposta e a envia para Aprovações. O {nome} só muda quando um
          Administrador aprovar.
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
                placeholder="Ex.: estamos fechando com empresas menores na Colômbia e no Chile."
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
