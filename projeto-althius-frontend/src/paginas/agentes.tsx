import { Bot, CalendarClock, MessageSquare, MousePointerClick, Plus, Repeat2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogoDaIntegracao } from '@/components/logos'
import { Carregando, IconeAgente, SeloDeEstado } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { AvisoDeModuloIndisponivel } from '@/components/modulo-indisponivel'
import { Composer } from '@/conversa/composer'
import { useConversas } from '@/conversa/contexto'
import { useAmbiente, useDados } from '@/fonte/contexto'
import type { Agente, Integracao, Mensagem } from '@/fonte/tipos'
import { usePodeAdministrarAgentes } from '@/paginas/administracao-de-agentes'
import { DialogoNovoAgente } from '@/paginas/novo-agente'
import { descreverFrequencia } from '@/paginas/rotulos'

export function PaginaAgentes() {
  const agentes = useDados((fonte) => fonte.agentes(), [])
  const integracoes = useDados((fonte) => fonte.integracoes(), [])
  const [criando, setCriando] = useState(false)
  const { disponivel } = useAmbiente()
  const podeAdministrar = usePodeAdministrarAgentes()

  return (
    <Pagina
      titulo="Agentes"
      icone={Bot}
      acoes={
        podeAdministrar && (
          <Button
            onClick={() => setCriando(true)}
            className="h-8 gap-2 bg-al-ink px-4 tracking-rotulo text-al-bg uppercase hover:bg-al-ink/90"
          >
            <Plus strokeWidth={1.8} aria-hidden />
            Novo agente
          </Button>
        )
      }
    >
      {!agentes || !integracoes ? (
        <Carregando />
      ) : (
        <ul aria-label="Agentes do Workspace" className="grid grid-cols-3 gap-4">
          {agentes.map((agente) => (
            <li key={agente.id}>
              <CartaoDeAgente agente={agente} integracoes={integracoes} />
            </li>
          ))}
        </ul>
      )}
      {/* Pedir algo aos Agentes é executá-los: sem provedor de modelo no Workspace, a tela diz isso, sem responder. */}
      {disponivel('conversas') ? <PedidoCoordenado /> : <AvisoDeModuloIndisponivel modulo="conversas" />}
      <DialogoNovoAgente aberto={criando} aoMudar={setCriando} />
    </Pagina>
  )
}

/** O composer abaixo da grade: um pedido sem escolher um Agente abre a Conversa coordenada (ADR 0004). */
function PedidoCoordenado() {
  const conversas = useConversas()
  const sugestoes = useDados((fonte) => fonte.sugestoesCoordenadas(), [])
  const navegar = useNavigate()
  const { itens, respondendo } = conversas.coordenada
  const ultimoPedido = itens.findLast((item) => item.tipo === 'pedido')

  function coordenar(pedido: Mensagem) {
    conversas.coordenar(pedido)
    navegar('/conversa')
  }

  return (
    <div className="flex flex-col gap-3">
      <Composer
        nome="Pedido aos agentes"
        rotulo="Peça algo aos agentes"
        placeholder="Descreva o trabalho. A Althius chama os agentes certos. Use @ para chamar um agente específico."
        comEspecialidades
        ocupado={respondendo}
        aoEnviar={(texto) => coordenar({ texto })}
      />
      <div className="flex flex-wrap gap-2">
        {sugestoes?.map((sugestao) => (
          <button
            key={sugestao.id}
            type="button"
            disabled={respondendo}
            onClick={() => coordenar({ texto: sugestao.texto, sugestaoId: sugestao.id })}
            className="inline-flex h-8 items-center gap-2 border border-al-line px-3 text-sm hover:border-al-ink disabled:opacity-50"
          >
            <MessageSquare strokeWidth={1.8} className="size-3.5 text-al-muted" aria-hidden />
            {sugestao.texto}
          </button>
        ))}
      </div>
      {ultimoPedido && (
        <section
          aria-label="Conversa coordenada em andamento"
          className="flex items-center justify-between gap-6 border border-al-line bg-al-surface py-3 pr-6 pl-5"
        >
          <span className="flex min-w-0 items-center gap-3">
            <MessageSquare strokeWidth={1.8} className="size-4 shrink-0 text-al-muted" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="rotulo">Conversa coordenada em andamento</span>
              <span className="truncate">{ultimoPedido.texto}</span>
            </span>
          </span>
          <Link
            to="/conversa"
            className="inline-flex h-8 shrink-0 items-center border border-al-line px-4 text-xs font-normal tracking-rotulo uppercase hover:border-al-ink"
          >
            Abrir conversa
          </Link>
        </section>
      )}
    </div>
  )
}

function CartaoDeAgente({ agente, integracoes }: { agente: Agente; integracoes: Integracao[] }) {
  const quando = agente.rotinaAtiva ? descreverFrequencia(agente.rotinaAtiva) : 'Sob demanda'
  const IconeDoGatilho = agente.rotinaAtiva ? CalendarClock : MousePointerClick

  return (
    <Link
      to={`/agentes/${agente.id}`}
      aria-label={agente.nome}
      className="cartao flex h-full min-h-42 flex-col gap-2.5 border border-al-line p-5 transition-colors hover:border-al-muted"
    >
      <div className="flex items-center gap-2.5">
        <IconeAgente especialidade={agente.especialidade.id} />
        <span className="min-w-0 flex-1 leading-tight font-normal">{agente.nome}</span>
        <SeloDeEstado estado={agente.estado} />
      </div>
      <p className="line-clamp-2 text-sm leading-relaxed text-al-muted">{agente.descricao}</p>
      <div className="mt-auto flex items-center gap-3 pt-2 text-sm text-al-muted">
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          <IconeDoGatilho strokeWidth={1.8} className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{quando}</span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap tabular-nums">
          <Repeat2 strokeWidth={1.8} className="size-3.5" aria-hidden />
          <strong className="font-normal text-al-ink">{agente.execucoes}</strong> execuções
        </span>
        <span className="flex items-center gap-1.5">
          {agente.integracoes.map((id) => (
            <LogoDaIntegracao key={id} id={id} nome={integracoes.find((i) => i.id === id)?.nome ?? id} />
          ))}
        </span>
      </div>
    </Link>
  )
}
