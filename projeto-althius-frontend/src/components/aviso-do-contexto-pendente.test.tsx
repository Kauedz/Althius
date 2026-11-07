import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { FonteDoContextoDaEmpresaProvider } from '@/fonte/contexto'
import { criarFonteDoContextoDaEmpresaSimulada } from '@/fonte/simulada-contexto-da-empresa'
import { criarFonteDoContextoDaEmpresaIndisponivel } from '@/fonte/indisponivel'
import type { FonteDoContextoDaEmpresa } from '@/fonte/contexto-da-empresa-tipos'
import { AvisoDoContextoPendente } from './aviso-do-contexto-pendente'

function mostrar(fonte: FonteDoContextoDaEmpresa) {
  return render(
    <FonteDoContextoDaEmpresaProvider fonte={fonte}>
      <MemoryRouter>
        <AvisoDoContextoPendente operacao="A busca pelo ICP" />
        <p>Depois do aviso</p>
      </MemoryRouter>
    </FonteDoContextoDaEmpresaProvider>,
  )
}

describe('Aviso do Contexto da empresa pendente', () => {
  it('sem site, diz o que falta e leva a Configurações, sem esconder o resto', async () => {
    mostrar(criarFonteDoContextoDaEmpresaSimulada({ inicial: null, site: '' }))
    expect(await screen.findByText(/A busca pelo ICP precisa do Contexto da empresa/)).toHaveTextContent(/Informe o site/)
    expect(screen.getByRole('link', { name: 'Abrir Contexto da empresa' })).toHaveAttribute('href', '/configuracoes/contexto')
    expect(screen.getByText('Depois do aviso')).toBeInTheDocument()
  })

  it('com o site e sem contexto, pede para gerar ou escrever', async () => {
    mostrar(criarFonteDoContextoDaEmpresaSimulada({ inicial: null, site: 'norte.test' }))
    expect(await screen.findByText(/Gere o contexto pelo site ou escreva-o/)).toBeInTheDocument()
  })

  it('com a leitura em andamento, avisa que ainda está sendo gerado', async () => {
    const fonte = criarFonteDoContextoDaEmpresaSimulada({ inicial: null, site: 'norte.test', lerSite: () => new Promise(() => {}) })
    await fonte.gerar()
    mostrar(fonte)
    expect(await screen.findByText(/ainda está sendo gerado/)).toBeInTheDocument()
  })

  it('com a leitura que falhou, avisa da falha', async () => {
    const fonte = criarFonteDoContextoDaEmpresaSimulada({ inicial: null, site: 'norte.test', lerSite: async () => ({ falha: 'falhou' }) })
    await fonte.gerar()
    mostrar(fonte)
    expect(await screen.findByText(/A leitura do site falhou/)).toBeInTheDocument()
  })

  it('com contexto vigente ou sem a Fonte do contexto, não mostra nada', async () => {
    const { unmount } = mostrar(criarFonteDoContextoDaEmpresaSimulada())
    await screen.findByText('Depois do aviso')
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('link', { name: 'Abrir Contexto da empresa' })).not.toBeInTheDocument()
    unmount()
    mostrar(criarFonteDoContextoDaEmpresaIndisponivel())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('link', { name: 'Abrir Contexto da empresa' })).not.toBeInTheDocument()
  })
})
