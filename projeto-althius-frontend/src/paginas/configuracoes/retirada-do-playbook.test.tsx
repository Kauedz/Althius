import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'

// contexto-da-empresa 07: o Playbook e a Memória do Workspace saem de Configurações. Fica só o Contexto da empresa,
// com os três textos; as entradas antigas levam a ele.

function abrir(rota: string) {
  return renderizarApp(rota, {}, {}, {}, {}, { sessao: { contaId: 'marina' } })
}

describe('Retirada do Playbook em Configurações', () => {
  it('as abas não têm mais Playbook nem Memória do Workspace; o Contexto da empresa continua', async () => {
    abrir('/configuracoes/contexto')

    const abas = within(await screen.findByRole('navigation', { name: 'Seções de Configurações' }))
    expect(abas.getByRole('link', { name: 'Contexto da empresa' })).toBeInTheDocument()
    expect(abas.queryByRole('link', { name: 'Playbook' })).not.toBeInTheDocument()
    expect(abas.queryByRole('link', { name: 'Memória do Workspace' })).not.toBeInTheDocument()
  })

  it.each([
    '/configuracoes/playbook',
    '/configuracoes/playbook/icp',
    '/configuracoes/playbook/sla_e_metas',
    '/configuracoes/memoria',
    '/configuracoes/memoria/personas',
  ])('a entrada antiga %s leva ao Contexto da empresa', async (rota) => {
    abrir(rota)

    expect(await screen.findByRole('heading', { level: 2, name: 'Contexto da empresa' })).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: 'Perfil de cliente ideal' })).toBeInTheDocument()
    expect(screen.queryByText(/Importar/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Playbook' })).not.toBeInTheDocument()
  })
})
