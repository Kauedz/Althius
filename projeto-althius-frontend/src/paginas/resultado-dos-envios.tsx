import { useDadosDeSequencias } from '@/fonte/contexto'
import type { TaxaDosEnvios } from '@/fonte/sequencias-tipos'

const NOME_DO_CANAL: Record<string, string> = { email: 'E-mail', linkedin: 'LinkedIn', whatsapp: 'WhatsApp' }

function percentual(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)}%` : '—'
}

/**
 * O Resultado dos Envios do Workspace (motor-hermes 03): por canal e segmento, quanto saiu e quanto deu resposta,
 * resposta positiva, reunião e oportunidade. Resposta negativa conta como resposta, nunca como positiva. Sem o método
 * na fonte, ou sem nenhum Envio, nada aparece.
 */
export function ResultadoDosEnvios() {
  const { dados: taxas } = useDadosDeSequencias(
    (f) => f.taxasDosEnvios?.().catch(() => [] as TaxaDosEnvios[]) ?? Promise.resolve([] as TaxaDosEnvios[]),
    [],
  )
  if (!taxas || taxas.length === 0) return null

  return (
    <section aria-labelledby="resultado-dos-envios" className="flex flex-col gap-2">
      <h2 id="resultado-dos-envios" className="rotulo text-xs text-al-muted">
        Resultado dos envios
      </h2>
      <div className="overflow-x-auto">
        <table aria-label="Resultado dos envios" className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-al-line text-xs font-medium tracking-rotulo text-al-muted uppercase">
              <th scope="col" className="py-2 pr-4 font-normal">Canal</th>
              <th scope="col" className="py-2 px-4 font-normal">Segmento</th>
              <th scope="col" className="py-2 px-4 font-normal">Enviados</th>
              <th scope="col" className="py-2 px-4 font-normal">Resposta</th>
              <th scope="col" className="py-2 px-4 font-normal">Positiva</th>
              <th scope="col" className="py-2 px-4 font-normal">Reuniões</th>
              <th scope="col" className="py-2 pl-4 font-normal">Oportunidades</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-al-line">
            {taxas.map((taxa) => (
              <tr key={`${taxa.canal}-${taxa.segmento}`} className="h-10 tabular-nums">
                <td className="py-2 pr-4 text-al-ink">{NOME_DO_CANAL[taxa.canal] ?? taxa.canal}</td>
                <td className="py-2 px-4 text-al-ink">{taxa.segmento}</td>
                <td className="py-2 px-4 text-al-muted">{taxa.enviados}</td>
                <td className="py-2 px-4 text-al-muted">{percentual(taxa.respostas, taxa.enviados)}</td>
                <td className="py-2 px-4 text-al-muted">{percentual(taxa.positivas, taxa.enviados)}</td>
                <td className="py-2 px-4 text-al-muted">{taxa.reunioes}</td>
                <td className="py-2 pl-4 text-al-muted">{taxa.oportunidades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-al-muted">
        Percentuais sobre os envios. Resposta negativa conta como resposta, não como positiva. Os números são só deste
        Workspace.
      </p>
    </section>
  )
}
