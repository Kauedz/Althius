import { RadioTower, Users } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { SeloDeAderencia } from '@/components/aderencia'
import { LogoDaConta } from '@/components/logos'
import type { ContaAlvo } from '@/fonte/contas-tipos'
import {
  ESTAGIO_SO_DO_ENVIO_AO_CRM,
  ESTAGIOS_DE_PROSPECCAO,
  eEstagioDeProspeccao,
  type EstagioDeProspeccao,
} from '@/fonte/estagios-de-prospeccao'
import { cn } from '@/lib/utils'
import { Foguinho } from './sinais/componentes'
import type { EstadoDaNavegacao } from './voltar-para-a-lista'

const TIPO_DO_ARRASTE = 'application/x-althius-conta'

/**
 * A vista Kanban das Contas (kanban 03): uma coluna por Estágio de prospecção, na ordem do funil. Arrastar um cartão
 * para outra coluna, ou escolher o estágio no menu do cartão, move a Conta à mão; o banco decide quem pode (só o
 * Vendedor responsável), e a recusa aparece em português acima das colunas. No CRM não recebe cartões à mão: só o
 * envio ao CRM leva a Conta para lá.
 */
export function KanbanDeContas({
  contas,
  mover,
  estadoDoLink,
}: {
  contas: ContaAlvo[]
  mover: (contaId: string, estagio: EstagioDeProspeccao) => Promise<void>
  estadoDoLink: EstadoDaNavegacao
}) {
  const [erro, setErro] = useState<string>()
  const [movendo, setMovendo] = useState<string>()
  const [sobre, setSobre] = useState<EstagioDeProspeccao>()

  const porEstagio = new Map<EstagioDeProspeccao, ContaAlvo[]>(ESTAGIOS_DE_PROSPECCAO.map((e) => [e.id, []]))
  for (const conta of contas) porEstagio.get(conta.estagio ?? 'descoberta')!.push(conta)

  async function moverConta(conta: ContaAlvo, estagio: EstagioDeProspeccao) {
    if ((conta.estagio ?? 'descoberta') === estagio) return
    setErro(undefined)
    setMovendo(conta.id)
    try {
      await mover(conta.id, estagio)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível mover a Conta.')
    } finally {
      setMovendo(undefined)
    }
  }

  function soltar(e: DragEvent, estagio: EstagioDeProspeccao) {
    e.preventDefault()
    setSobre(undefined)
    const conta = contas.find((c) => c.id === e.dataTransfer.getData(TIPO_DO_ARRASTE))
    if (conta) void moverConta(conta, estagio)
  }

  return (
    // O kanban ocupa o resto da janela: as colunas rolam na horizontal e cada uma rola os cartões na vertical.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {erro && (
        <p role="alert" className="border border-al-line bg-al-surface px-3 py-2 text-sm text-al-ink">
          {erro}
        </p>
      )}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2" aria-label="Kanban de Contas" role="list">
        {ESTAGIOS_DE_PROSPECCAO.map(({ id, rotulo }) => {
          const daColuna = porEstagio.get(id)!
          const aceita = id !== ESTAGIO_SO_DO_ENVIO_AO_CRM
          return (
            <section
              key={id}
              role="listitem"
              aria-label={`${rotulo}, ${daColuna.length} ${daColuna.length === 1 ? 'conta' : 'contas'}`}
              onDragOver={(e) => {
                if (!aceita) return
                e.preventDefault()
                setSobre(id)
              }}
              onDragLeave={() => setSobre((atual) => (atual === id ? undefined : atual))}
              onDrop={(e) => aceita && soltar(e, id)}
              className={cn(
                'flex w-64 shrink-0 flex-col gap-2 overflow-y-auto border border-al-line bg-al-bg p-2',
                sobre === id && 'border-al-accent bg-al-surface/40',
              )}
            >
              <h3 className="sticky top-0 z-1 -mx-2 -mt-2 flex items-center justify-between bg-al-bg px-3 py-2 text-xs font-medium tracking-rotulo text-al-muted uppercase">
                <span>{rotulo}</span>
                <span className="tabular-nums">{daColuna.length}</span>
              </h3>
              {daColuna.map((conta) => (
                <CartaoDaConta
                  key={conta.id}
                  conta={conta}
                  estadoDoLink={estadoDoLink}
                  movendo={movendo === conta.id}
                  mover={(estagio) => moverConta(conta, estagio)}
                />
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function CartaoDaConta({
  conta,
  estadoDoLink,
  movendo,
  mover,
}: {
  conta: ContaAlvo
  estadoDoLink: EstadoDaNavegacao
  movendo: boolean
  mover: (estagio: EstagioDeProspeccao) => void
}) {
  const estagio = conta.estagio ?? 'descoberta'
  return (
    <article
      aria-label={conta.nome}
      draggable={!movendo}
      onDragStart={(e) => {
        e.dataTransfer.setData(TIPO_DO_ARRASTE, conta.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'flex cursor-grab flex-col gap-2 border border-al-line bg-al-surface p-2.5 text-sm active:cursor-grabbing',
        movendo && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2">
        <LogoDaConta nome={conta.nome} logo={conta.logo} deUmaCor={conta.logoDeUmaCor} />
        <Link to={`/contas/${conta.id}`} state={estadoDoLink} className="min-w-0 truncate font-medium hover:underline">
          {conta.nome}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Foguinho quantidade={conta.totalSinaisValidos ?? 0} />
        <SeloDeAderencia aderencia={conta.aderencia} />
        <span className="inline-flex items-center gap-1 text-xs text-al-muted">
          <Users className="size-3.5" aria-hidden />
          {conta.totalContatos} {conta.totalContatos === 1 ? 'contato' : 'contatos'}
        </span>
      </div>
      {conta.ultimoSinal && (
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-al-muted" title={conta.ultimoSinal.frase}>
          <RadioTower strokeWidth={1.8} className="size-3.5 shrink-0 text-al-accent" aria-hidden />
          <span className="truncate">{conta.ultimoSinal.frase}</span>
        </p>
      )}
      <select
        aria-label={`Mover ${conta.nome}`}
        value={estagio}
        disabled={movendo}
        onChange={(e) => eEstagioDeProspeccao(e.target.value) && mover(e.target.value)}
        className="h-7 cursor-pointer border border-al-line bg-al-bg px-1.5 text-xs text-al-ink"
      >
        {ESTAGIOS_DE_PROSPECCAO.map(({ id, rotulo }) => (
          <option key={id} value={id} disabled={id === ESTAGIO_SO_DO_ENVIO_AO_CRM && estagio !== id}>
            {rotulo}
          </option>
        ))}
      </select>
    </article>
  )
}
