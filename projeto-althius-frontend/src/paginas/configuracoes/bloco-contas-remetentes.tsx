import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { CanalDaContaRemetente, ContaRemetente } from '@/fonte/contas-remetentes-tipos'
import { useAmbiente, useCarregamento, useDados, useFonteDeContasRemetentes } from '@/fonte/contexto'
import { CONTAS_REMETENTES_NA_DEMONSTRACAO } from '@/fonte/simulada-contas-remetentes'
import { cn } from '@/lib/utils'
import { Bloco } from './componentes'

const TITULO = 'Minhas Contas remetentes'
const DESCRICAO =
  'As suas identidades de E-mail, WhatsApp e LinkedIn, pelas quais as suas Sequências saem em seu nome. Só você as vê e usa; elas nunca viram contas do Workspace.'

/** De quanto em quanto tempo a lista é relida enquanto o backend ainda não confirmou o estado final. */
const INTERVALO_DE_ATUALIZACAO_MS = 5000
/** Quanto vale o link da autenticação hospedada que a Edge Function `sender-accounts` gera: depois disso, não há mais o que esperar. */
const VALIDADE_DO_LINK_MS = 15 * 60 * 1000
/**
 * Por quanto tempo a lista é relida sozinha. Uma conta que o backend deixou parada não é relida para sempre: depois
 * disso, ela se atualiza ao voltar para a aba ou pelo botão Atualizar.
 */
const LIMITE_DO_ACOMPANHAMENTO_MS = 15 * 60 * 1000

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

const CANAIS: CanalDaContaRemetente[] = ['email', 'whatsapp', 'linkedin']

const NOME_DO_CANAL: Record<CanalDaContaRemetente, string> = { email: 'E-mail', whatsapp: 'WhatsApp', linkedin: 'LinkedIn' }

/** Os provedores de E-mail aparecem pelo nome; nos outros Canais, o provedor é o próprio Canal. */
const NOME_DO_PROVEDOR: Record<string, string> = { GOOGLE: 'Google', OUTLOOK: 'Outlook', MICROSOFT: 'Outlook', IMAP: 'IMAP' }

type Situacao = ContaRemetente['estado'] | 'conferindo' | 'sem-conta'

const SITUACAO: Record<Situacao, { rotulo: string; descricao: string; className?: string }> = {
  'sem-conta': { rotulo: 'Não conectada', descricao: 'Conecte a sua identidade para as Sequências saírem em seu nome por este Canal.' },
  conectando: { rotulo: 'Conectando', descricao: 'O provedor está concluindo a conexão desta conta.' },
  sincronizando: { rotulo: 'Sincronizando', descricao: 'A conta entrou e o provedor está sincronizando. Ela fica pronta quando terminar.' },
  conferindo: {
    rotulo: 'Conferindo respostas',
    descricao: 'Conferindo respostas do período fora do ar. Nenhum passo sai por esta conta até a conferência terminar.',
  },
  pronta: { rotulo: 'Pronta', descricao: 'Conectada e pronta para uso.', className: 'border-al-sucesso/50 text-al-sucesso' },
  'requer-reconexao': {
    rotulo: 'Requer reconexão',
    descricao: 'O provedor pediu uma nova autenticação. Reconecte a mesma conta para voltar a usá-la.',
    className: 'border-al-erro/50 text-al-erro',
  },
  desconectada: { rotulo: 'Desconectada', descricao: 'Esta conta não está mais conectada. Conecte de novo para usar este Canal.' },
}

function situacaoDe(conta: ContaRemetente): Situacao {
  return conta.estado === 'sincronizando' && conta.conferindoPeriodoForaDoAr ? 'conferindo' : conta.estado
}

/** O que o backend diz de um Canal agora. Quando muda, o backend respondeu à autenticação aberta para ele. */
function retratoDoCanal(contas: ContaRemetente[], canal: CanalDaContaRemetente): string {
  return contas
    .filter((conta) => conta.canal === canal)
    .map((conta) => `${conta.id}:${situacaoDe(conta)}`)
    .join('|')
}

/** A autenticação hospedada aberta em outra aba, à espera de o backend responder por este Canal. */
interface Espera {
  canal: CanalDaContaRemetente
  url: string
  retrato: string
}

/**
 * As Contas remetentes do titular, em Meu perfil. No Workspace operacional, o estado vem sempre do backend: a
 * autenticação hospedada abre em outra aba e o retorno dela não prova a conexão (ela volta para Conexões), então esta
 * tela relê a lista ao voltar para ela e, enquanto espera o backend, de tempos em tempos. Na Demonstração, nada é
 * conectado.
 */
export function BlocoDeContasRemetentes() {
  const { modo } = useAmbiente()
  if (modo === 'demonstracao') {
    return (
      <Bloco titulo={TITULO} descricao={DESCRICAO}>
        <p className="text-sm text-al-muted">{CONTAS_REMETENTES_NA_DEMONSTRACAO}</p>
      </Bloco>
    )
  }
  return <ContasRemetentesDoTitular />
}

function ContasRemetentesDoTitular() {
  const fonte = useFonteDeContasRemetentes()
  const { dados: contas, erro: erroDaLista, recarregar } = useCarregamento(fonte, (f) => f.minhas(), [])
  const [espera, setEspera] = useState<Espera | null>(null)
  const [pedindo, setPedindo] = useState(false)
  const [erro, setErro] = useState('')
  const [desconectando, setDesconectando] = useState<ContaRemetente | null>(null)
  // As Contas remetentes são do titular em cada Workspace: a tela diz de qual Workspace é a lista.
  const workspace = useDados((f) => f.workspace(), [])

  // "Atualizar" relê o backend e diz quando a releitura chegou, mesmo sem mudança; uma falha aparece no erro da lista.
  const [atualizando, setAtualizando] = useState(false)
  const [atualizadaAs, setAtualizadaAs] = useState('')
  const atualizacaoPedida = useRef(false)
  useEffect(() => {
    if (!atualizacaoPedida.current || (!contas && !erroDaLista)) return
    atualizacaoPedida.current = false
    setAtualizando(false)
    setAtualizadaAs(erroDaLista ? '' : HORA.format(new Date()))
  }, [contas, erroDaLista])
  function atualizar() {
    atualizacaoPedida.current = true
    setAtualizando(true)
    setAtualizadaAs('')
    recarregar()
  }

  // A espera acaba quando o backend responde pelo Canal (a linha passa a mostrar o estado) ou quando o link vence.
  if (espera && contas && retratoDoCanal(contas, espera.canal) !== espera.retrato) setEspera(null)
  useEffect(() => {
    if (!espera) return
    const fim = setTimeout(() => setEspera(null), VALIDADE_DO_LINK_MS)
    return () => clearTimeout(fim)
  }, [espera])

  // Enquanto algo está em andamento, a lista é relida de tempos em tempos, só com a aba à vista.
  const emTransicao = contas?.some((conta) => conta.estado === 'conectando' || conta.estado === 'sincronizando') ?? false
  const acompanhar = emTransicao || espera !== null
  useEffect(() => {
    if (!acompanhar) return
    const intervalo = setInterval(() => {
      if (document.visibilityState !== 'hidden') recarregar()
    }, INTERVALO_DE_ATUALIZACAO_MS)
    const limite = setTimeout(() => clearInterval(intervalo), LIMITE_DO_ACOMPANHAMENTO_MS)
    return () => {
      clearInterval(intervalo)
      clearTimeout(limite)
    }
  }, [acompanhar, recarregar])

  // O retrato da espera sai da lista de quando o link chega, não da de quando o botão foi clicado.
  const contasAtuais = useRef(contas)
  useEffect(() => {
    contasAtuais.current = contas
  }, [contas])

  // Quem volta para esta aba (da autenticação, de Conexões ou de outro lugar) vê o que o backend tem agora.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState !== 'hidden') recarregar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [recarregar])

  /** Pede o link novo ao backend e abre a autenticação hospedada em outra aba, sem sair desta tela. */
  async function autenticar(canal: CanalDaContaRemetente, pedirLink: () => Promise<string>) {
    if (!contas) return
    setPedindo(true)
    setErro('')
    try {
      const url = await pedirLink()
      window.open(url, '_blank', 'noopener,noreferrer')
      setEspera({ canal, url, retrato: retratoDoCanal(contasAtuais.current ?? contas, canal) })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível iniciar a conexão.')
    } finally {
      setPedindo(false)
    }
  }

  return (
    <Bloco
      titulo={TITULO}
      descricao={DESCRICAO}
      acoes={
        <button type="button" onClick={atualizar} disabled={atualizando} className={BOTAO_DISCRETO}>
          {atualizando ? 'Atualizando…' : 'Atualizar'}
        </button>
      }
    >
      {workspace && (
        <p className="text-sm text-al-muted">
          Estas são as Contas remetentes que você conectou no Workspace {workspace.cliente}. Cada Workspace tem as suas:
          uma conta conectada em outro Workspace não aparece aqui.
        </p>
      )}
      {atualizadaAs && (
        <p role="status" className="text-sm text-al-muted">
          Lista atualizada às {atualizadaAs}.
        </p>
      )}
      <Mensagem tipo="info">
        {espera && (
          <>
            A autenticação do {NOME_DO_CANAL[espera.canal]} abriu em outra aba. Conclua por lá e volte para esta: o estado
            aparece aqui quando o provedor confirmar a conexão. Se a aba não abriu,{' '}
            <a href={espera.url} target="_blank" rel="noopener noreferrer" className="text-al-ink underline underline-offset-2">
              abra a autenticação por aqui
            </a>
            .
          </>
        )}
      </Mensagem>
      <Mensagem tipo="erro">{erro}</Mensagem>
      {erroDaLista && <Mensagem tipo="erro">{erroDaLista.message}</Mensagem>}
      {!contas ? (
        !erroDaLista && <Carregando />
      ) : (
        <ul className="flex flex-col">
          {CANAIS.flatMap((canal) => {
            const doCanal = contas.filter((conta) => conta.canal === canal)
            const ativas = doCanal.filter((conta) => conta.estado !== 'desconectada')
            const nome = NOME_DO_CANAL[canal]
            const conectar = (
              <button
                type="button"
                aria-label={`Conectar ${nome}`}
                disabled={pedindo}
                onClick={() => autenticar(canal, () => fonte.conectar(canal))}
                className={BOTAO_SECUNDARIO}
              >
                Conectar
              </button>
            )
            if (ativas.length === 0) {
              // Sem conta ativa, o Canal mostra a última desconectada, se houver, e oferece uma conexão nova.
              const ultima = doCanal.at(-1)
              return [
                <LinhaDoCanal key={canal} nome={nome} conta={ultima} situacao={ultima ? 'desconectada' : 'sem-conta'}>
                  {conectar}
                </LinhaDoCanal>,
              ]
            }
            return ativas.map((conta) => (
              <LinhaDoCanal key={conta.id} nome={nome} conta={conta} situacao={situacaoDe(conta)}>
                {conta.estado === 'requer-reconexao' && (
                  <button
                    type="button"
                    aria-label={`Reconectar ${nome}`}
                    disabled={pedindo}
                    onClick={() => autenticar(canal, () => fonte.reconectar(conta))}
                    className={BOTAO_PRIMARIO}
                  >
                    Reconectar
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Desconectar ${nome}`}
                  disabled={pedindo}
                  onClick={() => setDesconectando(conta)}
                  className={BOTAO_DISCRETO}
                >
                  Desconectar
                </button>
              </LinhaDoCanal>
            ))
          })}
        </ul>
      )}
      <DialogoDeDesconexao
        conta={desconectando}
        aoFechar={() => setDesconectando(null)}
        aoFalhar={(mensagem) => {
          setErro(mensagem)
          setDesconectando(null)
        }}
      />
    </Bloco>
  )
}

function LinhaDoCanal({
  nome,
  conta,
  situacao,
  children,
}: {
  nome: string
  conta?: ContaRemetente
  situacao: Situacao
  children: ReactNode
}) {
  const { rotulo, descricao, className } = SITUACAO[situacao]
  const provedor = conta && NOME_DO_PROVEDOR[conta.provedor]
  return (
    <li aria-label={nome} className="flex items-start gap-6 border-b border-al-line py-4 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-normal">{nome}</span>
          {provedor && <span className="rotulo">{provedor}</span>}
          <span className={cn('selo', className)}>{rotulo}</span>
        </div>
        <p className="text-sm text-al-muted">{descricao}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </li>
  )
}

function DialogoDeDesconexao({
  conta,
  aoFechar,
  aoFalhar,
}: {
  conta: ContaRemetente | null
  aoFechar: () => void
  aoFalhar: (mensagem: string) => void
}) {
  const fonte = useFonteDeContasRemetentes()
  const [desconectando, setDesconectando] = useState(false)
  const nome = conta ? NOME_DO_CANAL[conta.canal] : ''

  async function desconectar() {
    if (!conta) return
    setDesconectando(true)
    try {
      await fonte.desconectar(conta.id)
      aoFechar()
    } catch (e) {
      aoFalhar(e instanceof Error ? e.message : 'Não foi possível desconectar a conta.')
    } finally {
      setDesconectando(false)
    }
  }

  return (
    <Dialog open={conta !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogTitle className="titulo-secao text-2xl">Desconectar {nome}</DialogTitle>
        <DialogDescription className="text-al-muted">
          As suas Sequências deixam de sair por esta conta até você conectar de novo. As Interações já registradas continuam
          no Workspace.
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={desconectando}
            onClick={desconectar}
            className={cn(BOTAO_PRIMARIO, 'border-al-erro bg-al-erro text-white hover:border-al-erro hover:bg-al-erro/85')}
          >
            Desconectar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
