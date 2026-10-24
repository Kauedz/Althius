import { ChevronDown, ChevronRight, Play } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDadosDeSinais, useFonteDeSinais } from '@/fonte/contexto'
import {
  ErroDaRodada,
  MENSAGEM_DA_FALHA_DA_RODADA,
  dataEHoraEmBrasilia,
  frasesDoBloqueio,
  textoDaParada,
  textoDaPrevia,
  type AchadoDaRodada,
  type RodadaRegistrada,
} from '@/fonte/rodadas-do-sinal'
import type { Monitoramento } from '@/fonte/sinais-tipos'
import { cn } from '@/lib/utils'
import { sinalComRodadaPulada } from '@/fonte/preco-por-rodada'
import { AvisoDeRodadaPulada } from './aviso-de-pausa'
import { TIPOS_DO_PLANO } from './campos-do-plano'
import type { EstadoDasRodadas } from './usar-rodadas'

const plural = (n: number, singular: string, pluralizado: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : pluralizado}`
const creditos = (n: number) => plural(n, 'crédito', 'créditos')

/**
 * "Rodar agora" (agente-de-sinal 02): a pessoa vê o que a Rodada pode custar em créditos, confirma, e o pedido entra na fila
 * do relógio (começa em até 10 minutos). Roda o Sinal como está salvo, só nas Contas do escopo, sem esperar a Agenda.
 */
export function RodarAgora({ monitoramento, rodadas }: { monitoramento: Monitoramento; rodadas: EstadoDasRodadas }) {
  const fonte = useFonteDeSinais()
  const { previa, historico, erroDaPrevia, emAndamento, recarregar } = rodadas
  const [aberto, setAberto] = useState(false)
  const [pedindo, setPedindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const rotuloDoBotao = useId()

  const pedido = historico?.pedidos[0]
  const rodando = historico?.rodadas.some((r) => r.estado === 'rodando') ?? false

  if (!rodadas.suportado || !fonte.rodarAgora || erroDaPrevia) return null
  if (!previa) return <Carregando rotulo="Conferindo o Sinal" />
  // Um Sinal que não tem fonte por Conta (interno, cascata, mercado) não roda sob demanda: não há o que oferecer.
  if (previa.bloqueio === 'sem_fonte') return null

  const bloqueio = emAndamento ? 'ja_na_fila' as const : previa.bloqueio
  const motivo = bloqueio ? frasesDoBloqueio(bloqueio, previa.liberadoEm) : null

  async function pedir() {
    setPedindo(true)
    setErro(null)
    try {
      await fonte.rodarAgora!(monitoramento.id)
      setAberto(false)
    } catch (e) {
      setErro(e instanceof ErroDaRodada || (e instanceof Error && e.message) ? (e as Error).message : MENSAGEM_DA_FALHA_DA_RODADA)
    } finally {
      recarregar()
      setPedindo(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={BOTAO_SECUNDARIO}
          disabled={!!bloqueio}
          aria-describedby={rotuloDoBotao}
          onClick={() => {
            setErro(null)
            recarregar()
            setAberto(true)
          }}
        >
          <Play strokeWidth={1.8} className="size-3.5" aria-hidden />
          Rodar agora
        </button>
        <span id={rotuloDoBotao} role="status" className="text-sm text-al-muted">
          {pedido
            ? pedido.estado === 'rodando' ? 'Rodando.' : 'Na fila. Começa em até 10 minutos.'
            : rodando
            ? 'Rodando.'
            : motivo}
        </span>
      </div>

      <Dialog open={aberto} onOpenChange={(valor) => !pedindo && setAberto(valor)}>
        <DialogContent className="gap-5 p-6 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Rodar agora</DialogTitle>
            <DialogDescription className="flex flex-col gap-2 text-sm text-al-muted">
              <span>{textoDaPrevia(previa, monitoramento.publico.listas.length)}</span>
              {previa.contasSemDado > 0 && (
                <span>
                  Pelo que sabemos, {plural(previa.contasSemDado, 'Conta não tem', 'Contas não têm')} dado suficiente e deve ficar de fora.
                </span>
              )}
              <span>Roda o Sinal como está salvo, só nas Contas do escopo. Começa em até 10 minutos.</span>
            </DialogDescription>
          </DialogHeader>
          {(motivo || erro) && (
            <p role="alert" className="rounded-xl bg-al-atencao-suave px-4 py-3 text-sm text-al-ink">
              {erro ?? motivo}
            </p>
          )}
          <DialogFooter className="mt-1 flex items-center justify-end gap-2">
            <button type="button" className={BOTAO_SECUNDARIO} disabled={pedindo} onClick={() => setAberto(false)}>
              Cancelar
            </button>
            <button type="button" className={BOTAO_PRIMARIO} disabled={pedindo || !!motivo} onClick={pedir}>
              Rodar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** A linha de uma Rodada: quando, de onde veio, o que verificou, o que achou, quanto custou e por que parou. */
function ResumoDaRodada({ rodada }: { rodada: RodadaRegistrada }) {
  // A Rodada perdida nunca começou: o que importa é o horário marcado da Agenda, e não a hora em que o relógio a registrou.
  const quando = rodada.motivoDaParada === 'perdida' && rodada.horarioMarcado ? rodada.horarioMarcado : rodada.iniciadaEm
  const partes = [
    plural(rodada.contasVerificadas, 'Conta verificada', 'Contas verificadas'),
    plural(rodada.sinaisNovos, 'Sinal novo', 'Sinais novos'),
    creditos(rodada.creditos),
  ]
  return (
    <span className="flex min-w-0 flex-col gap-1 text-left">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="tabular-nums">{dataEHoraEmBrasilia(quando)}</span>
        <span className="selo">{rodada.origem === 'manual' ? 'Manual' : 'Agendada'}</span>
        <span className="text-sm text-al-muted">{textoDaParada(rodada)}</span>
      </span>
      <span className="text-sm text-al-muted">
        {partes.join(' · ')}
        {rodada.contasSemDado > 0 && ` · ${plural(rodada.contasSemDado, 'Conta sem dado suficiente', 'Contas sem dado suficiente')}`}
      </span>
    </span>
  )
}

/** O cartão de um Sinal achado: a Conta, a frase, o "por que apareceu" e a evidência. */
function CartaoDoAchado({ achado }: { achado: AchadoDaRodada }) {
  const link = achado.evidencia && /^https?:\/\//i.test(achado.evidencia) ? achado.evidencia : null
  return (
    <li className="rounded-xl flex flex-col gap-2 border border-al-line bg-al-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link to={`/contas/${achado.contaId}`} className="text-base hover:text-al-accent hover:underline">
          {achado.contaNome}
        </Link>
        <span className="selo">{TIPOS_DO_PLANO[achado.tipo]?.rotulo ?? 'Sinal'}</span>
        {achado.situacao === 'visto_de_novo' && <span className="selo">Visto de novo</span>}
      </div>
      <p className="text-sm">{achado.frase}</p>
      <p className="text-sm text-al-muted">
        <span className="rotulo mr-2">Por que apareceu</span>
        {achado.porQue}
      </p>
      <p className="text-xs text-al-muted">
        {achado.fonte && `${achado.fonte} · `}
        {dataEHoraEmBrasilia(achado.data).slice(0, 10)}
        {achado.evidencia && (
          <>
            {' · '}
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-al-ink">
                Ver evidência
              </a>
            ) : (
              achado.evidencia
            )}
          </>
        )}
      </p>
    </li>
  )
}

function SinaisEncontrados({ rodada }: { rodada: RodadaRegistrada }) {
  const { dados: achados, erro, recarregar } = useDadosDeSinais(
    (f) => (f.achadosDaRodada ? f.achadosDaRodada(rodada.id) : Promise.resolve([])),
    [rodada.id],
  )
  if (erro) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-sm text-al-muted">Não foi possível carregar os Sinais desta rodada.</p>
        <button type="button" onClick={recarregar} className={BOTAO_SECUNDARIO}>
          Tentar de novo
        </button>
      </div>
    )
  }
  if (!achados) return <Carregando rotulo="Carregando os Sinais" />
  const novos = achados.filter((a) => a.situacao === 'novo')
  return (
    <div className="flex flex-col gap-3">
      <h3 className="titulo-secao text-base">Sinais encontrados</h3>
      {novos.length === 0 && <p className="text-sm text-al-muted">Nenhum Sinal novo nesta rodada.</p>}
      {achados.length > 0 && (
        <ul aria-label="Sinais encontrados" className="flex flex-col gap-3">
          {achados.map((a) => (
            <CartaoDoAchado key={`${a.id}:${a.situacao}`} achado={a} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * A seção "Rodadas" do Monitoramento: o histórico, com a origem (agendada ou manual), as Contas verificadas, os Sinais novos,
 * os créditos e por que parou. Clicar numa Rodada abre os Sinais encontrados nela.
 */
export function RodadasDoMonitoramento({ rodadas, monitoramento }: { rodadas: EstadoDasRodadas; monitoramento?: Monitoramento }) {
  const { historico, erroDoHistorico: erro, recarregar } = rodadas
  const [aberta, setAberta] = useState<string | null>(null)

  if (!rodadas.suportado) return null
  if (erro) {
    return (
      <section aria-label="Rodadas" className="flex flex-col items-start gap-3 border-t border-al-line pt-6">
        <h2 className="titulo-secao text-lg">Rodadas</h2>
        <p role="alert" className="text-sm text-al-muted">
          Não foi possível carregar as rodadas.
        </p>
        <button type="button" onClick={recarregar} className={BOTAO_SECUNDARIO}>
          Tentar de novo
        </button>
      </section>
    )
  }
  if (!historico) return <Carregando rotulo="Carregando as rodadas" />
  // O aviso da 1ª Rodada pulada fica na linha da Rodada mais recente que parou por falta de créditos.
  const idDaRodadaPulada = monitoramento && sinalComRodadaPulada(monitoramento)
    ? historico.rodadas.find((r) => r.motivoDaParada === 'sem_creditos')?.id
    : undefined

  return (
    <section aria-labelledby="titulo-das-rodadas" className="flex flex-col gap-4 border-t border-al-line pt-6">
      <h2 id="titulo-das-rodadas" className="titulo-secao text-lg">
        Rodadas
      </h2>
      {historico.rodadas.length === 0 && historico.pedidos.length === 0 ? (
        <p className="text-sm text-al-muted">Nenhuma rodada ainda. Use Rodar agora para ver o que o Sinal encontra.</p>
      ) : (
        <ul aria-label="Rodadas do Sinal" className="flex flex-col border-t border-al-line">
          {historico.rodadas.map((rodada) => {
            const expandida = aberta === rodada.id
            return (
              <li key={rodada.id} className="flex flex-col gap-3 border-b border-al-line py-3">
                <button
                  type="button"
                  aria-expanded={expandida}
                  onClick={() => setAberta(expandida ? null : rodada.id)}
                  className={cn(BOTAO_DISCRETO, 'h-auto w-full items-start justify-between gap-3 px-0 py-1 text-al-ink')}
                >
                  <ResumoDaRodada rodada={rodada} />
                  {expandida
                    ? <ChevronDown strokeWidth={1.8} className="mt-1 size-4 shrink-0 text-al-muted" aria-hidden />
                    : <ChevronRight strokeWidth={1.8} className="mt-1 size-4 shrink-0 text-al-muted" aria-hidden />}
                </button>
                {rodada.observacao && <p className="text-xs text-al-muted">{rodada.observacao}</p>}
                {monitoramento && rodada.id === idDaRodadaPulada && <AvisoDeRodadaPulada monitoramento={monitoramento} />}
                {expandida && <SinaisEncontrados rodada={rodada} />}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
