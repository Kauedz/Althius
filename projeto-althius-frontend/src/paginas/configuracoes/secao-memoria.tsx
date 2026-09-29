import { ArrowRight, CircleCheck, Clock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { ListaDeDependentes, SecoesDoDocumento } from '@/components/documento-da-memoria'
import { Carregando, IconeAgente, Pulso } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useDados, useFonte } from '@/fonte/contexto'
import { formatarDiaIsoPorExtenso } from '@/fonte/formatar-data'
import {
  dependentesDe,
  DOCUMENTOS_DA_MEMORIA,
  ehDocumentoDaMemoria,
  frasesDo,
  maiuscula,
  revisoesDo,
} from '@/fonte/regras-memoria'
import type { AprovacaoDeRevisao, DocumentoDaMemoria, DocumentoVigente } from '@/fonte/tipos'
import { mensagemDeErro } from '@/lib/utils'
import { AbasDasPaginas, Bloco, SecaoDeConfiguracoes } from './componentes'

/** Uma aba por documento da Memória do Workspace: /configuracoes/memoria/icp e /configuracoes/memoria/personas. */
const PAGINAS = Object.fromEntries(Object.entries(DOCUMENTOS_DA_MEMORIA).map(([id, { nome }]) => [id, nome]))

/**
 * Memória do Workspace: o ICP e as Personas vigentes, a referência que os módulos leem, um documento por aba. Não há
 * edição direta: qualquer participante pede revisão ao Agente do documento, e ele só muda quando um Administrador
 * aprova a proposta.
 */
export function SecaoMemoria() {
  const { pagina: documento } = useParams()
  const memoria = useDados((fonte) => fonte.memoriaDoWorkspace(), [])
  const aprovacoes = useDados((fonte) => fonte.aprovacoes(), [])
  if (!ehDocumentoDaMemoria(documento)) return <Navigate to="/configuracoes/memoria/icp" replace />

  return (
    <SecaoDeConfiguracoes
      id="memoria-do-workspace"
      titulo="Memória do Workspace"
      alcance="workspace"
      descricao="O contexto que os Agentes e os módulos usam como referência. É do Workspace, separado da Memória de cada Agente, e só muda depois da aprovação de um Administrador."
    >
      <AbasDasPaginas secao="memoria" paginas={PAGINAS} rotuloAcessivel="Documentos da Memória do Workspace" />
      {!memoria || !aprovacoes ? (
        <Carregando />
      ) : (
        <DocumentoNaMemoria
          key={documento}
          documento={documento}
          vigente={memoria[documento]}
          revisoes={revisoesDo(documento, aprovacoes)}
        />
      )}
    </SecaoDeConfiguracoes>
  )
}

/**
 * A Memória do Workspace no Workspace operacional (CRM-09, bloqueado pela execução dos Agentes, CRM-14): quem propõe o
 * ICP e as Personas é o Agente do documento, e os Agentes já existem aqui, mas ainda não rodam. Até lá a seção diz por
 * que está vazia, sem documento de exemplo e sem edição direta no lugar.
 */
export function SecaoMemoriaDoWorkspaceOperacional() {
  const { icp, personas } = DOCUMENTOS_DA_MEMORIA
  return (
    <SecaoDeConfiguracoes
      id="memoria-do-workspace"
      titulo="Memória do Workspace"
      alcance="workspace"
      descricao="O contexto que os Agentes e os módulos usam como referência. É do Workspace e só muda depois da aprovação de um Administrador."
    >
      <div role="status" className="flex max-w-2xl flex-col items-start gap-2 border border-dashed border-al-line px-5 py-4">
        <span className="selo">Aguardando a execução dos Agentes</span>
        <p className="text-al-ink">O ICP e as Personas deste Workspace chegam junto com a execução dos Agentes.</p>
        <p className="text-sm text-al-muted">
          Quem propõe o ICP é o {icp.agente}, e quem propõe as Personas é o {personas.agente}; um Administrador aprova em
          Aprovações. Esses Agentes ainda não rodam neste Workspace, então ainda não há ICP nem Personas a mostrar, e não
          existe edição direta no lugar deles. Os documentos de exemplo aparecem só na Demonstração.
        </p>
      </div>
    </SecaoDeConfiguracoes>
  )
}

function DocumentoNaMemoria({
  documento,
  vigente,
  revisoes,
}: {
  documento: DocumentoDaMemoria
  vigente: DocumentoVigente
  revisoes: AprovacaoDeRevisao[]
}) {
  const [pedindo, setPedindo] = useState(false)
  const { nome, oNome, agente, especialidade } = DOCUMENTOS_DA_MEMORIA[documento]
  const { concordar, oVigente, naoMudou } = frasesDo(documento)
  const pendente = revisoes.find((r) => r.estado === 'pendente')
  // As revisões vêm da mais nova para a mais antiga: a primeira decidida é a última decisão.
  const ultimaDecidida = revisoes.find((r) => r.estado !== 'pendente')
  const recusadaPor = ultimaDecidida?.estado === 'rejeitada' ? ultimaDecidida.revisao.decididaPor : undefined
  const aprovadoEm = formatarDiaIsoPorExtenso(vigente.aprovadoEm)
  const veioDeRevisao = ultimaDecidida?.estado === 'aprovada'

  return (
    <>
      <section aria-label={`${nome} ${concordar('vigente', 'vigentes')}`} className="flex flex-col gap-6">
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
                {concordar('Aprovado', 'Aprovadas')} em {aprovadoEm} por {vigente.aprovadoPor.nome} ·{' '}
                {concordar('mantido', 'mantidas')} pelo {agente}
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
                Enquanto um Administrador não decidir, {oNome} abaixo {concordar('continua', 'continuam')} valendo em
                todo o Workspace.
              </span>
            </p>
          </div>
        )}
        {!pendente && recusadaPor && (
          <Mensagem tipo="info">
            A última proposta do {agente} foi recusada por {recusadaPor.nome}. {maiuscula(oVigente)} {naoMudou}.
          </Mensagem>
        )}
        {veioDeRevisao && (
          <Mensagem tipo="sucesso">
            {concordar(`Este ${nome} substituiu o anterior`, `Estas ${nome} substituíram as anteriores`)} com a
            aprovação de {aprovadoEm}, e as configurações abaixo já usam o novo contexto.
          </Mensagem>
        )}

        <SecoesDoDocumento secoes={vigente.secoes} className="cartao gap-y-4 p-6" />
        {documento === 'personas' && (
          <p className="text-sm text-al-muted">
            Cada Persona descreve um papel do Comitê de compra. As Personas classificam os Contatos em Contas e Contatos e não
            são participantes do Workspace.
          </p>
        )}
        <p className="text-sm text-al-muted">
          A Memória do Workspace guarda só o documento vigente: não há histórico nem restauração. Para mudar {oNome},
          peça ao {agente}; não há edição direta.
        </p>
      </section>

      <Bloco
        titulo="Onde este contexto é usado"
        descricao={`Estas configurações leem ${oVigente}. Uma aprovação atualiza todas de uma vez, sem novas aprovações por módulo.`}
      >
        <ListaDeDependentes
          dependentes={dependentesDe(documento, vigente.secoes)}
          rotuloAcessivel={`Configurações que usam ${oNome}`}
          situacao={
            veioDeRevisao ? (
              <span className="inline-flex items-center gap-1 text-xs text-al-sucesso">
                <CircleCheck strokeWidth={1.8} className="size-3.5" aria-hidden />
                Atualizada em {aprovadoEm}
              </span>
            ) : (
              <span className="text-xs text-al-muted">Em uso</span>
            )
          }
        />
      </Bloco>

      <DialogoDeRevisao documento={documento} aberto={pedindo} aoFechar={() => setPedindo(false)} />
    </>
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
