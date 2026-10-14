import { Info, Search, TriangleAlert } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { buscar, PAGINAS_DA_DOCUMENTACAO, type Bloco, type PaginaDaDocumentacao } from '@/ajuda/documentacao'
import { Mensagem } from '@/components/mensagem'
import { Opcao } from '@/components/opcao'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FaixaProvisoria, SecaoDeConfiguracoes } from './componentes'
import { POLITICA_DE_PRIVACIDADE, TERMOS_DE_SERVICO, type DocumentoInstitucional } from './conteudo-ajuda'

/** As páginas institucionais, depois da documentação. */
const INFORMACOES = {
  feedback: 'Enviar feedback',
  termos: 'Termos de serviço',
  privacidade: 'Política de privacidade',
} as const

const GRUPOS: { titulo: string; paginas: { id: string; titulo: string }[] }[] = [
  ...PAGINAS_DA_DOCUMENTACAO.reduce((grupos, p) => {
    const grupo = grupos.find((g) => g.titulo === p.grupo)
    if (grupo) grupo.paginas.push({ id: p.id, titulo: p.titulo })
    else grupos.push({ titulo: p.grupo, paginas: [{ id: p.id, titulo: p.titulo }] })
    return grupos
  }, [] as { titulo: string; paginas: { id: string; titulo: string }[] }[]),
  { titulo: 'Informações', paginas: Object.entries(INFORMACOES).map(([id, titulo]) => ({ id, titulo })) },
]

/** Rotas antigas da Ajuda e a página equivalente de agora. */
const ROTAS_ANTIGAS: Record<string, string> = { central: 'comecar' }

const PRIMEIRA = PAGINAS_DA_DOCUMENTACAO[0].id

/**
 * Ajuda e informações em formato de documentação, dentro da rota /configuracoes/ajuda/:pagina: barra lateral com
 * grupos recolhíveis e busca (Ctrl+K), o conteúdo no centro e "Nesta página" à direita. O texto vem dos arquivos
 * Markdown de `src/ajuda`; os Termos e a Política, de `conteudo-ajuda.ts`.
 */
export function SecaoAjuda() {
  const { pagina } = useParams()
  if (pagina && ROTAS_ANTIGAS[pagina]) return <Navigate to={`/configuracoes/ajuda/${ROTAS_ANTIGAS[pagina]}`} replace />
  const doc = PAGINAS_DA_DOCUMENTACAO.find((p) => p.id === pagina)
  if (!doc && !(pagina && pagina in INFORMACOES)) return <Navigate to={`/configuracoes/ajuda/${PRIMEIRA}`} replace />

  return (
    <>
      <SecaoDeConfiguracoes
        id="ajuda"
        titulo="Ajuda e informações"
        alcance="althius"
        descricao="Como a Althius funciona, igual para todos os Workspaces."
      >
        <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <BarraLateral atual={pagina!} />
          <div className="min-w-0">
            {doc && <PaginaDeDocumentacao pagina={doc} />}
            {pagina === 'feedback' && <Feedback />}
            {pagina === 'termos' && <Documento documento={TERMOS_DE_SERVICO} />}
            {pagina === 'privacidade' && <Documento documento={POLITICA_DE_PRIVACIDADE} />}
          </div>
        </div>
      </SecaoDeConfiguracoes>
      {/* Fora da região da Ajuda, que não tem link externo; a licença do Scroll Progress pede um crédito visível ao rareui.com. */}
      <p className="text-xs text-al-ink-3">
        O indicador de leitura das páginas é o Scroll Progress, de{' '}
        <a href="https://rareui.com/components/scrollprogressindicator" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-al-ink">
          rareui.com
        </a>
        .
      </p>
    </>
  )
}

function irPara(evento: MouseEvent<HTMLAnchorElement>, id: string) {
  evento.preventDefault()
  const alvo = document.getElementById(id)
  alvo?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  alvo?.focus({ preventScroll: true })
}

function BarraLateral({ atual }: { atual: string }) {
  const navegar = useNavigate()
  const campo = useRef<HTMLInputElement>(null)
  const [termo, setTermo] = useState('')
  const resultados = buscar(termo)

  useEffect(() => {
    function atalho(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault()
        campo.current?.focus()
      }
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-22 lg:self-start">
      <div className="relative">
        <Search strokeWidth={1.8} className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-al-muted" aria-hidden />
        <input
          ref={campo}
          type="search"
          aria-label="Buscar na Ajuda"
          placeholder="Buscar (Ctrl+K)"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          className="campo w-full pl-9"
        />
      </div>
      {termo.trim().length >= 2 && (
        <ul aria-label="Resultados da busca" className="flex flex-col gap-1">
          {resultados.length === 0 && <li className="text-sm text-al-muted">Nada encontrado.</li>}
          {resultados.map((r, i) => (
            <li key={i}>
              <Link
                to={`/configuracoes/ajuda/${r.pagina.id}${r.ancora ? `#${r.ancora}` : ''}`}
                onClick={() => setTermo('')}
                className="flex flex-col rounded-md px-2 py-1 text-sm hover:bg-al-line/40"
              >
                <span className="text-al-ink">{r.rotulo}</span>
                <span className="text-xs text-al-muted">
                  <Destaque texto={r.trecho} termo={termo} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <select
        aria-label="Ir para a página"
        value={atual}
        onChange={(e) => navegar(`/configuracoes/ajuda/${e.target.value}`)}
        className="campo lg:hidden"
      >
        {GRUPOS.map((g) => (
          <optgroup key={g.titulo} label={g.titulo}>
            {g.paginas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titulo}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <nav aria-label="Páginas de Ajuda e informações" className="hidden flex-col gap-3 lg:flex">
        {GRUPOS.map((g) => (
          <details key={g.titulo} open className="group">
            <summary className="rotulo cursor-pointer pb-1 text-[0.6875rem]">{g.titulo}</summary>
            <ul className="flex flex-col">
              {g.paginas.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/configuracoes/ajuda/${p.id}`}
                    aria-current={p.id === atual ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-2 py-1 text-sm text-al-muted hover:text-al-ink',
                      p.id === atual && 'bg-al-line/40 text-al-ink',
                    )}
                  >
                    {p.titulo}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </nav>
    </aside>
  )
}

/** O trecho do resultado com o termo buscado em destaque, sem diferenciar acentos. */
function Destaque({ texto, termo }: { texto: string; termo: string }) {
  const normal = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  // A normalização remove os acentos sem mudar o tamanho de cada letra, então as posições batem com o texto original.
  const pos = normal(texto).indexOf(normal(termo.trim()))
  if (pos < 0) return <>{texto}</>
  const fim = pos + termo.trim().length
  return (
    <>
      {texto.slice(0, pos)}
      <mark className="rounded-sm bg-al-accent/20 text-al-ink">{texto.slice(pos, fim)}</mark>
      {texto.slice(fim)}
    </>
  )
}

/** Texto com **negrito**. */
function Inline({ texto }: { texto: string }) {
  return (
    <>
      {texto.split('**').map((parte, i) => (i % 2 ? <strong key={i} className="font-normal text-al-ink">{parte}</strong> : <Fragment key={i}>{parte}</Fragment>))}
    </>
  )
}

function BlocoDaPagina({ bloco }: { bloco: Bloco }): ReactNode {
  switch (bloco.tipo) {
    case 'titulo':
      return (
        <h4 id={bloco.id} tabIndex={-1} className="titulo-secao scroll-mt-24 pt-4 text-xl">
          {bloco.texto}
        </h4>
      )
    case 'paragrafo':
      return (
        <p className="leading-relaxed text-al-muted">
          <Inline texto={bloco.texto} />
        </p>
      )
    case 'lista':
      return (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-al-muted">
          {bloco.itens.map((item) => (
            <li key={item}>
              <Inline texto={item} />
            </li>
          ))}
        </ul>
      )
    case 'tabela':
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-al-line">
                {bloco.cabecalho.map((c) => (
                  <th key={c} className="py-2 pr-4 font-normal text-al-ink">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloco.linhas.map((linha, i) => (
                <tr key={i} className="border-b border-al-line/60">
                  {linha.map((c, j) => (
                    <td key={j} className="py-2 pr-4 text-al-muted">
                      <Inline texto={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'aviso': {
      const Icone = bloco.nivel === 'atencao' ? TriangleAlert : Info
      return (
        <div
          role="note"
          aria-label={bloco.nivel === 'atencao' ? 'Atenção' : 'Nota'}
          className={cn(
            'rounded-xl flex items-start gap-3 border p-4 text-sm',
            bloco.nivel === 'atencao' ? 'border-al-atencao/50 bg-al-atencao/5' : 'border-al-line bg-al-line/20',
          )}
        >
          <Icone strokeWidth={1.8} className={cn('mt-0.5 size-4 shrink-0', bloco.nivel === 'atencao' ? 'text-al-atencao' : 'text-al-muted')} aria-hidden />
          <p>
            <Inline texto={bloco.texto} />
          </p>
        </div>
      )
    }
  }
}

function PaginaDeDocumentacao({ pagina }: { pagina: PaginaDaDocumentacao }) {
  const titulos = pagina.blocos.filter((b): b is Extract<Bloco, { tipo: 'titulo' }> => b.tipo === 'titulo')
  // Chegando por um resultado da busca (#ancora), leva até a seção.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.focus({ preventScroll: false })
  }, [pagina.id])
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,720px)_12rem]">
      <article aria-labelledby="titulo-da-pagina" className="flex max-w-[720px] flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h3 id="titulo-da-pagina" className="titulo-secao text-2xl">
            {pagina.titulo}
          </h3>
          <span className="text-sm text-al-muted">Atualizado em {pagina.atualizado}</span>
        </header>
        {pagina.blocos.map((bloco, i) => (
          <BlocoDaPagina key={i} bloco={bloco} />
        ))}
      </article>
      {titulos.length > 0 && (
        <nav aria-label={`Seções de ${pagina.titulo}`} className="hidden flex-col gap-1 self-start xl:sticky xl:top-22 xl:flex">
          <span className="rotulo pb-1 text-[0.6875rem]">Nesta página</span>
          {titulos.map((t) => (
            <a key={t.id} href={`#${t.id}`} onClick={(e) => irPara(e, t.id)} className="py-0.5 text-sm text-al-muted hover:text-al-ink">
              {t.texto}
            </a>
          ))}
        </nav>
      )}
    </div>
  )
}

const TIPOS = ['Sugestão', 'Problema', 'Elogio'] as const

type Tipo = (typeof TIPOS)[number]

const TIPO_INICIAL: Tipo = 'Sugestão'

/**
 * Feedback demonstrativo: valida a mensagem e termina com uma confirmação, sem enviar a ninguém nem guardar o que
 * foi escrito. Não existe serviço de suporte nesta demonstração.
 */
function Feedback() {
  const [tipo, setTipo] = useState<Tipo>(TIPO_INICIAL)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [concluido, setConcluido] = useState(false)
  // Depois de "Enviar outro", o formulário volta com o foco na mensagem; na primeira abertura, o foco fica onde está.
  const [recomecou, setRecomecou] = useState(false)
  const campoDaMensagem = useRef<HTMLTextAreaElement>(null)
  const preenchido = tipo !== TIPO_INICIAL || mensagem !== '' || erro !== ''

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!mensagem.trim()) {
      setErro('Escreva seu feedback antes de enviar.')
      campoDaMensagem.current?.focus()
      return
    }
    // Nada é enviado nem guardado: o feedback só existiu no formulário até aqui.
    limpar()
    setConcluido(true)
  }

  function limpar() {
    setTipo(TIPO_INICIAL)
    setMensagem('')
    setErro('')
  }

  function cancelar() {
    limpar()
    campoDaMensagem.current?.focus()
  }

  return (
    <section aria-label="Enviar feedback" className="flex max-w-2xl flex-col gap-6">
      <p className="text-al-muted">
        Conte o que está funcionando, o que atrapalha ou o que falta. Nesta demonstração, o que você escrever não sai do
        formulário.
      </p>
      <Mensagem tipo="sucesso">
        {concluido &&
          'Obrigado! Demonstração: seu feedback não foi enviado a ninguém nem guardado, e o formulário foi limpo.'}
      </Mensagem>
      {concluido ? (
        <Button
          type="button"
          variant="outline"
          autoFocus
          className="self-start"
          onClick={() => {
            setConcluido(false)
            setRecomecou(true)
          }}
        >
          Enviar outro
        </Button>
      ) : (
        <form aria-label="Feedback" noValidate onSubmit={enviar} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span id="feedback-tipo" className="rotulo">
              Tipo
            </span>
            <div role="radiogroup" aria-labelledby="feedback-tipo" className="flex gap-2">
              {TIPOS.map((opcao) => (
                <Opcao key={opcao} papel="radio" marcada={tipo === opcao} aoClicar={() => setTipo(opcao)}>
                  {opcao}
                </Opcao>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="feedback-mensagem" className="rotulo">
              Mensagem
            </label>
            <textarea
              ref={campoDaMensagem}
              id="feedback-mensagem"
              autoFocus={recomecou}
              rows={5}
              value={mensagem}
              onChange={(e) => {
                setMensagem(e.target.value)
                setErro('')
              }}
              aria-invalid={Boolean(erro)}
              aria-describedby={erro ? 'feedback-mensagem-erro' : undefined}
              className="campo"
            />
            {erro && (
              <p id="feedback-mensagem-erro" role="alert" className="text-sm text-al-erro">
                {erro}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Button type="submit" className="px-6 tracking-[0.04em]">
              Enviar feedback
            </Button>
            <Button type="button" variant="ghost" disabled={!preenchido} onClick={cancelar}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

/**
 * Termos ou privacidade: a estrutura completa, com o texto que vier de `conteudo-ajuda.ts`. O índice ao lado rola até a
 * seção e leva o foco para o título dela.
 */
function Documento({ documento }: { documento: DocumentoInstitucional }) {
  const { titulo, versao, provisorio, secoes } = documento

  return (
    <div className="grid grid-cols-[1fr_12rem] gap-10">
      <article aria-labelledby="titulo-documento" className="flex flex-col gap-8">
        {provisorio && (
          <FaixaProvisoria>O texto definitivo ainda será fornecido. Nada abaixo descreve práticas reais da Althius.</FaixaProvisoria>
        )}
        <header className="flex flex-col gap-1">
          <h3 id="titulo-documento" className="titulo-secao text-2xl">
            {titulo}
          </h3>
          <span className="text-sm text-al-muted">{versao}</span>
        </header>
        {secoes.map((secao, i) => (
          <section key={secao.id} aria-labelledby={`documento-${secao.id}`} className="flex flex-col gap-2">
            <h4 id={`documento-${secao.id}`} tabIndex={-1} className="scroll-mt-24 font-normal">
              <span className="rotulo mr-3 text-al-accent" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              {secao.titulo}
            </h4>
            {secao.paragrafos.map((paragrafo) => (
              <p key={paragrafo} className="leading-relaxed text-al-muted">
                {paragrafo}
              </p>
            ))}
          </section>
        ))}
      </article>
      <nav aria-label={`Seções de ${titulo}`} className="sticky top-22 flex flex-col gap-1 self-start">
        <span className="rotulo pb-1 text-[0.6875rem]">Nesta página</span>
        {secoes.map((secao) => (
          <a
            key={secao.id}
            href={`#documento-${secao.id}`}
            onClick={(evento) => irPara(evento, `documento-${secao.id}`)}
            className="py-0.5 text-sm text-al-muted hover:text-al-ink"
          >
            {secao.titulo}
          </a>
        ))}
      </nav>
    </div>
  )
}
