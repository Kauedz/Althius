import { Building2, RadioTower } from 'lucide-react'
import { AbasSublinhadas } from '@/components/abas'
import { LogoDaConta } from '@/components/logos'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { useDadosDeContas, useFonteDeContas } from '@/fonte/contexto'
import type { Aderencia, ContaAlvo, PreviaContato } from '@/fonte/contas-tipos'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { cn, iniciais } from '@/lib/utils'

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

// Cabeçalho fixo ao rolar a página, logo abaixo da barra de topo da Pagina (h-16).
const CABECALHO =
  'sticky top-16 z-2 h-9.5 border-b border-al-line bg-al-bg pr-4 text-[0.625rem] font-normal tracking-rotulo whitespace-nowrap text-al-muted uppercase'
// Linhas compactas, separadas só pela linha do token.
const CELULA = 'border-b border-al-line pr-4'

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
        // Sem contêiner de rolagem em volta: é a página que rola, nos dois sentidos. Assim o cabeçalho
        // fica fixo logo abaixo da barra de topo da Pagina (h-16), e a coluna Empresa, fixa à esquerda.
        <table
          aria-label="Tabela de Contas"
          className="w-full min-w-[64rem] table-fixed border-separate border-spacing-0 text-left text-sm"
        >
          <thead>
            <tr>
              <th scope="col" className={cn(CABECALHO, 'left-0 z-3 w-52')}>
                Empresa
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
              <tr key={conta.id} className="h-11">
                <td className={cn(CELULA, 'sticky left-0 z-1 bg-al-bg')}>
                  <CelulaEmpresa conta={conta} />
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
      )}
    </Pagina>
  )
}

function CelulaEmpresa({ conta }: { conta: ContaAlvo }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <LogoDaConta nome={conta.nome} logo={conta.logo} />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-normal text-al-ink">{conta.nome}</span>
        {conta.dominio && <span className="truncate text-[0.6875rem] text-al-muted">{conta.dominio}</span>}
      </div>
    </div>
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
    return <span className="text-al-ink">🔥 Quente</span>
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

  // Numa linha só: a frase é truncada e a data continua sempre visível.
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
