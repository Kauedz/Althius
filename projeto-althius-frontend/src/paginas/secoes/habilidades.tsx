import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Switch } from '@/components/ui/switch'
import { useDados, useFonte } from '@/fonte/contexto'
import { DOCUMENTOS_DA_MEMORIA, frasesDo, USO_NA_HABILIDADE } from '@/fonte/regras-memoria'
import type { Agente } from '@/fonte/tipos'
import { useEscritaDeAgente, usePodeAdministrarAgentes } from '@/paginas/administracao-de-agentes'
import { useSomenteLeituraDoAgente } from '@/paginas/secoes/somente-leitura'

export function SecaoHabilidades({ agente }: { agente: Agente }) {
  const fonte = useFonte()
  const habilidades = useDados((f) => f.habilidades(agente.id), [agente.id])
  const memoria = useDados((f) => f.memoriaDoWorkspace(), [])
  const podeAdministrar = usePodeAdministrarAgentes()
  const { erro, escrever } = useEscritaDeAgente()
  const somenteLeitura = useSomenteLeituraDoAgente()

  return (
    <section aria-labelledby="titulo-habilidades" className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="titulo-habilidades" className="titulo-secao text-3xl">
          Habilidades
        </h2>
        <p className="text-al-muted">Procedimentos que {agente.nome} criou ou refinou com o uso e passa a reaplicar.</p>
      </div>
      <Mensagem tipo="erro">{erro}</Mensagem>
      {!habilidades ? (
        <Carregando />
      ) : habilidades.length === 0 ? (
        <p className="text-al-muted">{agente.nome} ainda não criou nenhuma Habilidade.</p>
      ) : (
        <ul className="flex flex-col border-t border-al-line">
          {habilidades.map((habilidade) => (
            <li key={habilidade.id} aria-label={habilidade.nome} className="flex items-start gap-6 border-b border-al-line py-4">
              <div className="flex flex-1 flex-col gap-1">
                <span className="font-normal">{habilidade.nome}</span>
                <p className="text-al-muted">{habilidade.descricao}</p>
                {habilidade.usaDocumento && memoria && (
                  <p className="text-sm">
                    <span className="rotulo mr-2">
                      {DOCUMENTOS_DA_MEMORIA[habilidade.usaDocumento].nome}{' '}
                      {frasesDo(habilidade.usaDocumento).concordar('vigente', 'vigentes')}
                    </span>
                    {USO_NA_HABILIDADE[habilidade.usaDocumento](memoria[habilidade.usaDocumento].secoes)}
                  </p>
                )}
                <span className="text-sm text-al-muted">
                  {habilidade.usos} usos · melhorada em {habilidade.ultimaMelhoria}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rotulo">{habilidade.ativa ? 'Ativa' : 'Inativa'}</span>
                <Switch
                  aria-label={habilidade.nome}
                  checked={habilidade.ativa}
                  disabled={somenteLeitura || !podeAdministrar}
                  onCheckedChange={(ativa) => escrever(() => fonte.definirHabilidadeAtiva(habilidade.id, ativa))}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
