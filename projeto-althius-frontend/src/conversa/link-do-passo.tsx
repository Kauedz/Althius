// O link de um passo de ferramenta dos Agentes (Etapa 5b): leva a pessoa para onde ela continua o que o Agente começou —
// a Caixa de Descobertas, para confirmar a busca pelo ICP, ou a fila de Aprovações, para decidir o envio ao CRM.
import { Link } from 'react-router-dom'
import type { LinkDoPasso as Destino } from '@/fonte/tipos'

export function LinkDoPasso({ link }: { link?: Destino }) {
  if (!link) return null
  const [para, rotulo] = link.tipo === 'descobertas'
    ? ['/contas/descobertas', 'Abrir a Caixa de Descobertas']
    : ['/aprovacoes', 'Ver a Aprovação']
  return (
    <Link to={para} className="shrink-0 text-al-ink underline underline-offset-2 hover:text-al-muted">
      {rotulo}
    </Link>
  )
}
