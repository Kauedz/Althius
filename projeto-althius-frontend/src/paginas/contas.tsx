import { Building2, RadioTower } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AbasSublinhadas } from '@/components/abas'
import { LogoDaConta } from '@/components/logos'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { useDadosDeContas, useFonteDeContas } from '@/fonte/contexto'
import type { Aderencia, ContaAlvo, PreviaContato } from '@/fonte/contas-tipos'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { parseDataDisparo } from '@/fonte/regras-sinais'
import { cn, iniciais } from '@/lib/utils'
import { DetalheConta } from './detalhe-conta'
import { Foguinho } from './sinais/componentes'

const ABAS_MODULO = [
  { rotulo: 'Contas', para: '/contas' },
  { rotulo: 'Contatos', para: '/contatos' },
]

/**
 * Ordena as Contas-alvo pela regra de Prioridade (ADR 0007):
 * 1. Quente (ao menos um sinal válido): contas Quentes vêm primeiro.
 * 2. Dentro do grupo de Quentes: sinal mais recente primeiro (desempate por recência); se igual, Fit > Não fit > Não avaliada; depois alfabética.
 * 3. Dentro do grupo de Não quentes: Aderência (Fit > Não fit > Não avaliada); dentro de cada grupo, sinal mais recente primeiro (mesmo expirado); depois alfabética.
 */
export function ordenarPorPrioridade(a: ContaAlvo, b: ContaAlvo): number {
  const quenteA = (a.totalSinaisValidos ?? 0) > 0
  const quenteB = (b.totalSinaisValidos ?? 0) > 0

  if (quenteA !== quenteB) {
    return quenteA ? -1 : 1
  }

  const rankAderencia = (c: ContaAlvo) => {
    if (c.aderencia === 'fit') return 1
    if (c.aderencia === 'nao-fit') return 2
    return 3 // Não avaliada
  }

  if (quenteA && quenteB) {
    const dataSinalA = a.ultimoSinal ? parseDataDisparo(a.ultimoSinal.data).getTime() : -1
    const dataSinalB = b.ultimoSinal ? parseDataDisparo(b.ultimoSinal.data).getTime() : -1
    if (dataSinalA !== dataSinalB) {
      return dataSinalB - dataSinalA
    }
    const rankA = rankAderencia(a)
    const rankB = rankAderencia(b)
    if (rankA !== rankB) {
      return rankA - rankB
    }
    return a.nome.localeCompare(b.nome, 'pt-BR')
  }

  const rankA = rankAderencia(a)
  const rankB = rankAderencia(b)
  if (rankA !== rankB) {
    return rankA - rankB
  }

  const dataSinalA = a.ultimoSinal ? parseDataDisparo(a.ultimoSinal.data).getTime() : -1
  const dataSinalB = b.ultimoSinal ? parseDataDisparo(b.ultimoSinal.data).getTime() : -1
  if (dataSinalA !== dataSinalB) {
    return dataSinalB - dataSinalA
  }

  return a.nome.localeCompare(b.nome, 'pt-BR')
}

// Cabeçalho fixo no topo do quadro que rola.
const CABECALHO = 'rotulo sticky top-0 z-2 h-9.5 border-b border-al-line bg-al-bg pr-4 text-[0.625rem] whitespace-nowrap'
// Linhas compactas, separadas só pela linha do token.
const CELULA = 'border-b border-al-line pr-4'

export function PaginaContas() {
  const { contaId } = useParams<{ contaId?: string }>()

  if (contaId) {
    return (
      <Pagina titulo="Contas" icone={Building2}>
        <DetalheConta contaId={contaId} />
      </Pagina>
    )
  }

  return <ListaContas />
}

function ListaContas() {
  const navegar = useNavigate()
  const fonte = useFonteDeContas()
  const { dados: contas, carregando, erro, recarregar } = useDadosDeContas(
    (f) => f.contas(),
    [],
  )

  const hoje = fonte.hoje()
  const contasOrdenadas = contas ? [...contas].sort(ordenarPorPrioridade) : []

  return (
    <Pagina titulo="Contas" icone={Building2} ocupaAJanela>
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
        // A tabela rola num quadro próprio, nos dois sentidos, que vai até o pé da janela. Assim o cabeçalho
        // fica fixo na rolagem vertical e a coluna Empresa, na horizontal, sem tirar do lugar a sidebar e a
        // barra de topo.
        <div className="min-h-0 overflow-auto">
          <table
            aria-label="Tabela de Contas"
            className="w-full min-w-[64rem] table-fixed border-separate border-spacing-0 text-left text-sm"
          >
            <thead>
              <tr>
                <th scope="col" className={cn(CABECALHO, 'left-0 z-3 w-52')}>
                  Empresa
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-28')}>
                  Quente
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-24')}>
                  Aderência
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-40')}>
                  Contatos
                </th>
                {/* Sem largura fixa: o Último sinal fica com o resto, e é a coluna mais larga. */}
                <th scope="col" className={CABECALHO}>
                  Último sinal
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-36')}>
                  Segmento
                </th>
                <th scope="col" className={cn(CABECALHO, 'w-28')}>
                  Último contato
                </th>
              </tr>
            </thead>
            <tbody>
              {contasOrdenadas.map((conta) => (
                <tr
                  key={conta.id}
                  className="h-11 cursor-pointer transition-colors hover:bg-al-surface/40"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a, button')) return
                    navegar(`/contas/${conta.id}`)
                  }}
                >
                  <td className={cn(CELULA, 'sticky left-0 z-1 bg-al-bg')}>
                    <CelulaEmpresa conta={conta} />
                  </td>
                  <td className={CELULA}>
                    <CelulaQuente totalSinaisValidos={conta.totalSinaisValidos ?? 0} />
                  </td>
                  <td className={CELULA}>
                    <CelulaAderencia aderencia={conta.aderencia} />
                  </td>
                  <td className={CELULA}>
                    <CelulaContatos total={conta.totalContatos} previa={conta.previaContatos} />
                  </td>
                  <td className={CELULA}>
                    <CelulaUltimoSinal sinal={conta.ultimoSinal} hoje={hoje} />
                  </td>
                  <td className={CELULA}>
                    <CelulaSegmento segmento={conta.segmento} />
                  </td>
                  <td className={CELULA}>
                    <CelulaUltimoContato data={conta.ultimoContatoEm} hoje={hoje} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Pagina>
  )
}

function CelulaEmpresa({ conta }: { conta: ContaAlvo }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <LogoDaConta nome={conta.nome} logo={conta.logo} deUmaCor={conta.logoDeUmaCor} />
      <div className="flex min-w-0 flex-col leading-tight">
        <Link
          to={`/contas/${conta.id}`}
          className="truncate font-normal text-al-ink hover:text-al-accent hover:underline focus:outline-none"
        >
          {conta.nome}
        </Link>
        <span className="truncate text-[0.6875rem] text-al-muted">{conta.dominio ?? 'Domínio não informado'}</span>
      </div>
    </div>
  )
}

function CelulaQuente({ totalSinaisValidos }: { totalSinaisValidos: number }) {
  if (totalSinaisValidos > 0) {
    return <Foguinho quantidade={totalSinaisValidos} />
  }

  return (
    <span
      title="Sem sinais válidos"
      aria-label="Sem sinais válidos"
      className="text-al-muted"
    >
      —
    </span>
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

  if (aderencia === 'fit') {
    return <span className="text-al-ink">Fit</span>
  }

  return <span className="text-al-muted">Não fit</span>
}

function CelulaContatos({ total, previa = [] }: { total: number; previa?: PreviaContato[] }) {
  if (total === 0) {
    return <span className="text-al-muted">Nenhum contato</span>
  }
  return (
    <div className="flex items-center">
      {previa.slice(0, 3).map((contato, i) => (
        <AvatarDoContato key={i} contato={contato} className={i > 0 ? '-ml-1.5' : undefined} />
      ))}
      <span className="ml-2 text-[0.8125rem] whitespace-nowrap text-al-muted">
        {total} {total === 1 ? 'contato' : 'contatos'}
      </span>
    </div>
  )
}

/** A foto do Contato num círculo, ou as iniciais do nome quando não há foto. */
function AvatarDoContato({ contato, className }: { contato: PreviaContato; className?: string }) {
  const circulo = cn('size-6.5 shrink-0 rounded-full border border-al-line ring-[1.5px] ring-al-bg', className)
  if (contato.foto) {
    return <img src={contato.foto} alt={contato.nome} title={contato.nome} className={cn(circulo, 'object-cover')} />
  }
  return (
    <span
      role="img"
      aria-label={contato.nome}
      title={contato.nome}
      className={cn(circulo, 'grid place-items-center bg-al-surface text-[0.625rem] font-normal text-al-ink')}
    >
      {iniciais(contato.nome)}
    </span>
  )
}

function CelulaUltimoSinal({ sinal, hoje }: { sinal?: ContaAlvo['ultimoSinal']; hoje: Date }) {
  if (!sinal) {
    return <span className="text-al-muted">Nenhum sinal</span>
  }

  const dataRelativa = formatarDataDoModulo(sinal.data, hoje, { maiuscula: false })
  const textoCompleto = `${sinal.frase} · ${formatarDataCompleta(sinal.data)}`

  // Numa linha só: a frase é truncada e a data continua sempre visível. O espaço entre as duas não aparece no
  // flex, mas mantém "frase · data" no texto da célula, ao copiar.
  return (
    <span title={textoCompleto} aria-label={textoCompleto} className="flex min-w-0 items-center gap-1.5">
      <RadioTower strokeWidth={1.8} className="size-3.5 shrink-0 text-al-accent" aria-hidden />
      <span className="truncate">{sinal.frase}</span>{' '}
      <span className="shrink-0 whitespace-nowrap text-al-muted">· {dataRelativa}</span>
    </span>
  )
}

function CelulaSegmento({ segmento }: { segmento?: string }) {
  if (!segmento) {
    return <span className="text-al-muted">—</span>
  }
  return (
    <span title={segmento} className="block truncate">
      {segmento}
    </span>
  )
}

function CelulaUltimoContato({ data, hoje }: { data?: string; hoje: Date }) {
  if (!data) {
    return <span className="text-al-muted">Nunca</span>
  }

  const dataRelativaOuExplicita = formatarDataDoModulo(data, hoje, { maiuscula: true })
  const dataCompleta = formatarDataCompleta(data)

  return (
    <span title={dataCompleta} aria-label={dataCompleta} className="whitespace-nowrap">
      {dataRelativaOuExplicita}
    </span>
  )
}
