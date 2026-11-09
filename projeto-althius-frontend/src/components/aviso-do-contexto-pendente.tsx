// O que falta no Contexto da empresa, numa operação que depende do ICP (contexto-da-empresa 03). Só avisa e leva a
// Configurações: a operação e as funções que não dependem do contexto continuam disponíveis.
import { Link } from 'react-router-dom'
import { useDados, useFonteDoContextoDaEmpresa } from '@/fonte/contexto'
import { ENDERECO_DO_CONTEXTO, pendenciaDoContexto, type PendenciaDoContexto } from '@/fonte/contexto-no-onboarding'
import { Mensagem } from './mensagem'

const O_QUE_FALTA: Record<PendenciaDoContexto, string> = {
  sem_site: 'Informe o site da empresa para gerar o contexto, ou escreva-o à mão.',
  sem_contexto: 'Gere o contexto pelo site ou escreva-o à mão.',
  gerando: 'Ele ainda está sendo gerado pela leitura do site.',
  falha: 'A leitura do site falhou: tente de novo ou escreva o contexto à mão.',
}

/** `operacao`: o que depende do contexto, como sujeito da frase (por exemplo, "A busca pelo ICP"). */
export function AvisoDoContextoPendente({ operacao }: { operacao: string }) {
  const contexto = useDados(useFonteDoContextoDaEmpresa(), (fonte) => fonte.contexto(), [])
  const pendencia = contexto ? pendenciaDoContexto(contexto) : null
  if (!pendencia) return null
  return (
    <Mensagem tipo="info">
      {operacao} precisa do Contexto da empresa. {O_QUE_FALTA[pendencia]}{' '}
      <Link className="font-medium text-al-ink underline underline-offset-4" to={ENDERECO_DO_CONTEXTO}>
        Abrir Contexto da empresa
      </Link>
    </Mensagem>
  )
}
