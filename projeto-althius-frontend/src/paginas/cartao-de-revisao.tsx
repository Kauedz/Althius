import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ListaDeDependentes } from '@/components/documento-da-memoria'
import { IconeAgente } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Button, buttonVariants } from '@/components/ui/button'
import { useDados, useFonte } from '@/fonte/contexto'
import { formatarDiaIsoPorExtenso } from '@/fonte/formatar-data'
import { podeDecidir } from '@/fonte/regras'
import {
  dependentesDe,
  DOCUMENTOS_DA_MEMORIA,
  ERRO_SO_ADMINISTRADOR_DECIDE_REVISAO,
  frasesDo,
  secoesAlteradas,
} from '@/fonte/regras-memoria'
import type { AprovacaoDeRevisao, AprovacaoDeRevisaoDecidida, Decisao, Papel, RevisaoPendente } from '@/fonte/tipos'
import { cn, mensagemDeErro } from '@/lib/utils'

/**
 * Uma revisão da Memória do Workspace na fila de Aprovações: o pedido e a origem e, enquanto pendente, o que muda e o
 * alcance. Decidida, fica só o registro da decisão: o conteúdo não é guardado, e o aprovado é o vigente na Memória.
 * Só Administradores veem a decisão; a fonte também recusa a de um Membro.
 */
export function CartaoDeRevisao({ aprovacao, papel }: { aprovacao: AprovacaoDeRevisao; papel: Papel | null }) {
  const { revisao } = aprovacao
  const { titulo, agente, agenteId, especialidade } = DOCUMENTOS_DA_MEMORIA[revisao.documento]

  return (
    <article aria-label={titulo} className="cartao flex flex-col gap-5 p-6">
      <div className="flex items-center gap-4">
        <IconeAgente especialidade={especialidade} />
        <Link to={`/agentes/${agenteId}`} className="font-normal underline-offset-4 hover:underline">
          {agente}
        </Link>
        <Link to={`/configuracoes/memoria/${revisao.documento}`} className="rotulo underline-offset-4 hover:underline">
          Memória do Workspace
        </Link>
        <span className="rotulo ml-auto">
          Pedido por {revisao.solicitante.nome} · {formatarDiaIsoPorExtenso(revisao.pedidaEm)}
        </span>
      </div>
      <p className="text-xl font-normal">{titulo}</p>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-6 gap-y-2">
        <dt className="rotulo">Pedido</dt>
        <dd>“{revisao.pedido}”</dd>
        <dt className="rotulo">Por quê</dt>
        <dd className="text-al-muted">{aprovacao.justificativa}</dd>
      </dl>

      {aprovacao.estado === 'pendente' ? (
        <>
          <PropostaPendente revisao={aprovacao.revisao} />
          <DecisaoDaRevisao aprovacao={aprovacao} papel={papel} />
        </>
      ) : (
        <ResultadoDaDecisao aprovacao={aprovacao} />
      )}
    </article>
  )
}

/** O que a proposta muda no documento vigente e as configurações que a aprovação atualiza de uma vez. */
function PropostaPendente({ revisao }: { revisao: RevisaoPendente }) {
  const { oVigente } = frasesDo(revisao.documento)
  const mudancas = secoesAlteradas(revisao.vigenteNoPedido, revisao.proposto)
  const semMudanca = revisao.proposto.filter((s) => !mudancas.includes(s)).map((s) => s.titulo)
  const dependentes = dependentesDe(revisao.documento, revisao.proposto)

  return (
    <>
      <section aria-label="Alterações propostas" className="flex flex-col gap-3">
        <h3 className="rotulo">Alterações propostas</h3>
        <ul className="flex flex-col gap-3">
          {mudancas.map((secao) => {
            const antes = revisao.vigenteNoPedido.find((s) => s.titulo === secao.titulo)
            return (
              <li key={secao.titulo} className="grid grid-cols-[12rem_1fr] gap-x-6 border-l-2 border-al-accent pl-4">
                <span className="flex items-start gap-2 font-normal">
                  {secao.titulo}
                  {!antes && <span className="selo h-5 border-al-accent/60 text-al-ink">Nova</span>}
                </span>
                <div className="flex flex-col gap-1">
                  {antes && (
                    <p className="text-sm text-al-muted line-through decoration-al-muted/60">
                      <span className="sr-only">Vigente: </span>
                      {antes.texto}
                    </p>
                  )}
                  <p>
                    <span className="sr-only">Proposto: </span>
                    {secao.texto}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
        {semMudanca.length > 0 && <p className="text-sm text-al-muted">Sem mudança: {semMudanca.join(', ')}.</p>}
      </section>

      <section aria-label="Alcance" className="flex flex-col gap-3 border-t border-al-line pt-4">
        <h3 className="rotulo">Alcance</h3>
        <p className="text-sm">
          Aprovar substitui {oVigente} e atualiza de uma vez estas {dependentes.length} configurações do Workspace, sem
          novas aprovações por módulo:
        </p>
        <ListaDeDependentes dependentes={dependentes} />
      </section>
    </>
  )
}

function ResultadoDaDecisao({ aprovacao }: { aprovacao: AprovacaoDeRevisaoDecidida }) {
  const { documento, decididaPor } = aprovacao.revisao
  const { concordar, oVigente, foiSubstituido } = frasesDo(documento)
  if (aprovacao.estado === 'aprovada') {
    return (
      <span className="rotulo text-al-sucesso">
        Aprovada por {decididaPor.nome} · {oVigente} {foiSubstituido} e as configurações dependentes foram atualizadas
      </span>
    )
  }
  return (
    <span className="rotulo text-al-erro">
      Recusada por {decididaPor.nome} · {oVigente} {concordar('continua o mesmo', 'continuam as mesmas')}
    </span>
  )
}

function DecisaoDaRevisao({ aprovacao, papel }: { aprovacao: AprovacaoDeRevisao; papel: Papel | null }) {
  const fonte = useFonte()
  const [erro, setErro] = useState<string | null>(null)
  const [decidindo, setDecidindo] = useState(false)

  if (!papel || !podeDecidir('revisao-da-memoria', papel)) return <AguardandoAdministrador />

  async function decidir(decisao: Decisao) {
    setErro(null)
    setDecidindo(true)
    try {
      await fonte.decidirAprovacao(aprovacao.id, decisao, 'fila')
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setDecidindo(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button disabled={decidindo} onClick={() => decidir('aprovada')} className="px-6 tracking-[0.04em]">
          Aprovar
        </Button>
        <Button
          variant="outline"
          disabled={decidindo}
          onClick={() => decidir('rejeitada')}
          className="px-6 tracking-[0.04em]"
        >
          Recusar
        </Button>
      </div>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
    </div>
  )
}

/** O que um Membro vê: a decisão existe, mas cabe a um Administrador. Os botões são só ilustração. */
function AguardandoAdministrador() {
  const dados = useDados((fonte) => fonte.participantesDoWorkspace(), [])
  const administradores =
    dados?.participantes.filter((p) => podeDecidir('revisao-da-memoria', p.papel)).map((p) => p.conta.nome) ?? []
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2" aria-hidden>
        <span className={cn(buttonVariants(), 'pointer-events-none px-6 tracking-[0.04em] opacity-40')}>Aprovar</span>
        <span className={cn(buttonVariants({ variant: 'outline' }), 'pointer-events-none px-6 tracking-[0.04em] opacity-40')}>
          Recusar
        </span>
      </div>
      <Mensagem tipo="info">
        {ERRO_SO_ADMINISTRADOR_DECIDE_REVISAO}
        {administradores.length > 0 && ` Aguardando: ${administradores.join(' ou ')}.`}
      </Mensagem>
    </div>
  )
}
