// A busca de contas pelo Contexto da empresa (contexto-da-empresa, ticket 04): o diálogo mostra um recorte por perfil
// do Perfil de cliente ideal salvo, com a origem no texto, os filtros editáveis e o que a fonte não aplica. Ajustar
// os filtros não toca no contexto salvo; filtros de uma versão antiga são preparados de novo; ausência de contexto,
// falha de tradução, falha da fonte e zero resultados são coisas diferentes.
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { criteriosDaBuscaVazios, ErroDaBuscaDeContas, type PreparacaoDaBusca, type UltimaBuscaDeContas } from '@/fonte/descobertas-tipos'
import type { FonteDeDescobertas } from '@/fonte/descobertas-tipos'
import { renderizarAppCom } from '@/test/renderizar'

const PRONTA: PreparacaoDaBusca = {
  estado: 'pronta',
  contextoVersao: 7,
  fonte: 'linkedin',
  perfis: [
    {
      nome: 'ICP primário',
      criterios: { ...criteriosDaBuscaVazios(), setores: ['Corretoras de seguros'], portes: ['51-200'], regioes: ['SP'] },
      aplicados: [{ conceito: 'setor', valor: 'Corretoras de seguros', trecho: 'Corretoras de seguros' }],
      pendentes: [{
        conceito: 'modeloDeNegocio',
        valor: 'B2B',
        trecho: 'Modelo B2B',
        motivo: 'sem_suporte_na_fonte',
        explicacao: 'O LinkedIn não informa modelo de negócio: fica para verificar depois, sem confirmar a Aderência.',
      }],
    },
    {
      nome: 'ICP secundário',
      criterios: { ...criteriosDaBuscaVazios(), setores: ['Seguradoras'], regioes: ['PR'] },
      aplicados: [{ conceito: 'setor', valor: 'Seguradoras', trecho: 'Seguradoras de médio porte' }],
      pendentes: [{
        conceito: 'funcionarios',
        valor: 'médio porte',
        trecho: 'médio porte',
        motivo: 'ambiguo',
        explicacao: 'O texto não determina um valor exato de funcionários: nada foi aplicado. Ajuste o filtro se quiser.',
      }],
    },
  ],
}

function montar(ajustes: Partial<FonteDeDescobertas> = {}) {
  const salvar = vi.fn()
  const r = renderizarAppCom('/contas/descobertas', {
    opcoesOnboarding: {},
    descobertas: (fonte) => {
      vi.spyOn(fonte, 'cotarBusca').mockResolvedValue({ creditos: 5, saldoDisponivel: 100, emAndamento: false, estadoDoActor: 'available', podeTestar: true })
      return Object.assign(fonte, {
        prepararBusca: vi.fn().mockResolvedValue(PRONTA),
        buscarPorPerfis: vi.fn().mockResolvedValue(undefined),
        ultimaBusca: vi.fn().mockResolvedValue(null),
        ...ajustes,
      })
    },
    contextoDaEmpresa: (fonte) => Object.assign(fonte, { salvar }),
  })
  return { ...r, salvar }
}

async function abrirDialogo(usuario: ReturnType<typeof montar>['usuario']) {
  await screen.findByText('LogiFlow Brasil S.A.')
  await usuario.click(screen.getByRole('button', { name: /Buscar contas pelo ICP/i }))
  return screen.findByRole('dialog', { name: 'Confirmar filtros da busca' })
}

describe('Busca de contas pelo Contexto da empresa', () => {
  it('mostra um recorte por perfil, com a origem no texto, e envia os ajustes sem tocar no contexto salvo', async () => {
    const { usuario, fonteDeDescobertas, salvar } = montar()
    const painel = await abrirDialogo(usuario)

    expect(within(painel).getByText(/versão 7 do Perfil de cliente ideal/)).toBeInTheDocument()
    const primario = within(painel).getByRole('group', { name: 'ICP primário' })
    const secundario = within(painel).getByRole('group', { name: 'ICP secundário' })
    expect(within(primario).getByRole('list', { name: 'Setores escolhidas' })).toHaveTextContent('Corretoras de seguros')
    expect(within(secundario).getByRole('list', { name: 'Setores escolhidas' })).toHaveTextContent('Seguradoras')
    expect(within(secundario).getByText(/“Seguradoras de médio porte”/)).toBeInTheDocument()
    // O que a fonte não aplica fica à vista, com o porquê.
    const pendentes = within(secundario).getByRole('list', { name: 'Não aplicado pela fonte' })
    expect(pendentes).toHaveTextContent('Funcionários: médio porte')
    expect(pendentes).toHaveTextContent('não determina um valor exato')
    expect(within(primario).getByRole('list', { name: 'Não aplicado pela fonte' })).toHaveTextContent('Modelo de negócio: B2B')

    // Ajuste local num perfil não vaza para o outro.
    await usuario.type(within(secundario).getByLabelText('Palavras-chave'), 'resseguro{Enter}')
    await usuario.click(within(painel).getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(fonteDeDescobertas.buscarPorPerfis).toHaveBeenCalled())
    expect(fonteDeDescobertas.buscarPorPerfis).toHaveBeenCalledWith({
      contextoVersao: 7,
      allowTesting: false,
      perfis: [
        {
          nome: 'ICP primário',
          criterios: expect.objectContaining({ setores: ['Corretoras de seguros'], palavrasChave: [] }),
          aplicados: PRONTA.perfis[0].aplicados,
          pendentes: PRONTA.perfis[0].pendentes,
        },
        {
          nome: 'ICP secundário',
          criterios: expect.objectContaining({ setores: ['Seguradoras'], palavrasChave: ['resseguro'] }),
          aplicados: PRONTA.perfis[1].aplicados,
          pendentes: PRONTA.perfis[1].pendentes,
        },
      ],
    })
    expect(salvar).not.toHaveBeenCalled()
  })

  it('perfil sem setor nem palavra-chave trava a busca pelo nome; tirar o perfil da busca libera', async () => {
    const { usuario, fonteDeDescobertas } = montar()
    const painel = await abrirDialogo(usuario)
    const secundario = within(painel).getByRole('group', { name: 'ICP secundário' })
    await usuario.click(within(secundario).getByRole('button', { name: 'Remover Seguradoras' }))
    expect(within(painel).getByRole('button', { name: 'Confirmar' })).toBeDisabled()
    expect(within(painel).getByText(/ICP secundário: informe ao menos um setor ou uma palavra-chave/)).toBeInTheDocument()

    await usuario.click(within(secundario).getByRole('checkbox', { name: 'Incluir na busca' }))
    await usuario.click(within(painel).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(fonteDeDescobertas.buscarPorPerfis).toHaveBeenCalled())
    const [{ perfis }] = vi.mocked(fonteDeDescobertas.buscarPorPerfis!).mock.calls[0]
    expect(perfis.map((p) => p.nome)).toEqual(['ICP primário'])
  })

  it('sem Perfil de cliente ideal salvo, leva ao Contexto da empresa e não busca', async () => {
    const { usuario } = montar({
      prepararBusca: vi.fn().mockResolvedValue({
        estado: 'sem_contexto', contextoVersao: null, fonte: 'linkedin', perfis: [],
        mensagem: 'O Contexto da empresa ainda não tem o Perfil de cliente ideal.',
      } satisfies PreparacaoDaBusca),
    })
    const painel = await abrirDialogo(usuario)
    expect(within(painel).getByText(/ainda não tem o Perfil de cliente ideal/)).toBeInTheDocument()
    expect(within(painel).getByRole('link', { name: 'Abrir Contexto da empresa' })).toHaveAttribute('href', '/configuracoes/contexto')
    expect(within(painel).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
  })

  it('erro ao ler o contexto não é falha de tradução: diz o erro e deixa tentar de novo', async () => {
    const prepararBusca = vi.fn()
      .mockRejectedValueOnce(new Error('Não foi possível ler o Contexto da empresa agora.'))
      .mockResolvedValueOnce(PRONTA)
    const { usuario } = montar({ prepararBusca })
    const painel = await abrirDialogo(usuario)
    expect(within(painel).getByRole('alert')).toHaveTextContent('Não foi possível ler o Contexto da empresa agora.')
    expect(within(painel).queryByText(/traduzir/)).not.toBeInTheDocument()
    await usuario.click(within(painel).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(painel).findByRole('group', { name: 'ICP primário' })).toBeInTheDocument()
  })

  it('falha de tradução é dita como falha, com tentar de novo', async () => {
    const prepararBusca = vi.fn()
      .mockResolvedValueOnce({
        estado: 'falha_traducao', contextoVersao: 7, fonte: 'linkedin', perfis: [],
        mensagem: 'Não conseguimos traduzir o Perfil de cliente ideal em filtros agora. Isso não diz nada sobre o mercado.',
      } satisfies PreparacaoDaBusca)
      .mockResolvedValueOnce(PRONTA)
    const { usuario } = montar({ prepararBusca })
    const painel = await abrirDialogo(usuario)
    expect(within(painel).getByRole('alert')).toHaveTextContent('Isso não diz nada sobre o mercado')
    await usuario.click(within(painel).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(painel).findByRole('group', { name: 'ICP primário' })).toBeInTheDocument()
    expect(prepararBusca).toHaveBeenCalledTimes(2)
  })

  it('quando o contexto mudou, pede para preparar de novo com a versão atual', async () => {
    const prepararBusca = vi.fn()
      .mockResolvedValueOnce(PRONTA)
      .mockResolvedValueOnce({ ...PRONTA, contextoVersao: 8 })
    const buscarPorPerfis = vi.fn()
      .mockRejectedValueOnce(new ErroDaBuscaDeContas('O Contexto da empresa mudou desde que estes filtros foram preparados.', 'contexto_mudou'))
      .mockResolvedValueOnce(undefined)
    const { usuario } = montar({ prepararBusca, buscarPorPerfis })
    const painel = await abrirDialogo(usuario)
    await usuario.click(within(painel).getByRole('button', { name: 'Confirmar' }))
    expect(await within(painel).findByRole('alert')).toHaveTextContent('O Contexto da empresa mudou')
    await usuario.click(within(painel).getByRole('button', { name: 'Preparar de novo' }))
    expect(await within(painel).findByText(/versão 8 do Perfil de cliente ideal/)).toBeInTheDocument()
    await usuario.click(within(painel).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(buscarPorPerfis).toHaveBeenLastCalledWith(expect.objectContaining({ contextoVersao: 8 })))
  })

  it('zero resultados e falha da fonte aparecem diferentes, e nenhum diz que o mercado não existe', async () => {
    const vazia: UltimaBuscaDeContas = { desfecho: 'sem_resultados', encontradas: 0, novas: 0, contextoVersao: 7, perfis: ['ICP primário'] }
    const { unmount } = montar({ ultimaBusca: vi.fn().mockResolvedValue(vazia) })
    expect(await screen.findByText(/A última busca não encontrou empresas neste recorte, nesta fonte/)).toBeInTheDocument()
    expect(screen.getByText(/não quer dizer que elas não existam/)).toBeInTheDocument()
    unmount()

    const falha: UltimaBuscaDeContas = {
      desfecho: 'falha_da_fonte', encontradas: 0, novas: 0, contextoVersao: 7, perfis: [], mensagem: 'A fonte não respondeu a tempo.',
    }
    montar({ ultimaBusca: vi.fn().mockResolvedValue(falha) })
    expect(await screen.findByText(/A última busca falhou na fonte: A fonte não respondeu a tempo\./)).toBeInTheDocument()
    expect(screen.queryByText(/não encontrou empresas/)).not.toBeInTheDocument()
  })
})
