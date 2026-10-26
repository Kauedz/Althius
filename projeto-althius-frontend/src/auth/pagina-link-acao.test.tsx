import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PaginaLinkDeAcao } from './pagina-link-acao'

afterEach(cleanup)

it('mostra a ação irreversível ligada ao link e oferece confirmação autenticada', async () => {
  const rpc = vi.fn(async (nome: string) => nome === 'get_whatsapp_action_link'
    ? { data: [{ workspace_id: 'workspace-norte', tool: 'ativar_sequencia', action: { sequencia: 'Fintechs SP' }, state: 'pendente', expires_at: '2026-11-22T13:30:00Z' }], error: null }
    : { data: 'aprovar', error: null })
  const cliente = { rpc } as unknown as SupabaseClient

  render(<PaginaLinkDeAcao cliente={cliente} token="token-opaco" />)

  expect(await screen.findByText('Ativar Sequência')).toBeTruthy()
  expect(screen.getByText('Workspace: workspace-norte')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Aprovar' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Recusar' })).toBeTruthy()
})

it('encaminha conexão de Integração ao OAuth e não oferece campo para chave', async () => {
  const rpc = vi.fn(async () => ({
    data: [{ workspace_id: 'workspace-norte', tool: 'conectar_integracao', action: { integrationId: 'hubspot' }, state: 'pendente', expires_at: '2026-11-22T13:30:00Z' }],
    error: null,
  }))
  const cliente = { rpc, functions: { invoke: vi.fn() } } as unknown as SupabaseClient

  render(<PaginaLinkDeAcao cliente={cliente} token="token-oauth" />)

  expect(await screen.findByRole('button', { name: 'Continuar para autorização OAuth' })).toBeTruthy()
  expect(screen.queryByLabelText(/chave de api/i)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull()
})

it('exige nova autenticação quando o servidor rejeita login acima de 12 horas', async () => {
  const rpc = vi.fn(async (nome: string) => nome === 'get_whatsapp_action_link'
    ? { data: [{ workspace_id: 'workspace-norte', tool: 'apagar_contato', action: { contato: 'Contato Norte' }, state: 'pendente', expires_at: '2026-11-22T13:30:00Z' }], error: null }
    : { data: 'login_recente', error: null })
  const cliente = { rpc, auth: { signOut: vi.fn() } } as unknown as SupabaseClient

  render(<PaginaLinkDeAcao cliente={cliente} token="token-step-up" />);
  (await screen.findByRole('button', { name: 'Aprovar' })).click()

  expect(await screen.findByText(/login feito nos últimos 12 horas/i)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Sair e entrar novamente' })).toBeTruthy()
})
