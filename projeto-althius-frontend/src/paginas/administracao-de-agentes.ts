import { useState } from 'react'
import { useDados } from '@/fonte/contexto'

/**
 * Só o Administrador cria e exclui Agentes e altera a Personalização, as Permissões, a Memória, as Habilidades e as
 * Rotinas; o Membro consulta. Quem decide é o banco, na operação: a tela só esconde o que o Membro não faz. Enquanto o
 * papel não chega, os controles aparecem, e uma recusa do servidor é mostrada como qualquer outra falha.
 */
export function usePodeAdministrarAgentes(): boolean {
  const workspace = useDados((fonte) => fonte.workspace(), [])
  return workspace?.papel !== 'membro'
}

/**
 * Roda uma escrita da fonte e guarda o motivo quando ela é recusada, para a tela mostrá-lo no lugar em que a pessoa agiu.
 * Devolve se a escrita valeu.
 */
export function useEscritaDeAgente() {
  const [erro, setErro] = useState('')

  async function escrever(escrita: () => Promise<unknown>): Promise<boolean> {
    setErro('')
    try {
      await escrita()
      return true
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível concluir agora.')
      return false
    }
  }

  return { erro, escrever }
}
