import { useState } from 'react'
import { useFonteDeSinais } from '@/fonte/contexto'
import type { Monitoramento } from '@/fonte/sinais-tipos'
import { AtivarSinal, MENSAGEM_DA_FALHA_AO_ATIVAR } from './ativar-sinal'
import { useSinaisDoMockup } from './estado'

/**
 * O que ativa ou retoma um Sinal que já existe: com Agenda (e uma Fonte que estima), pela confirmação "Ativar Sinal"; sem Agenda,
 * direto, como sempre. Devolve `pedir`, que o botão chama, e o `dialogo`, que a tela põe em qualquer lugar. `aoFalhar` recebe a
 * frase quando a ativação direta falha (a da confirmação aparece dentro dela).
 */
export function useAtivacaoDoSinal(monitoramento: Monitoramento, aoFalhar?: (mensagem: string) => void) {
  const fonte = useFonteDeSinais()
  const { mudarEstado } = useSinaisDoMockup()
  const [aberto, setAberto] = useState(false)
  const confirma = !!monitoramento.agenda && !!fonte.estimarAgenda

  async function ativar(): Promise<string | null> {
    try {
      await mudarEstado(monitoramento.id, 'ativo')
      return null
    } catch {
      return MENSAGEM_DA_FALHA_AO_ATIVAR
    }
  }

  return {
    pedir: () => {
      if (confirma) setAberto(true)
      else void ativar().then((mensagem) => mensagem && aoFalhar?.(mensagem))
    },
    dialogo: confirma ? (
      <AtivarSinal
        monitoramento={monitoramento}
        aberto={aberto}
        aoCancelar={() => setAberto(false)}
        aoAtivar={async () => {
          const mensagem = await ativar()
          if (!mensagem) setAberto(false)
          return mensagem
        }}
      />
    ) : null,
  }
}
