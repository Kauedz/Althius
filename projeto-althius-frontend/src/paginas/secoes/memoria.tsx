import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Button } from '@/components/ui/button'
import { useDados, useFonte } from '@/fonte/contexto'
import { formatarDiaIsoPorExtenso } from '@/fonte/formatar-data'
import type { Agente, Fato, IcpVigente } from '@/fonte/tipos'

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
      {memoriaDoWorkspace && <ContextoDoWorkspace icp={memoriaDoWorkspace.icp} />}
    </section>
  )
}

/**
 * O contexto compartilhado que o Agente usa, lido da Memória do Workspace a cada abertura: não é um Fato
 * dele nem uma cópia. Muda só com a aprovação de uma revisão, feita em Configurações.
 */
function ContextoDoWorkspace({ icp }: { icp: IcpVigente }) {
  return (
    <section aria-label="Contexto do Workspace" className="flex flex-col gap-4 border-t border-al-line pt-6">
      <div className="flex flex-col gap-1">
        <h3 className="titulo-secao text-lg">Contexto do Workspace</h3>
        <p className="text-sm text-al-muted">
          O ICP vigente da{' '}
          <Link to="/configuracoes/memoria" className="text-al-ink underline-offset-4 hover:underline">
            Memória do Workspace
          </Link>
          , aprovado em {formatarDiaIsoPorExtenso(icp.aprovadoEm)}. Vale para todos os Agentes e não se edita aqui.
        </p>
      </div>
      <dl className="grid grid-cols-[12rem_1fr] gap-x-8 gap-y-2 text-sm">
        {icp.secoes.map((secao) => (
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
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(fato.texto)

  async function salvar() {
    if (!texto.trim()) return
    await fonte.editarFato(fato.id, texto.trim())
    setEditando(false)
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
      </div>
      <div className="flex gap-2">
        {editando ? (
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
            <Button variant="ghost" onClick={() => fonte.apagarFato(fato.id)}>
              Apagar
            </Button>
          </>
        )}
      </div>
    </li>
  )
}
