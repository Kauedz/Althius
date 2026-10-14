import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { BOTAO_DISCRETO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAmbiente, useDados, useFonteDoPlaybook } from '@/fonte/contexto'
import { formatarDataCompleta } from '@/fonte/formatar-data'
import {
  ehSecaoDoPlaybook,
  SECOES_DO_PLAYBOOK,
  type ConteudoDoPlaybook,
  type IdDaSecaoDoPlaybook,
  type SecaoDoPlaybook,
  type VersaoDoPlaybook,
} from '@/fonte/playbook-tipos'
import { ehRevisaoDoPlaybook } from '@/fonte/regras'
import { COLUNAS_DO_PLAYBOOK, linhaVazia, type ColunaDoPlaybook } from '@/fonte/regras-playbook'
import type { AprovacaoDeRevisaoDoPlaybook } from '@/fonte/tipos'
import { mensagemDeErro } from '@/lib/utils'
import { SecaoDeConfiguracoes } from './componentes'
import { ImportarPlaybook } from './importar-playbook'

const CONTEUDO_VAZIO: ConteudoDoPlaybook = { texto: '', linhas: [] }

/**
 * O Playbook do Workspace: as seções do playbook do setup, uma por página em /configuracoes/playbook/<seção>. Todo
 * participante lê; só o Administrador edita. Cada gravação cria uma versão, e voltar a uma versão antiga cria uma nova.
 */
export function SecaoPlaybook() {
  const { pagina } = useParams()
  const workspace = useDados((f) => f.workspace(), [])
  // As propostas dos Agentes (CRM-09) aparecem na seção que querem mudar; sem a fila, nenhuma.
  const aprovacoes = useDados((f) => f.aprovacoes(), [])
  const revisoes = (aprovacoes ?? []).filter(ehRevisaoDoPlaybook)
  const comProposta = new Set(revisoes.filter((r) => r.estado === 'pendente').map((r) => r.revisao.secao))
  const administrador = workspace?.papel === 'administrador'
  const importando = pagina === IMPORTAR
  if (!importando && !ehSecaoDoPlaybook(pagina)) return <Navigate to="/configuracoes/playbook/empresa" replace />

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
                <ItemDoMenu para={id} atual={id === pagina}>
                  {nome}
                  {comProposta.has(id) && (
                    <>
                      <span className="ml-2 inline-block size-1.5 rounded-full bg-al-atencao align-middle" aria-hidden />
                      <span className="sr-only">, proposta pendente</span>
                    </>
                  )}
                </ItemDoMenu>
              </li>
            ))}
            {administrador && (
              <li className="mt-3 border-t border-al-line pt-3">
                <ItemDoMenu para={IMPORTAR} atual={importando}>
                  Importar planilha
                </ItemDoMenu>
              </li>
            )}
          </ul>
        </nav>
        {importando ? (
          workspace ? (
            administrador ? (
              <ImportarPlaybook />
            ) : (
              <p className="text-sm text-al-muted">Só um Administrador importa a planilha do Playbook.</p>
            )
          ) : (
            <Carregando />
          )
        ) : (
          <SecaoAberta
            key={pagina}
            id={pagina as IdDaSecaoDoPlaybook}
            revisoes={revisoes.filter((r) => r.revisao.secao === pagina)}
          />
        )}
      </div>
    </SecaoDeConfiguracoes>
  )
}

/** A página do menu que importa a planilha do setup, ao lado das seções. */
const IMPORTAR = 'importar'

function ItemDoMenu({ para, atual, children }: { para: string; atual: boolean; children: ReactNode }) {
  return (
    <Link
      to={`/configuracoes/playbook/${para}`}
      aria-current={atual ? 'page' : undefined}
      className={
        atual
          ? 'block rounded-lg bg-al-hover px-3 py-1.5 text-sm text-al-ink'
          : 'block rounded-lg px-3 py-1.5 text-sm text-al-muted hover:bg-al-hover hover:text-al-ink'
      }
    >
      {children}
    </Link>
  )
}

function SecaoAberta({ id, revisoes }: { id: IdDaSecaoDoPlaybook; revisoes: AprovacaoDeRevisaoDoPlaybook[] }) {
  const fonte = useFonteDoPlaybook()
  const secao = useDados(fonte, (f) => f.secao(id), [id])
  const workspace = useDados((f) => f.workspace(), [])
  const { modo } = useAmbiente()
  if (!secao || !workspace) return <Carregando />
  const podeEditar = workspace.papel === 'administrador'
  // A regra única: o Administrador grava direto; no Workspace operacional, o Membro propõe uma revisão.
  const podePropor = !podeEditar && workspace.papel === 'membro' && modo === 'real'
  const pendente = revisoes.find((r) => r.estado === 'pendente')
  return (
    <div className="flex flex-col gap-6">
      {pendente && <PropostaPendente nome={secao.nome} podeEditar={podeEditar} />}
      <ConteudoDaSecao
        key={secao.vigente?.versao ?? 0}
        secao={secao}
        podeEditar={podeEditar}
        podePropor={podePropor}
      />
    </div>
  )
}

/** Um Agente propôs uma versão nova desta seção (CRM-09): ela só vale com a Aprovação de um Administrador. */
function PropostaPendente({ nome, podeEditar }: { nome: string; podeEditar: boolean }) {
  return (
    <div role="status" className="rounded-xl flex items-start gap-3 border border-al-atencao/50 bg-al-atencao/5 p-4 text-sm">
      <p>
        <span className="font-normal">Há uma proposta para {nome}, aguardando Aprovação.</span>{' '}
        <span className="text-al-muted">
          A versão abaixo continua valendo até um Administrador decidir.
          {podeEditar && ' Salvar uma versão agora deixa a proposta desatualizada.'}
        </span>{' '}
        <Link to="/aprovacoes" className="text-al-ink underline underline-offset-2">
          Ver a proposta
        </Link>
      </p>
    </div>
  )
}

function ConteudoDaSecao({
  secao,
  podeEditar,
  podePropor = false,
}: {
  secao: SecaoDoPlaybook
  podeEditar: boolean
  podePropor?: boolean
}) {
  const fonte = useFonteDoPlaybook()
  const colunas = COLUNAS_DO_PLAYBOOK[secao.id]
  const vigente = secao.vigente
  const [texto, setTexto] = useState(vigente?.conteudo.texto ?? '')
  const [linhas, setLinhas] = useState(vigente?.conteudo.linhas ?? [])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  const [restaurando, setRestaurando] = useState<VersaoDoPlaybook | null>(null)

  const original = vigente?.conteudo ?? CONTEUDO_VAZIO
  const alterado = texto !== original.texto || JSON.stringify(linhas) !== JSON.stringify(original.linhas)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    setSalvo(false)
    try {
      if (podeEditar) await fonte.salvar(secao.id, { texto, linhas })
      else await fonte.propor(secao.id, { texto, linhas }, justificativa)
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

      {podeEditar || podePropor ? (
        <form aria-label={podeEditar ? `Editar ${secao.nome}` : `Propor revisão de ${secao.nome}`} noValidate onSubmit={salvar} className="flex flex-col gap-5">
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
          {!podeEditar && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="playbook-justificativa" className="rotulo">
                Por quê
              </label>
              <textarea
                id="playbook-justificativa"
                rows={2}
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                className="campo"
              />
              <span className="text-sm text-al-muted">
                A proposta vai para Aprovações; a versão vigente continua valendo até um Administrador decidir.
              </span>
            </div>
          )}
          <Mensagem tipo="erro">{erro}</Mensagem>
          <Mensagem tipo="sucesso">
            {salvo ? (podeEditar ? 'Playbook salvo.' : 'Proposta enviada para Aprovações.') : ''}
          </Mensagem>
          <div className="flex gap-2">
            <button type="submit" disabled={salvando || !alterado} className={BOTAO_PRIMARIO}>
              {podeEditar ? 'Salvar' : 'Propor revisão'}
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
          <li key={i} aria-label={`Linha ${i + 1}`} className="rounded-xl flex flex-col gap-3 border border-al-line p-4">
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
