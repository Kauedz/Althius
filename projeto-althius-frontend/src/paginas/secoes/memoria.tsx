import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Button } from '@/components/ui/button'
import { useDados, useFonte } from '@/fonte/contexto'
import { useContextoDaEmpresaVigente } from '@/fonte/contexto-da-empresa-vigente'
import { CAMPOS_DO_CONTEXTO, type VersaoDoContexto } from '@/fonte/contexto-da-empresa-tipos'
import { ENDERECO_DO_CONTEXTO } from '@/fonte/contexto-no-onboarding'
import { formatarDiaIsoPorExtenso } from '@/fonte/formatar-data'
import type { Agente, Fato } from '@/fonte/tipos'
import { useEscritaDeAgente, usePodeAdministrarAgentes } from '@/paginas/administracao-de-agentes'

export function SecaoMemoria({ agente }: { agente: Agente }) {
  const fatos = useDados((fonte) => fonte.memoria(agente.id), [agente.id])
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const contexto = useContextoDaEmpresaVigente()

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
          <Link to={ENDERECO_DO_CONTEXTO} className="text-al-ink underline underline-offset-2">
            Contexto da empresa
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
      {contexto !== undefined && <ContextoDaEmpresaDoAgente vigente={contexto} />}
    </section>
  )
}

/**
 * O contexto compartilhado que o Agente usa: os três textos vigentes do Contexto da empresa (contexto-da-empresa 07),
 * lidos a cada abertura. Não é um Fato dele nem uma cópia; só um Administrador o edita, em Configurações.
 */
function ContextoDaEmpresaDoAgente({ vigente }: { vigente: VersaoDoContexto | null }) {
  return (
    <section aria-label="Contexto da empresa" className="flex flex-col gap-4 border-t border-al-line pt-6">
      <div className="flex flex-col gap-1">
        <h3 className="titulo-secao text-lg">Contexto da empresa</h3>
        <p className="text-sm text-al-muted">
          {vigente
            ? `Versão ${vigente.versao}, de ${formatarDiaIsoPorExtenso(vigente.em.slice(0, 10))}. Vale para todos os Agentes e não se edita aqui: um Administrador edita no `
            : 'O Workspace ainda não tem Contexto da empresa. Um Administrador gera ou escreve no '}
          <Link to={ENDERECO_DO_CONTEXTO} className="text-al-ink underline-offset-4 hover:underline">
            Contexto da empresa
          </Link>
          .
        </p>
      </div>
      {vigente &&
        CAMPOS_DO_CONTEXTO.filter(({ id }) => vigente[id].trim()).map(({ id, nome }) => (
          <section key={id} aria-label={nome} className="flex flex-col gap-2">
            <h4 className="rotulo">{nome}</h4>
            <p className="text-sm whitespace-pre-line">{vigente[id]}</p>
          </section>
        ))}
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
