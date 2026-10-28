import { Bot, CalendarClock, MousePointerClick, Plus, Repeat2 } from 'lucide-react'
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
import { ConversasSalvas } from '@/paginas/conversas-salvas'
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
            className="h-8 gap-2 bg-al-ink px-4 tracking-[0.04em] text-al-bg hover:bg-al-ink/90"
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
        <div className="flex flex-col gap-3">
          <p className="rotulo">Especialistas</p>
          <ul aria-label="Agentes do Workspace" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {agentes.map((agente) => (
            <li key={agente.id}>
              <CartaoDeAgente agente={agente} integracoes={integracoes} conversasDisponiveis={disponivel('conversas')} />
            </li>
          ))}
          </ul>
        </div>
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
  const { respondendo } = conversas.coordenada

  function coordenar(pedido: Mensagem) {
    conversas.coordenar(pedido)
    navegar('/conversa')
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
      <Composer
        nome="Pedido aos agentes"
        rotulo="Peça algo aos agentes"
        placeholder="Descreva o trabalho. A Althius chama os agentes certos. Use @ para chamar um agente específico."
        comEspecialidades
        classificarIntencao
        ocupado={respondendo}
        aoEnviar={(texto, anexos) => coordenar({ texto, ...(anexos.length ? { anexos } : {}) })}
      />
      <div className="flex flex-wrap justify-center gap-2">
        {sugestoes?.map((sugestao) => (
          <button
            key={sugestao.id}
            type="button"
            disabled={respondendo}
            onClick={() => coordenar({ texto: sugestao.texto, sugestaoId: sugestao.id })}
            className="inline-flex items-center rounded-full border border-al-line px-4 py-2 text-sm font-light hover:border-al-muted disabled:opacity-50"
          >
            {sugestao.texto}
          </button>
        ))}
      </div>
      <ConversasSalvas />
    </div>
  )
}

function CartaoDeAgente({
  agente,
  integracoes,
  conversasDisponiveis,
}: {
  agente: Agente
  integracoes: Integracao[]
  conversasDisponiveis: boolean
}) {
  const quando = agente.rotinaAtiva ? descreverFrequencia(agente.rotinaAtiva) : 'Sob demanda'
  const IconeDoGatilho = agente.rotinaAtiva ? CalendarClock : MousePointerClick

  return (
    <Link
      to={`/agentes/${agente.id}`}
      aria-label={agente.nome}
      className="cartao flex h-full flex-col gap-2.5 border border-al-line p-3.5 transition-colors hover:border-al-muted"
    >
      <div className="flex items-center gap-2">
        <IconeAgente especialidade={agente.especialidade.id} />
        <span className="min-w-0 flex-1 truncate leading-tight font-normal">{agente.nome}</span>
        <SeloDeEstado estado={agente.estado} conversasDisponiveis={conversasDisponiveis} />
      </div>
      <div className="flex items-center gap-3 text-sm text-al-muted">
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          <IconeDoGatilho strokeWidth={1.8} className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{quando}</span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap tabular-nums">
          <Repeat2 strokeWidth={1.8} className="size-3.5" aria-hidden />
          <strong className="font-normal text-al-ink">{agente.execucoes}</strong> execuções
        </span>
      </div>
      <span className="flex items-center gap-1.5 border-t border-al-divisor pt-2.5">
        {agente.integracoes.map((id) => (
          <LogoDaIntegracao key={id} id={id} nome={integracoes.find((i) => i.id === id)?.nome ?? id} />
        ))}
      </span>
    </Link>
  )
}
