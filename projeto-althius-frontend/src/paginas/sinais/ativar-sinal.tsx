import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { textoDaAgenda } from '@/fonte/agenda-do-sinal'
import { useDados, useFonteDeSinais } from '@/fonte/contexto'
import {
  AUTOMACAO_NAO_LIBERADA,
  AVISO_DE_REPETICAO,
  ErroDoLimite,
  PEDIDO_DE_AUTOMACAO,
  TEXTO_DO_SEM_CREDITOS,
  TITULO_DA_ATIVACAO,
  creditos,
  textoDaEstimativa,
} from '@/fonte/preco-por-rodada'
import { frasesDoBloqueio } from '@/fonte/rodadas-do-sinal'
import type { Monitoramento } from '@/fonte/sinais-tipos'
import { TIPOS_DO_PLANO } from './campos-do-plano'
import { resumoDasContas } from './resumos'
import { useEstimativa } from './usar-estimativa'

export const MENSAGEM_DA_FALHA_AO_ATIVAR = 'Não foi possível ativar o Sinal. Tente de novo.'
const MAX_DO_BRIEFING = 140

function resumir(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length > MAX_DO_BRIEFING ? `${limpo.slice(0, MAX_DO_BRIEFING - 1).trimEnd()}…` : limpo
}

/** Uma linha da confirmação: o rótulo e o que a pessoa confere. */
function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="rotulo border-b border-al-line py-2.5 pr-4">{rotulo}</dt>
      <dd className="border-b border-al-line py-2.5 text-sm">{children}</dd>
    </div>
  )
}

/**
 * A confirmação "Ativar Sinal" (agente-de-sinal 04): antes de ativar um Sinal com Agenda, a pessoa confere o Plano, a Agenda e a
 * estimativa em créditos, e lê o que acontece se os créditos acabarem. Só créditos: nunca US$, custo de fornecedor nem valor de
 * Teto. Quando a automação ainda não está liberada, quem é Administrador recebe o caminho para configurá-la; quem não é, o pedido
 * ao responsável pelo plano. O Sinal não ativa enquanto algo bloqueia (contrato, automação, saldo).
 *
 * `aoAtivar` faz a ativação e devolve a frase de erro que a pessoa lê, ou nada quando deu certo.
 */
export function AtivarSinal({
  monitoramento,
  aberto,
  aoCancelar,
  aoAtivar,
}: {
  monitoramento: Monitoramento
  aberto: boolean
  aoCancelar: () => void
  aoAtivar: () => Promise<string | null>
}) {
  const fonte = useFonteDeSinais()
  const workspace = useDados((f) => f.workspace(), [])
  const { estimativa } = useEstimativa(monitoramento.id, undefined, aberto)
  const [ativando, setAtivando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const administrador = workspace?.papel === 'administrador'
  const bloqueio = estimativa?.bloqueio ?? null
  const motivo = bloqueio === 'sem_teto_automacao' ? null : bloqueio ? frasesDoBloqueio(bloqueio) : null
  const plano = monitoramento.plano
  const tipo = plano ? TIPOS_DO_PLANO[plano.sinais[0]?.tipo ?? '']?.rotulo : undefined
  const limite = monitoramento.limitePorDia ?? estimativa?.limiteSugeridoPorDia

  async function confirmar() {
    setAtivando(true)
    setErro(null)
    try {
      // Sem limite por dia gravado, vale o padrão: o custo máximo de um dia da Agenda, que a pessoa só baixa.
      if (monitoramento.limitePorDia === undefined && estimativa && estimativa.limiteSugeridoPorDia > 0 && fonte.salvarLimitePorDia) {
        await fonte.salvarLimitePorDia(monitoramento.id, estimativa.limiteSugeridoPorDia)
      }
      setErro(await aoAtivar())
    } catch (e) {
      setErro(e instanceof ErroDoLimite ? e.message : MENSAGEM_DA_FALHA_AO_ATIVAR)
    } finally {
      setAtivando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(valor) => !ativando && !valor && aoCancelar()}>
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITULO_DA_ATIVACAO}</DialogTitle>
          <DialogDescription className="text-sm text-al-muted">
            Confira o Plano, a agenda e quanto o Sinal pode gastar antes de ativar.
          </DialogDescription>
        </DialogHeader>

        <dl aria-label="Resumo do Sinal" className="grid grid-cols-[8.5rem_1fr] border-t border-al-line">
          <Linha rotulo="Plano">
            <span className="flex flex-col gap-0.5">
              <span>
                {monitoramento.nome}
                {tipo && <span className="text-al-muted"> · {tipo}</span>}
              </span>
              <span className="text-al-muted">{resumoDasContas(monitoramento.publico.listas.length)}</span>
              {monitoramento.briefing && <span className="text-al-muted">{resumir(monitoramento.briefing)}</span>}
            </span>
          </Linha>
          {monitoramento.agenda && <Linha rotulo="Agenda">{textoDaAgenda(monitoramento.agenda)}</Linha>}
          <Linha rotulo="Estimativa">
            {estimativa === undefined ? (
              <Carregando rotulo="Calculando a estimativa" />
            ) : estimativa === null ? (
              <span className="text-al-muted">Não foi possível calcular a estimativa agora.</span>
            ) : (
              <span className="flex flex-col gap-1">
                <span>{textoDaEstimativa(estimativa)}</span>
                {estimativa.avisoDeRepeticao && <span className="text-al-muted">{AVISO_DE_REPETICAO}</span>}
              </span>
            )}
          </Linha>
          {limite !== undefined && limite > 0 && <Linha rotulo="Limite por dia">{creditos(limite)}</Linha>}
        </dl>

        <p className="text-sm text-al-muted">{TEXTO_DO_SEM_CREDITOS}</p>

        {motivo && (
          <p role="alert" className="rounded-xl bg-al-atencao-suave px-4 py-3 text-sm text-al-ink">
            {motivo}
          </p>
        )}
        {bloqueio === 'sem_teto_automacao' && (
          <p role="alert" className="rounded-xl bg-al-atencao-suave px-4 py-3 text-sm text-al-ink">
            {administrador ? (
              <>
                {AUTOMACAO_NAO_LIBERADA}{' '}
                <Link to="/configuracoes/automacao" className="underline underline-offset-4 hover:text-al-accent">
                  Configurar a automação
                </Link>
              </>
            ) : (
              PEDIDO_DE_AUTOMACAO
            )}
          </p>
        )}
        {erro && (
          <p role="alert" className="rounded-xl bg-al-erro/10 px-4 py-3 text-sm text-al-erro">
            {erro}
          </p>
        )}

        <DialogFooter className="mt-1 flex items-center justify-end gap-2">
          <button type="button" className={BOTAO_SECUNDARIO} disabled={ativando} onClick={aoCancelar}>
            Cancelar
          </button>
          <button type="button" className={BOTAO_PRIMARIO} disabled={ativando || !estimativa || bloqueio !== null} onClick={confirmar}>
            Ativar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
