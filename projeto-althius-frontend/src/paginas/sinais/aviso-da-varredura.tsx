import { Link } from 'react-router-dom'
import { useDados, useFonteDeAutomacao } from '@/fonte/contexto'

const numero = new Intl.NumberFormat('pt-BR')

/**
 * O que a varredura faz com um Monitoramento novo: o modo (confirmar ou automático) e o teto de créditos do Workspace.
 * Sem a leitura, vale o caso seguro — confirmar — para não prometer uma rodada que o teto não deixa.
 */
export function AvisoDaVarredura() {
  const fonte = useFonteDeAutomacao()
  const escopos = useDados(fonte, (f) => f.escopos(), [])
  const varredura = escopos?.find((escopo) => escopo.escopo === 'acao:varredura')
  const link = (
    <Link to="/configuracoes/automacao" className="text-al-ink underline-offset-4 hover:underline">
      Automação e tetos
    </Link>
  )

  if (varredura?.bloqueio === null) {
    return (
      <p className="text-sm text-al-muted">
        A varredura automática está ligada, com limite de {numero.format(varredura.teto ?? 0)} créditos (
        {numero.format(varredura.gastoNoMes)} já usados neste mês). A rodada deste Sinal cabe nesse limite. O ajuste fica em{' '}
        {link}.
      </p>
    )
  }
  if (varredura?.bloqueio === 'sem_teto') {
    return (
      <p className="text-sm text-al-muted">
        A varredura automática não roda sem um limite mensal aprovado em {link}. O Monitoramento pode ser salvo; a rodada
        espera esse limite.
      </p>
    )
  }
  if (varredura?.bloqueio === 'teto_atingido') {
    return (
      <p className="text-sm text-al-muted">
        A varredura chegou no limite do mês. O Monitoramento pode ser salvo e volta a rodar quando o mês virar ou o limite
        subir, em {link}.
      </p>
    )
  }
  return (
    <p className="text-sm text-al-muted">
      A varredura está em confirmar: o Monitoramento pode ficar ativo, mas não roda sozinho até um Administrador ligar o
      automático e aprovar o limite em {link}.
    </p>
  )
}
