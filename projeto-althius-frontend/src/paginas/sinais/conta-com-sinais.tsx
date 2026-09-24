import { RadioTower } from 'lucide-react'
import { Navigate, useParams } from 'react-router-dom'
import { LogoDaConta } from '@/components/logos'
import { Pagina } from '@/components/pagina'
import { useDadosDeSinais, useFonteDeContas } from '@/fonte/contexto'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { cn } from '@/lib/utils'
import { tipoPorId } from './catalogo'
import { Foguinho, SeloDeAderencia } from './componentes'
import {
  CONTAS_MOCK,
  ROTULO_DA_ADERENCIA,
  SINAIS_MOCK,
  VALIDADE_EM_DIAS,
  dataDoDisparo,
  estaValido,
  expiraEm,
  type SinalMock,
} from './dados-mock'
import { useSinaisDoMockup } from './estado'

/** O nome atual do Monitoramento de origem, já com as edições feitas no mockup. */
function useNomeDoMonitoramento() {
  const { monitoramentos } = useSinaisDoMockup()
  return (id: string) => monitoramentos.find((m) => m.id === id)?.nome ?? 'Monitoramento'
}

/**
 * A Conta-alvo vista a partir de um Sinal encontrado, no mockup. Mostra como o foguinho, a Aderência, o Último sinal
 * e o histórico ficam depois do ADR 0007, conectado ao armazenamento compartilhado (Tickets 02 a 04).
 */
export function ContaComSinais() {
  const { contaId = '' } = useParams<{ contaId: string }>()
  const hoje = useFonteDeContas().hoje()
  const { dados: sinaisCarregados } = useDadosDeSinais((f) => f.sinaisEncontrados(), [])
  const conta = CONTAS_MOCK.find((c) => c.id === contaId)
  if (!conta) return <Navigate to="/sinais?vista=encontrados" replace />

  const sinais = (sinaisCarregados ?? SINAIS_MOCK)
    .filter((s) => s.contaId === conta.id)
    .sort((a, b) => b.data.localeCompare(a.data))
  const validos = sinais.filter((s) => estaValido(s, hoje))
  const ultimo = sinais[0]

  return (
    <Pagina titulo={conta.nome} voltar={{ para: '/sinais?vista=encontrados', rotulo: 'Sinais encontrados' }}>
      <div className="flex max-w-4xl flex-col gap-8">
        <header className="flex flex-col gap-3 border-b border-al-line pb-6">
          <div className="flex flex-wrap items-center gap-4">
            <LogoDaConta nome={conta.nome} logo={conta.logo} deUmaCor={conta.logoDeUmaCor} className="size-12 border border-al-line p-2" />
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="titulo-secao text-2xl">{conta.nome}</h2>
                <Foguinho quantidade={validos.length} />
                <SeloDeAderencia aderencia={conta.aderencia} />
              </div>
              <p className="text-xs text-al-muted">
                {conta.dominio} · {conta.segmento} · {conta.origem === 'recomendada' ? 'Recomendada pela Althius' : 'Importada'}
              </p>
            </div>
          </div>
          <p className="max-w-2xl text-sm text-al-muted">
            {validos.length > 0
              ? `Quente por ${validos.length} ${validos.length === 1 ? 'Sinal disparado' : 'Sinais disparados'} nos últimos ${VALIDADE_EM_DIAS} dias: uma razão para priorizar e aquecer a Conta-alvo, não uma garantia de compra. A Aderência do Scopus continua a mesma.`
              : 'Sem Sinais válidos: a Conta-alvo não está Quente. O histórico e a Aderência continuam preservados.'}
          </p>
        </header>

        <section aria-labelledby="como-aparece" className="flex flex-col gap-3">
          <h3 id="como-aparece" className="rotulo">
            Como aparece na lista de Contas
          </h3>
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                {['Empresa', 'Quente', 'Aderência', 'Último sinal'].map((coluna) => (
                  <th key={coluna} scope="col" className="rotulo h-9 border-b border-al-line pr-4 text-[0.625rem]">
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="h-11">
                <td className="w-48 border-b border-al-line pr-4">
                  <span className="flex items-center gap-2.5">
                    <LogoDaConta nome={conta.nome} logo={conta.logo} deUmaCor={conta.logoDeUmaCor} />
                    {conta.nome}
                  </span>
                </td>
                <td className="w-28 border-b border-al-line pr-4">
                  {validos.length > 0 ? <Foguinho quantidade={validos.length} /> : <span className="text-al-muted">—</span>}
                </td>
                <td className={cn('w-28 border-b border-al-line pr-4', !conta.aderencia && 'text-al-muted')}>
                  {conta.aderencia ? ROTULO_DA_ADERENCIA[conta.aderencia] : '—'}
                </td>
                <td className="border-b border-al-line pr-4">
                  {ultimo && (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <RadioTower strokeWidth={1.8} className="size-3.5 shrink-0 text-al-accent" aria-hidden />
                      <span className="truncate">{ultimo.frase}</span>
                      <span className="shrink-0 text-al-muted">
                        · {formatarDataDoModulo(dataDoDisparo(ultimo.data), hoje)}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section aria-labelledby="historico-de-sinais" className="flex flex-col gap-3">
          <h3 id="historico-de-sinais" className="rotulo">
            Histórico de sinais
          </h3>
          <ol className="flex flex-col border-t border-al-line">
            {sinais.map((sinal, indice) => (
              <ItemDoHistorico key={sinal.id} sinal={sinal} hoje={hoje} ultimo={indice === 0} />
            ))}
          </ol>
        </section>
      </div>
    </Pagina>
  )
}

function ItemDoHistorico({ sinal, hoje, ultimo }: { sinal: SinalMock; hoje: Date; ultimo: boolean }) {
  const nomeDoMonitoramento = useNomeDoMonitoramento()
  const ehValido = estaValido(sinal, hoje)
  const expira = expiraEm(sinal)
  return (
    <li aria-label={sinal.frase} className={cn('flex flex-col gap-2 border-b border-al-line py-5', !ehValido && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-3">
        <RadioTower strokeWidth={1.8} className={cn('size-4', ehValido ? 'text-al-accent' : 'text-al-muted')} aria-hidden />
        <span className="text-base">{sinal.frase}</span>
        {ultimo && <span className="selo border-al-accent/60 text-al-ink">Último sinal</span>}
        <span className="selo">{ehValido ? `Válido até ${formatarDataCompleta(new Date(expira.getTime() - 1))}` : 'Expirado'}</span>
      </div>
      <p className="text-xs text-al-muted">
        Disparado em {formatarDataCompleta(dataDoDisparo(sinal.data))} · {tipoPorId(sinal.tipoId)?.nome} · {nomeDoMonitoramento(sinal.monitoramentoId)}
      </p>
      <blockquote className="border-l-2 border-al-line pl-4 text-sm">{sinal.evidencia}</blockquote>
      <p className="text-xs text-al-muted">Fonte: {sinal.fonte}</p>
      {sinal.reencontrado && (
        <p className="text-xs text-al-muted">
          Reencontrado em {formatarDataCompleta(dataDoDisparo(sinal.reencontrado.data))} por “{nomeDoMonitoramento(sinal.reencontrado.monitoramentoId)}”:
          é o mesmo acontecimento, então não conta de novo nem renova a validade.
        </p>
      )}
    </li>
  )
}
