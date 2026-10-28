import { Bot } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AvisoDeModuloIndisponivel } from '@/components/modulo-indisponivel'
import { Pagina } from '@/components/pagina'
import { Composer } from '@/conversa/composer'
import { useConversas } from '@/conversa/contexto'
import { useAmbiente, useDados } from '@/fonte/contexto'
import type { Mensagem } from '@/fonte/tipos'
import { ConversasSalvas } from '@/paginas/conversas-salvas'

/**
 * A tela inicial (`/`) é só o composer (Sinais first 10, ADR 0033 D1 e D9a): a grade dos quatro Agentes e o "Novo
 * agente" saíram. O dado dos Agentes antigos continua lido em `/agentes/:id`, só para leitura.
 */
export function PaginaAgentes() {
  const { disponivel } = useAmbiente()

  return (
    <Pagina titulo="Agentes" icone={Bot}>
      {/* Pedir algo aos Agentes é executá-los: sem provedor de modelo no Workspace, a tela diz isso, sem responder. */}
      {disponivel('conversas') ? <PedidoCoordenado /> : <AvisoDeModuloIndisponivel modulo="conversas" />}
    </Pagina>
  )
}

/** O composer da tela inicial: classifica o pedido; um pedido que não é Sinal abre a Conversa coordenada (ADR 0004). */
function PedidoCoordenado() {
  const conversas = useConversas()
  const sugestoes = useDados((fonte) => fonte.sugestoesCoordenadas(), [])
  const navegar = useNavigate()
  const { respondendo } = conversas.coordenada
  const { modo, disponivel } = useAmbiente()

  function coordenar(pedido: Mensagem) {
    conversas.coordenar(pedido)
    navegar('/conversa')
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
      <Composer
        nome="Pedido aos agentes"
        rotulo="Peça algo aos agentes"
        placeholder="Descreva o trabalho. A Althius chama os agentes certos."
        classificarIntencao
        criarSinalNoComposer={modo === 'real' && disponivel('sinais')}
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
