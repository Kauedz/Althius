import { Send } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useDadosDeConexoes, useDadosDeContas, useFonteDeContas } from '@/fonte/contexto'
import type { ContaAlvo, ResultadoDoEnvioAoCrm } from '@/fonte/contas-tipos'
import type { IntegracaoId } from '@/fonte/tipos'

const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * "Enviar ao CRM" (kanban-de-prospeccao 05, ADR-0020): o Vendedor responsável leva a Conta-alvo, os Contatos e uma nota com
 * os Sinais e a abordagem para um CRM em que ele tem o próprio Acesso conectado. Confirma vendo o que vai; depois do
 * envio, o CRM manda e a Conta mostra para onde foi. Só aparece onde a Fonte oferece o envio (a Demonstração não).
 */
export function EnviarAoCrm({ conta, contatos }: { conta: ContaAlvo; contatos: number }) {
  const fonte = useFonteDeContas()
  const oferece = !!fonte.enviarAoCrm && !!fonte.envioAoCrm && conta.sobMinhaResponsabilidade !== false && !conta.arquivadaEm
  if (!oferece) return null
  return <Envio conta={conta} contatos={contatos} />
}

function Envio({ conta, contatos }: { conta: ContaAlvo; contatos: number }) {
  const fonte = useFonteDeContas()
  const { dados: envio, recarregar } = useDadosDeContas((f) => f.envioAoCrm!(conta.id), [conta.id])
  const { dados: crms } = useDadosDeConexoes(async (f) => {
    const [integracoes, acessos] = await Promise.all([f.integracoes(), f.acessos?.() ?? Promise.resolve([])])
    const conectados = new Set(acessos.filter((a) => a.estado === 'conectado').map((a) => a.integracaoId))
    const nomes = new Map(integracoes.map((i) => [i.id, i.nome]))
    return {
      conectados: integracoes.filter((i) => i.categoria === 'CRM' && i.habilitada && conectados.has(i.id)),
      nomes,
    }
  }, [])
  const [confirmando, setConfirmando] = useState(false)
  const [escolhido, setEscolhido] = useState<IntegracaoId | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoDoEnvioAoCrm | null>(null)
  const tituloId = useId()

  if (envio === undefined || !crms) return null
  const nomeDe = (id: IntegracaoId) => crms.nomes.get(id) ?? id

  if (envio?.estado === 'enviado') {
    return (
      <div className="flex flex-col gap-1 border-b border-al-line py-4">
        <p className="text-sm text-al-ink">Enviada ao {nomeDe(envio.integracaoId)}</p>
        {resultado && (
          <p role="status" className="text-xs text-al-muted">
            {resultado.mensagem}
            {resultado.pendencias.map((p) => ` ${p}`).join('')}
          </p>
        )}
      </div>
    )
  }

  if (envio?.estado === 'enviando') {
    return (
      <p role="status" className="border-b border-al-line py-4 text-sm text-al-muted">
        Enviando ao {nomeDe(envio.integracaoId)}…
      </p>
    )
  }

  if (crms.conectados.length === 0) {
    return (
      <p className="border-b border-al-line py-4 text-sm text-al-muted">
        Conecte um CRM em <Link to="/conexoes" className="underline">Conexões</Link> para enviar esta Conta.
      </p>
    )
  }

  const destino = escolhido ?? crms.conectados[0].id

  async function enviar() {
    setEnviando(true)
    setErro(null)
    try {
      setResultado(await fonte.enviarAoCrm!(conta.id, destino))
      setConfirmando(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar ao CRM.')
      setConfirmando(false)
    } finally {
      setEnviando(false)
      recarregar()
    }
  }

  return (
    <div className="flex flex-col gap-3 border-b border-al-line py-4">
      {envio?.estado === 'falhou' && envio.erro && (
        <p className="text-xs text-al-muted">A última tentativa de envio falhou: {envio.erro}</p>
      )}
      {!confirmando ? (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmando(true)}
            className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
          >
            <Send strokeWidth={1.8} className="size-3.5" aria-hidden />
            Enviar ao CRM
          </Button>
        </div>
      ) : (
        <section aria-labelledby={tituloId} className="flex flex-col gap-3 rounded-md border border-al-line p-4">
          <h3 id={tituloId} className="text-sm font-medium text-al-ink">Confirmar o envio ao CRM</h3>
          {crms.conectados.length > 1 && (
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-1 text-xs text-al-muted">Para qual CRM</legend>
              {crms.conectados.map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="crm-do-envio" checked={destino === i.id} onChange={() => setEscolhido(i.id)} />
                  {i.nome}
                </label>
              ))}
            </fieldset>
          )}
          <p className="text-sm text-al-ink">
            Vai para o {nomeDe(destino)}: a empresa {conta.nome}, {contar(contatos, 'Contato', 'Contatos')} e uma nota com os
            Sinais e a abordagem.
          </p>
          <p className="text-xs text-al-muted">
            Depois do envio, o CRM passa a ser a fonte da verdade e a Althius não escreve de novo nesta Conta.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={enviando}
              onClick={enviar}
              className="h-8 text-xs tracking-rotulo uppercase"
            >
              Confirmar envio
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={enviando}
              onClick={() => setConfirmando(false)}
              className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
            >
              Cancelar
            </Button>
          </div>
        </section>
      )}
      {enviando && (
        <p role="status" className="text-xs text-al-muted">
          Enviando ao {nomeDe(destino)}…
        </p>
      )}
      {erro && (
        <p role="alert" className="text-sm text-al-atencao">
          {erro}
        </p>
      )}
    </div>
  )
}
