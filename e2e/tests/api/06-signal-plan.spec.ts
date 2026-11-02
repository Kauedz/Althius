// signal-plan publicado: com o ICP do QA na seção ICP do Playbook (setor, porte e geografia por extenso), o Plano
// proposto pela IA reflete o ICP (ADR-0034).
// A função só propõe; quem grava é save_signal_plan, que este teste nunca chama. Nada é ativado nem cobrado.
// Conta 1 no limite de 20 Planos por dia do Workspace QA.
import { expect, test } from '@playwright/test'
import { ambiente } from '../../support/ambiente.js'
import { normalizar, TERMOS_DO_ICP } from '../../support/fixture-icp.js'
import { tokenDoQa } from '../../support/sessao.js'

test('signal-plan: o Plano da IA usa setor, porte ou geografia do ICP', async ({ request }, testInfo) => {
  test.setTimeout(60_000)
  const e = ambiente()
  const resposta = await request.post(`${e.supabaseUrl}/functions/v1/signal-plan`, {
    headers: { apikey: e.publishableKey, Authorization: `Bearer ${tokenDoQa()}`, Origin: e.baseUrl },
    data: {
      workspaceId: e.workspaceId,
      briefing: 'Quero saber quando empresas abrirem vagas de liderança comercial.',
      escopo: { tipo: 'contas', contaIds: ['00000000-0000-4000-8000-000000000001'] },
    },
    timeout: 50_000,
  })
  const corpo = (await resposta.json()) as { plano?: { sinais: { tipo: string; criterios: Record<string, unknown> }[]; explicacao: string }; avisos?: string[]; error?: string }
  await testInfo.attach('plano.json', { body: JSON.stringify(corpo, null, 2), contentType: 'application/json' })
  expect(resposta.status(), corpo.error ?? '').toBe(200)
  expect(corpo.avisos, 'com aviso, o Plano saiu do planejador por regra e não da IA').toEqual([])
  expect(corpo.plano!.sinais.length).toBeGreaterThanOrEqual(1)

  const texto = ` ${normalizar(`${corpo.plano!.explicacao} ${JSON.stringify(corpo.plano!.sinais)}`)} `
  const achados = Object.entries(TERMOS_DO_ICP)
    .filter(([, termos]) => termos.some((t) => texto.includes(t)))
    .map(([campo]) => campo)
  testInfo.annotations.push({ type: 'info', description: `campos do ICP refletidos no Plano: ${achados.join(', ') || 'nenhum'}` })
  expect(achados, 'o Plano deveria citar setor, porte ou geografia do ICP').not.toEqual([])
  const [sinal] = corpo.plano!.sinais
  testInfo.annotations.push({ type: 'info', description: `tipo ${sinal.tipo}; criterios ${JSON.stringify(sinal.criterios)}` })
})
