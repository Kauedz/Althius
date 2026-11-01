import { useState } from 'react'
import { useDadosDeSequencias } from '@/fonte/contexto'
import type { ResultadosPorConta, TaxaDosEnvios, TaxaPorAbordagem } from '@/fonte/sequencias-tipos'

const NOME_DO_CANAL: Record<string, string> = { email: 'E-mail', linkedin: 'LinkedIn', whatsapp: 'WhatsApp' }

function percentual(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)}%` : '—'
}

type Vista = 'segmento' | 'abordagem' | 'conta'

/** Uma linha das duas vistas: o que a agrupa (segmento ou abordagem) e os números. */
interface Linha {
  chave: string
  grupo: string
  canal: string
  enviados: number
  respostas: number
  positivas: number
  reunioes: number
  oportunidades: number
}

/**
 * O Resultado dos Envios do Workspace (motor-hermes 03): quanto saiu e quanto deu resposta, resposta positiva, reunião
 * e oportunidade, por canal e segmento ou por abordagem (o título do passo). Resposta negativa conta como resposta,
 * nunca como positiva. Sem o método na fonte, ou sem nenhum Envio, nada aparece.
 */
export function ResultadoDosEnvios() {
  const [vista, setVista] = useState<Vista>('segmento')
  const { dados: porSegmento } = useDadosDeSequencias(
    (f) => f.taxasDosEnvios?.().catch(() => [] as TaxaDosEnvios[]) ?? Promise.resolve([] as TaxaDosEnvios[]),
    [],
  )
  const { dados: porAbordagem } = useDadosDeSequencias(
    (f) => f.taxasPorAbordagem?.().catch(() => [] as TaxaPorAbordagem[]) ?? Promise.resolve([] as TaxaPorAbordagem[]),
    [],
  )
  const { dados: porConta } = useDadosDeSequencias(
    (f) => f.resultadosPorConta?.().catch(() => null as ResultadosPorConta | null) ?? Promise.resolve(null),
  )
  if ((!porSegmento || porSegmento.length === 0) && !porConta) return null
  const temAbordagem = (porAbordagem?.length ?? 0) > 0
  const vistas: Vista[] = ['segmento', ...(temAbordagem ? ['abordagem' as const] : []), ...(porConta ? ['conta' as const] : [])]
  const vistaAtual: Vista = vistas.includes(vista) ? vista : 'segmento'

  const linhas: Linha[] =
    vistaAtual === 'segmento'
      ? (porSegmento ?? []).map((t) => ({ ...t, chave: `${t.canal}-${t.segmento}`, grupo: t.segmento }))
      : vistaAtual === 'abordagem'
        ? (porAbordagem ?? []).map((t) => ({ ...t, chave: `${t.canal}-${t.abordagem}`, grupo: t.abordagem }))
        : []

  return (
    <section aria-labelledby="resultado-dos-envios" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="resultado-dos-envios" className="rotulo text-xs text-al-muted">
          Resultado dos envios
        </h2>
        {vistas.length > 1 && (
          <div role="group" aria-label="Agrupar resultado por" className="segmentado">
            {vistas.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={vistaAtual === v}
                onClick={() => setVista(v)}
              >
                {v === 'segmento' ? 'Segmento' : v === 'abordagem' ? 'Abordagem' : 'Conta'}
              </button>
            ))}
          </div>
        )}
      </div>
      {vistaAtual === 'conta' && porConta ? (
        <div className="overflow-x-auto">
          <table aria-label="Resultado por Conta-alvo" className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-al-line text-xs font-medium tracking-rotulo text-al-muted uppercase">
                <th scope="col" className="py-2 pr-4 font-normal">Período</th>
                <th scope="col" className="py-2 px-4 font-normal">Contas abordadas</th>
                <th scope="col" className="py-2 px-4 font-normal">Resposta positiva</th>
                <th scope="col" className="py-2 px-4 font-normal">Reuniões</th>
                <th scope="col" className="py-2 pl-4 font-normal">Respostas negativas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-al-line">
              <tr className="h-10 tabular-nums">
                <td className="py-2 pr-4 text-al-ink">Todo o histórico até {new Intl.DateTimeFormat('pt-BR').format(new Date(porConta.dataCorte))}</td>
                <td className="py-2 px-4 text-al-muted">{porConta.contasAbordadas}</td>
                <td className="py-2 px-4 text-al-muted">{porConta.respostasPositivas} ({percentual(porConta.respostasPositivas, porConta.contasAbordadas)})</td>
                <td className="py-2 px-4 text-al-muted">{porConta.reunioes} ({percentual(porConta.reunioes, porConta.contasAbordadas)})</td>
                <td className="py-2 pl-4 text-al-muted">{porConta.respostasNegativas}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table aria-label="Resultado dos envios" className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-al-line text-xs font-medium tracking-rotulo text-al-muted uppercase">
              <th scope="col" className="py-2 pr-4 font-normal">Canal</th>
              <th scope="col" className="py-2 px-4 font-normal">{vistaAtual === 'segmento' ? 'Segmento' : 'Abordagem'}</th>
              <th scope="col" className="py-2 px-4 font-normal">Enviados</th>
              <th scope="col" className="py-2 px-4 font-normal">Resposta</th>
              <th scope="col" className="py-2 px-4 font-normal">Positiva</th>
              <th scope="col" className="py-2 px-4 font-normal">Reuniões</th>
              <th scope="col" className="py-2 pl-4 font-normal">Oportunidades</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-al-line">
            {linhas.map((linha) => (
              <tr key={linha.chave} className="h-10 tabular-nums">
                <td className="py-2 pr-4 text-al-ink">{NOME_DO_CANAL[linha.canal] ?? linha.canal}</td>
                <td className="py-2 px-4 text-al-ink">{linha.grupo}</td>
                <td className="py-2 px-4 text-al-muted">{linha.enviados}</td>
                <td className="py-2 px-4 text-al-muted">{percentual(linha.respostas, linha.enviados)}</td>
                <td className="py-2 px-4 text-al-muted">{percentual(linha.positivas, linha.enviados)}</td>
                <td className="py-2 px-4 text-al-muted">{linha.reunioes}</td>
                <td className="py-2 pl-4 text-al-muted">{linha.oportunidades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <p className="text-xs text-al-muted">
        {vistaAtual === 'conta'
          ? 'Cada Conta é contada uma vez em cada resultado; o denominador é o número de Contas com ao menos um envio realizado no período. Desfechos registrados após a data de corte não entram. Os números são só deste Workspace.'
          : 'Percentuais sobre os envios. Resposta negativa conta como resposta, não como positiva. A abordagem é o título do passo. Os números são só deste Workspace.'}
      </p>
    </section>
  )
}
