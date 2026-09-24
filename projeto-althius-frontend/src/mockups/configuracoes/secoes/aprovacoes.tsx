import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IconeAgente } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { cn } from '@/lib/utils'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Mensagem } from '../componentes'
import { DOCUMENTOS, dependentesDe } from '../dados'
import { useMockup, type Proposta } from '../estado'

export function PaginaDeAprovacoes() {
  const { propostas } = useMockup()
  const pendentes = propostas.filter((p) => p.estado === 'pendente')
  const decididas = propostas.filter((p) => p.estado !== 'pendente')

  return (
    <Pagina titulo="Aprovações" icone={ShieldCheck} className="max-w-4xl gap-10">
      <div className="flex flex-col gap-2">
        <p className="max-w-2xl text-lg text-al-muted">O que os agentes propuseram e só acontece com o seu ok.</p>
        <p className="text-sm text-al-muted">Neste mockup aparecem só as revisões da Memória do Workspace; as demais Aprovações do aplicativo continuam como estão.</p>
      </div>
      <section aria-label="Propostas" className="flex flex-col gap-6">
        <h2 className="titulo-secao text-3xl">Pendentes · {pendentes.length}</h2>
        {pendentes.length === 0 && (
          <p className="text-al-muted">
            <span className="anotacao text-lg">nada esperando por você</span> · peça uma revisão na{' '}
            <Link to="/configuracoes/memoria/icp" className="font-normal text-al-ink underline-offset-4 hover:underline">
              Memória do Workspace
            </Link>
            .
          </p>
        )}
        <ul className="flex flex-col gap-6">
          {pendentes.map((proposta) => (
            <li key={proposta.id}>
              <CartaoDeRevisao proposta={proposta} />
            </li>
          ))}
        </ul>
      </section>
      {decididas.length > 0 && (
        <section aria-label="Decididas" className="flex flex-col gap-6">
          <h2 className="titulo-secao text-3xl">Decididas · {decididas.length}</h2>
          <ul className="flex flex-col gap-6">
            {decididas.map((proposta) => (
              <li key={proposta.id}>
                <CartaoDeRevisao proposta={proposta} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Pagina>
  )
}

function CartaoDeRevisao({ proposta }: { proposta: Proposta }) {
  const { participantes, memoria } = useMockup()
  const { nome, agente, especialidade } = DOCUMENTOS[proposta.documentoId]
  const solicitante = participantes.find((p) => p.id === proposta.solicitanteId)?.nome ?? 'Pessoa removida do Workspace'
  const titulo = proposta.documentoId === 'icp' ? 'Revisar o ICP do Workspace' : 'Revisar as Personas do Workspace'

  const mudancas = proposta.secoes.filter((secao) => {
    const antes = proposta.vigenteNoPedido.find((s) => s.titulo === secao.titulo)
    return !antes || antes.texto !== secao.texto
  })
  const semMudanca = proposta.secoes.filter((s) => !mudancas.includes(s)).map((s) => s.titulo)
  const dependentes = dependentesDe({ ...memoria[proposta.documentoId], secoes: proposta.secoes })
  const textoDoAlcance = {
    pendente: `Aprovar substitui o ${nome} vigente e atualiza de uma vez estas ${dependentes.length} configurações do Workspace, sem novas aprovações por módulo:`,
    aprovada: `O ${nome} vigente foi substituído e estas ${dependentes.length} configurações foram atualizadas de uma vez, sem novas aprovações por módulo:`,
    recusada: `Nada mudou: estas configurações continuam usando o ${nome} vigente. Com a aprovação, ficariam assim:`,
  }[proposta.estado]

  return (
    <article aria-label={titulo} className="cartao flex flex-col gap-5 p-6">
      <div className="flex items-center gap-4">
        <IconeAgente especialidade={especialidade} />
        <span className="font-normal">{agente}</span>
        <span className="rotulo">Memória do Workspace</span>
        <span className="rotulo ml-auto">
          Pedido por {solicitante} · {proposta.criadaEm}
        </span>
      </div>
      <p className="text-xl font-normal">{titulo}</p>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-6 gap-y-2">
        <dt className="rotulo">Pedido</dt>
        <dd>“{proposta.pedido}”</dd>
        <dt className="rotulo">Por quê</dt>
        <dd className="text-al-muted">{proposta.resposta}</dd>
      </dl>

      <section aria-label="Alterações propostas" className="flex flex-col gap-3">
        <h3 className="rotulo">Alterações propostas</h3>
        <ul className="flex flex-col gap-3">
          {mudancas.map((secao) => {
            const antes = proposta.vigenteNoPedido.find((s) => s.titulo === secao.titulo)
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

      <Decisao proposta={proposta} nome={nome} quantidade={dependentes.length} />
    </article>
  )
}

function Decisao({ proposta, nome, quantidade }: { proposta: Proposta; nome: string; quantidade: number }) {
  const { ehAdministrador, decidir, participantes } = useMockup()
  const [erro, setErro] = useState<string | null>(null)

  if (proposta.estado === 'aprovada') {
    return (
      <span className="rotulo text-al-sucesso">
        Aprovada por {proposta.decididaPor} · o {nome} vigente foi substituído e {quantidade} configurações foram atualizadas
      </span>
    )
  }
  if (proposta.estado === 'recusada') {
    return (
      <span className="rotulo text-al-erro">
        Recusada por {proposta.decididaPor} · o {nome} vigente continua o mesmo
      </span>
    )
  }

  if (!ehAdministrador) {
    const admins = participantes.filter((p) => p.papel === 'administrador').map((p) => p.nome)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2" aria-hidden>
          <span className={cn(BOTAO_PRIMARIO, 'pointer-events-none opacity-40')}>Aprovar</span>
          <span className={cn(BOTAO_SECUNDARIO, 'pointer-events-none opacity-40')}>Recusar</span>
        </div>
        <Mensagem tipo="info">
          Somente Administradores aprovam ou recusam revisões do ICP e das Personas. Aguardando: {admins.join(' ou ')}.
        </Mensagem>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button type="button" onClick={() => setErro(decidir(proposta.id, 'aprovada'))} className={BOTAO_PRIMARIO}>
          Aprovar
        </button>
        <button type="button" onClick={() => setErro(decidir(proposta.id, 'recusada'))} className={BOTAO_SECUNDARIO}>
          Recusar
        </button>
      </div>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
    </div>
  )
}
