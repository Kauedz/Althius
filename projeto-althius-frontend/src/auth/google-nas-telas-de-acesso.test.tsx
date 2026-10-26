import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ContextoDeAutenticacao } from './contexto'
import { MemoriaDosConvites } from './convite-do-acesso'
import { TelaEsqueciASenha } from './tela-esqueci-a-senha'
import { TelaDeCadastro } from './tela-de-cadastro'
import { TelaDeEntrada } from './tela-de-entrada'
import { criarSupabaseFalso } from '@/test/supabase-falso'
import { criarServicosDoNavegadorFalsos } from '@/test/servicos-do-navegador-falsos'

afterEach(cleanup)

function abrirEntrada(comGoogle: boolean, tela: 'entrada' | 'senha' | 'cadastro' = 'entrada') {
  const { cliente } = criarSupabaseFalso({ rpcs: { workspace_invitation_preview: () => [{ status: 'pendente', email: 'pessoa@empresa.com.br', workspace_name: 'Empresa', role: 'member' }] } })
  const { servicos } = criarServicosDoNavegadorFalsos(comGoogle ? { google: {} } : {})
  return render(
    <MemoryRouter initialEntries={[tela === 'cadastro' ? '/cadastro?destino=/convite/token-do-teste' : '/entrar']}>
      <ContextoDeAutenticacao cliente={cliente} servicos={servicos}>
        <MemoriaDosConvites>{tela === 'senha' ? <TelaEsqueciASenha /> : tela === 'cadastro' ? <TelaDeCadastro /> : <TelaDeEntrada />}</MemoriaDosConvites>
      </ContextoDeAutenticacao>
    </MemoryRouter>,
  )
}

it('sem o serviço do Google, a entrada não promete essa opção', async () => {
  const { container } = abrirEntrada(false)
  await screen.findByRole('heading', { name: 'Entrar' })
  expect(container).not.toHaveTextContent(/Google/i)
  expect(screen.queryByRole('button', { name: 'Continuar com Google' })).not.toBeInTheDocument()
})

it('sem Google, a recuperação de senha não cita essa opção', async () => {
  const { container } = abrirEntrada(false, 'senha')
  await screen.findByRole('heading', { name: 'Esqueci a senha' })
  expect(container).not.toHaveTextContent(/Google/i)
})

it('com Google, a entrada mostra a explicação e o botão juntos', async () => {
  abrirEntrada(true)
  expect(await screen.findByRole('button', { name: 'Continuar com Google' })).toBeInTheDocument()
  expect(screen.getByText(/Com o Google, você vê a demonstração/)).toBeInTheDocument()
})

it.each([false, true])('o cadastro por convite só oferece Google com o serviço (%s)', async (comGoogle) => {
  const { container } = abrirEntrada(comGoogle, 'cadastro')
  await screen.findByRole('heading', { name: 'Criar conta' })
  if (comGoogle) {
    expect(await screen.findByRole('button', { name: 'Continuar com Google' })).toBeInTheDocument()
  } else {
    expect(container).not.toHaveTextContent(/Google/i)
  }
})

it('com Google, a recuperação preserva a orientação para criar senha', async () => {
  abrirEntrada(true, 'senha')
  expect(await screen.findByText(/Também serve para quem só entra com Google criar uma senha/)).toBeInTheDocument()
})
