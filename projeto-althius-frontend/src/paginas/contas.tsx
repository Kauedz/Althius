import { Building2 } from 'lucide-react'
import { AbasSublinhadas } from '@/components/abas'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { useDadosDeContas, useFonteDeContas } from '@/fonte/contexto'
import type { Aderencia, ContaAlvo } from '@/fonte/contas-tipos'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'

const ABAS_MODULO = [
  { rotulo: 'Contas', para: '/contas' },
  { rotulo: 'Contatos', para: '/contatos' },
]

const ORDEM_ADERENCIA: Record<Aderencia, number> = {
  quente: 1,
  fit: 2,
  'nao-fit': 3,
}

/**
 * Ordena as Contas-alvo pela regra de Prioridade:
 * 1. Aderência: Quente > Fit > Não fit > Não avaliada
 * 2. Dentro de cada grupo: Sinal mais recente primeiro; contas sem Sinal por último
 * 3. Empate: ordem alfabética do nome da empresa
 */
function ordenarPorPrioridade(a: ContaAlvo, b: ContaAlvo): number {
  const rankA = a.aderencia ? ORDEM_ADERENCIA[a.aderencia] : 4
  const rankB = b.aderencia ? ORDEM_ADERENCIA[b.aderencia] : 4

  if (rankA !== rankB) {
    return rankA - rankB
  }

  // Dentro do grupo: sinal mais recente primeiro, sem sinal por último
  const dataSinalA = a.ultimoSinal ? new Date(a.ultimoSinal.data).getTime() : -1
  const dataSinalB = b.ultimoSinal ? new Date(b.ultimoSinal.data).getTime() : -1

  if (dataSinalA !== dataSinalB) {
    return dataSinalB - dataSinalA
  }

  // Empate: ordem alfabética pelo nome
  return a.nome.localeCompare(b.nome, 'pt-BR')
}

export function PaginaContas() {
  const fonte = useFonteDeContas()
  const { dados: contas, carregando, erro, recarregar } = useDadosDeContas(
    (f) => f.contas(),
    [],
  )

  const hoje = fonte.hoje()
  const contasOrdenadas = contas ? [...contas].sort(ordenarPorPrioridade) : []

  return (
    <Pagina titulo="Contas" icone={Building2}>
      <AbasSublinhadas rotuloAcessivel="Abas de contas e contatos" abas={ABAS_MODULO} />

      <div className="flex flex-col gap-1">
        <h2 className="sr-only">Empresas</h2>
        <p className="text-sm text-al-muted">
          Empresas do seu mercado organizadas pelo momento de abordagem
        </p>
        {contas && (
          <span className="rotulo text-xs text-al-muted">
            {contas.length} {contas.length === 1 ? 'conta' : 'contas'}
          </span>
        )}
      </div>

      {carregando && <Carregando />}

      {erro && (
        <div role="alert" className="flex flex-col items-start gap-3 py-6">
          <p className="text-sm text-al-muted">Não foi possível carregar as contas.</p>
          <Button
            type="button"
            variant="outline"
            onClick={recarregar}
            className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {!carregando && !erro && contas && contas.length === 0 && (
        <p className="py-12 text-sm text-al-muted">
          Nenhuma Conta-alvo ainda. As empresas aparecem aqui quando o Scopus encontrá-las ou quando forem importadas.
        </p>
      )}

      {!carregando && !erro && contas && contas.length > 0 && (
        <div className="overflow-x-auto">
          <table aria-label="Tabela de Contas" className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-al-line text-xs font-medium tracking-rotulo text-al-muted uppercase">
                <th scope="col" className="py-3 pr-4 font-normal">
                  Empresa
                </th>
                <th scope="col" className="py-3 px-4 font-normal">
                  Aderência
                </th>
                <th scope="col" className="py-3 px-4 font-normal">
                  Contatos
                </th>
                <th scope="col" className="py-3 px-4 font-normal">
                  Último sinal
                </th>
                <th scope="col" className="py-3 px-4 font-normal">
                  Segmento
                </th>
                <th scope="col" className="py-3 pl-4 font-normal">
                  Último contato
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-al-line">
              {contasOrdenadas.map((conta) => {
                return (
                  <tr key={conta.id} className="h-11">
                    <td className="py-3 pr-4 font-medium text-al-ink">{conta.nome}</td>
                    <td className="py-3 px-4">
                      <CelulaAderencia aderencia={conta.aderencia} />
                    </td>
                    <td className="py-3 px-4 text-al-muted">
                      <CelulaContatos total={conta.totalContatos} />
                    </td>
                    <td className="py-3 px-4 text-al-muted">
                      <CelulaUltimoSinal sinal={conta.ultimoSinal} hoje={hoje} />
                    </td>
                    <td className="py-3 px-4 text-al-muted">{conta.segmento ?? '—'}</td>
                    <td className="py-3 pl-4 text-al-muted">
                      <CelulaUltimoContato data={conta.ultimoContatoEm} hoje={hoje} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Pagina>
  )
}

function CelulaAderencia({ aderencia }: { aderencia?: Aderencia }) {
  if (!aderencia) {
    return (
      <span
        title="Aderência ainda não avaliada"
        aria-label="Aderência ainda não avaliada"
        className="text-al-muted"
      >
        —
      </span>
    )
  }

  if (aderencia === 'quente') {
    return <span className="font-normal text-al-ink">🔥 Quente</span>
  }

  if (aderencia === 'fit') {
    return <span className="font-normal text-al-ink">Fit</span>
  }

  return <span className="font-normal text-al-muted">Não fit</span>
}

function CelulaContatos({ total }: { total: number }) {
  if (total === 0) {
    return <span>Nenhum contato</span>
  }
  return (
    <span>
      {total} {total === 1 ? 'contato' : 'contatos'}
    </span>
  )
}

function CelulaUltimoSinal({ sinal, hoje }: { sinal?: ContaAlvo['ultimoSinal']; hoje: Date }) {
  if (!sinal) {
    return <span>Nenhum sinal</span>
  }

  const dataRelativa = formatarDataDoModulo(sinal.data, hoje, { maiuscula: false })
  const dataCompleta = formatarDataCompleta(sinal.data)

  return (
    <span title={dataCompleta} aria-label={`${sinal.frase} · ${dataCompleta}`}>
      {sinal.frase} · {dataRelativa}
    </span>
  )
}

function CelulaUltimoContato({ data, hoje }: { data?: string; hoje: Date }) {
  if (!data) {
    return <span>Nunca</span>
  }

  const dataRelativaOuExplicita = formatarDataDoModulo(data, hoje, { maiuscula: true })
  const dataCompleta = formatarDataCompleta(data)

  return (
    <span title={dataCompleta} aria-label={dataCompleta}>
      {dataRelativaOuExplicita}
    </span>
  )
}
