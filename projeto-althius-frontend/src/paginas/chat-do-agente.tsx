// A tela inicial (`/`): a conversa com o agente único (Fase 3). Cada pedido vira um turno; o agente mostra os passos
// que deu (o que leu, o que buscou, quanto custou) e os resultados em cartões com as escolhas da pessoa. O histórico
// fica em `/?c=<id>`. Enquanto um turno roda, a tela relê a conversa a cada 1,5 s.
import {
  Building2, Check, ChevronRight, CircleAlert, CircleCheck, Coins, ExternalLink, History, LoaderCircle, Plus, Users, X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Mensagem } from '@/components/mensagem'
import { Composer } from '@/conversa/composer'
import { tempoRelativo } from '@/conversa/tempo-relativo'
import {
  type CartaoDoAgente, type ConversaDoAgente, type EmpresaDoCartao, type EscolhaDoCartao, type FonteDoAgente,
  type PassoDoAgente, type ResumoDaConversaDoAgente, type TurnoDoAgente, turnoEmAndamento, ErroDoAgente,
} from '@/fonte/agente-tipos'
import { useAmbiente, useFonteDoAgente } from '@/fonte/contexto'
import { cn, mensagemDeErro } from '@/lib/utils'

export const INTERVALO_DA_RELEITURA_MS = 1500
const INTERVALO_DA_BUSCA_LONGA_MS = 8000

const SUGESTOES = [
  'Ache 20 empresas com aderência ao meu ICP',
  'Mostre o ICP salvo do Workspace',
  'Quem é o comitê de compra das minhas Contas-alvo novas?',
]

const ROTULO_DO_NIVEL: Record<EmpresaDoCartao['nivel'], string> = {
  alto: 'Aderência alta',
  medio: 'Aderência média',
  baixo: 'Aderência baixa',
  sem_dado: 'Aderência sem dado',
}

const MENSAGEM_DO_ERRO: Record<string, string> = {
  turn_expired: 'O pedido passou do tempo e foi interrompido. Tente de novo.',
  model_timeout: 'O motor de IA demorou demais para responder. Tente de novo em instantes.',
  model_unreachable: 'O motor de IA está fora do ar agora. Tente de novo em alguns minutos.',
  model_rate_limited: 'Muitos pedidos ao mesmo tempo neste Workspace. Espere um pouco e tente de novo.',
  model_invalid_output: 'O agente não conseguiu montar uma resposta. Reformule o pedido.',
  membership_inactive: 'A sua Participação neste Workspace não está ativa.',
}

/** Um erro do pedido: o código conhecido vira o texto da tela; o resto, a mensagem que a Fonte já traduziu. */
function erroDoPedido(e: unknown): string {
  return (e instanceof ErroDoAgente && MENSAGEM_DO_ERRO[e.codigo]) || mensagemDeErro(e)
}

const creditos = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'crédito' : 'créditos'}`

export function PaginaChatDoAgente() {
  const fonte = useFonteDoAgente()
  const [parametros, setParametros] = useSearchParams()
  const conversaId = parametros.get('c')
  const [conversa, setConversa] = useState<ConversaDoAgente | null>(null)
  const [historico, setHistorico] = useState<ResumoDaConversaDoAgente[] | null>(null)
  const [motorNoAr, setMotorNoAr] = useState<boolean | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [carregando, setCarregando] = useState(Boolean(conversaId))
  const [verHistorico, setVerHistorico] = useState(false)
  const fim = useRef<HTMLDivElement>(null)

  const recarregarHistorico = useCallback(() => {
    fonte.conversas().then(setHistorico).catch(() => setHistorico([]))
  }, [fonte])

  useEffect(() => {
    let ativo = true
    fonte.disponivel().then((v) => ativo && setMotorNoAr(v)).catch(() => ativo && setMotorNoAr(false))
    recarregarHistorico()
    return () => { ativo = false }
  }, [fonte, recarregarHistorico])

  const reler = useCallback(async (id: string) => {
    const lida = await fonte.conversa(id)
    setConversa(lida)
    return lida
  }, [fonte])

  // Abrir outra conversa (ou nenhuma) troca a leitura.
  useEffect(() => {
    let ativo = true
    setErro('')
    if (!conversaId) {
      setConversa(null)
      setCarregando(false)
      return
    }
    setCarregando(true)
    fonte.conversa(conversaId)
      .then((c) => ativo && setConversa(c))
      .catch((e) => ativo && (setConversa(null), setErro(erroDoPedido(e))))
      .finally(() => ativo && setCarregando(false))
    return () => { ativo = false }
  }, [conversaId, fonte])

  const ultimo = conversa?.turnos.at(-1)
  const rodando = Boolean(ultimo && (ultimo.status === 'fila' || ultimo.status === 'rodando'))
  const emAndamento = Boolean(conversa?.turnos.some(turnoEmAndamento))

  // Enquanto algo roda, relê; uma busca longa pendente é conferida na função de tempos em tempos.
  useEffect(() => {
    if (!conversa || !emAndamento) return
    const id = conversa.id
    const releitura = window.setInterval(() => { void reler(id).catch(() => {}) }, INTERVALO_DA_RELEITURA_MS)
    const pendentes = conversa.turnos.flatMap((t) => t.passos.filter((p) => p.pendente).map((p) => p.id))
    const conferencia = pendentes.length
      ? window.setInterval(() => { pendentes.forEach((p) => void fonte.atualizar(p).catch(() => {})) }, INTERVALO_DA_BUSCA_LONGA_MS)
      : undefined
    return () => {
      window.clearInterval(releitura)
      if (conferencia) window.clearInterval(conferencia)
    }
  }, [conversa, emAndamento, fonte, reler])

  // Um turno que terminou atualiza o histórico (o título e o status).
  const statusDoUltimo = ultimo?.status
  useEffect(() => {
    if (statusDoUltimo && !rodando) recarregarHistorico()
  }, [statusDoUltimo, rodando, recarregarHistorico])

  useEffect(() => {
    fim.current?.scrollIntoView?.({ block: 'end' })
  }, [conversa?.turnos.length, ultimo?.passos.length, ultimo?.status])

  async function enviar(texto: string, anexos: unknown[] = []) {
    const pedido = texto.trim()
    if (!pedido) return
    setErro('')
    setAviso(anexos.length ? 'O agente ainda não lê anexos; o pedido foi enviado só com o texto.' : '')
    setEnviando(true)
    try {
      const r = await fonte.enviar(pedido, conversa?.id ?? null)
      if (r.conversaId !== conversaId) setParametros({ c: r.conversaId })
      await reler(r.conversaId)
    } catch (e) {
      setErro(erroDoPedido(e))
    } finally {
      setEnviando(false)
    }
  }

  async function agir(acao: () => Promise<unknown>) {
    setErro('')
    try {
      await acao()
      if (conversa) await reler(conversa.id)
    } catch (e) {
      setErro(erroDoPedido(e))
    }
  }

  function novaConversa() {
    setConversa(null)
    setErro('')
    setAviso('')
    setParametros({})
  }

  const ocupado = enviando || rodando
  const vazia = !conversaId && !conversa
  const semMotor = motorNoAr === false

  return (
    <div className="mx-auto flex w-full max-w-180 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 pb-4">
        <p className="truncate text-sm text-al-muted">{conversa ? conversa.titulo : 'Nova conversa'}</p>
        <div className="flex items-center gap-1">
          {Boolean(historico?.length) && (
            <button type="button" className={BOTAO_DISCRETO} aria-expanded={verHistorico} onClick={() => setVerHistorico((v) => !v)}>
              <History strokeWidth={1.8} className="size-3.5" aria-hidden />
              Conversas
            </button>
          )}
          {conversa && (
            <button type="button" className={BOTAO_DISCRETO} onClick={novaConversa}>
              <Plus strokeWidth={1.8} className="size-3.5" aria-hidden />
              Nova conversa
            </button>
          )}
        </div>
      </div>

      {verHistorico && historico && (
        <ListaDeConversas conversas={historico} atual={conversa?.id ?? null} aoEscolher={(id) => { setVerHistorico(false); setParametros({ c: id }) }} />
      )}

      {semMotor && (
        <Mensagem tipo="info">O motor de IA do agente está fora do ar agora. Você pode ler as conversas; para pedir algo novo, tente de novo em alguns minutos.</Mensagem>
      )}

      <div aria-live="polite" className="flex flex-1 flex-col gap-10 pt-2 pb-10">
        {carregando && <p className="text-sm text-al-muted">Carregando a conversa…</p>}
        {vazia && !carregando && (
          <div className="flex flex-col gap-3 pt-6">
            <h2 className="text-lg font-normal text-al-ink">O que você quer prospectar hoje?</h2>
            <p className="max-w-[60ch] text-sm text-al-muted">
              O agente busca empresas pelo seu ICP, mostra por que cada uma combina, aceita as que você escolher como Conta-alvo e
              enriquece o comitê de compra. Ações que gastam acima do teto da conversa pedem a sua confirmação; nada fala com um
              prospect sem você aprovar.
            </p>
          </div>
        )}
        {conversa?.turnos.map((turno) => (
          <TurnoNaTela key={turno.id} turno={turno} fonte={fonte} agir={agir} ocupado={ocupado} />
        ))}
      </div>

      <div className="rodape-da-conversa">
        {erro && <div className="pb-3"><Mensagem tipo="erro">{erro}</Mensagem></div>}
        {aviso && <div className="pb-3"><Mensagem tipo="info">{aviso}</Mensagem></div>}
        {vazia && (
          <div className="flex flex-wrap gap-2 pb-3">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={ocupado || semMotor}
                onClick={() => void enviar(s)}
                className="inline-flex items-center rounded-full border border-al-line px-4 py-2 text-sm font-light hover:border-al-muted disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <Composer
          nome="Pedido ao agente"
          rotulo="Peça algo ao agente"
          placeholder={conversa ? 'Ex.: agora enriqueça o comitê das que eu aceitei' : 'Ex.: ache 20 empresas de logística em SP com aderência alta'}
          ocupado={ocupado || semMotor}
          aoEnviar={(texto, anexos) => void enviar(texto, anexos)}
        />
        {conversa && (
          <p className="pt-2 text-center text-xs text-al-muted tabular-nums">
            Gasto nesta conversa: {conversa.gastos.toLocaleString('pt-BR')} de {creditos(conversa.teto)}
          </p>
        )}
      </div>
      <div ref={fim} />
    </div>
  )
}

function ListaDeConversas({ conversas, atual, aoEscolher }: { conversas: ResumoDaConversaDoAgente[]; atual: string | null; aoEscolher: (id: string) => void }) {
  const agora = new Date()
  return (
    <nav aria-label="Conversas com o agente" className="mb-4 rounded-md border border-al-line">
      <ul className="divide-y divide-al-line">
        {conversas.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              aria-current={c.id === atual ? 'page' : undefined}
              onClick={() => aoEscolher(c.id)}
              className={cn('flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-al-hover', c.id === atual && 'bg-al-hover')}
            >
              <span className="truncate text-al-ink">{c.titulo}</span>
              <span className="shrink-0 text-xs text-al-muted">{c.atualizadaEm ? tempoRelativo(c.atualizadaEm, agora) : ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

interface PropsDoTurno {
  turno: TurnoDoAgente
  fonte: FonteDoAgente
  agir: (acao: () => Promise<unknown>) => Promise<void>
  ocupado: boolean
}

function TurnoNaTela({ turno, fonte, agir, ocupado }: PropsDoTurno) {
  const rodando = turno.status === 'fila' || turno.status === 'rodando'
  return (
    <section aria-label={`Pedido: ${turno.pedido}`} className="flex flex-col gap-4">
      <p className="self-end max-w-[85%] rounded-xl bg-al-surface px-4 py-2.5 text-sm text-al-ink whitespace-pre-wrap">{turno.pedido}</p>
      {turno.passos.length > 0 && (
        <ol aria-label="Passos do agente" className="flex flex-col gap-3">
          {turno.passos.map((p) => <PassoNaTela key={p.id} passo={p} fonte={fonte} agir={agir} ocupado={ocupado} />)}
        </ol>
      )}
      {rodando && (
        <p role="status" className="inline-flex items-center gap-2 text-sm text-al-muted">
          <LoaderCircle strokeWidth={1.8} className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {turno.status === 'fila' ? 'Na fila do agente…' : 'O agente está trabalhando…'}
        </p>
      )}
      {turno.status === 'falhou' && (
        <Mensagem tipo="erro">{MENSAGEM_DO_ERRO[turno.errorCode ?? ''] ?? turno.resposta ?? 'O pedido não terminou. Tente de novo.'}</Mensagem>
      )}
      {turno.status !== 'falhou' && turno.resposta && (
        <p className="text-[0.95rem] leading-relaxed text-al-ink whitespace-pre-wrap">{turno.resposta}</p>
      )}
    </section>
  )
}

function IconeDoPasso({ passo }: { passo: PassoDoAgente }) {
  const classe = 'mt-0.5 size-4 shrink-0'
  if (passo.estado === 'rodando') return <LoaderCircle strokeWidth={1.8} className={cn(classe, 'animate-spin text-al-muted motion-reduce:animate-none')} aria-hidden />
  if (passo.estado === 'erro') return <CircleAlert strokeWidth={1.8} className={cn(classe, 'text-al-erro')} aria-hidden />
  if (passo.estado === 'aguardando_confirmacao') return <Coins strokeWidth={1.8} className={cn(classe, 'text-al-atencao')} aria-hidden />
  if (passo.estado === 'cancelado') return <X strokeWidth={1.8} className={cn(classe, 'text-al-muted')} aria-hidden />
  return <CircleCheck strokeWidth={1.8} className={cn(classe, 'text-al-sucesso')} aria-hidden />
}

const ESTADO_DO_PASSO: Record<PassoDoAgente['estado'], string> = {
  rodando: 'em andamento',
  ok: 'feito',
  erro: 'falhou',
  aguardando_confirmacao: 'aguarda a sua confirmação',
  cancelado: 'cancelado',
}

function PassoNaTela({ passo, fonte, agir, ocupado }: { passo: PassoDoAgente } & Omit<PropsDoTurno, 'turno'>) {
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-start gap-2 text-sm">
        <IconeDoPasso passo={passo} />
        <span className="text-al-ink">{passo.titulo}</span>
        <span className="sr-only">: {ESTADO_DO_PASSO[passo.estado]}</span>
        {passo.custo > 0 && <span className="ml-auto shrink-0 text-xs text-al-muted tabular-nums">{creditos(passo.custo)}</span>}
      </div>
      {passo.estado === 'erro' && passo.erro && <p className="pl-6 text-sm text-al-muted">{passo.erro}</p>}
      {passo.cartoes.map((c, i) => (
        <div key={i} className="pl-6">
          <CartaoNaTela cartao={c} passo={passo} fonte={fonte} agir={agir} ocupado={ocupado} />
        </div>
      ))}
    </li>
  )
}

function CartaoNaTela({ cartao, passo, fonte, agir, ocupado }: { cartao: CartaoDoAgente; passo: PassoDoAgente } & Omit<PropsDoTurno, 'turno'>) {
  switch (cartao.tipo) {
    case 'empresas':
      return <CartaoDeEmpresas empresas={cartao.empresas} passo={passo} fonte={fonte} agir={agir} ocupado={ocupado} />
    case 'pessoas':
      return <CartaoDePessoas conta={cartao.conta} contaId={cartao.contaId} pessoas={cartao.pessoas} />
    case 'receita':
      return (
        <div className="rounded-md border border-al-line p-3 text-sm">
          <p className="text-al-ink">{cartao.razaoSocial || cartao.cnpj}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-al-muted">CNPJ</dt><dd className="tabular-nums">{cartao.cnpj}</dd>
            {cartao.situacao && (<><dt className="text-al-muted">Situação</dt><dd>{cartao.situacao}</dd></>)}
            {cartao.porte && (<><dt className="text-al-muted">Porte</dt><dd>{cartao.porte}</dd></>)}
            {cartao.cnae && (<><dt className="text-al-muted">CNAE</dt><dd>{cartao.cnae}</dd></>)}
            {cartao.local && (<><dt className="text-al-muted">Local</dt><dd>{cartao.local}</dd></>)}
            {Boolean(cartao.socios?.length) && (<><dt className="text-al-muted">Sócios</dt><dd>{cartao.socios!.join(', ')}</dd></>)}
          </dl>
        </div>
      )
    case 'icp':
      return (
        <div className="rounded-md border border-al-line p-3 text-sm">
          <p className="text-al-ink">ICP{cartao.versao ? `, versão ${cartao.versao}` : ''}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {cartao.setor && (<><dt className="text-al-muted">Setor</dt><dd>{cartao.setor}</dd></>)}
            {cartao.porte && (<><dt className="text-al-muted">Porte</dt><dd>{cartao.porte}</dd></>)}
            {cartao.geografia && (<><dt className="text-al-muted">Região</dt><dd>{cartao.geografia}</dd></>)}
            {Boolean(cartao.cargos?.length) && (<><dt className="text-al-muted">Cargos</dt><dd>{cartao.cargos!.join(', ')}</dd></>)}
            {cartao.oQueVende && (<><dt className="text-al-muted">O que vende</dt><dd>{cartao.oQueVende}</dd></>)}
          </dl>
          <Link to="/configuracoes/playbook/icp" className={cn(BOTAO_DISCRETO, 'mt-2 -ml-2')}>
            Ver o ICP em Configurações
            <ChevronRight strokeWidth={1.8} className="size-3.5" aria-hidden />
          </Link>
        </div>
      )
    case 'criterios':
      return null
    case 'confirmacao':
      return passo.estado === 'aguardando_confirmacao' ? (
        <div className="rounded-md border border-al-atencao/40 bg-al-atencao-suave p-3 text-sm">
          <p className="text-al-ink">{cartao.texto}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={BOTAO_PRIMARIO} disabled={ocupado} onClick={() => void agir(() => fonte.confirmar(passo.id))}>
              <Check strokeWidth={1.8} className="size-4" aria-hidden />
              {cartao.motivo === 'teto' ? `Confirmar ${creditos(cartao.custo)}` : 'Confirmar'}
            </button>
            <button type="button" className={BOTAO_SECUNDARIO} disabled={ocupado} onClick={() => void agir(() => fonte.cancelar(passo.id))}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null
    case 'aviso':
      return <p className="text-sm text-al-muted">{cartao.texto}</p>
    default:
      return null
  }
}

function CartaoDeEmpresas({ empresas, passo, fonte, agir, ocupado }: { empresas: EmpresaDoCartao[]; passo: PassoDoAgente } & Omit<PropsDoTurno, 'turno'>) {
  const [fazendo, setFazendo] = useState<string | null>(null)
  if (!empresas.length) return <p className="text-sm text-al-muted">Nenhuma empresa nova para estes critérios.</p>

  async function escolher(empresa: EmpresaDoCartao, escolha: EscolhaDoCartao) {
    setFazendo(`${empresa.id}:${escolha}`)
    await agir(() => fonte.escolher(passo.id, escolha, empresa.id))
    setFazendo(null)
  }

  return (
    <ul aria-label="Empresas encontradas" className="divide-y divide-al-line rounded-md border border-al-line">
      {empresas.map((e) => (
        <li key={e.id} className="flex flex-col gap-2 p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-al-ink">
                <Building2 strokeWidth={1.8} className="size-3.5 shrink-0 text-al-muted" aria-hidden />
                <span className="truncate">{e.nome}</span>
              </p>
              <p className="mt-0.5 text-xs text-al-muted">{[e.setor, e.porte, e.local].filter(Boolean).join(', ') || e.dominio || ''}</p>
            </div>
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-medium',
                e.nivel === 'alto' && 'bg-al-sucesso-suave text-al-sucesso',
                e.nivel === 'medio' && 'bg-al-atencao-suave text-al-atencao',
                (e.nivel === 'baixo' || e.nivel === 'sem_dado') && 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
              )}
            >
              {ROTULO_DO_NIVEL[e.nivel] ?? ROTULO_DO_NIVEL.baixo}
            </span>
          </div>
          {e.porques.length > 0 && (
            <ul aria-label={`Por que ${e.nome} combina`} className="flex flex-col gap-0.5 text-xs">
              {e.porques.map((p, i) => (
                <li key={i} className={cn('flex items-start gap-1.5', p.atende === true ? 'text-al-ink' : 'text-al-muted')}>
                  {p.atende === true && <Check strokeWidth={1.8} className="mt-0.5 size-3 shrink-0 text-al-sucesso" aria-label="Atende" />}
                  {p.atende === false && <X strokeWidth={1.8} className="mt-0.5 size-3 shrink-0" aria-label="Não atende" />}
                  {p.atende === null && <span className="mt-1.5 size-1 shrink-0 rounded-full bg-al-muted" aria-label="Sem dado" role="img" />}
                  {p.texto}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {(!e.estado || e.estado === 'nova') && (
              <>
                <button type="button" className={BOTAO_SECUNDARIO} disabled={ocupado || fazendo !== null} onClick={() => void escolher(e, 'aceitar')} aria-label={`Aceitar ${e.nome}`}>
                  <Check strokeWidth={1.8} className="size-4" aria-hidden />
                  Aceitar
                </button>
                <button type="button" className={BOTAO_DISCRETO} disabled={ocupado || fazendo !== null} onClick={() => void escolher(e, 'descartar')} aria-label={`Descartar ${e.nome}`}>
                  Descartar
                </button>
              </>
            )}
            {e.estado === 'aceita' && (
              <>
                <span className="text-xs text-al-sucesso">Conta-alvo</span>
                {e.contaId && (
                  <button type="button" className={BOTAO_SECUNDARIO} disabled={ocupado || fazendo !== null} onClick={() => void escolher(e, 'enriquecer')} aria-label={`Enriquecer o comitê de ${e.nome}`}>
                    <Users strokeWidth={1.8} className="size-4" aria-hidden />
                    Enriquecer comitê
                  </button>
                )}
              </>
            )}
            {e.estado === 'descartada' && <span className="text-xs text-al-muted">Descartada</span>}
            {e.dominio && (
              <a href={`https://${e.dominio}`} target="_blank" rel="noreferrer" className={cn(BOTAO_DISCRETO, 'ml-auto')}>
                {e.dominio}
                <ExternalLink strokeWidth={1.8} className="size-3" aria-hidden />
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function CartaoDePessoas({ conta, contaId, pessoas }: { conta: string; contaId: string; pessoas: { nome: string; cargo?: string | null; persona?: string | null; linkedinUrl?: string | null; jaEncontrada?: boolean }[] }) {
  // Na Demonstração a Conta aceita pelo agente só existe nesta conversa: sem link para uma página que não a tem.
  const { modo } = useAmbiente()
  if (!pessoas.length) return <p className="text-sm text-al-muted">Não achei pessoas do comitê de {conta}.</p>
  return (
    <div className="rounded-md border border-al-line">
      <ul aria-label={`Comitê de compra de ${conta}`} className="divide-y divide-al-line">
        {pessoas.map((p, i) => (
          <li key={`${p.nome}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate text-al-ink">{p.nome}</p>
              <p className="truncate text-xs text-al-muted">{[p.cargo, p.persona].filter(Boolean).join(', ')}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-al-muted">
              {p.jaEncontrada && <span>já estava na Conta</span>}
              {p.linkedinUrl && (
                <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-al-ink">
                  LinkedIn
                  <ExternalLink strokeWidth={1.8} className="size-3" aria-hidden />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      {modo === 'real' && (
        <Link to={`/contas/${contaId}`} className={cn(BOTAO_DISCRETO, 'm-1')}>
          Abrir a Conta-alvo
          <ChevronRight strokeWidth={1.8} className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  )
}
