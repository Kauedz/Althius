import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Button } from '@/components/ui/button'
import { useDados, useFonte } from '@/fonte/contexto'
import { formatarDiaIsoPorExtenso } from '@/fonte/formatar-data'
import { DOCUMENTOS_DA_MEMORIA, frasesDo } from '@/fonte/regras-memoria'
import type { Agente, DocumentoDaMemoria, DocumentoVigente, Fato, MemoriaDoWorkspace } from '@/fonte/tipos'
import { useEscritaDeAgente, usePodeAdministrarAgentes } from '@/paginas/administracao-de-agentes'

export function SecaoMemoria({ agente }: { agente: Agente }) {
  const fatos = useDados((fonte) => fonte.memoria(agente.id), [agente.id])
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const memoriaDoWorkspace = useDados((fonte) => fonte.memoriaDoWorkspace(), [])

  return (
    <section aria-labelledby="titulo-memoria" className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="titulo-memoria" className="titulo-secao text-3xl">
          Memória
        </h2>
        <p className="text-al-muted">O que {agente.nome} aprendeu sobre a {workspace?.cliente} e sobre você. Corrija o que estiver errado.</p>
        <p className="text-sm text-al-muted">
          Esta é a Memória do Agente: as notas e preferências que só {agente.nome} guarda. O que vale para todos os
          Agentes, como o ICP e as Personas, fica no{' '}
          <Link to="/configuracoes/memoria/icp" className="text-al-ink underline underline-offset-2">
            Contexto do Workspace
          </Link>
          .
        </p>
      </div>
      {!fatos ? (
        <Carregando />
      ) : fatos.length === 0 ? (
        <p className="text-al-muted">{agente.nome} ainda não guardou nenhum fato.</p>
      ) : (
        <ul className="flex flex-col border-t border-al-line">
          {fatos.map((fato) => (
            <ItemDeFato key={fato.id} fato={fato} />
          ))}
        </ul>
      )}
      {memoriaDoWorkspace && <ContextoDoWorkspace memoria={memoriaDoWorkspace} />}
    </section>
  )
}

/**
 * O contexto compartilhado que o Agente usa, lido da Memória do Workspace a cada abertura: não é um Fato
 * dele nem uma cópia. Muda só com a aprovação de uma revisão, feita em Configurações.
 */
function ContextoDoWorkspace({ memoria }: { memoria: MemoriaDoWorkspace }) {
  return (
    <section aria-label="Contexto do Workspace" className="flex flex-col gap-4 border-t border-al-line pt-6">
      <div className="flex flex-col gap-1">
        <h3 className="titulo-secao text-lg">Contexto do Workspace</h3>
        <p className="text-sm text-al-muted">
          O ICP e as Personas vigentes da{' '}
          <Link to="/configuracoes/memoria" className="text-al-ink underline-offset-4 hover:underline">
            Memória do Workspace
          </Link>
          . Valem para todos os Agentes e não se editam aqui.
        </p>
      </div>
      {(Object.keys(DOCUMENTOS_DA_MEMORIA) as DocumentoDaMemoria[]).map((id) => (
        <DocumentoDoContexto key={id} documento={id} vigente={memoria[id]} />
      ))}
    </section>
  )
}

/** Um documento da Memória do Workspace, com o link para a aba dele em Configurações. */
function DocumentoDoContexto({ documento, vigente }: { documento: DocumentoDaMemoria; vigente: DocumentoVigente }) {
  const { nome } = DOCUMENTOS_DA_MEMORIA[documento]
  const { concordar } = frasesDo(documento)
  return (
    <section aria-label={nome} className="flex flex-col gap-2">
      <h4 className="flex items-baseline gap-3">
        <Link to={`/configuracoes/memoria/${documento}`} className="rotulo text-al-ink underline-offset-4 hover:underline">
          {nome}
        </Link>
        <span className="text-xs text-al-muted">
          {concordar('Aprovado', 'Aprovadas')} em {formatarDiaIsoPorExtenso(vigente.aprovadoEm)}
        </span>
      </h4>
      <dl className="grid grid-cols-[12rem_1fr] gap-x-8 gap-y-2 text-sm">
        {vigente.secoes.map((secao) => (
          <div key={secao.titulo} className="contents">
            <dt className="rotulo pt-0.5">{secao.titulo}</dt>
            <dd>{secao.texto}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function ItemDeFato({ fato }: { fato: Fato }) {
  const fonte = useFonte()
  const podeAdministrar = usePodeAdministrarAgentes()
  const { erro, escrever } = useEscritaDeAgente()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(fato.texto)

  async function salvar() {
    if (!texto.trim()) return
    if (await escrever(() => fonte.editarFato(fato.id, texto.trim()))) setEditando(false)
  }

  return (
    <li aria-label={fato.texto} className="flex items-start gap-6 border-b border-al-line py-4">
      <div className="flex flex-1 flex-col gap-1">
        {editando ? (
          <textarea
            aria-label="Fato"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            rows={2}
            className="campo"
          />
        ) : (
          <p>{fato.texto}</p>
        )}
        <span className="text-sm text-al-muted">{fato.origem}</span>
        <Mensagem tipo="erro">{erro}</Mensagem>
      </div>
      <div className="flex gap-2">
        {!podeAdministrar ? null : editando ? (
          <>
            <Button onClick={salvar}>Salvar</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setTexto(fato.texto)
                setEditando(false)
              }}
            >
              Cancelar
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button variant="ghost" onClick={() => escrever(() => fonte.apagarFato(fato.id))}>
              Apagar
            </Button>
          </>
        )}
      </div>
    </li>
  )
}
