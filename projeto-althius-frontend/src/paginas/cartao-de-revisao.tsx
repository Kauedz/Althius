import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IconeAgente } from '@/components/marca'
import { Button, buttonVariants } from '@/components/ui/button'
import { useDados, useFonte } from '@/fonte/contexto'
import { formatarDiaIsoPorExtenso } from '@/fonte/formatar-data'
import {
  dependentesDoIcp,
  DOCUMENTOS_DA_MEMORIA,
  ERRO_SO_ADMINISTRADOR_DECIDE_REVISAO,
  secoesAlteradas,
} from '@/fonte/regras-memoria'
import type { Aprovacao, Decisao, Papel, RevisaoDaMemoria } from '@/fonte/tipos'
import { cn, mensagemDeErro } from '@/lib/utils'
import { Mensagem } from '@/paginas/configuracoes/componentes'

/**
 * Uma revisão da Memória do Workspace na fila de Aprovações: o pedido, a origem, o que muda e o alcance.
 * Só Administradores veem a decisão; a fonte também recusa a de um Membro.
 */
export function CartaoDeRevisao({
  aprovacao,
  revisao,
  papel,
}: {
  aprovacao: Aprovacao
  revisao: RevisaoDaMemoria
  papel: Papel | null
}) {
  const { nome, titulo, agente, agenteId, especialidade } = DOCUMENTOS_DA_MEMORIA[revisao.documento]
  const mudancas = secoesAlteradas(revisao.vigenteNoPedido, revisao.proposto)
  const semMudanca = revisao.proposto.filter((s) => !mudancas.includes(s)).map((s) => s.titulo)
  const dependentes = dependentesDoIcp(revisao.proposto)
  const textoDoAlcance = {
    pendente: `Aprovar substitui o ${nome} vigente e atualiza de uma vez estas ${dependentes.length} configurações do Workspace, sem novas aprovações por módulo:`,
    aprovada: `O ${nome} vigente foi substituído e estas ${dependentes.length} configurações foram atualizadas de uma vez, sem novas aprovações por módulo:`,
    rejeitada: `Nada mudou: estas configurações continuam usando o ${nome} vigente. Com a aprovação, ficariam assim:`,
  }[aprovacao.estado]

  return (
    <article aria-label={titulo} className="cartao flex flex-col gap-5 p-6">
      <div className="flex items-center gap-4">
        <IconeAgente especialidade={especialidade} />
        <Link to={`/agentes/${agenteId}`} className="font-normal underline-offset-4 hover:underline">
          {agente}
        </Link>
        <Link to="/configuracoes/memoria" className="rotulo underline-offset-4 hover:underline">
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
        <p className="text-sm">{textoDoAlcance}</p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {dependentes.map((dependente) => (
            <li key={dependente.nome} className="grid grid-cols-[12rem_1fr] gap-x-6">
              <span className="rotulo pt-0.5 text-[0.625rem]">{dependente.modulo}</span>
              <span>
                {dependente.nome} <span className="text-al-muted">→ {dependente.resumo}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <DecisaoDaRevisao aprovacao={aprovacao} revisao={revisao} papel={papel} />
    </article>
  )
}

function DecisaoDaRevisao({ aprovacao, revisao, papel }: { aprovacao: Aprovacao; revisao: RevisaoDaMemoria; papel: Papel | null }) {
  const fonte = useFonte()
  const [erro, setErro] = useState<string | null>(null)
  const [decidindo, setDecidindo] = useState(false)
  const { nome } = DOCUMENTOS_DA_MEMORIA[revisao.documento]

  if (aprovacao.estado === 'aprovada') {
    return (
      <span className="rotulo text-al-sucesso">
        Aprovada por {revisao.decididaPor?.nome} · o {nome} vigente foi substituído e as configurações dependentes foram atualizadas
      </span>
    )
  }
  if (aprovacao.estado === 'rejeitada') {
    return (
      <span className="rotulo text-al-erro">
        Recusada por {revisao.decididaPor?.nome} · o {nome} vigente continua o mesmo
      </span>
    )
  }
  if (papel !== 'administrador') return <AguardandoAdministrador />

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
        <Button disabled={decidindo} onClick={() => decidir('aprovada')} className="px-6 tracking-rotulo uppercase">
          Aprovar
        </Button>
        <Button
          variant="outline"
          disabled={decidindo}
          onClick={() => decidir('rejeitada')}
          className="px-6 tracking-rotulo uppercase"
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
  const administradores = dados?.participantes.filter((p) => p.papel === 'administrador').map((p) => p.conta.nome) ?? []
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2" aria-hidden>
        <span className={cn(buttonVariants(), 'pointer-events-none px-6 tracking-rotulo uppercase opacity-40')}>Aprovar</span>
        <span className={cn(buttonVariants({ variant: 'outline' }), 'pointer-events-none px-6 tracking-rotulo uppercase opacity-40')}>
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
