import { useCarregamento, useFonteDeContasRemetentes } from '@/fonte/contexto'
import type { CanalDaContaRemetente } from '@/fonte/contas-remetentes-tipos'
import { LinhaDaCotaDeEntrada } from '@/paginas/cota-de-entrada'

/**
 * No topo da Sequência do responsável, no Workspace operacional: a cota de cada Canal que a Sequência usa.
 * A Demonstração não monta este bloco. Se o backend ainda não tem a fila, a fonte devolve vazio e nada aparece.
 */
export function CotasDeEntradaDaSequencia({ canais }: { canais: CanalDaContaRemetente[] }) {
  const fonte = useFonteDeContasRemetentes()
  const { dados } = useCarregamento(fonte, (f) => f.cotasDeEntrada(), [canais.join('|')])
  const visiveis = (dados ?? []).filter((cota) => canais.includes(cota.canal))
  if (visiveis.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {visiveis.map((cota) => (
        <LinhaDaCotaDeEntrada key={cota.id} cota={cota} comCanal />
      ))}
    </div>
  )
}
