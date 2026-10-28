import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Pagina } from '@/components/pagina'
import { BOTAO_PRIMARIO } from '@/components/botoes'
import { useDados, useDadosDeSinais, useFonteDeSinais } from '@/fonte/contexto'
import type { PedidoDeSinal, StatusDoPedido, UrgenciaDoPedido } from '@/fonte/sinais-tipos'

const URGENCIAS: { id: UrgenciaDoPedido; rotulo: string }[] = [
  { id: 'esta_semana', rotulo: 'Esta semana' },
  { id: 'este_mes', rotulo: 'Este mês' },
  { id: 'sem_pressa', rotulo: 'Sem pressa' },
]

const ROTULO_DO_STATUS: Record<StatusDoPedido, string> = {
  novo: 'Novo',
  em_analise: 'Em análise',
  em_construcao: 'Em construção',
  disponivel: 'Disponível',
  recusado: 'Recusado',
}

/** Pedido de um Sinal que a equipe Althius monta. Não cobra e não cria Monitoramento. */
export function PaginaDePedidoDeSinal() {
  const fonte = useFonteDeSinais()
  const localizacao = useLocation()
  const { dados: pedidos, recarregar } = useDadosDeSinais((f) => f.pedidosDeSinal(), [])
  const workspace = useDados((f) => f.workspace(), [])
  const memoria = useDados((f) => f.memoriaDoWorkspace(), [])
  const segmentos = memoria?.icp.secoes.find((secao) => secao.titulo === 'Segmentos')?.texto ?? ''

  const [evento, setEvento] = useState(() => {
    const estado = localizacao.state as { briefing?: unknown } | null
    return typeof estado?.briefing === 'string' ? estado.briefing : ''
  })
  const [empresas, setEmpresas] = useState<string | null>(null)
  const [fontes, setFontes] = useState('')
  const [urgencia, setUrgencia] = useState<UrgenciaDoPedido>('este_mes')
  const [nome, setNome] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [whatsapp, setWhatsapp] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [recebido, setRecebido] = useState(false)

  const empresasValor = empresas ?? segmentos
  const nomeValor = nome ?? workspace?.usuario.nome ?? ''
  const emailValor = email ?? workspace?.usuario.email ?? ''

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!evento.trim()) {
      setErro('Conte o evento que você quer acompanhar.')
      return
    }
    if (!empresasValor.trim()) {
      setErro('Diga as empresas ou o nicho.')
      return
    }
    if (!nomeValor.trim() || !emailValor.trim()) {
      setErro('Nome e e-mail são o contato da equipe.')
      return
    }
    setErro(null)
    setEnviando(true)
    try {
      await fonte.pedirSinal({
        evento: evento.trim(),
        empresasOuNicho: empresasValor.trim(),
        ...(fontes.trim() ? { fontesConhecidas: fontes.trim() } : {}),
        urgencia,
        contato: {
          nome: nomeValor.trim(),
          email: emailValor.trim(),
          ...(whatsapp.trim() ? { whatsapp: whatsapp.trim() } : {}),
        },
      })
      setRecebido(true)
      setEvento('')
      recarregar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível enviar o pedido.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Pagina titulo="Falar com a equipe Althius" voltar={{ para: '/sinais', rotulo: 'Sinais' }}>
      <div className="flex max-w-3xl flex-col gap-8">
        <p className="text-sm text-al-muted">
          Conte o evento que você quer acompanhar e a equipe Althius monta para você. Sem cobrança.
        </p>

        {recebido && (
          <p role="status" className="rounded-xl bg-al-sucesso-suave px-4 py-3 text-sm">
            Pedido recebido, a equipe responde em até 2 dias úteis
          </p>
        )}

        <form noValidate onSubmit={enviar} className="flex flex-col gap-5">
          <Campo rotulo="Evento" obrigatorio>
            <textarea
              required
              value={evento}
              onChange={(e) => setEvento(e.target.value)}
              className="campo min-h-24 py-2"
            />
          </Campo>
          <Campo rotulo="Empresas ou nicho" obrigatorio>
            <textarea
              required
              value={empresasValor}
              onChange={(e) => setEmpresas(e.target.value)}
              className="campo min-h-20 py-2"
            />
          </Campo>
          <Campo rotulo="Fontes conhecidas">
            <textarea
              value={fontes}
              onChange={(e) => setFontes(e.target.value)}
              placeholder="Opcional"
              className="campo min-h-20 py-2"
            />
          </Campo>
          <div role="radiogroup" aria-label="Urgência" className="flex flex-col gap-2">
            <span className="rotulo text-al-ink">Urgência</span>
            <div className="flex flex-wrap gap-2">
              {URGENCIAS.map((opcao) => (
                <label key={opcao.id} className="selo flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="urgencia"
                    checked={urgencia === opcao.id}
                    onChange={() => setUrgencia(opcao.id)}
                  />
                  {opcao.rotulo}
                </label>
              ))}
            </div>
          </div>
          <Campo rotulo="Nome" obrigatorio>
            <input required value={nomeValor} onChange={(e) => setNome(e.target.value)} className="campo h-10" />
          </Campo>
          <Campo rotulo="E-mail" obrigatorio>
            <input required type="email" value={emailValor} onChange={(e) => setEmail(e.target.value)} className="campo h-10" />
          </Campo>
          <Campo rotulo="WhatsApp">
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Opcional" className="campo h-10" />
          </Campo>

          {erro && (
            <p role="alert" className="text-sm text-al-erro">{erro}</p>
          )}

          <div>
            <button type="submit" className={BOTAO_PRIMARIO} disabled={enviando}>
              Enviar pedido
            </button>
          </div>
        </form>

        <section aria-labelledby="titulo-pedidos" className="flex flex-col gap-3">
          <h2 id="titulo-pedidos" className="titulo-secao text-lg">Seus pedidos</h2>
          {!pedidos || pedidos.length === 0 ? (
            <p className="text-sm text-al-muted">Nenhum pedido ainda.</p>
          ) : (
            <ul aria-label="Seus pedidos" className="flex flex-col border-t border-al-line">
              {pedidos.map((pedido) => (
                <ItemDoPedido key={pedido.id} pedido={pedido} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Pagina>
  )
}

function ItemDoPedido({ pedido }: { pedido: PedidoDeSinal }) {
  return (
    <li className="flex flex-col gap-1 border-b border-al-line py-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-base">{pedido.evento}</p>
        <span className="selo">{ROTULO_DO_STATUS[pedido.status]}</span>
      </div>
      <p className="text-sm text-al-muted">{pedido.empresasOuNicho}</p>
      {pedido.status === 'disponivel' && pedido.modeloId && (
        <Link className="text-sm text-al-accent underline" to={`/sinais/novo?modelo=${encodeURIComponent(pedido.modeloId)}`}>Usar o Modelo</Link>
      )}
    </li>
  )
}

function Campo({ rotulo, children }: { rotulo: string; obrigatorio?: boolean; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="rotulo text-al-ink">{rotulo}</span>
      {children}
    </label>
  )
}
