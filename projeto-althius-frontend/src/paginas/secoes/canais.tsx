import { Link } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Switch } from '@/components/ui/switch'
import { useDados, useFonte } from '@/fonte/contexto'
import type { Agente, CanalId } from '@/fonte/tipos'
import { useEscritaDeAgente, usePodeAdministrarAgentes } from '@/paginas/administracao-de-agentes'

export function SecaoCanais({ agente }: { agente: Agente }) {
  const fonte = useFonte()
  const canais = useDados((f) => f.canais(), [])
  const personalizacao = useDados((f) => f.personalizacao(agente.id), [agente.id])
  const podeAdministrar = usePodeAdministrarAgentes()
  const { erro, escrever } = useEscritaDeAgente()

  async function alternar(canalId: CanalId, atende: boolean) {
    if (!personalizacao) return
    const canaisDoAgente = atende
      ? [...personalizacao.canais, canalId]
      : personalizacao.canais.filter((c) => c !== canalId)
    await escrever(() => fonte.salvarPersonalizacao(agente.id, { ...personalizacao, canais: canaisDoAgente }))
  }

  return (
    <section aria-labelledby="titulo-canais" className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="titulo-canais" className="titulo-secao text-3xl">
          Canais
        </h2>
        <p className="text-al-muted">
          Onde {agente.nome} pode ser chamado fora da Althius. Os canais são conectados uma vez para o Workspace, em{' '}
          <Link to="/conexoes" className="text-al-ink underline underline-offset-4">
            Conexões
          </Link>
          .
        </p>
      </div>
      <Mensagem tipo="erro">{erro}</Mensagem>
      {!canais || !personalizacao ? (
        <Carregando />
      ) : (
        <ul className="flex flex-col border-t border-al-line">
          {canais.map((canal) => (
            <li key={canal.id} className="flex items-center gap-6 border-b border-al-line py-4">
              <div className="flex flex-1 flex-col gap-1">
                <span className="font-normal">{canal.nome}</span>
                <span className="text-sm text-al-muted">
                  {canal.conectado ? canal.descricao : 'Canal não conectado no Workspace.'}
                </span>
              </div>
              <Switch
                aria-label={canal.nome}
                checked={canal.conectado && personalizacao.canais.includes(canal.id)}
                disabled={!canal.conectado || !podeAdministrar}
                onCheckedChange={(atende) => alternar(canal.id, atende)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
