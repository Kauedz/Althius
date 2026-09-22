import { ArrowRight, Check, Copy, Wrench } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { IconeAgente, Pulso } from '@/components/marca'
import { Button } from '@/components/ui/button'
import { MS_POR_CARACTERE, useConversas, type ItemDaConversa } from '@/conversa/contexto'
import { ListaDeMencoes, useMencao } from '@/conversa/mencao'
import { DecisaoDeAprovacao } from '@/components/decisao'
import { useDados } from '@/fonte/contexto'
import { ROTULO_DA_DECISAO } from '@/fonte/regras'
import type { Agente, AgenteId } from '@/fonte/tipos'
import { ROTULO_DO_CANAL } from '@/paginas/rotulos'

export function SecaoConversa({ agente }: { agente: Agente }) {
  const conversas = useConversas()
  const agentes = useDados((fonte) => fonte.agentes(), []) ?? []
  const itens = conversas.itens(agente.id)
  const respondendo = conversas.respondendo(agente.id)
  const [texto, setTexto] = useState('')
  const mencao = useMencao(texto, setTexto, agentes)
  const fim = useRef<HTMLDivElement>(null)
  const nomes = Object.fromEntries(agentes.map((a) => [a.id, a.nome])) as Record<AgenteId, string>

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [itens.length])

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    const mensagem = texto.trim()
    if (!mensagem || respondendo) return
    conversas.enviar(agente.id, { texto: mensagem })
    setTexto('')
  }

  return (
    <section aria-labelledby="titulo-conversa" className="flex max-w-3xl flex-col gap-6">
      <h2 id="titulo-conversa" className="sr-only">
        Conversa
      </h2>

      <div aria-live="polite" className="flex flex-col gap-6">
        {itens.length === 0 && (
          <p className="anotacao text-lg">comece por uma sugestão, ou mencione outro agente com @</p>
        )}
        {itens.map((item) => (
          <Item key={item.id} item={item} nomes={nomes} animar={conversas.animarDigitacao} />
        ))}
        {respondendo && (
          <div role="status" className="flex items-center gap-4 text-al-muted">
            <span className="relative size-5">
              <Pulso className="absolute inset-0" />
            </span>
            <span className="rotulo">{agente.nome} está trabalhando</span>
          </div>
        )}
        <div ref={fim} />
      </div>

      <div className="flex flex-wrap gap-2">
        {agente.sugestoes.map((sugestao) => (
          <Button
            key={sugestao.id}
            variant="outline"
            disabled={respondendo}
            onClick={() => conversas.enviar(agente.id, { texto: sugestao.texto, sugestaoId: sugestao.id })}
            className="h-auto px-4 py-2 font-light whitespace-normal"
          >
            {sugestao.texto}
          </Button>
        ))}
      </div>

      <form onSubmit={enviar} className="relative flex gap-2">
        {mencao.aberta && (
          <ListaDeMencoes
            id="conversa-mencoes"
            opcoes={mencao.opcoes}
            indice={mencao.indice}
            aoSelecionar={mencao.selecionar}
            className="absolute bottom-full left-0 mb-2 w-96"
          />
        )}
        <input
          aria-label={`Mensagem para ${agente.nome}`}
          aria-controls={mencao.aberta ? 'conversa-mencoes' : undefined}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => mencao.aoTeclar(evento)}
          placeholder={`Peça algo a ${agente.nome}. Use @ para chamar outro agente.`}
          className="campo flex-1"
        />
        <Button type="submit" disabled={respondendo || !texto.trim()} className="h-auto px-6 tracking-rotulo uppercase">
          Enviar
        </Button>
      </form>
    </section>
  )
}

function Item({ item, nomes, animar }: { item: ItemDaConversa; nomes: Record<AgenteId, string>; animar: boolean }) {
  switch (item.tipo) {
    case 'usuario':
      return <p className="self-end bg-al-surface px-4 py-2">{item.texto}</p>
    case 'ferramenta':
      return (
        <p className="flex items-center gap-2 text-sm text-al-muted">
          <Wrench strokeWidth={1.8} className="size-4" aria-hidden />
          {item.descricao}
        </p>
      )
    case 'texto':
      return (
        <div className="flex gap-4">
          <IconeAgente id={item.agenteId} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="rotulo">{nomes[item.agenteId]}</span>
              <BotaoCopiar texto={item.texto} />
            </div>
            <TextoDigitado texto={item.texto} animar={animar} />
          </div>
        </div>
      )
    case 'repasse':
      return (
        <div
          role="note"
          aria-label={`Repasse de ${nomes[item.de]} para ${nomes[item.para]}`}
          className="flex items-center gap-4 border-l-2 border-al-accent-2 py-2 pl-4"
        >
          <span className="rotulo text-al-ink">{nomes[item.de]}</span>
          <ArrowRight strokeWidth={1.8} className="size-4 text-al-accent-2" aria-hidden />
          <span className="rotulo text-al-ink">{nomes[item.para]}</span>
          <span className="text-sm text-al-muted">{item.resumo}</span>
        </div>
      )
    case 'aprovacao':
      return <CartaoDeAprovacao aprovacaoId={item.aprovacaoId} />
  }
}

function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      // Sem acesso à área de transferência: nada a fazer na demo.
    }
  }
  return (
    <Button variant="ghost" size="sm" onClick={copiar} aria-label={copiado ? 'Copiado' : 'Copiar resposta'}>
      {copiado ? <Check strokeWidth={1.8} aria-hidden /> : <Copy strokeWidth={1.8} aria-hidden />}
    </Button>
  )
}

/** Mostra o texto com efeito de digitação. Parágrafos separados por linha em branco; "- " vira lista. */
function TextoDigitado({ texto, animar }: { texto: string; animar: boolean }) {
  const [visiveis, setVisiveis] = useState(animar ? 0 : texto.length)

  useEffect(() => {
    if (!animar) return
    const passo = 3
    const intervalo = setInterval(() => {
      setVisiveis((atual) => {
        if (atual + passo >= texto.length) clearInterval(intervalo)
        return Math.min(atual + passo, texto.length)
      })
    }, MS_POR_CARACTERE * passo)
    return () => clearInterval(intervalo)
  }, [texto, animar])

  return <TextoFormatado texto={texto.slice(0, visiveis)} />
}

function TextoFormatado({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col gap-2">
      {texto.split('\n\n').map((bloco, i) => {
        const linhas = bloco.split('\n')
        const itensDeLista = linhas.filter((l) => l.startsWith('- '))
        if (itensDeLista.length === 0) return <p key={i} className="whitespace-pre-line">{bloco}</p>
        const introducao = linhas.filter((l) => !l.startsWith('- '))
        return (
          <div key={i}>
            {introducao.length > 0 && <p>{introducao.join('\n')}</p>}
            <ul className="flex list-none flex-col gap-1 pl-0">
              {itensDeLista.map((linha, j) => (
                <li key={j} className="flex gap-2">
                  <span className="text-al-accent" aria-hidden>
                    ·
                  </span>
                  {linha.slice(2)}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function CartaoDeAprovacao({ aprovacaoId }: { aprovacaoId: string }) {
  const aprovacoes = useDados((f) => f.aprovacoes(), [])
  const aprovacao = aprovacoes?.find((a) => a.id === aprovacaoId)
  if (!aprovacao) return null

  const rotuloDoEstado = aprovacao.estado === 'pendente' ? 'Aprovação pendente' : ROTULO_DA_DECISAO[aprovacao.estado]

  return (
    <article
      aria-label={`${rotuloDoEstado}: ${aprovacao.acao}`}
      className="cartao flex flex-col gap-4 border-l-2 border-al-accent p-6"
    >
      <span className="rotulo text-al-accent">{rotuloDoEstado}</span>
      <p className="text-lg font-normal">{aprovacao.acao}</p>
      <p className="text-sm text-al-muted">{aprovacao.impacto}</p>
      {aprovacao.origem !== 'althius' && (
        <p className="anotacao">também enviada ao {ROTULO_DO_CANAL[aprovacao.origem]}</p>
      )}
      {aprovacao.estado === 'pendente' && <DecisaoDeAprovacao aprovacao={aprovacao} onde="althius" />}
    </article>
  )
}
