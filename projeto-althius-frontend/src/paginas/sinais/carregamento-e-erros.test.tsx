import { act, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { renderizarAppCom } from '@/test/renderizar'
import type { Monitoramento } from '@/fonte/sinais-tipos'
import { MONITORAMENTOS_INICIAIS } from './dados-mock'
import { criarSupabaseFalso } from '@/test/supabase-falso'
import { criarFonteDeContasSupabase } from '@/fonte/supabase-contas'

it('mantém o deep link válido enquanto carrega e abre o Monitoramento depois', async () => {
  let resolver!: (dados: Monitoramento[]) => void
  const pendente = new Promise<Monitoramento[]>((resolve) => { resolver = resolve })
  const monitor = MONITORAMENTOS_INICIAIS[0]
  const rota = `/sinais/tipos/${monitor.tipoId}/${monitor.id}`
  renderizarAppCom(rota, { sinais: (fonte) => ({ ...fonte, monitoramentos: () => pendente }) }, true)
  expect(window.location.pathname).toBe(rota)
  await act(async () => { resolver([monitor]) })
  expect(await screen.findByRole('heading', { name: monitor.nome })).toBeInTheDocument()
  expect(window.location.pathname).toBe(rota)
})

it('falha na lista de Monitoramentos mostra erro em vez de vazio e tenta de novo', async () => {
  const monitor = MONITORAMENTOS_INICIAIS[0]
  const monitoramentos = vi.fn().mockRejectedValueOnce(new Error('Falha de leitura')).mockResolvedValueOnce([monitor])
  const { usuario } = renderizarAppCom(`/sinais/tipos/${monitor.tipoId}`, { sinais: (fonte) => ({ ...fonte, monitoramentos }) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os monitoramentos.')
  expect(screen.queryByText('Nenhum Monitoramento deste tipo ainda.')).not.toBeInTheDocument()
  await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
  expect(await screen.findByRole('link', { name: monitor.nome })).toBeInTheDocument()
})

it('falha de leitura dos estágios mostra erro no Kanban em vez de Descoberta', async () => {
  let falha = true
  const { cliente } = criarSupabaseFalso({
    tabelas: { target_accounts: [], target_contacts: [], sales_responsibilities: [] },
    rpcs: { list_prospecting_stages: () => { if (falha) throw new Error('Falha nos estágios'); return [] } },
  })
  const real = criarFonteDeContasSupabase(cliente, () => 'ws-1', () => 'usuario-1')
  const { usuario } = renderizarAppCom('/contas?vista=kanban', { contas: (fonte) => ({ ...fonte, contas: real.contas }) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as contas.')
  expect(screen.queryByText('Descoberta')).not.toBeInTheDocument()
  falha = false
  await usuario.click(screen.getByRole('button', { name: /Tentar de novo/i }))
  expect(await screen.findByText(/Nenhuma Conta-alvo ainda/)).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('falha no editor mantém a URL, mostra erro e permite nova tentativa', async () => {
  const monitor = MONITORAMENTOS_INICIAIS[0]
  const monitoramentos = vi.fn().mockRejectedValueOnce(new Error('Falha de leitura'))
    .mockResolvedValueOnce([monitor])
  const rota = `/sinais/tipos/${monitor.tipoId}/${monitor.id}`
  const { usuario } = renderizarAppCom(rota, { sinais: (fonte) => ({ ...fonte, monitoramentos }) }, true)
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os monitoramentos.')
  expect(window.location.pathname).toBe(rota)
  expect(screen.queryByText('Nenhum Monitoramento deste tipo ainda.')).not.toBeInTheDocument()
  await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
  expect(await screen.findByRole('heading', { name: monitor.nome })).toBeInTheDocument()
})
