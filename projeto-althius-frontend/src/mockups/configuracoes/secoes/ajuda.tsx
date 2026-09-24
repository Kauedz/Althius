import { useState, type FormEvent } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { AbasSublinhadas } from '@/components/abas'
import { cn } from '@/lib/utils'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CabecalhoDaSecao, Campo, FaixaProvisoria, Mensagem, Opcao } from '../componentes'

const PAGINAS = ['central', 'feedback', 'termos', 'privacidade'] as const
type PaginaId = (typeof PAGINAS)[number]

export function SecaoAjuda() {
  const { paginaId } = useParams()
  if (!PAGINAS.includes(paginaId as PaginaId)) return <Navigate to="/configuracoes/ajuda/central" replace />

  return (
    <>
      <CabecalhoDaSecao titulo="Ajuda e informações" alcance="althius" />
      <AbasSublinhadas
        rotuloAcessivel="Ajuda e informações"
        abas={[
          { rotulo: 'Central de ajuda', para: '/configuracoes/ajuda/central' },
          { rotulo: 'Enviar feedback', para: '/configuracoes/ajuda/feedback' },
          { rotulo: 'Termos de serviço', para: '/configuracoes/ajuda/termos' },
          { rotulo: 'Política de privacidade', para: '/configuracoes/ajuda/privacidade' },
        ]}
      />
      {paginaId === 'central' && <CentralDeAjuda />}
      {paginaId === 'feedback' && <Feedback />}
      {paginaId === 'termos' && <Documento titulo="Termos de serviço" secoes={TERMOS} />}
      {paginaId === 'privacidade' && <Documento titulo="Política de privacidade" secoes={PRIVACIDADE} />}
    </>
  )
}

const ORIENTACOES = [
  { titulo: 'Agentes e Especialidades', texto: 'Scopus, Ethos, Rhetor e Oraculum trabalham em frentes fixas. Crie Agentes a partir de uma Especialidade e personalize instruções, tom e ferramentas.' },
  { titulo: 'Conversa e Menções', texto: 'Converse com um Agente na página dele ou mencione outros com @ na Conversa coordenada.' },
  { titulo: 'Aprovações', texto: 'O que um Agente propõe e só acontece com o seu ok. Decida na fila de Aprovações ou no Canal de onde veio o pedido.' },
  { titulo: 'Contas e Contatos', texto: 'As Contas-alvo com a Aderência do Scopus e os Contatos com a Persona do Ethos.' },
  { titulo: 'Sequências', texto: 'Cadências de mensagens por canal, escritas pelo Rhetor e acompanhadas passo a passo.' },
  { titulo: 'Sinais', texto: 'Monitoramentos que avisam quando uma Conta-alvo fica Quente, sem mudar a Aderência dela.' },
  { titulo: 'Conexões', texto: 'Conecte cada ferramenta uma vez para o Workspace e escolha em cada Agente o que ele pode usar.' },
  { titulo: 'Memória do Workspace', texto: 'O ICP e as Personas vigentes. Peça revisões ao Scopus ou ao Ethos; um Administrador decide.' },
]

function CentralDeAjuda() {
  return (
    <section aria-label="Central de ajuda" className="flex flex-col gap-6">
      <FaixaProvisoria>Orientações curtas para a demonstração; os artigos completos entram depois, nesta mesma estrutura.</FaixaProvisoria>
      <ul className="grid grid-cols-2 gap-4">
        {ORIENTACOES.map((o) => (
          <li key={o.titulo} className="cartao flex flex-col gap-2 p-5">
            <h3 className="font-normal">{o.titulo}</h3>
            <p className="text-sm text-al-muted">{o.texto}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

const TIPOS = ['Sugestão', 'Problema', 'Elogio'] as const

function Feedback() {
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>('Sugestão')
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState<string | undefined>()
  const [enviado, setEnviado] = useState(false)

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!mensagem.trim()) {
      setErro('Escreva seu feedback antes de enviar.')
      return
    }
    setErro(undefined)
    setMensagem('')
    setEnviado(true)
  }

  if (enviado) {
    return (
      <section aria-label="Enviar feedback" className="flex max-w-2xl flex-col gap-4">
        <Mensagem tipo="sucesso">Obrigado! Feedback registrado nesta demonstração. Nada foi enviado para fora da Althius.</Mensagem>
        <button type="button" onClick={() => setEnviado(false)} className={cn(BOTAO_SECUNDARIO, 'self-start')}>
          Enviar outro
        </button>
      </section>
    )
  }

  return (
    <section aria-label="Enviar feedback" className="flex max-w-2xl flex-col gap-6">
      <p className="text-al-muted">Conte o que está funcionando, o que atrapalha ou o que falta. Quem constrói a Althius lê tudo.</p>
      <form aria-label="Feedback" noValidate onSubmit={enviar} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="rotulo" id="feedback-tipo">
            Tipo
          </span>
          <div role="radiogroup" aria-labelledby="feedback-tipo" className="flex gap-2">
            {TIPOS.map((t) => (
              <Opcao key={t} papel="radio" marcada={tipo === t} aoClicar={() => setTipo(t)}>
                {t}
              </Opcao>
            ))}
          </div>
        </div>
        <Campo rotulo="Mensagem" id="feedback-mensagem" erro={erro}>
          <textarea
            id="feedback-mensagem"
            rows={5}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            aria-invalid={Boolean(erro)}
            className="campo"
          />
        </Campo>
        <button type="submit" className={cn(BOTAO_PRIMARIO, 'self-start')}>
          Enviar feedback
        </button>
      </form>
    </section>
  )
}

interface SecaoDoDocumento {
  id: string
  titulo: string
  assunto: string
}

const TERMOS: SecaoDoDocumento[] = [
  { id: 'aceitacao', titulo: 'Aceitação dos termos', assunto: 'quando e como estes termos passam a valer para o Cliente e as pessoas do Workspace' },
  { id: 'servico', titulo: 'Descrição do serviço', assunto: 'o que a Althius oferece e o que depende das Integrações conectadas' },
  { id: 'contas', titulo: 'Contas de usuário e Workspaces', assunto: 'a Conta de usuário, a Participação no Workspace e as responsabilidades de Administradores e Membros' },
  { id: 'uso', titulo: 'Uso aceitável', assunto: 'o que não é permitido fazer com a Althius e com os Agentes' },
  { id: 'conteudo', titulo: 'Conteúdo do Cliente', assunto: 'a quem pertencem os dados e documentos enviados ao Workspace' },
  { id: 'alteracoes', titulo: 'Disponibilidade e alterações', assunto: 'como o serviço pode mudar e como o Cliente será avisado' },
  { id: 'responsabilidade', titulo: 'Limitação de responsabilidade', assunto: 'os limites de responsabilidade das partes' },
  { id: 'encerramento', titulo: 'Encerramento', assunto: 'como o Cliente ou a Althius podem encerrar o uso do serviço' },
  { id: 'contato', titulo: 'Contato', assunto: 'por onde falar com a Althius sobre estes termos' },
]

const PRIVACIDADE: SecaoDoDocumento[] = [
  { id: 'quem', titulo: 'Quem somos', assunto: 'a identificação do responsável pelo tratamento dos dados' },
  { id: 'dados', titulo: 'Dados tratados', assunto: 'quais dados pessoais e do Workspace são tratados' },
  { id: 'finalidades', titulo: 'Finalidades', assunto: 'para que esses dados são usados' },
  { id: 'compartilhamento', titulo: 'Compartilhamento', assunto: 'com quem os dados podem ser compartilhados, incluindo as Integrações' },
  { id: 'retencao', titulo: 'Retenção', assunto: 'por quanto tempo os dados são guardados' },
  { id: 'direitos', titulo: 'Direitos do titular', assunto: 'como exercer os direitos previstos na legislação aplicável' },
  { id: 'seguranca', titulo: 'Segurança', assunto: 'as medidas de proteção dos dados' },
  { id: 'contato', titulo: 'Contato', assunto: 'por onde falar sobre privacidade' },
]

/** Página de documento com estrutura completa e texto provisório, trocável sem redesenho. */
function Documento({ titulo, secoes }: { titulo: string; secoes: SecaoDoDocumento[] }) {
  return (
    <article aria-label={titulo} className="grid grid-cols-[1fr_12rem] gap-10">
      <div className="flex flex-col gap-8">
        <FaixaProvisoria>O texto definitivo será fornecido pelo jurídico. Nada abaixo descreve práticas reais da Althius.</FaixaProvisoria>
        <header className="flex flex-col gap-1">
          <h3 className="titulo-secao text-2xl">{titulo}</h3>
          <span className="text-sm text-al-muted">Versão provisória · sem data de vigência</span>
        </header>
        {secoes.map((secao, i) => (
          <section key={secao.id} id={`doc-${secao.id}`} aria-label={secao.titulo} className="flex scroll-mt-24 flex-col gap-2">
            <h4 className="font-normal">
              <span className="rotulo mr-3 text-al-accent">{String(i + 1).padStart(2, '0')}</span>
              {secao.titulo}
            </h4>
            <p className="leading-relaxed text-al-muted">
              [Texto provisório] Esta seção vai tratar de {secao.assunto}. O conteúdo definitivo substitui este parágrafo sem mudar a
              estrutura da página.
            </p>
          </section>
        ))}
      </div>
      <nav aria-label={`Seções de ${titulo}`} className="sticky top-22 flex flex-col gap-1 self-start">
        <span className="rotulo pb-1 text-[0.625rem]">Nesta página</span>
        {secoes.map((secao) => (
          <button
            key={secao.id}
            type="button"
            onClick={() => document.getElementById(`doc-${secao.id}`)?.scrollIntoView({ behavior: 'smooth' })}
            className="text-left text-sm text-al-muted hover:text-al-ink"
          >
            {secao.titulo}
          </button>
        ))}
      </nav>
    </article>
  )
}
