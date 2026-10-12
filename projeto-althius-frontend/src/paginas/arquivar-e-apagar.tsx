import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ContaAlvo, Contato } from '@/fonte/contas-tipos'
import { useDadosDeContas, useFonteDeContas } from '@/fonte/contexto'
import { formatarDataCompleta, formatarDataExplicita } from '@/fonte/formatar-data'
import { cn } from '@/lib/utils'
import { DialogoDeEdicaoDoContato } from './formulario-de-contato'
import { FalhaAoCarregar } from './modulo-contas-e-contatos'

const BOTAO_SECUNDARIO = 'h-9 border-al-line text-sm tracking-[0.04em] hover:bg-al-surface'
/** O botão que alterna a lista padrão e a de arquivados, ao lado da contagem. */
export const BOTAO_DO_CABECALHO = 'h-9 shrink-0 border-al-line text-sm tracking-[0.04em] hover:bg-al-surface'
const BOTAO_DE_PERIGO =
  'rounded-md h-9 border border-al-erro bg-al-erro px-4 text-sm font-medium tracking-[0.04em] text-white hover:opacity-90 disabled:opacity-50'
const BOTAO_PRIMARIO =
  'rounded-md h-9 border border-al-accent bg-al-accent px-4 text-sm font-medium tracking-[0.04em] text-al-on-accent hover:bg-al-accent-2 disabled:opacity-50'

const comoTexto = (valor: string) => valor.trim().toLowerCase()

interface PropsDoDialogo {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  titulo: string
  descricao: ReactNode
  rotuloDaAcao: string
  /** O nome que a pessoa digita para confirmar. Sem ele, basta o botão. */
  confirmarCom?: string
  perigo?: boolean
  /** Faz a ação. Rejeitar mostra a razão no diálogo e o mantém aberto. */
  agir: (confirmacao: string) => Promise<void>
}

/**
 * A confirmação de uma ação que tira um registro da operação. Apagar definitivamente exige digitar o nome do registro:
 * o botão só liga quando o texto confere, e o banco confere de novo.
 */
export function DialogoDeConfirmacao(props: PropsDoDialogo) {
  return (
    <Dialog open={props.aberto} onOpenChange={props.aoMudar}>
      <DialogContent className="gap-5 p-6 sm:max-w-lg">{props.aberto && <CorpoDoDialogo {...props} />}</DialogContent>
    </Dialog>
  )
}

function CorpoDoDialogo({ aoMudar, titulo, descricao, rotuloDaAcao, confirmarCom, perigo, agir }: PropsDoDialogo) {
  const [texto, setTexto] = useState('')
  const [agindo, setAgindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const confere = confirmarCom === undefined || comoTexto(texto) === comoTexto(confirmarCom)

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (!confere) return
    setAgindo(true)
    setErro(null)
    try {
      await agir(texto)
      aoMudar(false)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível concluir a ação.')
      setAgindo(false)
    }
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{titulo}</DialogTitle>
        <DialogDescription className="flex flex-col gap-2 text-sm text-al-muted">{descricao}</DialogDescription>
      </DialogHeader>
      {confirmarCom !== undefined && (
        <label className="flex flex-col gap-1.5 text-xs text-al-muted">
          Digite o nome para confirmar: <strong className="text-al-ink">{confirmarCom}</strong>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
            aria-label="Nome para confirmar"
            className="rounded-md h-9 border border-al-line bg-al-surface px-3 text-sm text-al-ink"
          />
        </label>
      )}
      {erro && (
        <p role="alert" className="text-sm text-al-atencao">
          {erro}
        </p>
      )}
      <DialogFooter className="mt-1 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => aoMudar(false)} className={BOTAO_SECUNDARIO}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!confere || agindo} className={perigo ? BOTAO_DE_PERIGO : BOTAO_PRIMARIO}>
          {agindo ? 'Aguarde...' : rotuloDaAcao}
        </Button>
      </DialogFooter>
    </form>
  )
}

function contar(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * O que quem pode faz com a Conta-alvo no detalhe: arquivar e restaurar (o Vendedor responsável ou um Administrador) e
 * apagar definitivamente (só o Administrador). Sem os métodos na fonte (a Demonstração), nada aparece. A Conta arquivada
 * traz o aviso de que saiu da operação, e a Sequência dela só é destravada ao restaurar, nunca retomada.
 */
export function AcoesDaConta({ conta, temSequenciaEmAndamento }: { conta: ContaAlvo; temSequenciaEmAndamento: boolean }) {
  const fonte = useFonteDeContas()
  const navegar = useNavigate()
  const [dialogo, setDialogo] = useState<'arquivar' | 'apagar' | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeArquivar = !!fonte.arquivarConta && conta.podeArquivar === true && !conta.arquivadaEm
  const podeRestaurar = !!fonte.restaurarConta && conta.podeArquivar === true && !!conta.arquivadaEm
  const podeApagar = !!fonte.apagarConta && conta.podeApagar === true
  if (!conta.arquivadaEm && !podeArquivar && !podeApagar && !resultado) return null

  async function restaurar() {
    setErro(null)
    setResultado(null)
    try {
      const { sequenciasDestravadas } = await fonte.restaurarConta!(conta.id)
      setResultado(
        sequenciasDestravadas > 0
          ? 'Conta restaurada. A Sequência continua pausada até o Vendedor responsável retomá-la.'
          : 'Conta restaurada.',
      )
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível restaurar a Conta-alvo.')
    }
  }

  return (
    <div className="flex flex-col gap-3 border-b border-al-line py-4">
      {conta.arquivadaEm && (
        <p role="status" className="flex items-start gap-2 text-sm text-al-ink">
          <Archive className="mt-0.5 size-4 shrink-0 text-al-atencao" aria-hidden />
          <span>
            Conta arquivada em{' '}
            <span title={formatarDataCompleta(conta.arquivadaEm)}>{formatarDataExplicita(conta.arquivadaEm, fonte.hoje())}</span>. Fora das
            listas e buscas, sem novas Interações, Contatos nem Sequências. O histórico fica e a Sequência continua pausada até o Vendedor
            responsável retomá-la.
          </span>
        </p>
      )}
      {resultado && (
        <p role="status" className="text-sm text-al-muted">
          {resultado}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {podeArquivar && (
          <Button type="button" variant="outline" onClick={() => setDialogo('arquivar')} className={BOTAO_SECUNDARIO}>
            <Archive className="mr-1.5 size-4" aria-hidden /> Arquivar Conta
          </Button>
        )}
        {podeRestaurar && (
          <Button type="button" variant="outline" onClick={restaurar} className={BOTAO_SECUNDARIO}>
            <ArchiveRestore className="mr-1.5 size-4" aria-hidden /> Restaurar Conta
          </Button>
        )}
        {podeApagar && (
          <Button type="button" variant="outline" onClick={() => setDialogo('apagar')} className={cn(BOTAO_SECUNDARIO, 'text-al-erro')}>
            <Trash2 className="mr-1.5 size-4" aria-hidden /> Apagar definitivamente
          </Button>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-sm text-al-atencao">
          {erro}
        </p>
      )}

      <DialogoDeConfirmacao
        aberto={dialogo === 'arquivar'}
        aoMudar={(aberto) => !aberto && setDialogo(null)}
        titulo={`Arquivar ${conta.nome}?`}
        descricao={
          <>
            <span>A Conta sai das listas e buscas padrão. O histórico fica, e você pode restaurá-la quando quiser.</span>
            {temSequenciaEmAndamento && (
              <span>
                A Sequência em andamento será pausada e os passos pendentes, cancelados. Restaurar a Conta só a destrava: o Vendedor
                responsável precisa retomá-la e ativar os envios de novo.
              </span>
            )}
          </>
        }
        rotuloDaAcao="Arquivar"
        agir={async () => {
          const { sequenciasPausadas } = await fonte.arquivarConta!(conta.id)
          setResultado(
            sequenciasPausadas > 0 ? `Conta arquivada. ${contar(sequenciasPausadas, 'Sequência pausada', 'Sequências pausadas')}.` : 'Conta arquivada.',
          )
        }}
      />
      <DialogoDeConfirmacao
        aberto={dialogo === 'apagar'}
        aoMudar={(aberto) => !aberto && setDialogo(null)}
        titulo={`Apagar ${conta.nome} definitivamente?`}
        descricao={
          <>
            <span>
              Some tudo o que é da empresa: nome, site, LinkedIn e demais dados, os Contatos que só existem nesta Conta, e o documento, os
              envios, as respostas e os anexos da Sequência dela. Não dá para desfazer.
            </span>
            <span>
              Ficam só os eventos comerciais, como o tipo e a data de cada Interação, sem nome nem contato. Os Contatos que também atuam
              em outra Conta continuam lá, sem o Vínculo com esta.
            </span>
          </>
        }
        rotuloDaAcao="Apagar definitivamente"
        confirmarCom={conta.nome}
        perigo
        agir={async (confirmacao) => {
          await fonte.apagarConta!(conta.id, confirmacao)
          navegar('/contas')
        }}
      />
    </div>
  )
}

const SEM_PERMISSAO_PARA_EDITAR =
  'Só um Administrador ou o Vendedor responsável por todas as Contas deste Contato pode editá-lo.'

/**
 * As ações de uma linha de Contato: editar (um Administrador ou o Vendedor responsável por todas as Contas dele), arquivar
 * (o Vendedor responsável ou um Administrador) e apagar definitivamente (só o Administrador). Só aparecem quando a fonte
 * oferece a ação e a sessão pode fazê-la. Quem pode arquivar mas não editar, por o Contato atuar também em Conta de outro
 * Vendedor, vê o Editar desligado com o motivo.
 */
export function AcoesDoContato({ contato }: { contato: Contato }) {
  const fonte = useFonteDeContas()
  const [dialogo, setDialogo] = useState<'editar' | 'arquivar' | 'apagar' | null>(null)
  const podeArquivar = !!fonte.arquivarContato && contato.podeArquivar === true
  const podeApagar = !!fonte.apagarContato && contato.podeApagar === true
  const podeEditar = !!fonte.editarContato && contato.podeEditar === true
  const editarDesligado = !!fonte.editarContato && !podeEditar && podeArquivar
  if (!podeEditar && !editarDesligado && !podeArquivar && !podeApagar) return null

  return (
    <span className="flex items-center gap-1">
      {(podeEditar || editarDesligado) && (
        <button
          type="button"
          onClick={() => setDialogo('editar')}
          disabled={editarDesligado}
          aria-label={`Editar ${contato.nome}`}
          title={editarDesligado ? SEM_PERMISSAO_PARA_EDITAR : 'Editar Contato'}
          className="grid size-6 cursor-pointer place-items-center text-al-muted hover:text-al-ink disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:text-al-muted"
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
      )}
      {podeArquivar && (
        <button
          type="button"
          onClick={() => setDialogo('arquivar')}
          aria-label={`Arquivar ${contato.nome}`}
          title="Arquivar Contato"
          className="grid size-6 cursor-pointer place-items-center text-al-muted hover:text-al-ink"
        >
          <Archive className="size-3.5" aria-hidden />
        </button>
      )}
      {podeApagar && (
        <button
          type="button"
          onClick={() => setDialogo('apagar')}
          aria-label={`Apagar ${contato.nome} definitivamente`}
          title="Apagar definitivamente"
          className="grid size-6 cursor-pointer place-items-center text-al-muted hover:text-al-erro"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      )}
      {podeEditar && (
        <DialogoDeEdicaoDoContato contato={contato} aberto={dialogo === 'editar'} aoMudar={(aberto) => !aberto && setDialogo(null)} />
      )}
      <DialogoDeConfirmacao
        aberto={dialogo === 'arquivar'}
        aoMudar={(aberto) => !aberto && setDialogo(null)}
        titulo={`Arquivar ${contato.nome}?`}
        descricao="O Contato sai das listas e os Vínculos com as Contas são encerrados, o que também impede os passos dele nas Sequências. O histórico fica, e ele volta com os Vínculos se você o restaurar."
        rotuloDaAcao="Arquivar"
        agir={() => fonte.arquivarContato!(contato.id)}
      />
      <DialogoDeConfirmacao
        aberto={dialogo === 'apagar'}
        aoMudar={(aberto) => !aberto && setDialogo(null)}
        titulo={`Apagar ${contato.nome} definitivamente?`}
        descricao="Some tudo o que é dele: nome, cargo, e-mail, telefone, LinkedIn, foto, as respostas recebidas e o destino e o conteúdo dos envios nas Sequências. Não dá para desfazer. Ficam só os eventos comerciais, sem o nome dele."
        rotuloDaAcao="Apagar definitivamente"
        confirmarCom={contato.nome}
        perigo
        agir={(confirmacao) => fonte.apagarContato!(contato.id, confirmacao)}
      />
    </span>
  )
}

/** Um registro arquivado, como a lista de arquivados o mostra. */
export interface ItemArquivado {
  id: string
  titulo: string
  detalhe?: string
  arquivadoEm?: string
  /** Para onde o nome leva (o detalhe da Conta). */
  para?: string
  restaurar?: () => Promise<void>
  /** Sem ele, não há apagar. Recebe o nome digitado. */
  apagar?: (confirmacao: string) => Promise<void>
}

/** As Contas-alvo arquivadas: o link leva ao detalhe, com o histórico. */
export function ContasArquivadas() {
  const fonte = useFonteDeContas()
  const { dados, carregando, erro, recarregar } = useDadosDeContas((f) => f.contasArquivadas!(), [])
  if (carregando) return <Carregando />
  if (erro) return <FalhaAoCarregar mensagem="Não foi possível carregar as Contas arquivadas." tentarDeNovo={recarregar} />
  const itens: ItemArquivado[] = (dados ?? []).map((conta) => ({
    id: conta.id,
    titulo: conta.nome,
    ...(conta.dominio ? { detalhe: conta.dominio } : {}),
    ...(conta.arquivadaEm ? { arquivadoEm: conta.arquivadaEm } : {}),
    para: `/contas/${conta.id}`,
    ...(fonte.restaurarConta && conta.podeArquivar
      ? { restaurar: async () => void (await fonte.restaurarConta!(conta.id)) }
      : {}),
    ...(fonte.apagarConta && conta.podeApagar
      ? { apagar: async (confirmacao: string) => void (await fonte.apagarConta!(conta.id, confirmacao)) }
      : {}),
  }))
  return (
    <ListaDeArquivados itens={itens} rotulo="Contas arquivadas" vazio="Nenhuma Conta-alvo arquivada." hoje={fonte.hoje()} />
  )
}

/** Os Contatos arquivados. */
export function ContatosArquivados() {
  const fonte = useFonteDeContas()
  const { dados, carregando, erro, recarregar } = useDadosDeContas((f) => f.contatosArquivados!(), [])
  if (carregando) return <Carregando />
  if (erro) return <FalhaAoCarregar mensagem="Não foi possível carregar os Contatos arquivados." tentarDeNovo={recarregar} />
  const itens: ItemArquivado[] = (dados ?? []).map((contato) => ({
    id: contato.id,
    titulo: contato.nome,
    ...(contato.cargo || contato.contaNome ? { detalhe: [contato.cargo, contato.contaNome].filter(Boolean).join(' · ') } : {}),
    arquivadoEm: contato.arquivadoEm,
    ...(fonte.restaurarContato ? { restaurar: () => fonte.restaurarContato!(contato.id) } : {}),
    ...(fonte.apagarContato && contato.podeApagar
      ? { apagar: (confirmacao: string) => fonte.apagarContato!(contato.id, confirmacao) }
      : {}),
  }))
  return (
    <ListaDeArquivados itens={itens} rotulo="Contatos arquivados" vazio="Nenhum Contato arquivado." hoje={fonte.hoje()} />
  )
}

/** A lista de Contas ou Contatos arquivados, com restaurar e apagar definitivamente por linha. */
export function ListaDeArquivados({ itens, rotulo, vazio, hoje }: { itens: ItemArquivado[]; rotulo: string; vazio: string; hoje: Date }) {
  const [apagando, setApagando] = useState<ItemArquivado | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function restaurar(item: ItemArquivado) {
    setErro(null)
    try {
      await item.restaurar!()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível restaurar.')
    }
  }

  if (itens.length === 0) {
    return <p className="py-12 text-sm text-al-muted">{vazio}</p>
  }

  return (
    <>
      {erro && (
        <p role="alert" className="text-sm text-al-atencao">
          {erro}
        </p>
      )}
      <ul aria-label={rotulo} className="flex flex-col divide-y divide-al-line border-y border-al-line">
        {itens.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 flex-col">
              {item.para ? (
                <Link to={item.para} className="truncate text-al-ink hover:text-al-accent hover:underline">
                  {item.titulo}
                </Link>
              ) : (
                <span className="truncate text-al-ink">{item.titulo}</span>
              )}
              <span className="text-xs text-al-muted">
                {[item.detalhe, item.arquivadoEm && `Arquivado em ${formatarDataExplicita(item.arquivadoEm, hoje)}`].filter(Boolean).join(' · ')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {item.restaurar && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => restaurar(item)}
                  aria-label={`Restaurar ${item.titulo}`}
                  className={BOTAO_SECUNDARIO}
                >
                  <ArchiveRestore className="mr-1.5 size-4" aria-hidden /> Restaurar
                </Button>
              )}
              {item.apagar && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setApagando(item)}
                  aria-label={`Apagar ${item.titulo} definitivamente`}
                  className={cn(BOTAO_SECUNDARIO, 'text-al-erro')}
                >
                  <Trash2 className="mr-1.5 size-4" aria-hidden /> Apagar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <DialogoDeConfirmacao
        aberto={apagando !== null}
        aoMudar={(aberto) => !aberto && setApagando(null)}
        titulo={`Apagar ${apagando?.titulo ?? ''} definitivamente?`}
        descricao="Some tudo o que é do registro, inclusive o que ele tem nas Sequências. Não dá para desfazer. Ficam só os eventos comerciais, sem nome nem contato."
        rotuloDaAcao="Apagar definitivamente"
        confirmarCom={apagando?.titulo}
        perigo
        agir={(confirmacao) => apagando!.apagar!(confirmacao)}
      />
    </>
  )
}
