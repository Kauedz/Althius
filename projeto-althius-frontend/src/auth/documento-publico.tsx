import { Logo } from '@/components/marca'
import { FaixaProvisoria } from '@/paginas/configuracoes/componentes'
import { POLITICA_DE_PRIVACIDADE, TERMOS_DE_SERVICO, type DocumentoInstitucional } from '@/paginas/configuracoes/conteudo-ajuda'
import { ENDERECO_DA_POLITICA_DE_PRIVACIDADE, ENDERECO_DOS_TERMOS_DE_USO } from './termos'

/** Os documentos que a Althius publica para qualquer pessoa ler, com ou sem conta: o mesmo texto de Ajuda e informações. */
const DOCUMENTOS_PUBLICOS: Record<string, DocumentoInstitucional> = {
  [ENDERECO_DOS_TERMOS_DE_USO]: TERMOS_DE_SERVICO,
  [ENDERECO_DA_POLITICA_DE_PRIVACIDADE]: POLITICA_DE_PRIVACIDADE,
}

/** O documento publicado neste caminho, se ele for o endereço dos Termos de Uso ou da Política de Privacidade. */
export function documentoPublicoDoCaminho(caminho: string): DocumentoInstitucional | null {
  return DOCUMENTOS_PUBLICOS[caminho] ?? null
}

/**
 * A página pública de um documento, fora do login e da Demonstração: é para onde o aceite passivo do cadastro leva, e o
 * Google pede os dois endereços publicados. Uma coluna só, para ler também no celular.
 */
export function PaginaDoDocumentoPublico({ documento }: { documento: DocumentoInstitucional }) {
  const { titulo, versao, provisorio, secoes } = documento
  return (
    <main className="min-h-screen bg-al-bg px-4 py-8 text-al-ink sm:px-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        {/* Sem link para o início: num navegador que nunca escolheu ambiente, ele abriria a Demonstração. */}
        <Logo className="h-5 self-start" />
        <article aria-labelledby="titulo-do-documento" className="flex flex-col gap-8">
          {provisorio && (
            <FaixaProvisoria>O texto definitivo ainda será fornecido. Nada abaixo descreve práticas reais da Althius.</FaixaProvisoria>
          )}
          <header className="flex flex-col gap-1">
            <h1 id="titulo-do-documento" className="titulo-secao text-2xl sm:text-3xl">{titulo}</h1>
            <span className="text-sm text-al-muted">{versao}</span>
          </header>
          {secoes.map((secao, i) => (
            <section key={secao.id} id={secao.id} aria-labelledby={`secao-${secao.id}`} className="flex flex-col gap-2">
              <h2 id={`secao-${secao.id}`} className="font-normal">
                <span className="rotulo mr-3 text-al-accent" aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
                {secao.titulo}
              </h2>
              {secao.paragrafos.map((paragrafo) => (
                <p key={paragrafo} className="leading-relaxed text-al-muted">
                  {paragrafo}
                </p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </main>
  )
}
