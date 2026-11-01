import { CircleAlert, Pause } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import {
  TEXTO_DA_PAUSA_POR_CREDITOS,
  TEXTO_DA_RODADA_PULADA,
  TITULO_DA_PAUSA_POR_CREDITOS,
  TITULO_DA_RODADA_PULADA,
  sinalComRodadaPulada,
} from '@/fonte/preco-por-rodada'
import type { Monitoramento } from '@/fonte/sinais-tipos'
import { useAtivacaoDoSinal } from './usar-ativacao'

/** A página de créditos que já existe: o saldo do Workspace, em créditos. */
export const CAMINHO_DOS_CREDITOS = '/configuracoes/plano'

/**
 * O aviso do Sinal que o sistema pausou por falta de créditos (agente-de-sinal 04, decidido pelo Kauê em 24/10/2026): depois de 3 rodadas
 * seguidas puladas sem créditos, o Sinal pausa e a tela diz por quê, com o caminho para ver os créditos e o botão de reativar
 * (pela confirmação "Ativar Sinal", que mostra o que o Sinal pode gastar). Fica no topo da página do Monitoramento, na lista
 * "Meus Sinais" e na lista dos Monitoramentos do tipo. Só o aviso na tela: nada de e-mail nem notificação externa.
 */
export function AvisoDePausaPorCreditos({ monitoramento, comNome = false }: { monitoramento: Monitoramento; comNome?: boolean }) {
  const [erro, setErro] = useState<string | null>(null)
  const { pedir, dialogo } = useAtivacaoDoSinal(monitoramento, setErro)

  return (
    <aside
      aria-label={`${TITULO_DA_PAUSA_POR_CREDITOS}: ${monitoramento.nome}`}
      className="rounded-xl flex flex-wrap items-center justify-between gap-3 bg-al-atencao-suave px-4 py-3 text-sm text-al-ink"
    >
      <p className="flex min-w-0 items-start gap-2">
        <Pause strokeWidth={1.8} className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">{TITULO_DA_PAUSA_POR_CREDITOS}</span>
          {comNome && <span className="text-al-muted"> · {monitoramento.nome}</span>}
          <span className="block text-al-muted">{TEXTO_DA_PAUSA_POR_CREDITOS}</span>
          {erro && (
            <span role="alert" className="block text-al-erro">
              {erro}
            </span>
          )}
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Link to={CAMINHO_DOS_CREDITOS} className={BOTAO_SECUNDARIO}>
          Ver créditos
        </Link>
        <button
          type="button"
          className={BOTAO_PRIMARIO}
          onClick={() => {
            setErro(null)
            pedir()
          }}
        >
          Reativar
        </button>
      </div>
      {dialogo}
    </aside>
  )
}

/**
 * O aviso da 1ª Rodada pulada por falta de créditos (agente-de-sinal 05, decidido pelo Kauê em 24/10/2026): o Sinal segue ativo,
 * mas a tela diz que a última rodada foi pulada, que a 3ª seguida pausa o Sinal e leva a "Ver créditos" (a página de créditos
 * que já existe; não há checkout). Fica no topo da página do Monitoramento, em "Meus Sinais", na lista dos Monitoramentos do tipo
 * e na linha da Rodada pulada em Rodadas. Some sozinho quando uma Rodada verifica alguma Conta, porque o servidor zera a contagem.
 */
export function AvisoDeRodadaPulada({ monitoramento, comNome = false }: { monitoramento: Monitoramento; comNome?: boolean }) {
  if (!sinalComRodadaPulada(monitoramento)) return null
  return (
    <aside
      aria-label={`${TITULO_DA_RODADA_PULADA}: ${monitoramento.nome}`}
      className="rounded-xl flex flex-wrap items-center justify-between gap-3 bg-al-atencao-suave px-4 py-3 text-sm text-al-ink"
    >
      <p className="flex min-w-0 items-start gap-2">
        <CircleAlert strokeWidth={1.8} className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">{TITULO_DA_RODADA_PULADA}</span>
          {comNome && <span className="text-al-muted"> · {monitoramento.nome}</span>}
          <span className="block text-al-muted">{TEXTO_DA_RODADA_PULADA}</span>
        </span>
      </p>
      <Link to={CAMINHO_DOS_CREDITOS} className={BOTAO_SECUNDARIO}>
        Ver créditos
      </Link>
    </aside>
  )
}
