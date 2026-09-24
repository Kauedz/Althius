import { PreviewCard } from '@base-ui/react/preview-card'
import { Building2, ExternalLink, RadioTower, Search } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AbasSublinhadas } from '@/components/abas'
import { LogoDaConta } from '@/components/logos'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { useDadosDeContas, useFonteDeContas } from '@/fonte/contexto'
import type { Aderencia, ContaAlvo, PreviaContato } from '@/fonte/contas-tipos'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { cn, iniciais, normalizarParaBusca } from '@/lib/utils'
import { DetalheConta } from './detalhe-conta'

const ABAS_MODULO = [
  { rotulo: 'Contas', para: '/contas' },
  { rotulo: 'Contatos', para: '/contatos' },
]

const ORDEM_ADERENCIA: Record<Aderencia, number> = {
  quente: 1,
  fit: 2,
  'nao-fit': 3,
}
// Sem Aderência, a Conta-alvo ainda não foi avaliada: fica depois das Não fit.
const ORDEM_NAO_AVALIADA = 4

type Comparacao = (a: ContaAlvo, b: ContaAlvo) => number

/** A data mais recente primeiro; sem data, no fim. */
function maisRecentePrimeiro(data: (conta: ContaAlvo) => string | undefined): Comparacao {
  const instante = (conta: ContaAlvo) => {
    const valor = data(conta)
    return valor ? new Date(valor).getTime() : -Infinity
  }
  return (a, b) => {
    const [instanteA, instanteB] = [instante(a), instante(b)]
    // Comparados antes da subtração: dois "sem data" (-Infinity) dariam NaN, e não empate.
    return instanteA === instanteB ? 0 : instanteB > instanteA ? 1 : -1
  }
}

const porNome: Comparacao = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR')
const rankDaAderencia = (conta: ContaAlvo) => (conta.aderencia ? ORDEM_ADERENCIA[conta.aderencia] : ORDEM_NAO_AVALIADA)
const porAderencia: Comparacao = (a, b) => rankDaAderencia(a) - rankDaAderencia(b)
const porUltimoSinal = maisRecentePrimeiro((conta) => conta.ultimoSinal?.data)

/** Aplica os critérios em sequência: o seguinte só desfaz o empate do anterior. */
function emSequencia(...criterios: Comparacao[]): Comparacao {
  return (a, b) => criterios.reduce((resultado, criterio) => resultado || criterio(a, b), 0)
}

/** As opções de "Ordenar por", cada uma com direção fixa. Empates, em todas, pelo nome. */
const ORDENACOES = {
  // Quente, Fit, Não fit e não avaliada; dentro do grupo, o Sinal mais recente primeiro e sem Sinal no fim.
  prioridade: { rotulo: 'Prioridade', comparar: emSequencia(porAderencia, porUltimoSinal, porNome) },
  'ultimo-sinal': { rotulo: 'Último sinal', comparar: emSequencia(porUltimoSinal, porNome) },
  contatos: { rotulo: 'Contatos', comparar: emSequencia((a, b) => b.totalContatos - a.totalContatos, porNome) },
  'ultimo-contato': {
    rotulo: 'Último contato',
    comparar: emSequencia(
      maisRecentePrimeiro((conta) => conta.ultimoContatoEm),
      porNome,
    ),
  },
} satisfies Record<string, { rotulo: string; comparar: Comparacao }>

type Ordenacao = keyof typeof ORDENACOES
const ORDENACAO_PADRAO: Ordenacao = 'prioridade'

function eOrdenacao(valor: string | null): valor is Ordenacao {
  return valor !== null && Object.hasOwn(ORDENACOES, valor)
}

/**
 * A busca e a ordenação da lista vivem nos parâmetros do endereço (`busca` e `ordem`), e só lá: abrir o
 * endereço reconstrói o recorte. Os valores padrão não aparecem no endereço.
 */
function useRecorteDasContas() {
  const [parametros, setParametros] = useSearchParams()
  const busca = parametros.get('busca') ?? ''
  const ordemNoEndereco = parametros.get('ordem')
  const ordem = eOrdenacao(ordemNoEndereco) ? ordemNoEndereco : ORDENACAO_PADRAO

  // Cada tecla da busca substitui a entrada do histórico, para o voltar não refazer a digitação.
  function alterar(parametro: 'busca' | 'ordem', valor: string, padrao: string) {
    setParametros(
      (atuais) => {
        const novos = new URLSearchParams(atuais)
        if (valor === padrao) novos.delete(parametro)
        else novos.set(parametro, valor)
        return novos
      },
      { replace: true },
    )
  }

  return {
    busca,
    ordem,
    buscar: (valor: string) => alterar('busca', valor, ''),
    ordenar: (valor: Ordenacao) => alterar('ordem', valor, ORDENACAO_PADRAO),
  }
}

/** As contas cujo nome ou domínio contém a busca, sem diferenciar maiúsculas e acentos. */
function buscarContas(contas: ContaAlvo[], busca: string): ContaAlvo[] {
  const termo = normalizarParaBusca(busca)
  return contas.filter((conta) =>
    [conta.nome, conta.dominio ?? ''].some((campo) => normalizarParaBusca(campo).includes(termo)),
  )
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

  const { busca, ordem, buscar, ordenar } = useRecorteDasContas()

  const hoje = fonte.hoje()
  const contasExibidas = buscarContas(contas ?? [], busca).toSorted(ORDENACOES[ordem].comparar)
  const recortada = normalizarParaBusca(busca) !== ''

  return (
    <Pagina titulo="Contas" icone={Building2} ocupaAJanela>
      <AbasSublinhadas rotuloAcessivel="Abas de contas e contatos" abas={ABAS_MODULO} />

      <div className="flex items-end justify-between gap-8">
        <h2 className="sr-only">Empresas</h2>
        <p className="text-sm text-al-muted">
          Empresas do seu mercado organizadas pelo momento de abordagem
        </p>
        {contas && (
          <span className="text-[0.8125rem] whitespace-nowrap text-al-muted">
            {/* O número em destaque; com busca, "N de M contas", no singular só quando M é 1. */}
            <strong className="font-normal text-al-ink">{recortada ? contasExibidas.length : contas.length}</strong>
            {recortada && ` de ${contas.length}`} {contas.length === 1 ? 'conta' : 'contas'}
          </span>
        )}
      </div>

      {contas && contas.length > 0 && (
        <div className="flex items-center gap-2.5 border-y border-al-line py-2">
          <label className="flex h-9 w-full max-w-105 items-center gap-2 border border-al-line bg-al-surface px-3 text-al-muted focus-within:border-al-muted">
            <Search className="size-4 shrink-0" aria-hidden />
            <input
              type="search"
              aria-label="Buscar contas"
              placeholder="Buscar por empresa ou domínio"
              value={busca}
              onChange={(e) => buscar(e.target.value)}
              className="w-full bg-transparent text-sm text-al-ink outline-none placeholder:text-al-muted"
            />
          </label>
          <span className="flex-1" />
          <select
            aria-label="Ordenar por"
            value={ordem}
            onChange={(e) => eOrdenacao(e.target.value) && ordenar(e.target.value)}
            className="h-9 cursor-pointer border border-al-line bg-al-surface pr-8 pl-3 text-sm text-al-ink"
          >
            {Object.entries(ORDENACOES).map(([valor, { rotulo }]) => (
              <option key={valor} value={valor}>
                Ordenar por: {rotulo}
              </option>
            ))}
          </select>
        </div>
      )}

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

      {!carregando && !erro && contas && contas.length > 0 && contasExibidas.length === 0 && (
        <div className="flex flex-col items-start gap-3 py-12">
          <p className="text-sm text-al-muted">Nenhuma conta encontrada para “{busca.trim()}”.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => buscar('')}
            className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
          >
            Limpar busca e filtros
          </Button>
        </div>
      )}

      {!carregando && !erro && contasExibidas.length > 0 && (
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
              {contasExibidas.map((conta) => (
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
        <PopUpDaEmpresa conta={conta}>
          <Link
            to={`/contas/${conta.id}`}
            className="truncate font-normal text-al-ink hover:text-al-accent hover:underline focus:outline-none"
          >
            {conta.nome}
          </Link>
        </PopUpDaEmpresa>
        <span className="truncate text-[0.6875rem] text-al-muted">{conta.dominio ?? 'Domínio não informado'}</span>
      </div>
    </div>
  )
}

/**
 * Os links do site e do LinkedIn da empresa, num pop-up que abre ao passar o mouse sobre o nome (depois de um
 * pequeno atraso, para não piscar ao percorrer a tabela) ou quando o nome recebe o foco. Mostra só os links que
 * existem e, sem nenhum, não aparece. Fica num portal, porque o quadro da tabela corta o que transborda.
 */
function PopUpDaEmpresa({ conta, children }: { conta: ContaAlvo; children: ReactElement }) {
  const [aberto, setAberto] = useState(false)
  const nomeRef = useRef<HTMLAnchorElement>(null)
  const popUpRef = useRef<HTMLDivElement>(null)

  const links = [
    conta.siteUrl && { rotulo: 'Site', href: conta.siteUrl },
    conta.linkedinUrl && { rotulo: 'LinkedIn', href: conta.linkedinUrl },
  ].filter((link) => !!link)

  if (links.length === 0) return children

  // No fim do <body>, o portal fica fora da ordem do Tab. Ela é refeita à mão: do nome, o Tab entra nos links;
  // do primeiro link, o Shift+Tab volta ao nome; do último, o Tab devolve o foco ao nome e segue dali.
  function tabNoNome(e: KeyboardEvent) {
    const primeiro = popUpRef.current?.querySelector('a')
    if (e.key !== 'Tab' || e.shiftKey || !aberto || !primeiro) return
    e.preventDefault()
    primeiro.focus()
  }

  function tabNoPopUp(e: KeyboardEvent) {
    if (e.key !== 'Tab') return
    const linksDoPopUp = [...(popUpRef.current?.querySelectorAll('a') ?? [])]
    const primeiro = e.shiftKey && e.target === linksDoPopUp[0]
    const ultimo = !e.shiftKey && e.target === linksDoPopUp.at(-1)
    if (!primeiro && !ultimo) return
    // Voltando, o foco para no nome. Seguindo, o Tab continua a partir do nome, para o que vem depois dele.
    if (primeiro) e.preventDefault()
    setAberto(false)
    nomeRef.current?.focus()
  }

  return (
    <PreviewCard.Root open={aberto} onOpenChange={setAberto}>
      <PreviewCard.Trigger
        ref={nomeRef}
        delay={400}
        closeDelay={200}
        onKeyDown={tabNoNome}
        render={children}
      />
      <PreviewCard.Portal>
        <PreviewCard.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
          <PreviewCard.Popup
            ref={popUpRef}
            aria-label={`Links de ${conta.nome}`}
            onKeyDown={tabNoPopUp}
            // O portal tira o pop-up da linha no DOM, mas não na árvore do React: o clique não pode abrir o detalhe.
            onClick={(e) => e.stopPropagation()}
            className="flex min-w-40 flex-col border border-al-line bg-al-surface py-1 text-sm text-al-ink shadow-md outline-none"
          >
            {links.map((link) => (
              <a
                key={link.rotulo}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 px-3 py-1.5 hover:bg-al-bg hover:text-al-accent focus-visible:bg-al-bg focus-visible:outline-none"
              >
                {link.rotulo}
                <ExternalLink className="size-3 text-al-muted" aria-hidden />
              </a>
            ))}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
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
