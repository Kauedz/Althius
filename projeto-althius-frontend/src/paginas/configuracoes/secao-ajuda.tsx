import { useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Mensagem } from '@/components/mensagem'
import { Opcao } from '@/components/opcao'
import { Button } from '@/components/ui/button'
import { AbasDasPaginas, FaixaProvisoria, SecaoDeConfiguracoes } from './componentes'
import { CENTRAL_DE_AJUDA, POLITICA_DE_PRIVACIDADE, TERMOS_DE_SERVICO, type DocumentoInstitucional } from './conteudo-ajuda'

const PAGINAS = {
  central: 'Central de ajuda',
  feedback: 'Enviar feedback',
  termos: 'Termos de serviço',
  privacidade: 'Política de privacidade',
} as const

type Pagina = keyof typeof PAGINAS

function ehPagina(valor: string | undefined): valor is Pagina {
  return valor !== undefined && valor in PAGINAS
}

/**
 * Ajuda e informações: orientações, feedback, termos e privacidade, iguais para todos os Workspaces. Uma página por aba
 * (/configuracoes/ajuda/termos); o conteúdo vem de `conteudo-ajuda.ts`.
 */
export function SecaoAjuda() {
  const { pagina } = useParams()
  if (!ehPagina(pagina)) return <Navigate to="/configuracoes/ajuda/central" replace />

  return (
    <>
      <SecaoDeConfiguracoes
        id="ajuda"
        titulo="Ajuda e informações"
        alcance="althius"
        descricao="Informações da Althius, iguais para todos os Workspaces."
      >
        <AbasDasPaginas secao="ajuda" paginas={PAGINAS} rotuloAcessivel="Páginas de Ajuda e informações" />
        {pagina === 'central' && <CentralDeAjuda />}
        {pagina === 'feedback' && <Feedback />}
        {pagina === 'termos' && <Documento documento={TERMOS_DE_SERVICO} />}
        {pagina === 'privacidade' && <Documento documento={POLITICA_DE_PRIVACIDADE} />}
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

function CentralDeAjuda() {
  return (
    <section aria-label="Central de ajuda" className="flex flex-col gap-6">
      {CENTRAL_DE_AJUDA.provisorio && (
        <FaixaProvisoria>Orientações curtas para a demonstração; o texto definitivo substitui estas orientações.</FaixaProvisoria>
      )}
      <ul className="grid grid-cols-2 gap-4">
        {CENTRAL_DE_AJUDA.orientacoes.map(({ titulo, texto }) => (
          <li key={titulo} className="cartao flex flex-col gap-2 p-5">
            <h3 className="font-normal">{titulo}</h3>
            <p className="text-sm text-al-muted">{texto}</p>
          </li>
        ))}
      </ul>
    </section>
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

  function irPara(evento: MouseEvent<HTMLAnchorElement>, id: string) {
    evento.preventDefault()
    const alvo = document.getElementById(id)
    alvo?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    alvo?.focus({ preventScroll: true })
  }

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
