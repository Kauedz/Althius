import { Pause } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { TEXTO_DA_PAUSA_POR_CREDITOS, TITULO_DA_PAUSA_POR_CREDITOS } from '@/fonte/preco-por-rodada'
import type { Monitoramento } from '@/fonte/sinais-tipos'
import { useAtivacaoDoSinal } from './usar-ativacao'

/** A página de créditos que já existe: o saldo do Workspace, em créditos. */
export const CAMINHO_DOS_CREDITOS = '/configuracoes/plano'

/**
 * O aviso do Sinal que o sistema pausou por falta de créditos (agente-de-sinal 04, DECISÃO PENDENTE 14): depois de 3 rodadas
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
