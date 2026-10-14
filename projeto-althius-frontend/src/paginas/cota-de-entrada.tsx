import { Gauge } from 'lucide-react'
import type { CanalDaContaRemetente, CotaDeEntrada } from '@/fonte/contas-remetentes-tipos'
import { ehCanalSuportado, type CanalStep } from '@/fonte/sequencias-tipos'

const NOME_DO_CANAL: Record<CanalDaContaRemetente, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
}

/**
 * "X de Y hoje · N na fila para amanhã". Sem teto (Y nulo) não há o que contar, e a linha não aparece.
 * `comCanal` vale no topo da Sequência, onde o remetente não está ao lado do nome do Canal.
 */
export function textoDaCotaDeEntrada(cota: CotaDeEntrada, opcoes: { comCanal?: boolean } = {}): string | null {
  if (cota.tetoHoje == null) return null
  const base = `${cota.usadasHoje} de ${cota.tetoHoje} hoje · ${cota.naFilaParaAmanha} na fila para amanhã`
  const texto = cota.emAquecimento ? `${base} · em aquecimento` : base
  return opcoes.comCanal ? `${NOME_DO_CANAL[cota.canal]}: ${texto}` : texto
}

/** A linha da cota, com o ícone da biblioteca. Sem teto, não renderiza. */
export function LinhaDaCotaDeEntrada({ cota, comCanal = false }: { cota: CotaDeEntrada; comCanal?: boolean }) {
  const texto = textoDaCotaDeEntrada(cota, { comCanal })
  if (!texto) return null
  return (
    <p className="inline-flex items-center gap-1.5 text-sm text-al-ink">
      <Gauge className="size-3.5 shrink-0 text-al-muted" aria-hidden="true" />
      <span>{texto}</span>
    </p>
  )
}

/** Os Canais de abordagem que a Sequência realmente usa, na ordem dos passos, sem repetir. */
export function canaisDosPassos(passos: { canal: CanalStep }[]): CanalDaContaRemetente[] {
  const vistos = new Set<string>()
  const canais: CanalDaContaRemetente[] = []
  for (const passo of passos) {
    if (ehCanalSuportado(passo.canal) && !vistos.has(passo.canal)) {
      vistos.add(passo.canal)
      canais.push(passo.canal)
    }
  }
  return canais
}
