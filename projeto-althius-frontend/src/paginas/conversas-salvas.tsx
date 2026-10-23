import { History } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BOTAO_DISCRETO } from '@/components/botoes'
import { Mensagem } from '@/components/mensagem'
import { useConversas } from '@/conversa/contexto'
import { GavetaDeHistorico, temHistorico, useHistoricoDeConversas } from '@/conversa/gaveta-de-historico'
import { LinhaDeConversa } from '@/conversa/linha-de-conversa'
import { useFonte } from '@/fonte/contexto'
import type { ResumoDeConversa } from '@/fonte/tipos'

const RECENTES = 4

/** As mais recentes primeiro. O banco já manda assim; a ordenação segura a página se a ordem vier misturada. */
function maisRecentes(conversas: ResumoDeConversa[]): ResumoDeConversa[] {
  return [...conversas].sort((a, b) => (a.atualizadaEm < b.atualizadaEm ? 1 : -1)).slice(0, RECENTES)
}

/**
 * As Conversas coordenadas mais recentes de quem está na sessão, para reabrir e continuar de onde pararam, e as que
 * nasceram no Slack, para ler. "Ver todas" abre a gaveta. Só existe onde as Conversas ficam no banco; na
 * Demonstração, o bloco não aparece.
 */
export function ConversasSalvas() {
  const fonte = useFonte()
  const conversas = useConversas()
  const navegar = useNavigate()
  const { respondendo } = conversas.coordenada
  const [gaveta, setGaveta] = useState(false)
  const [ciclo, setCiclo] = useState(0)
  const historico = useHistoricoDeConversas(null, `${respondendo}-${ciclo}`, temHistorico(fonte))
  const agora = new Date()

  if (!temHistorico(fonte)) return null
  if (historico.erro && !historico.conversas) return <Mensagem tipo="erro">{historico.erro}</Mensagem>
  if (!historico.conversas || historico.conversas.length === 0) return null

  async function abrir(conversa: ResumoDeConversa) {
    // A do Slack abre só para leitura, na Conversa do Agente dela; a coordenada continua na página da Conversa.
    if (conversa.doSlack) {
      navegar(`/agentes/${encodeURIComponent(conversa.doSlack.agenteId)}/conversa?slack=${encodeURIComponent(conversa.id)}`)
      return
    }
    await conversas.abrir(conversa.id)
    navegar('/conversa')
  }

  function aoMudarGaveta(aberto: boolean) {
    setGaveta(aberto)
    if (!aberto) setCiclo((n) => n + 1)
  }

  const recentes = maisRecentes(historico.conversas)

  return (
    <section aria-label="Recentes" className="mt-3 flex flex-col">
      <div className="flex items-center justify-between gap-3 px-2 py-1.5">
        <h2 className="rotulo">Recentes</h2>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={gaveta}
          onClick={() => setGaveta(true)}
          className={BOTAO_DISCRETO}
        >
          <History strokeWidth={1.8} className="size-4" aria-hidden />
          Ver todas
        </button>
      </div>
      {historico.erro && <Mensagem tipo="erro">{historico.erro}</Mensagem>}
      <ul>
        {recentes.map((conversa) => (
          <LinhaDeConversa
            key={conversa.id}
            conversa={conversa}
            agora={agora}
            editando={historico.editando === conversa.id}
            nome={historico.nome}
            aoMudarNome={historico.definirNome}
            aoAbrir={() => void abrir(conversa)}
            aoIniciarRenome={historico.podeRenomear ? () => historico.iniciarRenome(conversa) : undefined}
            aoCancelarRenome={historico.cancelarRenome}
            aoSalvarNome={(evento) => void historico.salvarNome(evento, conversa.id)}
            aoArquivar={historico.podeArquivar ? () => void historico.arquivar(conversa.id) : undefined}
          />
        ))}
      </ul>
      <GavetaDeHistorico
        aberto={gaveta}
        aoMudar={aoMudarGaveta}
        agenteId={null}
        aoAbrir={abrir}
        versao={`${respondendo}-${ciclo}`}
      />
    </section>
  )
}
