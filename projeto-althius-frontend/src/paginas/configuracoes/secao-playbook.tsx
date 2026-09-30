import { useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useDados, useFonteDoPlaybook } from '@/fonte/contexto'
import { formatarDataCompleta } from '@/fonte/formatar-data'
import {
  ehSecaoDoPlaybook,
  SECOES_DO_PLAYBOOK,
  type ConteudoDoPlaybook,
  type IdDaSecaoDoPlaybook,
  type SecaoDoPlaybook,
  type VersaoDoPlaybook,
} from '@/fonte/playbook-tipos'
import { COLUNAS_DO_PLAYBOOK, linhaVazia, type ColunaDoPlaybook } from '@/fonte/regras-playbook'
import { mensagemDeErro } from '@/lib/utils'
import { SecaoDeConfiguracoes } from './componentes'

const CONTEUDO_VAZIO: ConteudoDoPlaybook = { texto: '', linhas: [] }

/**
 * O Playbook do Workspace: as seções do playbook do setup, uma por página em /configuracoes/playbook/<seção>. Todo
 * participante lê; só o Administrador edita. Cada gravação cria uma versão, e voltar a uma versão antiga cria uma nova.
 */
export function SecaoPlaybook() {
  const { pagina } = useParams()
  if (!ehSecaoDoPlaybook(pagina)) return <Navigate to="/configuracoes/playbook/empresa" replace />

  return (
    <SecaoDeConfiguracoes
      id="playbook-do-workspace"
      titulo="Playbook do Workspace"
      alcance="workspace"
      descricao="O playbook de prospecção da empresa: o que os Agentes leem para responder com o contexto do seu negócio. Só um Administrador edita, e cada mudança fica guardada como uma versão."
    >
      <div className="grid gap-8 md:grid-cols-[14rem_1fr]">
        <nav aria-label="Seções do Playbook">
          <ul className="flex flex-col">
            {SECOES_DO_PLAYBOOK.map(({ id, nome }) => (
              <li key={id}>
                <Link
                  to={`/configuracoes/playbook/${id}`}
                  aria-current={id === pagina ? 'page' : undefined}
                  className={
                    id === pagina
                      ? 'block border-l-2 border-al-accent py-1.5 pl-3 text-sm text-al-ink'
                      : 'block border-l-2 border-transparent py-1.5 pl-3 text-sm text-al-muted hover:text-al-ink'
                  }
                >
                  {nome}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <SecaoAberta key={pagina} id={pagina} />
      </div>
    </SecaoDeConfiguracoes>
  )
}

function SecaoAberta({ id }: { id: IdDaSecaoDoPlaybook }) {
  const fonte = useFonteDoPlaybook()
  const secao = useDados(fonte, (f) => f.secao(id), [id])
  const workspace = useDados((f) => f.workspace(), [])
  if (!secao || !workspace) return <Carregando />
  return <ConteudoDaSecao key={secao.vigente?.versao ?? 0} secao={secao} podeEditar={workspace.papel === 'administrador'} />
}

function ConteudoDaSecao({ secao, podeEditar }: { secao: SecaoDoPlaybook; podeEditar: boolean }) {
  const fonte = useFonteDoPlaybook()
  const colunas = COLUNAS_DO_PLAYBOOK[secao.id]
  const vigente = secao.vigente
  const [texto, setTexto] = useState(vigente?.conteudo.texto ?? '')
  const [linhas, setLinhas] = useState(vigente?.conteudo.linhas ?? [])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [restaurando, setRestaurando] = useState<VersaoDoPlaybook | null>(null)

  const original = vigente?.conteudo ?? CONTEUDO_VAZIO
  const alterado = texto !== original.texto || JSON.stringify(linhas) !== JSON.stringify(original.linhas)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    setSalvo(false)
    try {
      await fonte.salvar(secao.id, { texto, linhas })
      setSalvo(true)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Versão vigente" className="flex flex-col gap-1">
        <h3 className="titulo-secao text-2xl">{secao.nome}</h3>
        <span className="text-sm text-al-muted">
          {vigente
            ? `Versão ${vigente.versao} · ${vigente.autor ?? 'Alguém que já não está no Workspace'} · ${formatarDataCompleta(vigente.em)}`
            : 'Ainda não foi escrita.'}
        </span>
      </section>

      {podeEditar ? (
        <form aria-label={`Editar ${secao.nome}`} noValidate onSubmit={salvar} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="playbook-texto" className="rotulo">
              Texto
            </label>
            <textarea
              id="playbook-texto"
              rows={colunas ? 4 : 12}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value)
                setSalvo(false)
              }}
              className="campo"
            />
          </div>
          {colunas && (
            <TabelaEditavel
              colunas={colunas}
              linhas={linhas}
              aoMudar={(novas) => {
                setLinhas(novas)
                setSalvo(false)
              }}
            />
          )}
          <Mensagem tipo="erro">{erro}</Mensagem>
          <Mensagem tipo="sucesso">{salvo ? 'Playbook salvo.' : ''}</Mensagem>
          <div className="flex gap-2">
            <button type="submit" disabled={salvando || !alterado} className={BOTAO_PRIMARIO}>
              Salvar
            </button>
          </div>
        </form>
      ) : (
        <LeituraDaSecao colunas={colunas} conteudo={vigente?.conteudo ?? null} />
      )}

      <section aria-label="Histórico de versões" className="flex flex-col gap-3 border-t border-al-line pt-6">
        <h4 className="rotulo">Histórico</h4>
        {secao.historico.length === 0 ? (
          <p className="text-sm text-al-muted">Nenhuma versão ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-al-line">
            {secao.historico.map((versao) => (
              <li key={versao.versao} className="flex items-center justify-between gap-4 py-2 text-sm">
                <span>
                  Versão {versao.versao} · {versao.autor ?? 'Alguém que já não está no Workspace'} ·{' '}
                  <span className="text-al-muted">{formatarDataCompleta(versao.em)}</span>
                  {versao.versao === vigente?.versao && <span className="selo ml-2">Vigente</span>}
                </span>
                {podeEditar && versao.versao !== vigente?.versao && (
                  <button type="button" onClick={() => setRestaurando(versao)} className={BOTAO_DISCRETO}>
                    Restaurar a versão {versao.versao}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {restaurando && (
        <ConfirmarRestauracao
          secao={secao}
          versao={restaurando}
          aoFechar={() => setRestaurando(null)}
        />
      )}
    </div>
  )
}

function LeituraDaSecao({ colunas, conteudo }: { colunas?: ColunaDoPlaybook[]; conteudo: ConteudoDoPlaybook | null }) {
  if (!conteudo || (!conteudo.texto && conteudo.linhas.length === 0)) {
    return <p className="text-sm text-al-muted">Um Administrador ainda não escreveu esta seção.</p>
  }
  return (
    <div className="flex flex-col gap-5">
      {conteudo.texto && <p className="whitespace-pre-wrap text-al-ink">{conteudo.texto}</p>}
      {colunas && conteudo.linhas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {colunas.map(({ campo, rotulo }) => (
                  <th key={campo} scope="col" className="rotulo pr-4 pb-2">
                    {rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conteudo.linhas.map((linha, i) => (
                <tr key={i} className="border-t border-al-line align-top">
                  {colunas.map(({ campo }) => (
                    <td key={campo} className="py-2 pr-4">
                      {linha[campo]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TabelaEditavel({
  colunas,
  linhas,
  aoMudar,
}: {
  colunas: ColunaDoPlaybook[]
  linhas: Record<string, string>[]
  aoMudar: (linhas: Record<string, string>[]) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="rotulo">Tabela</span>
      {linhas.length === 0 && <p className="text-sm text-al-muted">Nenhuma linha ainda.</p>}
      <ul className="flex flex-col gap-4">
        {linhas.map((linha, i) => (
          <li key={i} aria-label={`Linha ${i + 1}`} className="flex flex-col gap-3 border border-al-line p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {colunas.map(({ campo, rotulo }) => (
                <div key={campo} className="flex flex-col gap-1.5">
                  <label htmlFor={`playbook-${i}-${campo}`} className="rotulo">
                    {rotulo} (linha {i + 1})
                  </label>
                  <input
                    id={`playbook-${i}-${campo}`}
                    value={linha[campo] ?? ''}
                    onChange={(e) => aoMudar(linhas.map((l, j) => (j === i ? { ...l, [campo]: e.target.value } : l)))}
                    className="campo"
                  />
                </div>
              ))}
            </div>
            <div>
              <button type="button" onClick={() => aoMudar(linhas.filter((_, j) => j !== i))} className={BOTAO_DISCRETO}>
                Remover a linha {i + 1}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div>
        <button type="button" onClick={() => aoMudar([...linhas, linhaVazia(colunas)])} className={BOTAO_SECUNDARIO}>
          Adicionar linha
        </button>
      </div>
    </div>
  )
}

function ConfirmarRestauracao({
  secao,
  versao,
  aoFechar,
}: {
  secao: SecaoDoPlaybook
  versao: VersaoDoPlaybook
  aoFechar: () => void
}) {
  const fonte = useFonteDoPlaybook()
  const [restaurando, setRestaurando] = useState(false)
  const [erro, setErro] = useState('')

  async function restaurar() {
    setRestaurando(true)
    setErro('')
    try {
      await fonte.restaurar(secao.id, versao.versao)
      aoFechar()
    } catch (falha) {
      setErro(mensagemDeErro(falha))
      setRestaurando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !restaurando && aoFechar()}>
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        <DialogTitle className="titulo-secao text-2xl">Restaurar a versão {versao.versao}?</DialogTitle>
        <DialogDescription className="text-al-muted">
          O conteúdo de {secao.nome} volta a ser o da versão {versao.versao}, gravado como uma versão nova. As versões
          atuais continuam no histórico.
        </DialogDescription>
        <Mensagem tipo="erro">{erro}</Mensagem>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={aoFechar} disabled={restaurando} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
          <button type="button" onClick={restaurar} disabled={restaurando} className={BOTAO_PRIMARIO}>
            Restaurar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
