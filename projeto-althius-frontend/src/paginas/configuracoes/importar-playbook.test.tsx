import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { FonteDoPlaybookProvider } from '@/fonte/contexto'
import type { AbaLida } from '@/fonte/playbook-planilha'
import { criarFonteDoPlaybookSimulada } from '@/fonte/simulada-playbook'
import { renderizarApp } from '@/test/renderizar'
import { ImportarPlaybook } from './importar-playbook'

const ABAS: AbaLida[] = [
  { nome: 'ICP – Quem Buscamos', linhas: [['ICP'], ['Porte', '50 a 500 colaboradores']] },
  { nome: 'Personas', linhas: [['Decisor', 'Diretor de compras']] },
  { nome: 'SDR – Outbound', linhas: [['Pesquisa']] },
  { nome: 'Base de Pesquisa', linhas: [['Empresa', 'Cidade'], ['Empresa Exemplo', 'Cidade Exemplo']] },
]

const planilha = () => new File(['x'], 'playbook.xlsx')

function abrir(lerArquivo: (arquivo: File) => Promise<AbaLida[]>) {
  const fonte = criarFonteDoPlaybookSimulada()
  const usuario = userEvent.setup()
  render(
    <MemoryRouter>
      <FonteDoPlaybookProvider fonte={fonte}>
        <ImportarPlaybook lerArquivo={lerArquivo} />
      </FonteDoPlaybookProvider>
    </MemoryRouter>,
  )
  return { fonte, usuario }
}

async function escolherPlanilha(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.upload(screen.getByLabelText(/Escolher planilha/), planilha())
}

describe('Importar a planilha do Playbook', () => {
  it('mostra a prévia antes de gravar e não grava nada até confirmar', async () => {
    const { fonte, usuario } = abrir(async () => ABAS)
    await escolherPlanilha(usuario)

    const encontradas = within(await screen.findByRole('region', { name: 'Seções encontradas' }))
    expect(encontradas.getByText('ICP')).toBeInTheDocument()
    expect(encontradas.getByText(/Porte \| 50 a 500 colaboradores/)).toBeInTheDocument()
    expect(encontradas.getByText('Substitui a versão 1')).toBeInTheDocument()
    expect(encontradas.getByRole('button', { name: 'Importar 2 seções' })).toBeInTheDocument()

    expect((await fonte.secao('icp')).vigente?.versao).toBe(1)
    expect((await fonte.secao('personas')).vigente).toBeNull()
  })

  it('lista a aba desconhecida e leva a Base de Pesquisa para o CSV de Contas-alvo', async () => {
    const { usuario } = abrir(async () => ABAS)
    await escolherPlanilha(usuario)

    const naoImportadas = within(await screen.findByRole('region', { name: 'Abas não importadas' }))
    expect(naoImportadas.getByText('SDR – Outbound')).toBeInTheDocument()
    const base = within(screen.getByRole('region', { name: 'Base de Pesquisa' }))
    expect(base.getByText(/1 linha depois do cabeçalho/)).toBeInTheDocument()
    expect(base.getByRole('button', { name: 'Baixar a Base de Pesquisa em CSV' })).toBeInTheDocument()
    expect(base.getByRole('link', { name: 'Abrir Importar CSV' })).toHaveAttribute('href', '/contas/importar')
  })

  it('confirmar grava uma versão nova de cada seção escolhida', async () => {
    const { fonte, usuario } = abrir(async () => ABAS)
    await escolherPlanilha(usuario)

    await usuario.click(await screen.findByRole('checkbox', { name: /Personas/ }))
    await usuario.click(screen.getByRole('button', { name: 'Importar 1 seção' }))

    expect(await screen.findByText('1 seção importada.')).toBeInTheDocument()
    const icp = await fonte.secao('icp')
    expect(icp.vigente?.versao).toBe(2)
    expect(icp.vigente?.conteudo).toEqual({ texto: 'ICP\nPorte | 50 a 500 colaboradores', linhas: [] })
    expect((await fonte.secao('personas')).vigente).toBeNull()
  })

  it('diz que não conseguiu ler um arquivo que não é a planilha, sem gravar', async () => {
    const lerArquivo = vi.fn().mockRejectedValue(new Error('zip inválido'))
    const { fonte, usuario } = abrir(lerArquivo)
    await escolherPlanilha(usuario)

    expect(await screen.findByText(/Não consegui ler esta planilha/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Seções encontradas' })).not.toBeInTheDocument()
    expect((await fonte.secao('icp')).vigente?.versao).toBe(1)
  })
})

describe('Importar a planilha: quem pode', () => {
  it('o Administrador vê o item no menu; o Membro não e, pela rota, é avisado', async () => {
    const admin = renderizarApp('/configuracoes/playbook/importar', {}, {}, {}, {}, { sessao: { contaId: 'marina' } })
    expect(await screen.findByRole('link', { name: 'Importar planilha' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 3, name: 'Importar a planilha do setup' })).toBeInTheDocument()
    admin.unmount()

    renderizarApp('/configuracoes/playbook/importar', {}, {}, {}, {}, { sessao: { contaId: 'lucas' } })
    expect(await screen.findByText('Só um Administrador importa a planilha do Playbook.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Importar planilha' })).not.toBeInTheDocument()
  })
})
