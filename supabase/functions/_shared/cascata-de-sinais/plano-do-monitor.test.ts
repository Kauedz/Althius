// O plano de um Monitoramento de tipo genérico, como o banco o devolve: as cascatas que atendem o tipo, o estado de cada
// uma e se estão no prazo da cadência. O motor só entrega ao runner o que está disponível (e o que está devido).
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { type ClienteRpc } from './db.ts'
import { criarMotorDeCascata } from './index.ts'

function admin(linhas: unknown, erro: { code?: string; message: string } | null = null) {
  const chamadas: { fn: string; args: unknown }[] = []
  const cliente = {
    rpc: (fn: string, args: unknown) => {
      chamadas.push({ fn, args })
      return Promise.resolve({ data: erro ? null : linhas, error: erro })
    },
  } as unknown as ClienteRpc
  return { cliente, chamadas }
}

Deno.test('o plano separa as cascatas disponíveis das devidas, na ordem do banco', async () => {
  const { cliente, chamadas } = admin([
    { cascade_signal_type: 'nova_planta_filial', state: 'available', due: true },
    { cascade_signal_type: 'novo_cd_ou_filial', state: 'available', due: false },
    { cascade_signal_type: 'troca_de_sede', state: 'testing', due: true },
    { cascade_signal_type: 'outra', state: 'sem_fonte', due: true },
  ])
  const motor = criarMotorDeCascata({ admin: cliente, tokens: ['token-falso'] })
  const plano = await motor.planoDoMonitor('mon-1')
  assertEquals(chamadas, [{ fn: 'signal_type_cascade_plan', args: { p_monitor_id: 'mon-1' } }])
  assertEquals(plano, { disponiveis: ['nova_planta_filial', 'novo_cd_ou_filial'], devidas: ['nova_planta_filial'] })
})

Deno.test('um tipo sem cascata ligada devolve um plano vazio', async () => {
  const { cliente } = admin([])
  const motor = criarMotorDeCascata({ admin: cliente, tokens: ['token-falso'] })
  assertEquals(await motor.planoDoMonitor('mon-2'), { disponiveis: [], devidas: [] })
})

Deno.test('a falha do banco rejeita, sem inventar um plano', async () => {
  const { cliente } = admin(null, { code: '42501', message: 'permission denied' })
  const motor = criarMotorDeCascata({ admin: cliente, tokens: ['token-falso'] })
  await assertRejects(() => motor.planoDoMonitor('mon-3'), Error, 'signal_type_cascade_plan')
})
